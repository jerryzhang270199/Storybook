import { generateFilename, saveFile } from "./image-storage";
import {
  generateNarrationAudio,
  getTtsProviderConfig,
  type TtsProviderConfig,
} from "./tts-provider";

export type BookPageAudioStore = {
  findPage(input: {
    bookId: string;
    pageId: string;
  }): Promise<{ audioUrl: string | null; id: string; text: string } | null>;
  updatePageAudioUrl(input: { audioUrl: string; pageId: string }): Promise<void>;
};

type GenerateAudio = (input: {
  config: TtsProviderConfig;
  text: string;
}) => Promise<Buffer | null>;

type SaveAudio = (buffer: Buffer) => Promise<string>;

export async function ensureBookPageAudioUrl({
  bookId,
  config = getTtsProviderConfig(),
  generateAudio = ({ config: ttsConfig, text }) => generateNarrationAudio({ text, config: ttsConfig }),
  pageId,
  saveAudio = (buffer) => saveFile(buffer, generateFilename("audio", "mp3"), "audio/mpeg"),
  store,
}: {
  bookId: string;
  config?: TtsProviderConfig | null;
  generateAudio?: GenerateAudio;
  pageId: string;
  saveAudio?: SaveAudio;
  store: BookPageAudioStore;
}): Promise<string> {
  const page = await store.findPage({ bookId, pageId });
  if (!page) {
    throw new Error("Book page not found");
  }

  const existingAudioUrl = page.audioUrl?.trim();
  if (existingAudioUrl) return existingAudioUrl;

  if (!config) {
    throw new Error("Doubao TTS is not configured");
  }

  const audio = await generateAudio({ config, text: page.text });
  if (!audio) {
    throw new Error("Doubao TTS returned no audio");
  }

  const audioUrl = await saveAudio(audio);
  await store.updatePageAudioUrl({ audioUrl, pageId: page.id });
  return audioUrl;
}
