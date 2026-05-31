import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendFfmpegStderrTail,
  createBookVideo,
  DEFAULT_AMBIENT_AUDIO_FILENAME,
  deleteCachedBookVideo,
  getBookVideoFilename,
  getBookVideoCachePath,
  getOrCreateCachedBookVideo,
  getContentDispositionFilename,
  readCachedBookVideo,
  resolveFfmpegPath,
  writeCachedBookVideo,
  type FfmpegRunner,
} from "./book-video";

test("getBookVideoFilename keeps mp4 names filesystem-safe", () => {
  assert.equal(getBookVideoFilename("  小熊:回家/第一章  "), "小熊-回家-第一章.mp4");
  assert.equal(getBookVideoFilename("   "), "picture-book-video.mp4");
});

test("getContentDispositionFilename encodes non-ascii filenames", () => {
  assert.equal(
    getContentDispositionFilename("小熊回家.mp4"),
    "attachment; filename*=UTF-8''%E5%B0%8F%E7%86%8A%E5%9B%9E%E5%AE%B6.mp4",
  );
});

test("resolveFfmpegPath falls back to the project ffmpeg-static binary when bundled paths are stale", () => {
  const cwd = "/project";
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const projectBinary = path.join(cwd, "node_modules", "ffmpeg-static", binaryName);

  assert.equal(
    resolveFfmpegPath({
      cwd,
      existsSync: (filePath) => filePath === projectBinary,
      ffmpegPath: "/ROOT/node_modules/ffmpeg-static/ffmpeg",
    }),
    projectBinary,
  );
});

test("resolveFfmpegPath uses the package path when it exists", () => {
  assert.equal(
    resolveFfmpegPath({
      cwd: "/project",
      existsSync: (filePath) => filePath === "/tmp/ffmpeg",
      ffmpegPath: "/tmp/ffmpeg",
    }),
    "/tmp/ffmpeg",
  );
});

test("appendFfmpegStderrTail keeps only bounded diagnostics", () => {
  assert.equal(appendFfmpegStderrTail("abc", "def", 5), "bcdef");
  assert.equal(appendFfmpegStderrTail("abc", "def", 10), "abcdef");
});

test("book video cache stores videos under a safe uploads subdirectory", async () => {
  const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "storybook-video-cache-"));
  const cachePath = getBookVideoCachePath("../book:one", uploadsDir);

  assert.equal(cachePath, path.join(uploadsDir, "video-cache", "v2", "book-one.mp4"));
  assert.equal(await readCachedBookVideo("../book:one", uploadsDir), null);

  await writeCachedBookVideo("../book:one", Buffer.from("cached-video"), uploadsDir);

  assert.equal((await readCachedBookVideo("../book:one", uploadsDir))?.toString("utf8"), "cached-video");
  assert.equal(await readFile(cachePath, "utf8"), "cached-video");

  await deleteCachedBookVideo("../book:one", uploadsDir);
  await assert.rejects(stat(cachePath));
  await rm(uploadsDir, { recursive: true, force: true });
});

test("getOrCreateCachedBookVideo reuses cached mp4 before rendering", async () => {
  const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "storybook-video-cache-"));
  await writeCachedBookVideo("book-1", Buffer.from("cached-video"), uploadsDir);
  let renderCount = 0;

  const result = await getOrCreateCachedBookVideo({
    book: {
      title: "小熊回家",
      pages: [{ imageUrl: "/uploads/page-1.png", audioUrl: "/uploads/audio-1.mp3", text: "第一页" }],
    },
    bookId: "book-1",
    createVideo: async () => {
      renderCount += 1;
      return Buffer.from("new-video");
    },
    uploadsDir,
  });

  assert.equal(result.cacheHit, true);
  assert.equal(result.video.toString("utf8"), "cached-video");
  assert.equal(renderCount, 0);
  await rm(uploadsDir, { recursive: true, force: true });
});

test("getOrCreateCachedBookVideo writes newly rendered mp4 to cache", async () => {
  const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "storybook-video-cache-"));

  const result = await getOrCreateCachedBookVideo({
    book: {
      title: "小熊回家",
      pages: [{ imageUrl: "/uploads/page-1.png", audioUrl: "/uploads/audio-1.mp3", text: "第一页" }],
    },
    bookId: "book-2",
    createVideo: async () => Buffer.from("new-video"),
    uploadsDir,
  });

  assert.equal(result.cacheHit, false);
  assert.equal(result.video.toString("utf8"), "new-video");
  assert.equal((await readCachedBookVideo("book-2", uploadsDir))?.toString("utf8"), "new-video");
  await rm(uploadsDir, { recursive: true, force: true });
});

test("getOrCreateCachedBookVideo reuses an in-flight render for the same cached mp4", async () => {
  const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "storybook-video-cache-"));
  let renderCount = 0;
  let markRenderStarted: () => void = () => {};
  let finishRender: () => void = () => {};
  const renderStarted = new Promise<void>((resolve) => {
    markRenderStarted = resolve;
  });
  const renderGate = new Promise<void>((resolve) => {
    finishRender = resolve;
  });
  const book = {
    title: "小熊回家",
    pages: [{ imageUrl: "/uploads/page-1.png", audioUrl: "/uploads/audio-1.mp3", text: "第一页" }],
  };

  const first = getOrCreateCachedBookVideo({
    book,
    bookId: "book-3",
    createVideo: async () => {
      renderCount += 1;
      markRenderStarted();
      await renderGate;
      return Buffer.from("shared-video");
    },
    uploadsDir,
  });
  await renderStarted;

  const second = getOrCreateCachedBookVideo({
    book,
    bookId: "book-3",
    createVideo: async () => {
      renderCount += 1;
      await renderGate;
      return Buffer.from("duplicate-video");
    },
    uploadsDir,
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(renderCount, 1);

  finishRender();
  const results = await Promise.all([first, second]);

  assert.deepEqual(
    results.map((result) => result.video.toString("utf8")),
    ["shared-video", "shared-video"],
  );
  assert.equal((await readCachedBookVideo("book-3", uploadsDir))?.toString("utf8"), "shared-video");
  await rm(uploadsDir, { recursive: true, force: true });
});

test("createBookVideo renders image/audio pages into a final mp4 buffer", async () => {
  const calls: string[][] = [];
  const ambientUrls: string[] = [];
  const runner: FfmpegRunner = async (args) => {
    calls.push(args);
    const outputPath = args.at(-1);
    assert.ok(outputPath);
    await writeFile(outputPath, outputPath.endsWith("book.mp4") ? "final-video" : "segment-video");
  };

  const video = await createBookVideo({
    book: {
      ambientAudioUrl: "/ambient/candidates_final/neg/1_neg.mp3",
      title: "小熊回家",
      pages: [
        { imageUrl: "/uploads/page-1.png", audioUrl: "/uploads/audio-1.mp3", text: "第一页" },
        { imageUrl: "/uploads/page-2.png", audioUrl: null, text: "第二页没有声音" },
      ],
    },
    ffmpegPath: "ffmpeg",
    loadAmbientAudio: async (url) => {
      ambientUrls.push(url);
      return Buffer.from(`ambient:${url}`);
    },
    loadFile: async (url) => Buffer.from(`file:${url}`),
    runner,
    tempDirFactory: () => mkdtemp(path.join(os.tmpdir(), "book-video-test-")),
  });

  assert.equal(video.toString("utf8"), "final-video");
  assert.deepEqual(ambientUrls, ["/ambient/candidates_final/neg/1_neg.mp3"]);
  assert.equal(calls.length, 3);
  assert.ok(calls[0].includes("-shortest"));
  const filterArgIndex = calls[0].indexOf("-filter_complex");
  const filterComplex = calls[0][filterArgIndex + 1];
  assert.equal(
    filterComplex?.split(";")[0],
    "[0:v]scale=w=1080:h=1080:force_original_aspect_ratio=decrease,pad=w=1080:h=1080:x=(ow-iw)/2:y=(oh-ih)/2:color=0xfff8df,setsar=1,format=yuv420p[v]",
  );
  assert.doesNotMatch(filterComplex ?? "", /1080pad/);
  assert.ok(calls[0].some((arg) => arg.endsWith("audio-001.mp3")));
  assert.ok(calls[0].some((arg) => arg.endsWith(DEFAULT_AMBIENT_AUDIO_FILENAME)));
  assert.ok(calls[0].some((arg) => arg.endsWith(".mp3")));
  assert.ok(calls[0].includes("5.60"));
  assert.ok(calls[0].some((arg) => arg.includes("volume=0.35")));
  assert.ok(calls[0].some((arg) => arg.includes("amix=inputs=2:duration=first:dropout_transition=0:normalize=0")));
  assert.ok(calls[1].some((arg) => arg.endsWith(DEFAULT_AMBIENT_AUDIO_FILENAME)));
  assert.ok(calls[1].some((arg) => arg.includes("volume=0.35")));
  assert.ok(!calls[0].some((arg) => arg.includes("anoisesrc")));
  assert.ok(!calls[0].some((arg) => arg.includes("sine=frequency")));
  assert.deepEqual(calls[2].slice(0, 5), ["-y", "-f", "concat", "-safe", "0"]);
});

test("createBookVideo can render only ambient audio for diagnosis", async () => {
  const calls: string[][] = [];
  const ambientUrls: string[] = [];
  const runner: FfmpegRunner = async (args) => {
    calls.push(args);
    const outputPath = args.at(-1);
    assert.ok(outputPath);
    await writeFile(outputPath, outputPath.endsWith("book.mp4") ? "final-video" : "segment-video");
  };

  await createBookVideo({
    ambientOnly: true,
    book: {
      ambientAudioUrl: "/ambient/candidates_final/pos/2_pos.mp3",
      title: "小熊回家",
      pages: [
        { imageUrl: "/uploads/page-1.png", audioUrl: "/uploads/audio-1.mp3", text: "第一页" },
      ],
    },
    ffmpegPath: "ffmpeg",
    loadAmbientAudio: async (url) => {
      ambientUrls.push(url);
      return Buffer.from(`ambient:${url}`);
    },
    loadFile: async (url) => Buffer.from(`file:${url}`),
    runner,
    tempDirFactory: () => mkdtemp(path.join(os.tmpdir(), "book-video-test-")),
  });

  assert.deepEqual(ambientUrls, ["/ambient/candidates_final/pos/2_pos.mp3"]);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].some((arg) => arg.endsWith(DEFAULT_AMBIENT_AUDIO_FILENAME)));
  assert.ok(calls[0].some((arg) => arg.includes("volume=0.35")));
  assert.ok(!calls[0].some((arg) => arg.endsWith("audio-001.mp3")));
  assert.ok(!calls[0].some((arg) => arg.includes("[narration]")));
  assert.ok(!calls[0].some((arg) => arg.includes("anoisesrc")));
  assert.ok(!calls[0].some((arg) => arg.includes("sine=frequency")));
});
