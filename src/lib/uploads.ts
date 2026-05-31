export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_REFERENCE_IMAGES = 4;
export const MAX_TOTAL_UPLOAD_BYTES = MAX_REFERENCE_IMAGES * MAX_UPLOAD_BYTES;

export const SUPPORTED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type SupportedImageMimeType = keyof typeof SUPPORTED_IMAGE_TYPES;

type UploadCandidate = {
  name: string;
  size: number;
  type: string;
};

export type UploadValidationResult =
  | { ok: true; extension: (typeof SUPPORTED_IMAGE_TYPES)[SupportedImageMimeType] }
  | { ok: false; error: string };

export type MultiUploadValidationResult =
  | {
      ok: true;
      items: Array<{ extension: (typeof SUPPORTED_IMAGE_TYPES)[SupportedImageMimeType] }>;
    }
  | { ok: false; error: string };

export function isSupportedImageType(type: string): type is SupportedImageMimeType {
  return type in SUPPORTED_IMAGE_TYPES;
}

export function validateUploadedImage(file: UploadCandidate): UploadValidationResult {
  if (file.size <= 0) {
    return { ok: false, error: "Please upload a non-empty image file." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "Image must be 8MB or smaller." };
  }

  if (!isSupportedImageType(file.type)) {
    return { ok: false, error: "Image must be a JPG, PNG, or WebP file." };
  }

  return { ok: true, extension: SUPPORTED_IMAGE_TYPES[file.type] };
}

export function validateUploadedImages(files: UploadCandidate[]): MultiUploadValidationResult {
  if (files.length === 0) {
    return { ok: false, error: "Please upload at least one reference image." };
  }

  if (files.length > MAX_REFERENCE_IMAGES) {
    return { ok: false, error: `Please upload up to ${MAX_REFERENCE_IMAGES} reference images.` };
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
    return { ok: false, error: "Reference images must be 32MB or smaller in total." };
  }

  const items = [];
  for (const file of files) {
    const validation = validateUploadedImage(file);
    if (!validation.ok) return validation;
    items.push({ extension: validation.extension });
  }

  return { ok: true, items };
}
