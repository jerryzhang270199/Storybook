import { spawn } from "node:child_process";
import { existsSync as fileExistsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_AMBIENT_AUDIO_URL,
  getSupportedAmbientAudioUrl,
} from "./ambient-audio";
import { estimateNarrationDurationMs } from "./book-reader";
import { getUploadsDir, loadImageBuffer } from "./image-storage";

export { getBookVideoFilename } from "./book-reader";

export type BookVideoPage = {
  audioUrl?: string | null;
  imageUrl: string;
  text: string;
};

export type BookVideoInput = {
  ambientAudioUrl?: string | null;
  title: string;
  pages: BookVideoPage[];
};

export type FfmpegRunner = (args: string[]) => Promise<void>;

type CreateBookVideoOptions = {
  ambientOnly?: boolean;
  book: BookVideoInput;
  ffmpegPath?: string | null;
  loadAmbientAudio?: (url: string) => Promise<Buffer>;
  loadFile?: (url: string) => Promise<Buffer>;
  runner?: FfmpegRunner;
  tempDirFactory?: () => Promise<string>;
};

type GetOrCreateCachedBookVideoOptions = {
  book: BookVideoInput;
  bookId: string;
  createVideo?: (input: { book: BookVideoInput }) => Promise<Buffer>;
  uploadsDir?: string;
};

type ResolveFfmpegPathOptions = {
  cwd?: string;
  existsSync?: (filePath: string) => boolean;
  ffmpegPath?: string | null;
};

const VIDEO_SIZE = 1080;
const BOOK_VIDEO_CACHE_DIRNAME = "video-cache";
const BOOK_VIDEO_CACHE_VERSION = "v2";
const bookVideoCacheRenders = new Map<string, Promise<Buffer>>();
const FFMPEG_BINARY_NAME = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
export const DEFAULT_AMBIENT_AUDIO_FILENAME = "ambient.mp3";
const MAX_FFMPEG_STDERR_CHARS = 12000;
const VIDEO_AMBIENT_AUDIO_VOLUME = "0.35";
const VIDEO_FILTER = [
  `scale=w=${VIDEO_SIZE}:h=${VIDEO_SIZE}:force_original_aspect_ratio=decrease`,
  `pad=w=${VIDEO_SIZE}:h=${VIDEO_SIZE}:x=(ow-iw)/2:y=(oh-ih)/2:color=0xfff8df`,
  "setsar=1",
  "format=yuv420p",
].join(",");

export function getContentDispositionFilename(filename: string): string {
  return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function getSafeBookVideoCacheKey(bookId: string): string {
  return bookId
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "book";
}

export function getBookVideoCachePath(
  bookId: string,
  uploadsDir: string = getUploadsDir(),
): string {
  return path.join(
    uploadsDir,
    BOOK_VIDEO_CACHE_DIRNAME,
    BOOK_VIDEO_CACHE_VERSION,
    `${getSafeBookVideoCacheKey(bookId)}.mp4`,
  );
}

export async function readCachedBookVideo(
  bookId: string,
  uploadsDir: string = getUploadsDir(),
): Promise<Buffer | null> {
  try {
    return await readFile(/* turbopackIgnore: true */ getBookVideoCachePath(bookId, uploadsDir));
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeCachedBookVideo(
  bookId: string,
  video: Buffer,
  uploadsDir: string = getUploadsDir(),
): Promise<string> {
  const cachePath = getBookVideoCachePath(bookId, uploadsDir);
  await mkdir(/* turbopackIgnore: true */ path.dirname(cachePath), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ cachePath, video);
  return cachePath;
}

export async function deleteCachedBookVideo(
  bookId: string,
  uploadsDir: string = getUploadsDir(),
): Promise<void> {
  const safeKey = getSafeBookVideoCacheKey(bookId);
  await Promise.all([
    rm(/* turbopackIgnore: true */ getBookVideoCachePath(bookId, uploadsDir), {
      force: true,
    }),
    rm(
      /* turbopackIgnore: true */ path.join(
        uploadsDir,
        BOOK_VIDEO_CACHE_DIRNAME,
        `${safeKey}.mp4`,
      ),
      { force: true },
    ),
  ]);
}

export async function getOrCreateCachedBookVideo({
  book,
  bookId,
  createVideo = ({ book: inputBook }) => createBookVideo({ book: inputBook }),
  uploadsDir = getUploadsDir(),
}: GetOrCreateCachedBookVideoOptions): Promise<{ cacheHit: boolean; video: Buffer }> {
  const cachePath = getBookVideoCachePath(bookId, uploadsDir);
  const cachedVideo = await readCachedBookVideo(bookId, uploadsDir);
  if (cachedVideo) {
    return { cacheHit: true, video: cachedVideo };
  }

  const existingRender = bookVideoCacheRenders.get(cachePath);
  if (existingRender) {
    return { cacheHit: false, video: await existingRender };
  }

  const render = Promise.resolve()
    .then(() => createVideo({ book }))
    .then(async (video) => {
      await writeCachedBookVideo(bookId, video, uploadsDir);
      return video;
    })
    .finally(() => {
      bookVideoCacheRenders.delete(cachePath);
    });
  bookVideoCacheRenders.set(cachePath, render);

  const video = await render;
  return { cacheHit: false, video };
}

export function resolveFfmpegPath({
  cwd,
  existsSync = fileExistsSync,
  ffmpegPath = null,
}: ResolveFfmpegPathOptions = {}): string {
  const projectFfmpegPath = cwd
    ? path.join(cwd, "node_modules", "ffmpeg-static", FFMPEG_BINARY_NAME)
    : path.join(
        process.cwd(),
        "node_modules",
        "ffmpeg-static",
        FFMPEG_BINARY_NAME,
      );
  const candidates = [
    ffmpegPath || null,
    projectFfmpegPath,
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(/* turbopackIgnore: true */ candidate)) {
      return candidate;
    }
  }

  if (ffmpegPath && !path.isAbsolute(ffmpegPath)) {
    return ffmpegPath;
  }

  throw new Error("ffmpeg binary is not available");
}

export function appendFfmpegStderrTail(
  current: string,
  chunk: string | Uint8Array,
  maxLength: number = MAX_FFMPEG_STDERR_CHARS,
): string {
  const next = current + String(chunk);
  return next.length > maxLength ? next.slice(-maxLength) : next;
}

function createFfmpegRunner(ffmpegPath: string): FfmpegRunner {
  return (args) =>
    new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, ["-hide_banner", "-v", "error", ...args], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";

      child.stderr.on("data", (chunk) => {
        stderr = appendFfmpegStderrTail(stderr, chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`ffmpeg failed with code ${code}: ${stderr.slice(-1200)}`));
      });
    });
}

function formatIndex(index: number): string {
  return String(index + 1).padStart(3, "0");
}

function escapeConcatPath(filePath: string): string {
  return `file '${filePath.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function getAmbientBackedDurationSeconds(durationSeconds: string): string {
  const parsedDuration = Number(durationSeconds);
  if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
    return durationSeconds;
  }

  return (parsedDuration + 4).toFixed(2);
}

async function writePageAsset({
  extension,
  index,
  loadFile,
  tempDir,
  url,
}: {
  extension: string;
  index: number;
  loadFile: (url: string) => Promise<Buffer>;
  tempDir: string;
  url: string;
}): Promise<string> {
  const assetPath = path.join(tempDir, `${extension === "mp3" ? "audio" : "page"}-${formatIndex(index)}.${extension}`);
  await writeFile(/* turbopackIgnore: true */ assetPath, await loadFile(url));
  return assetPath;
}

async function loadBundledAmbientAudio(url: string): Promise<Buffer> {
  const ambientAudioUrl = getSupportedAmbientAudioUrl(url);
  return readFile(
    /* turbopackIgnore: true */ path.join(process.cwd(), "public", ambientAudioUrl.slice(1)),
  );
}

async function writeAmbientAsset({
  ambientAudioUrl,
  loadAmbientAudio,
  tempDir,
}: {
  ambientAudioUrl: string;
  loadAmbientAudio: (url: string) => Promise<Buffer>;
  tempDir: string;
}): Promise<string> {
  const assetPath = path.join(tempDir, DEFAULT_AMBIENT_AUDIO_FILENAME);
  await writeFile(/* turbopackIgnore: true */ assetPath, await loadAmbientAudio(ambientAudioUrl));
  return assetPath;
}

function getSegmentArgs({
  ambientPath,
  audioPath,
  durationSeconds,
  imagePath,
  outputPath,
}: {
  ambientPath: string;
  audioPath: string | null;
  durationSeconds: string;
  imagePath: string;
  outputPath: string;
}): string[] {
  const ambientBackedDurationSeconds = audioPath
    ? getAmbientBackedDurationSeconds(durationSeconds)
    : durationSeconds;
  const inputArgs = audioPath
    ? [
        "-loop",
        "1",
        "-framerate",
        "30",
        "-t",
        ambientBackedDurationSeconds,
        "-i",
        imagePath,
        "-i",
        audioPath,
        "-stream_loop",
        "-1",
        "-t",
        ambientBackedDurationSeconds,
        "-i",
        ambientPath,
      ]
    : [
        "-loop",
        "1",
        "-framerate",
        "30",
        "-t",
        durationSeconds,
        "-i",
        imagePath,
        "-stream_loop",
        "-1",
        "-t",
        durationSeconds,
        "-i",
        ambientPath,
      ];
  const filterComplex = audioPath
    ? [
        `[0:v]${VIDEO_FILTER}[v]`,
        "[1:a]aformat=sample_rates=44100:channel_layouts=stereo[narration]",
        `[2:a]volume=${VIDEO_AMBIENT_AUDIO_VOLUME},aformat=sample_rates=44100:channel_layouts=stereo[ambient]`,
        "[narration][ambient]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]",
      ].join(";")
    : [
        `[0:v]${VIDEO_FILTER}[v]`,
        `[1:a]volume=${VIDEO_AMBIENT_AUDIO_VOLUME},aformat=sample_rates=44100:channel_layouts=stereo[a]`,
      ].join(";");

  return [
    "-y",
    ...inputArgs,
    "-filter_complex",
    filterComplex,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "stillimage",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

export async function createBookVideo({
  ambientOnly = false,
  book,
  ffmpegPath,
  loadAmbientAudio = loadBundledAmbientAudio,
  loadFile = loadImageBuffer,
  runner,
  tempDirFactory = () => mkdtemp(path.join(os.tmpdir(), "storybook-video-")),
}: CreateBookVideoOptions): Promise<Buffer> {
  if (book.pages.length === 0) {
    throw new Error("Cannot render an empty book video");
  }

  const tempDir = await tempDirFactory();
  const runFfmpeg = runner ?? createFfmpegRunner(resolveFfmpegPath({ ffmpegPath }));
  const segmentPaths: string[] = [];
  const ambientAudioUrl = getSupportedAmbientAudioUrl(book.ambientAudioUrl ?? DEFAULT_AMBIENT_AUDIO_URL);

  try {
    const ambientPath = await writeAmbientAsset({
      ambientAudioUrl,
      loadAmbientAudio,
      tempDir,
    });

    for (const [index, page] of book.pages.entries()) {
      const imagePath = await writePageAsset({
        extension: "png",
        index,
        loadFile,
        tempDir,
        url: page.imageUrl,
      });
      const audioUrl = ambientOnly ? null : page.audioUrl?.trim() || null;
      const audioPath = audioUrl
        ? await writePageAsset({
            extension: "mp3",
            index,
            loadFile,
            tempDir,
            url: audioUrl,
          })
        : null;
      const segmentPath = path.join(tempDir, `segment-${formatIndex(index)}.mp4`);
      const durationSeconds = (estimateNarrationDurationMs(page.text) / 1000).toFixed(2);

      await runFfmpeg(
        getSegmentArgs({
          ambientPath,
          audioPath,
          durationSeconds,
          imagePath,
          outputPath: segmentPath,
        }),
      );
      segmentPaths.push(segmentPath);
    }

    const concatPath = path.join(tempDir, "segments.txt");
    const outputPath = path.join(tempDir, "book.mp4");
    await writeFile(
      /* turbopackIgnore: true */ concatPath,
      `${segmentPaths.map(escapeConcatPath).join("\n")}\n`,
    );
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", "-movflags", "+faststart", outputPath]);

    return readFile(/* turbopackIgnore: true */ outputPath);
  } finally {
    await rm(/* turbopackIgnore: true */ tempDir, { force: true, recursive: true });
  }
}
