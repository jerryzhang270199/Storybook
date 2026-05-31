export type TtsVoiceId =
  | "child_girl"
  | "child_boy"
  | "gentle_woman"
  | "sunny_man";

export type TtsVoiceOption = {
  avatarUrl: string;
  description: string;
  id: TtsVoiceId;
  label: string;
  providerName: string;
  resourceId: string;
  voiceType: string;
};

export const TTS_VOICE_OPTIONS = [
  {
    avatarUrl: "/brand/voice_icon/child_woman.svg",
    id: "child_girl",
    label: "童声女孩",
    providerName: "少儿故事 2.0",
    description: "清亮、有故事感，适合亲子绘本",
    resourceId: "seed-tts-2.0",
    voiceType: "zh_female_shaoergushi_uranus_bigtts",
  },
  {
    avatarUrl: "/brand/voice_icon/child_man.svg",
    id: "child_boy",
    label: "童声男孩",
    providerName: "天才童声 2.0",
    description: "活泼、童真，适合孩子视角",
    resourceId: "seed-tts-2.0",
    voiceType: "zh_male_tiancaitongsheng_uranus_bigtts",
  },
  {
    avatarUrl: "/brand/voice_icon/woman.svg",
    id: "gentle_woman",
    label: "温柔女声",
    providerName: "小何 2.0",
    description: "自然、温柔，适合安静叙事",
    resourceId: "seed-tts-2.0",
    voiceType: "zh_female_xiaohe_uranus_bigtts",
  },
  {
    avatarUrl: "/brand/voice_icon/man.svg",
    id: "sunny_man",
    label: "阳光男声",
    providerName: "小天 2.0",
    description: "明朗、亲切，适合轻快故事",
    resourceId: "seed-tts-2.0",
    voiceType: "zh_male_taocheng_uranus_bigtts",
  },
] as const satisfies readonly TtsVoiceOption[];

export const DEFAULT_TTS_VOICE_ID: TtsVoiceId = "child_girl";

const TTS_VOICE_BY_ID = new Map<TtsVoiceId, TtsVoiceOption>(
  TTS_VOICE_OPTIONS.map((voice) => [voice.id, voice]),
);

export function parseTtsVoice(value: FormDataEntryValue | string | null | undefined): TtsVoiceOption {
  const voiceId = typeof value === "string" ? value.trim() : "";
  if (!voiceId) return TTS_VOICE_BY_ID.get(DEFAULT_TTS_VOICE_ID)!;

  const voice = TTS_VOICE_BY_ID.get(voiceId as TtsVoiceId);
  if (!voice) {
    throw new Error("Invalid TTS voice");
  }

  return voice;
}

export function getTtsVoiceProviderOverrides(value: string | null | undefined) {
  const voice = TTS_VOICE_BY_ID.get((value ?? "") as TtsVoiceId) ?? TTS_VOICE_BY_ID.get(DEFAULT_TTS_VOICE_ID)!;
  return {
    resourceId: voice.resourceId,
    speaker: voice.voiceType,
  };
}
