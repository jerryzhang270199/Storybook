import type { Prisma } from "@prisma/client";
import { selectAmbientAudioUrl } from "./ambient-audio";
import { generatePageAudioUrls } from "./audiobook-generation";
import { getOrCreateCachedBookVideo, type BookVideoInput } from "./book-video";
import { generateStory } from "./story-generation";
import { prisma } from "./db";
import { getPerBookImageConcurrencyLimit } from "./generation-concurrency";
import { getGenerationErrorResponse } from "./generation-errors";
import {
  GENERATION_JOB_STATUS,
  type StoredReferenceImage,
  parseStoredReferenceImages,
} from "./generation-job";
import { generateFilename, loadImageBuffer, saveImage, deleteSavedImages } from "./image-storage";
import { generateImage } from "./image-generation";
import {
  buildReferenceCharacterImagePrompt,
  buildReferenceCharacterStoryPrompt,
  parseReferenceCharactersFormValue,
  type ReferenceCharacterContext,
} from "./reference-characters";
import { parseStoryStyle } from "./story-styles";
import { shouldDeleteReferenceImagesAfterSuccess } from "./book-cleanup";
import { getTtsProviderConfig } from "./tts-provider";
import { getTtsVoiceProviderOverrides } from "./tts-voices";

type GenerationLogPayload = Record<string, unknown>;

type GenerationStageTimer = {
  elapsedMs: () => number;
  logStageCompleted: (
    stage: string,
    stageStartedAtMs: number,
    payload?: GenerationLogPayload,
  ) => void;
  startStage: () => number;
};

type PageImageAsset = {
  imagePrompt: string;
  text: string;
};

type PageAudioAsset = {
  text: string;
};

type ImageBatchEvent = {
  batchDurationMs?: number;
  fromPage: number;
  generatedImages?: number;
  toPage: number;
};

type PageImageGenerationResult = {
  pageImages: string[];
  savedPageImageUrls: string[];
};

type PageAudioGenerationResult = {
  pageAudioUrls: Array<string | null>;
  savedAudioUrls: string[];
};

export function createGenerationStageTimer({
  jobId,
  log = console.info,
  now = Date.now,
}: {
  jobId: string;
  log?: (message: string, payload: GenerationLogPayload) => void;
  now?: () => number;
}): GenerationStageTimer {
  const jobStartedAtMs = now();

  return {
    elapsedMs: () => now() - jobStartedAtMs,
    logStageCompleted: (stage, stageStartedAtMs, payload = {}) => {
      log("[generation-job] stage completed", {
        ...payload,
        durationMs: now() - stageStartedAtMs,
        jobId,
        stage,
        totalElapsedMs: now() - jobStartedAtMs,
      });
    },
    startStage: () => now(),
  };
}

export async function generatePageImagesInBatches({
  batchSize,
  generatePageImage,
  now = Date.now,
  onBatchCompleted,
  onBatchStarted,
  pages,
  savePageImage,
}: {
  batchSize: number;
  generatePageImage: (page: PageImageAsset, index: number) => Promise<string>;
  now?: () => number;
  onBatchCompleted?: (event: ImageBatchEvent) => void;
  onBatchStarted?: (event: ImageBatchEvent) => void;
  pages: PageImageAsset[];
  savePageImage: (imageBase64: string, index: number) => Promise<string>;
}): Promise<PageImageGenerationResult> {
  const pageImages: string[] = [];
  const savedPageImageUrls: string[] = [];
  const safeBatchSize = Math.max(1, batchSize);

  for (let i = 0; i < pages.length; i += safeBatchSize) {
    const batch = pages.slice(i, i + safeBatchSize);
    const event = { fromPage: i + 1, toPage: i + batch.length };
    const batchStartedAtMs = now();
    onBatchStarted?.(event);

    const results = await Promise.all(
      batch.map((page, batchIndex) => generatePageImage(page, i + batchIndex)),
    );

    for (let batchIndex = 0; batchIndex < results.length; batchIndex += 1) {
      const pageIndex = i + batchIndex;
      const url = await savePageImage(results[batchIndex], pageIndex);
      savedPageImageUrls.push(url);
      pageImages.push(url);
    }

    onBatchCompleted?.({
      ...event,
      batchDurationMs: now() - batchStartedAtMs,
      generatedImages: pageImages.length,
    });
  }

  return { pageImages, savedPageImageUrls };
}

export function startPageAudioGeneration({
  generateAudioUrls,
  onCompleted,
  onStarted,
  pages,
}: {
  generateAudioUrls: () => Promise<Array<string | null>>;
  onCompleted?: (result: PageAudioGenerationResult) => void;
  onStarted?: (pageCount: number) => void;
  pages: PageAudioAsset[];
}): Promise<PageAudioGenerationResult> {
  onStarted?.(pages.length);

  return (async () => {
    const pageAudioUrls = await generateAudioUrls();
    const result = {
      pageAudioUrls,
      savedAudioUrls: pageAudioUrls.filter((url): url is string => Boolean(url)),
    };
    onCompleted?.(result);
    return result;
  })();
}

export function shouldPrewarmBookVideoCache(
  pages: Array<{ audioUrl: string | null | undefined }>,
): boolean {
  return pages.length > 0 && pages.every((page) => Boolean(page.audioUrl?.trim()));
}

export function startBookVideoCachePrewarm({
  book,
  bookId,
  createCachedBookVideo = getOrCreateCachedBookVideo,
  logWarning = console.warn,
  onCompleted,
}: {
  book: BookVideoInput;
  bookId: string;
  createCachedBookVideo?: (input: { book: BookVideoInput; bookId: string }) => Promise<unknown>;
  logWarning?: (message: string, payload: GenerationLogPayload) => void;
  onCompleted?: () => void;
}): Promise<void> {
  return createCachedBookVideo({ book, bookId })
    .then(() => {
      onCompleted?.();
    })
    .catch((error) => {
      logWarning("[generation-job] video cache prewarm failed", {
        bookId,
        error: error instanceof Error ? error.message : "unknown",
      });
    });
}

async function claimQueuedGenerationJob(jobId: string) {
  const updated = await prisma.generationJob.updateMany({
    where: { id: jobId, status: GENERATION_JOB_STATUS.queued },
    data: {
      status: GENERATION_JOB_STATUS.generatingStory,
      startedAt: new Date(),
      error: null,
    },
  });

  if (updated.count !== 1) return null;
  return prisma.generationJob.findUnique({ where: { id: jobId } });
}

function getReferenceCharacterContext(
  referenceImages: StoredReferenceImage[],
): ReferenceCharacterContext {
  const fallback = parseReferenceCharactersFormValue(null, referenceImages.length);
  const characters = fallback.characters.map((character, index) => {
    return referenceImages[index]?.character ?? character;
  });
  const relationshipNote = characters.find((character) => character.relationshipNote)
    ?.relationshipNote;

  return {
    ...(relationshipNote ? { relationshipNote } : {}),
    characters,
  };
}

export async function processGenerationJob(jobId: string): Promise<void> {
  const job = await claimQueuedGenerationJob(jobId);
  if (!job) return;

  const savedPageImageUrls: string[] = [];
  const savedAudioUrls: string[] = [];
  let referenceImages: StoredReferenceImage[] = [];
  let audioPromise: Promise<PageAudioGenerationResult> | null = null;
  let audioResult: PageAudioGenerationResult | null = null;
  let pageAudioUrls: Array<string | null> = [];
  const timer = createGenerationStageTimer({ jobId });
  const totalStartedAtMs = timer.startStage();
  const collectAudioResult = async () => {
    if (!audioPromise || audioResult) return audioResult;

    audioResult = await audioPromise;
    pageAudioUrls = audioResult.pageAudioUrls;
    savedAudioUrls.push(...audioResult.savedAudioUrls);
    return audioResult;
  };

  try {
    referenceImages = parseStoredReferenceImages(job.referenceImages);
    const storyStyle = parseStoryStyle(job.style);
    const referenceCharacterContext = getReferenceCharacterContext(referenceImages);
    const referenceCharacterStoryPrompt =
      buildReferenceCharacterStoryPrompt(referenceCharacterContext);
    const referenceCharacterImagePrompt =
      buildReferenceCharacterImagePrompt(referenceCharacterContext);

    console.info("[generation-job] story generation started", {
      jobId,
      pageCount: job.pageCount,
      referenceCount: referenceImages.length,
      referenceCharacters: referenceCharacterContext.characters.map((character) => ({
        isPrimary: character.isPrimary,
        nickname: character.nickname,
        referenceIndex: character.referenceIndex,
        roleLabel: character.roleLabel,
      })),
    });
    const storyStartedAtMs = timer.startStage();
    const story = await generateStory({
      description: job.description,
      photoUsage: job.photoUsage as "character" | "inspiration",
      referenceCharacterPrompt: referenceCharacterStoryPrompt,
      style: `${storyStyle.name} (${storyStyle.prompt})`,
      referenceCount: referenceImages.length,
      pageCount: job.pageCount,
    });
    timer.logStageCompleted("story", storyStartedAtMs, {
      pageCount: story.pages.length,
      title: story.title,
    });
    console.info("[generation-job] story generation completed", {
      jobId,
      title: story.title,
      pageCount: story.pages.length,
    });

    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: GENERATION_JOB_STATUS.generatingImages },
    });

    const referenceLoadStartedAtMs = timer.startStage();
    const imageReferences = await Promise.all(
      referenceImages.map(async (reference) => ({
        buffer: await loadImageBuffer(reference.url),
        filename: reference.filename,
        mediaType: reference.mediaType,
      })),
    );
    timer.logStageCompleted("reference_images_loaded", referenceLoadStartedAtMs, {
      referenceCount: imageReferences.length,
    });

    const batchSize = getPerBookImageConcurrencyLimit();
    const ttsConfig = getTtsProviderConfig(process.env, getTtsVoiceProviderOverrides(job.ttsVoice));

    pageAudioUrls = story.pages.map(() => null);
    if (ttsConfig) {
      const audioStartedAtMs = timer.startStage();
      audioPromise = startPageAudioGeneration({
        pages: story.pages,
        generateAudioUrls: () =>
          generatePageAudioUrls({
            pages: story.pages,
            config: ttsConfig,
          }),
        onStarted: () => {
          console.info("[generation-job] audio generation started", {
            jobId,
            pageCount: story.pages.length,
          });
        },
        onCompleted: (result) => {
          timer.logStageCompleted("audio", audioStartedAtMs, {
            generatedAudio: result.savedAudioUrls.length,
            pageCount: story.pages.length,
          });
          console.info("[generation-job] audio generation completed", {
            jobId,
            generatedAudio: result.savedAudioUrls.length,
          });
        },
      });
      void audioPromise.catch(() => undefined);
    }

    const imageGenerationStartedAtMs = timer.startStage();
    const imageAssets = await generatePageImagesInBatches({
      batchSize,
      pages: story.pages,
      generatePageImage: (page) =>
        generateImage({
          prompt: page.imagePrompt,
          pageText: page.text,
          referenceImages: imageReferences,
          referenceCharacterPrompt: referenceCharacterImagePrompt,
          referenceMode: job.photoUsage as "character" | "inspiration",
          style: storyStyle.prompt,
        }),
      savePageImage: (imageBase64) => saveImage(imageBase64, generateFilename("page")),
      onBatchStarted: ({ fromPage, toPage }) => {
        console.info("[generation-job] image batch started", {
          jobId,
          fromPage,
          toPage,
        });
      },
      onBatchCompleted: ({ batchDurationMs, fromPage, generatedImages, toPage }) => {
        console.info("[generation-job] image batch completed", {
          batchDurationMs,
          fromPage,
          toPage,
          jobId,
          generatedImages,
          totalElapsedMs: timer.elapsedMs(),
        });
      },
    });
    savedPageImageUrls.push(...imageAssets.savedPageImageUrls);
    timer.logStageCompleted("images", imageGenerationStartedAtMs, {
      batchSize,
      generatedImages: imageAssets.pageImages.length,
    });

    if (audioPromise) {
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: GENERATION_JOB_STATUS.generatingAudio },
      });
      await collectAudioResult();
    }

    const saveBookStartedAtMs = timer.startStage();
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: GENERATION_JOB_STATUS.savingBook },
    });

    const shouldDeleteReferences = shouldDeleteReferenceImagesAfterSuccess();
    const ambientAudioUrl = selectAmbientAudioUrl({
      description: job.description,
      pages: story.pages,
      title: story.title,
    });
    const book = await prisma.book.create({
      data: {
        ambientAudioUrl,
        title: story.title,
        description: job.description,
        style: job.style,
        ttsVoice: job.ttsVoice,
        photoUsage: job.photoUsage,
        photoUrl: shouldDeleteReferences ? null : referenceImages[0]?.url,
        pages: {
          create: story.pages.map((page, index) => ({
            pageNumber: index + 1,
            text: page.text,
            imagePrompt: page.imagePrompt,
            imageUrl: imageAssets.pageImages[index],
            audioUrl: pageAudioUrls[index],
          })),
        },
      },
      select: { id: true },
    });

    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        bookId: book.id,
        completedAt: new Date(),
        referenceImages: shouldDeleteReferences
          ? toReferenceImagesJson([])
          : toReferenceImagesJson(referenceImages),
        status: GENERATION_JOB_STATUS.completed,
      },
    });
    timer.logStageCompleted("save_book", saveBookStartedAtMs, { bookId: book.id });
    timer.logStageCompleted("total", totalStartedAtMs, { bookId: book.id });

    const videoPages = story.pages.map((page, index) => ({
      audioUrl: pageAudioUrls[index],
      imageUrl: imageAssets.pageImages[index],
      text: page.text,
    }));
    if (shouldPrewarmBookVideoCache(videoPages)) {
      const videoCacheStartedAtMs = timer.startStage();
      void startBookVideoCachePrewarm({
        book: {
          ambientAudioUrl,
          title: story.title,
          pages: videoPages,
        },
        bookId: book.id,
        onCompleted: () => {
          timer.logStageCompleted("video_cache", videoCacheStartedAtMs, { bookId: book.id });
        },
      });
    }

    if (shouldDeleteReferences) {
      await deleteSavedImages(referenceImages.map((reference) => reference.url));
    }
  } catch (error) {
    if (audioPromise) {
      try {
        await collectAudioResult();
      } catch {
        // Preserve the original generation error.
      }
    }

    await deleteSavedImages([
      ...savedPageImageUrls,
      ...savedAudioUrls,
      ...referenceImages.map((reference) => reference.url),
    ]);

    const response = getGenerationErrorResponse(error);
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        completedAt: new Date(),
        error: response.error,
        status: GENERATION_JOB_STATUS.failed,
      },
    });

    console.error("[generation-job] failed", {
      jobId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export function toReferenceImagesJson(
  referenceImages: ReturnType<typeof parseStoredReferenceImages>,
): Prisma.InputJsonValue {
  return referenceImages as Prisma.InputJsonValue;
}
