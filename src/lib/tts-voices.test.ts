import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_TTS_VOICE_ID,
  TTS_VOICE_OPTIONS,
  getTtsVoiceProviderOverrides,
  parseTtsVoice,
} from "./tts-voices";

test("TTS voice options expose the four storybook choices", () => {
  assert.equal(DEFAULT_TTS_VOICE_ID, "child_girl");
  assert.deepEqual(
    TTS_VOICE_OPTIONS.map((voice) => ({
      id: voice.id,
      label: voice.label,
      providerName: voice.providerName,
      voiceType: voice.voiceType,
    })),
    [
      {
        id: "child_girl",
        label: "童声女孩",
        providerName: "少儿故事 2.0",
        voiceType: "zh_female_shaoergushi_uranus_bigtts",
      },
      {
        id: "child_boy",
        label: "童声男孩",
        providerName: "天才童声 2.0",
        voiceType: "zh_male_tiancaitongsheng_uranus_bigtts",
      },
      {
        id: "gentle_woman",
        label: "温柔女声",
        providerName: "小何 2.0",
        voiceType: "zh_female_xiaohe_uranus_bigtts",
      },
      {
        id: "sunny_man",
        label: "阳光男声",
        providerName: "小天 2.0",
        voiceType: "zh_male_taocheng_uranus_bigtts",
      },
    ],
  );
});

test("parseTtsVoice defaults blank selections and rejects unknown ids", () => {
  assert.equal(parseTtsVoice(null).id, DEFAULT_TTS_VOICE_ID);
  assert.equal(parseTtsVoice("").id, DEFAULT_TTS_VOICE_ID);
  assert.equal(parseTtsVoice("child_boy").voiceType, "zh_male_tiancaitongsheng_uranus_bigtts");
  assert.throws(() => parseTtsVoice("bad-voice"), /Invalid TTS voice/);
});

test("TTS voice options expose local avatar images", () => {
  assert.deepEqual(
    TTS_VOICE_OPTIONS.map((voice) => ({
      avatarUrl: voice.avatarUrl,
      id: voice.id,
    })),
    [
      { id: "child_girl", avatarUrl: "/brand/voice_icon/child_woman.svg" },
      { id: "child_boy", avatarUrl: "/brand/voice_icon/child_man.svg" },
      { id: "gentle_woman", avatarUrl: "/brand/voice_icon/woman.svg" },
      { id: "sunny_man", avatarUrl: "/brand/voice_icon/man.svg" },
    ],
  );

  for (const voice of TTS_VOICE_OPTIONS) {
    assert.equal(existsSync(new URL(`../../public${voice.avatarUrl}`, import.meta.url)), true);
  }
});

test("getTtsVoiceProviderOverrides returns the selected provider speaker", () => {
  assert.deepEqual(getTtsVoiceProviderOverrides("sunny_man"), {
    resourceId: "seed-tts-2.0",
    speaker: "zh_male_taocheng_uranus_bigtts",
  });
  assert.deepEqual(getTtsVoiceProviderOverrides("missing"), {
    resourceId: "seed-tts-2.0",
    speaker: "zh_female_shaoergushi_uranus_bigtts",
  });
});
