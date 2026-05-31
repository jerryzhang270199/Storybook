import { NextResponse } from "next/server";
import { ensureBookPageAudioUrl } from "@/lib/book-page-audio";
import { prisma } from "@/lib/db";
import { getTtsProviderConfig } from "@/lib/tts-provider";
import { getTtsVoiceProviderOverrides } from "@/lib/tts-voices";

export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> },
) {
  const { id, pageId } = await params;

  try {
    const book = await prisma.book.findUnique({
      where: { id },
      select: { ttsVoice: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const audioUrl = await ensureBookPageAudioUrl({
      bookId: id,
      config: getTtsProviderConfig(process.env, getTtsVoiceProviderOverrides(book.ttsVoice)),
      pageId,
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
    });

    return NextResponse.json({ audioUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate page audio";
    if (message === "Book page not found") {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    if (message === "Doubao TTS is not configured") {
      return NextResponse.json(
        { error: "豆包 TTS 未配置。请配置 DOUBAO_TTS_API_KEY，或配置 DOUBAO_TTS_APP_ID / DOUBAO_TTS_ACCESS_KEY。" },
        { status: 503 },
      );
    }
    if (message === "Doubao TTS credentials are invalid") {
      return NextResponse.json(
        { error: "豆包 TTS 凭证无效。DOUBAO_API_KEY 不能用于语音合成，请检查 DOUBAO_TTS_API_KEY。" },
        { status: 503 },
      );
    }
    if (message === "Doubao TTS resource is not granted") {
      return NextResponse.json(
        { error: "豆包 TTS 资源未开通或未授权。请在豆包语音控制台开通 seed-tts-2.0，并确认当前凭证有权限。" },
        { status: 503 },
      );
    }

    console.error("[book-page-audio] generation failed", {
      bookId: id,
      pageId,
      message,
    });
    return NextResponse.json({ error: "豆包音频生成失败，请稍后重试。" }, { status: 502 });
  }
}
