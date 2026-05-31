import { parseStoredReferenceImages } from "./generation-job";

type BookImageCleanupInput = {
  photoUrl: string | null;
  pages: Array<{ audioUrl?: string | null; imageUrl: string | null }>;
  generationJob?: { referenceImages: unknown } | null;
};

type ReferenceCleanupEnv = Record<string, string | undefined> & {
  KEEP_REFERENCE_IMAGES_AFTER_GENERATION?: string;
};

export function shouldDeleteReferenceImagesAfterSuccess(
  env: ReferenceCleanupEnv = process.env,
): boolean {
  return env.KEEP_REFERENCE_IMAGES_AFTER_GENERATION !== "true";
}

export function collectBookImageUrlsForDeletion(book: BookImageCleanupInput): string[] {
  const urls = new Set<string>();
  const addUrl = (url: string | null | undefined) => {
    if (url?.trim()) urls.add(url);
  };

  addUrl(book.photoUrl);
  for (const page of book.pages) {
    addUrl(page.imageUrl);
    addUrl(page.audioUrl);
  }

  try {
    for (const reference of parseStoredReferenceImages(book.generationJob?.referenceImages)) {
      addUrl(reference.url);
    }
  } catch {
    // Keep deletion best-effort if an older job has malformed reference metadata.
  }

  return Array.from(urls);
}
