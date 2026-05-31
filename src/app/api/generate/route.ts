import { after, NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { deleteSavedImages, generateFilename, saveImage } from "@/lib/image-storage";
import {
  validateUploadedImages,
  type SupportedImageMimeType,
} from "@/lib/uploads";
import { parsePageCount } from "@/lib/page-count";
import { parseStoryStyle } from "@/lib/story-styles";
import { parseTtsVoice } from "@/lib/tts-voices";
import {
  GENERATION_JOB_STATUS,
  type StoredReferenceImage,
} from "@/lib/generation-job";
import {
  processGenerationJob,
  toReferenceImagesJson,
} from "@/lib/generation-runner";
import { parseReferenceCharactersFormValue } from "@/lib/reference-characters";
import {
  formatLocalReadinessError,
  getBlockingLocalReadinessIssues,
} from "@/lib/local-readiness";

export const maxDuration = 300;

const DEFAULT_PHOTO_USAGE = "character";

type SavedReferenceImage = {
  filename: string;
  mediaType: SupportedImageMimeType;
  url: string;
};

function getUploadedPhotos(formData: FormData): File[] {
  const photos = formData
    .getAll("photos")
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (photos.length > 0) return photos;

  const legacyPhoto = formData.get("photo");
  return legacyPhoto instanceof File && legacyPhoto.size > 0 ? [legacyPhoto] : [];
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();

  const localReadinessIssues = getBlockingLocalReadinessIssues();
  if (localReadinessIssues.length > 0) {
    console.warn(`[generate:${requestId}] local configuration incomplete`, {
      issues: localReadinessIssues,
    });
    return NextResponse.json(
      {
        code: "LOCAL_CONFIGURATION_REQUIRED",
        error: formatLocalReadinessError(localReadinessIssues),
        issues: localReadinessIssues,
      },
      { status: 503 },
    );
  }

  const savedImageUrls: string[] = [];
  let jobCreated = false;

  try {
    console.info(`[generate:${requestId}] start`);
    const formData = await request.formData();
    const description = String(formData.get("description") ?? "").trim();
    const photoUsageValue = DEFAULT_PHOTO_USAGE;
    const photos = getUploadedPhotos(formData);

    let storyStyle: ReturnType<typeof parseStoryStyle>;
    try {
      storyStyle = parseStoryStyle(formData.get("style"));
    } catch (error) {
      console.warn(`[generate:${requestId}] invalid story style`, {
        style: String(formData.get("style") ?? ""),
      });
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid story style" },
        { status: 400 },
      );
    }

    let ttsVoice: ReturnType<typeof parseTtsVoice>;
    try {
      ttsVoice = parseTtsVoice(formData.get("ttsVoice"));
    } catch (error) {
      console.warn(`[generate:${requestId}] invalid TTS voice`, {
        ttsVoice: String(formData.get("ttsVoice") ?? ""),
      });
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid TTS voice" },
        { status: 400 },
      );
    }

    let pageCount: number;
    try {
      pageCount = parsePageCount(formData.get("pageCount"));
    } catch (error) {
      console.warn(`[generate:${requestId}] invalid page count`, {
        pageCount: String(formData.get("pageCount") ?? ""),
      });
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid page count" },
        { status: 400 },
      );
    }

    if (!description) {
      console.warn(`[generate:${requestId}] invalid form`, {
        hasDescription: Boolean(description),
      });
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const validation = validateUploadedImages(photos);
    if (!validation.ok) {
      console.warn(`[generate:${requestId}] invalid upload`, {
        reason: validation.error,
        photoCount: photos.length,
        totalSize: photos.reduce((sum, photo) => sum + photo.size, 0),
      });
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const referenceCharacterContext = parseReferenceCharactersFormValue(
      formData.get("referenceCharacters"),
      photos.length,
    );

    console.info(`[generate:${requestId}] form accepted`, {
      descriptionLength: description.length,
      style: storyStyle.id,
      styleName: storyStyle.name,
      ttsVoice: ttsVoice.id,
      ttsVoiceName: ttsVoice.label,
      photoUsage: photoUsageValue,
      pageCount,
      photoCount: photos.length,
      photoTypes: photos.map((photo) => photo.type),
      totalPhotoSize: photos.reduce((sum, photo) => sum + photo.size, 0),
      referenceCharacters: referenceCharacterContext.characters.map((character) => ({
        isPrimary: character.isPrimary,
        nickname: character.nickname,
        referenceIndex: character.referenceIndex,
        roleLabel: character.roleLabel,
      })),
    });

    const referenceImages: SavedReferenceImage[] = [];
    for (const [index, photo] of photos.entries()) {
      const photoBuffer = Buffer.from(await photo.arrayBuffer());
      const photoBase64 = photoBuffer.toString("base64");
      const photoFilename = generateFilename(`photo-${index + 1}`, validation.items[index].extension);
      const photoUrl = await saveImage(photoBase64, photoFilename);
      savedImageUrls.push(photoUrl);
      referenceImages.push({
        filename: photoFilename,
        mediaType: photo.type as SupportedImageMimeType,
        url: photoUrl,
      });
    }

    console.info(`[generate:${requestId}] photos saved`, {
      photoCount: referenceImages.length,
      photoUrls: referenceImages.map((photo) => photo.url),
    });

    const storedReferenceImages: StoredReferenceImage[] = referenceImages.map((image, index) => ({
      character: referenceCharacterContext.characters[index],
      filename: image.filename,
      mediaType: image.mediaType,
      url: image.url,
    }));
    const job = await prisma.generationJob.create({
      data: {
        description,
        style: storyStyle.id,
        ttsVoice: ttsVoice.id,
        photoUsage: photoUsageValue,
        pageCount,
        referenceImages: toReferenceImagesJson(storedReferenceImages),
        status: GENERATION_JOB_STATUS.queued,
      },
      select: { id: true, status: true },
    });
    jobCreated = true;

    after(async () => {
      try {
        await processGenerationJob(job.id);
      } catch (error) {
        console.error(`[generate:${requestId}] failed to process generation job`, {
          error: error instanceof Error ? error.message : "unknown",
          jobId: job.id,
        });
      }
    });

    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
  } catch (error) {
    console.error(`[generate:${requestId}] failed`, error);
    if (!jobCreated) {
      await deleteSavedImages(savedImageUrls);
    }
    return NextResponse.json(
      { error: "Unable to start generation job", requestId },
      { status: 500 },
    );
  }
}
