import { NextRequest, NextResponse } from "next/server";
import { ensureBookPageAudioUrl } from "@/lib/book-page-audio";
import {
  createBookVideo,
  getBookVideoFilename,
  getContentDispositionFilename,
  getOrCreateCachedBookVideo,
  readCachedBookVideo,
} from "@/lib/book-video";
import { prisma } from "@/lib/db";
import { getTtsProviderConfig } from "@/lib/tts-provider";
import { getTtsVoiceProviderOverrides } from "@/lib/tts-voices";

export const runtime = "nodejs";
export const maxDuration = 300;

function createVideoResponse(video: Buffer, filename: string) {
  const videoBody = new Uint8Array(video).buffer;

  return new NextResponse(videoBody, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": getContentDispositionFilename(filename),
      "Content-Type": "video/mp4",
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const book = await prisma.book.findUnique({
    where: { id },
    select: {
      id: true,
      ambientAudioUrl: true,
      ttsVoice: true,
      title: true,
      pages: {
        orderBy: { pageNumber: "asc" },
        select: {
          id: true,
          pageNumber: true,
          text: true,
          imageUrl: true,
          audioUrl: true,
        },
      },
    },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }
  if (book.pages.length === 0) {
    return NextResponse.json({ error: "这本绘本没有可导出的视频页面。" }, { status: 400 });
  }

  try {
    const ambientOnly = request.nextUrl.searchParams.get("ambientOnly") === "1";
    const filename = getBookVideoFilename(book.title);
    console.info("[book-video] generation requested", {
      ambientOnly,
      bookId: id,
      pages: book.pages.length,
    });

    if (!ambientOnly) {
      const cachedVideo = await readCachedBookVideo(book.id);
      if (cachedVideo) {
        console.info("[book-video] cache hit", { bookId: id });
        return createVideoResponse(cachedVideo, filename);
      }
    }

    const pages = [];
    const ttsConfig = getTtsProviderConfig(process.env, getTtsVoiceProviderOverrides(book.ttsVoice));
    for (const page of book.pages) {
      const audioUrl =
        ambientOnly ? null : page.audioUrl?.trim() ||
        (await ensureBookPageAudioUrl({
          bookId: book.id,
          config: ttsConfig,
          pageId: page.id,
          store: {
            findPage(input) {
              return prisma.page.findFirst({
                where: {
                  id: input.pageId,
                  bookId: input.bookId,
                },
                select: {
                  id: true,
                  text: true,
                  audioUrl: true,
                },
              });
            },
            async updatePageAudioUrl(input) {
              await prisma.page.update({
                where: { id: input.pageId },
                data: { audioUrl: input.audioUrl },
              });
            },
          },
        }));

      pages.push({
        audioUrl,
        imageUrl: page.imageUrl,
        text: page.text,
      });
    }

    const videoBook = {
      ambientAudioUrl: book.ambientAudioUrl,
      title: book.title,
      pages,
    };
    const video = ambientOnly ? await createBookVideo({
      ambientOnly,
      book: videoBook,
    }) : (await getOrCreateCachedBookVideo({
      book: videoBook,
      bookId: book.id,
    })).video;

    return createVideoResponse(video, filename);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate book video";
    if (message === "Doubao TTS is not configured") {
      return NextResponse.json(
        { error: "豆包 TTS 未配置，无法导出带声音的 MP4。请配置 DOUBAO_TTS_API_KEY。" },
        { status: 503 },
      );
    }
    if (message === "Doubao TTS credentials are invalid") {
      return NextResponse.json(
        { error: "豆包 TTS 凭证无效，无法导出带声音的 MP4。DOUBAO_API_KEY 不能用于语音合成。" },
        { status: 503 },
      );
    }
    if (message === "Doubao TTS resource is not granted") {
      return NextResponse.json(
        { error: "豆包 TTS 资源未开通或未授权，无法导出带声音的 MP4。请在豆包语音控制台开通 seed-tts-2.0。" },
        { status: 503 },
      );
    }

    console.error("[book-video] generation failed", {
      bookId: id,
      message,
    });
    return NextResponse.json({ error: "MP4 导出失败，请稍后重试。" }, { status: 502 });
  }
}
