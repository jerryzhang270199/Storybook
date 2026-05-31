type GenerationConcurrencyEnv = Record<string, string | undefined> & {
  PER_BOOK_IMAGE_CONCURRENCY?: string;
};

const DEFAULT_PER_BOOK_IMAGE_CONCURRENCY = 1;

export function getPerBookImageConcurrencyLimit(
  env: GenerationConcurrencyEnv = process.env,
): number {
  return parsePositiveInteger(env.PER_BOOK_IMAGE_CONCURRENCY, DEFAULT_PER_BOOK_IMAGE_CONCURRENCY);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}
