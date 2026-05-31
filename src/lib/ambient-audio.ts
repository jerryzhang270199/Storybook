export type AmbientAudioMood = "neg" | "pos";

type AmbientStoryPage = {
  text: string;
};

const POSITIVE_AMBIENT_AUDIO_TRACKS = [
  "/ambient/candidates_final/pos/2_pos.mp3",
  "/ambient/candidates_final/pos/3_pos.mp3",
  "/ambient/candidates_final/pos/4_pos.mp3",
  "/ambient/candidates_final/pos/5_pos.mp3",
  "/ambient/candidates_final/pos/7_pos.mp3",
] as const;

const NEGATIVE_AMBIENT_AUDIO_TRACKS = [
  "/ambient/candidates_final/neg/1_neg.mp3",
  "/ambient/candidates_final/neg/6_neg.mp3",
] as const;

const SUPPORTED_AMBIENT_AUDIO_TRACKS = [
  ...POSITIVE_AMBIENT_AUDIO_TRACKS,
  ...NEGATIVE_AMBIENT_AUDIO_TRACKS,
] as const;

const NEGATIVE_STORY_PATTERN =
  /害怕|恐惧|可怕|迷路|孤单|孤独|难过|伤心|哭|眼泪|失落|告别|离别|生病|吵架|争吵|黑暗|危险|怪物|scared|afraid|fear|lost|lonely|sad|cry|tears|goodbye|dark|danger|monster/i;

export const AMBIENT_AUDIO_TRACKS: Record<AmbientAudioMood, readonly string[]> = {
  neg: NEGATIVE_AMBIENT_AUDIO_TRACKS,
  pos: POSITIVE_AMBIENT_AUDIO_TRACKS,
};

export const DEFAULT_AMBIENT_AUDIO_URL = POSITIVE_AMBIENT_AUDIO_TRACKS[0];
export const DEFAULT_AMBIENT_AUDIO_VOLUME = 0.18;

export function inferAmbientAudioMood({
  description,
  pages,
  title,
}: {
  description: string;
  pages: AmbientStoryPage[];
  title: string;
}): AmbientAudioMood {
  const text = [description, title, ...pages.map((page) => page.text)].join(" ");
  return NEGATIVE_STORY_PATTERN.test(text) ? "neg" : "pos";
}

export function pickAmbientAudioUrl(
  mood: AmbientAudioMood,
  randomIndex: (maxExclusive: number) => number = (maxExclusive) =>
    Math.floor(Math.random() * maxExclusive),
): string {
  const pool = AMBIENT_AUDIO_TRACKS[mood];
  const index = Math.max(0, Math.min(pool.length - 1, randomIndex(pool.length)));
  return pool[index] ?? DEFAULT_AMBIENT_AUDIO_URL;
}

export function selectAmbientAudioUrl(input: {
  description: string;
  pages: AmbientStoryPage[];
  title: string;
}): string {
  return pickAmbientAudioUrl(inferAmbientAudioMood(input));
}

export function getSupportedAmbientAudioUrl(value: string | null | undefined): string {
  const url = value?.trim();
  return url && (SUPPORTED_AMBIENT_AUDIO_TRACKS as readonly string[]).includes(url)
    ? url
    : DEFAULT_AMBIENT_AUDIO_URL;
}
