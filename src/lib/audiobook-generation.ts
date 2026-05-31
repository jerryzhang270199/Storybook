import { generateFilename, saveFile } from "./image-storage";
import {
  generateNarrationAudio,
  getTtsProviderConfig,
  type TtsProviderConfig,
} from "./tts-provider";

type AudioPage = {
  text: string;
};

type GenerateAudio = (input: {
  config: TtsProviderConfig;
  index: number;
  text: string;
}) => Promise<Buffer | null>;

type SaveAudio = (buffer: Buffer, index: number) => Promise<string>;

export async function generatePageAudioUrls({
  pages,
  config = getTtsProviderConfig(),
  generateAudio = ({ config: ttsConfig, text }) =>
    generateNarrationAudio({ text, config: ttsConfig }),
  saveAudio = (buffer) => saveFile(buffer, generateFilename("audio", "mp3"), "audio/mpeg"),
}: {
  pages: AudioPage[];
  config?: TtsProviderConfig | null;
  generateAudio?: GenerateAudio;
  saveAudio?: SaveAudio;
}): Promise<Array<string | null>> {
  if (!config) return pages.map(() => null);

  const audioUrls: Array<string | null> = [];
  for (let index = 0; index < pages.length; index += 1) {
    try {
      const audio = await generateAudio({ config, index, text: pages[index].text });
      audioUrls.push(audio ? await saveAudio(audio, index) : null);
    } catch (error) {
      console.warn("[audiobook] narration generation skipped for page", {
        pageNumber: index + 1,
        message: error instanceof Error ? error.message : "unknown error",
      });
      audioUrls.push(null);
    }
  }

  return audioUrls;
}
