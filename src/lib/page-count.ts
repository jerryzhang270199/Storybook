export const MIN_PAGE_COUNT = 1;
export const MAX_PAGE_COUNT = 9;
export const DEFAULT_PAGE_COUNT = 4;

export type PageCount = number;

const PAGE_COUNT_ERROR = `Page count must be an integer from ${MIN_PAGE_COUNT} to ${MAX_PAGE_COUNT}.`;

export function isPageCount(value: number): value is PageCount {
  return Number.isInteger(value) && value >= MIN_PAGE_COUNT && value <= MAX_PAGE_COUNT;
}

export function parsePageCount(value: FormDataEntryValue | null | undefined): PageCount {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_PAGE_COUNT;
  }

  const parsed = Number(value);
  if (!isPageCount(parsed)) {
    throw new Error(PAGE_COUNT_ERROR);
  }

  return parsed;
}
