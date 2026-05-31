"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  buildInteractiveBookHtml,
  DEFAULT_AMBIENT_AUDIO_URL,
  DEFAULT_AMBIENT_AUDIO_VOLUME,
  getBookVideoFilename,
  estimateNarrationDurationMs,
  getInteractiveBookFilename,
  getNextPageAfterNarration,
  getPageNarration,
  getReplayStartPage,
} from "@/lib/book-reader";

interface Page {
  audioUrl?: string | null;
  id: string;
  pageNumber: number;
  text: string;
  imageUrl: string;
}

interface Book {
  ambientAudioUrl?: string | null;
  id: string;
  title: string;
  pages: Page[];
}

type AmbientBed = {
  bufferPromise: Promise<AudioBuffer>;
  context: AudioContext;
  gain: GainNode;
  isPlaying: boolean;
  source: AudioBufferSourceNode | null;
  sourceUrl: string;
};

type AmbientBedRef = {
  current: AmbientBed | null;
};

type BrowserAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

type StopNarrationOptions = {
  pauseAmbient?: boolean;
  updateState?: boolean;
};

type PlayNarrationOptions = {
  preserveAmbient?: boolean;
};

type GoToOptions = {
  autoPlay?: boolean;
};

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.readAsDataURL(blob);
  });
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载资源失败: ${response.status}`);
  }

  return readBlobAsDataUrl(await response.blob());
}

function downloadTextFile(filename: string, content: string, type: string) {
  downloadBlobFile(filename, new Blob([content], { type }));
}

function downloadBlobFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      {muted ? (
        <>
          <path d="m19 9-4 6" />
          <path d="m15 9 4 6" />
        </>
      ) : (
        <>
          <path d="M16 9.5a4 4 0 0 1 0 5" />
          <path d="M18.5 7a7 7 0 0 1 0 10" />
        </>
      )}
    </svg>
  );
}

function logAmbient(event: string, details: Record<string, unknown> = {}) {
  console.info("[book-ambient]", event, {
    source: DEFAULT_AMBIENT_AUDIO_URL,
    volume: DEFAULT_AMBIENT_AUDIO_VOLUME,
    ...details,
  });
}

const pageTurnVariants = {
  initial: (turnDirection: number) => ({
    filter: "drop-shadow(0 16px 28px rgba(77, 45, 16, 0.12))",
    opacity: turnDirection === 0 ? 1 : 0.9,
    rotateY: turnDirection === 0 ? 0 : turnDirection > 0 ? 14 : -14,
    scale: turnDirection === 0 ? 1 : 0.996,
    transformOrigin: turnDirection > 0 ? "right center" : "left center",
    transformPerspective: 1400,
    x: turnDirection === 0 ? 0 : turnDirection > 0 ? 10 : -10,
  }),
  animate: {
    filter: "drop-shadow(0 12px 22px rgba(77, 45, 16, 0.08))",
    opacity: 1,
    rotateY: 0,
    scale: 1,
    transformOrigin: "center center",
    transformPerspective: 1400,
    x: 0,
  },
};

const reducedPageTurnVariants = {
  initial: { opacity: 0.92 },
  animate: { opacity: 1 },
};

const PAGE_TURN_AUTO_PLAY_DELAY_MS = 320;
const PAGE_TURN_IMAGE_PRELOAD_SPAN = 1;

function createAmbientAudioContext(): AudioContext {
  const AudioContextCtor = window.AudioContext ?? (window as BrowserAudioWindow).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("Web Audio API is not available");
  }

  return new AudioContextCtor();
}

async function loadAmbientAudioBuffer(context: AudioContext, ambientAudioUrl: string): Promise<AudioBuffer> {
  const response = await fetch(ambientAudioUrl);
  if (!response.ok) {
    throw new Error(`Failed to load ambient audio: ${response.status}`);
  }

  return context.decodeAudioData(await response.arrayBuffer());
}

function setAmbientBedMuted(ambientRef: AmbientBedRef, muted: boolean): boolean {
  const ambient = ambientRef.current;
  if (!ambient) {
    logAmbient("set-muted-without-audio", { muted });
    return false;
  }

  ambient.gain.gain.value = muted ? 0 : DEFAULT_AMBIENT_AUDIO_VOLUME;
  logAmbient("volume-set", {
    muted,
    contextState: ambient.context.state,
    playing: ambient.isPlaying,
    target: muted ? 0 : DEFAULT_AMBIENT_AUDIO_VOLUME,
  });
  return !muted && ambient.isPlaying;
}

async function startAmbientBed(
  ambientRef: AmbientBedRef,
  muted: boolean,
  ambientAudioUrl: string,
  reason = "playback",
): Promise<boolean> {
  logAmbient("start-requested", {
    existing: Boolean(ambientRef.current),
    muted,
    reason,
    source: ambientAudioUrl,
  });
  if (muted) {
    setAmbientBedMuted(ambientRef, true);
    return false;
  }

  let ambient = ambientRef.current;
  if (ambient && ambient.sourceUrl !== ambientAudioUrl) {
    closeAmbientBed(ambientRef);
    ambient = null;
  }

  if (!ambient) {
    const context = createAmbientAudioContext();
    const gain = context.createGain();
    gain.gain.value = DEFAULT_AMBIENT_AUDIO_VOLUME;
    gain.connect(context.destination);
    ambient = {
      bufferPromise: loadAmbientAudioBuffer(context, ambientAudioUrl),
      context,
      gain,
      isPlaying: false,
      source: null,
      sourceUrl: ambientAudioUrl,
    };
    ambientRef.current = ambient;
    logAmbient("audio-context-created", { contextState: context.state, reason });
  }

  setAmbientBedMuted(ambientRef, false);
  try {
    await ambient.context.resume();
    if (ambient.isPlaying && ambient.source) {
      return true;
    }

    const source = ambient.context.createBufferSource();
    source.buffer = await ambient.bufferPromise;
    source.loop = true;
    source.connect(ambient.gain);
    source.onended = () => {
      if (ambientRef.current?.source === source) {
        ambientRef.current.source = null;
        ambientRef.current.isPlaying = false;
      }
    };
    source.start(0);
    ambient.source = source;
    ambient.isPlaying = true;
    logAmbient("web-audio-started", { contextState: ambient.context.state });
    return true;
  } catch (error: unknown) {
    logAmbient("web-audio-failed", {
      message: error instanceof Error ? error.message : String(error),
      contextState: ambient.context.state,
    });
    return false;
  }
}

function pauseAmbientBed(ambientRef: AmbientBedRef, reason = "pause") {
  const ambient = ambientRef.current;
  if (!ambient) return;

  if (ambient.source) {
    try {
      ambient.source.stop();
    } catch {
      // The source may already have ended.
    }
    ambient.source.disconnect();
    ambient.source = null;
  }
  ambient.isPlaying = false;
  logAmbient("pause-requested", { contextState: ambient.context.state, reason });
}

function closeAmbientBed(ambientRef: AmbientBedRef) {
  const ambient = ambientRef.current;
  if (!ambient) return;

  pauseAmbientBed(ambientRef, "close");
  void ambient.context.close().catch((error: unknown) => {
    logAmbient("audio-context-close-failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  });
  logAmbient("audio-closed");
  ambientRef.current = null;
}

export default function BookPage() {
  const shouldReduceMotion = useReducedMotion();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ambientRef = useRef<AmbientBed | null>(null);
  const silentTimerRef = useRef<number | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [pendingAutoPlay, setPendingAutoPlay] = useState(false);
  const [hasFinishedBookPlayback, setHasFinishedBookPlayback] = useState(false);
  const [playbackNotice, setPlaybackNotice] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isVideoDownloading, setIsVideoDownloading] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadBook() {
      try {
        const res = await fetch(`/api/books/${params.id}`);
        if (!res.ok) {
          throw new Error(res.status === 404 ? "找不到这本绘本" : "绘本加载失败");
        }

        const data = (await res.json()) as Book;
        if (!Array.isArray(data.pages) || data.pages.length === 0) {
          throw new Error("这本绘本没有可显示的页面");
        }

        if (!ignore) setBook(data);
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "绘本加载失败");
        }
      }
    }

    loadBook();

    return () => {
      ignore = true;
    };
  }, [params.id]);

  const pages = book?.pages ?? [];
  const totalPages = pages.length;
  const page = pages[currentPage] ?? null;
  const ambientAudioUrl = book?.ambientAudioUrl?.trim() || DEFAULT_AMBIENT_AUDIO_URL;
  const narration = page ? getPageNarration(page) : { audioUrl: null, text: null };
  const canPlayNarration = Boolean(narration.audioUrl || narration.text);

  const stopNarration = useCallback(
    ({ pauseAmbient = true, updateState = true }: StopNarrationOptions = {}) => {
      if (pauseAmbient) {
        pauseAmbientBed(ambientRef, "stop-narration");
      }

      if (silentTimerRef.current !== null) {
        window.clearTimeout(silentTimerRef.current);
        silentTimerRef.current = null;
      }

      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      if (updateState) setIsPlaying(false);
    },
    [],
  );

  const handleNarrationEnded = useCallback(() => {
    if (silentTimerRef.current !== null) {
      window.clearTimeout(silentTimerRef.current);
      silentTimerRef.current = null;
    }

    const nextPage = getNextPageAfterNarration({
      autoPlay: true,
      currentPage,
      totalPages,
    });

    setHasFinishedBookPlayback(nextPage === currentPage && currentPage === totalPages - 1);

    if (nextPage !== currentPage) {
      setIsPlaying(false);
      setDirection(1);
      setCurrentPage(nextPage);
      setPendingAutoPlay(true);
      return;
    }

    pauseAmbientBed(ambientRef, "page-ended");
    setIsPlaying(false);
  }, [currentPage, totalPages]);

  const setPageAudioUrl = useCallback((pageId: string, audioUrl: string) => {
    setBook((currentBook) => {
      if (!currentBook) return currentBook;

      return {
        ...currentBook,
        pages: currentBook.pages.map((bookPage) =>
          bookPage.id === pageId ? { ...bookPage, audioUrl } : bookPage,
        ),
      };
    });
  }, []);

  const ensureCurrentPageAudioUrl = useCallback(async (): Promise<string | null> => {
    if (!book || !page || !narration.text) return null;
    if (narration.audioUrl) return narration.audioUrl;

    setPlaybackNotice("正在生成豆包音频...");
    const response = await fetch(`/api/books/${book.id}/pages/${page.id}/audio`, {
      method: "POST",
    });
    const payload = (await response.json()) as { audioUrl?: string; error?: string };
    if (!response.ok || !payload.audioUrl) {
      throw new Error(payload.error || "豆包音频生成失败，请稍后重试。");
    }

    setPageAudioUrl(page.id, payload.audioUrl);
    return payload.audioUrl;
  }, [book, narration.audioUrl, narration.text, page, setPageAudioUrl]);

  const playAudioUrl = useCallback(
    async (audioUrl: string) => {
      const audio = audioRef.current;
      if (!audio) return;

      try {
        audio.src = audioUrl;
        audio.currentTime = 0;
        audio.muted = isMuted;
        const ambientStarted = startAmbientBed(
          ambientRef,
          isMuted,
          ambientAudioUrl,
          "before-audio-play",
        );
        const narrationStarted = audio.play();
        await narrationStarted;
        if (!(await ambientStarted)) {
          setPlaybackNotice("旁白已播放，背景音暂时无法播放。点播放按钮可重新尝试。");
        }
        logAmbient("narration-audio-played", { muted: isMuted });
        setIsPlaying(true);
      } catch (error) {
        pauseAmbientBed(ambientRef, "audio-play-failed");
        setIsPlaying(false);
        logAmbient("narration-audio-failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        setPlaybackNotice("浏览器拦截了自动播放，点播放开始。");
      }
    },
    [ambientAudioUrl, isMuted],
  );

  const playNarration = useCallback(
    async ({ preserveAmbient = false }: PlayNarrationOptions = {}) => {
      if (!narration.audioUrl && !narration.text) return;

      stopNarration({ pauseAmbient: !preserveAmbient });
      setPlaybackNotice("");

      if (narration.audioUrl) {
        await playAudioUrl(narration.audioUrl);
        return;
      }

      if (isMuted && narration.text) {
        const duration = estimateNarrationDurationMs(narration.text);
        setIsPlaying(true);
        silentTimerRef.current = window.setTimeout(handleNarrationEnded, duration);
        return;
      }

      try {
        const audioUrl = await ensureCurrentPageAudioUrl();
        if (audioUrl) {
          await playAudioUrl(audioUrl);
        }
      } catch (audioError) {
        setIsPlaying(false);
        setPlaybackNotice(
          audioError instanceof Error ? audioError.message : "豆包音频生成失败，请稍后重试。",
        );
      }
    },
    [
      ensureCurrentPageAudioUrl,
      handleNarrationEnded,
      isMuted,
      narration.audioUrl,
      narration.text,
      playAudioUrl,
      stopNarration,
    ],
  );

  const toggleMuted = () => {
    const nextMuted = !isMuted;
    const shouldRestartFallback = isPlaying && !narration.audioUrl && Boolean(narration.text);
    setIsMuted(nextMuted);
    void setAmbientBedMuted(ambientRef, nextMuted);
    if (!nextMuted && isPlaying) {
      void startAmbientBed(ambientRef, false, ambientAudioUrl, "unmuted");
    }
    if (shouldRestartFallback) {
      stopNarration({ pauseAmbient: false, updateState: false });
      setPendingAutoPlay(true);
    }
  };

  const downloadInteractiveBook = async () => {
    if (!book || isDownloading) return;

    setIsDownloading(true);
    try {
      const downloadableAmbientAudioUrl = await fetchAsDataUrl(ambientAudioUrl);
      const downloadablePages = await Promise.all(
        book.pages.map(async (bookPage) => ({
          text: bookPage.text,
          imageUrl: await fetchAsDataUrl(bookPage.imageUrl),
          audioUrl: bookPage.audioUrl ? await fetchAsDataUrl(bookPage.audioUrl) : null,
        })),
      );

      downloadTextFile(
        getInteractiveBookFilename(book.title),
        buildInteractiveBookHtml({
          ambientAudioUrl: downloadableAmbientAudioUrl,
          title: book.title,
          pages: downloadablePages,
        }),
        "text/html;charset=utf-8",
      );
    } catch (downloadError) {
      alert(downloadError instanceof Error ? downloadError.message : "下载绘本失败");
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadBookVideo = async () => {
    if (!book || isVideoDownloading) return;

    setIsVideoDownloading(true);
    try {
      const response = await fetch(`/api/books/${book.id}/video`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "MP4 导出失败，请稍后重试。");
      }

      downloadBlobFile(getBookVideoFilename(book.title), await response.blob());
    } catch (downloadError) {
      alert(downloadError instanceof Error ? downloadError.message : "MP4 导出失败");
    } finally {
      setIsVideoDownloading(false);
    }
  };

  useEffect(() => {
    return () => {
      stopNarration({ updateState: false });
      closeAmbientBed(ambientRef);
    };
  }, [stopNarration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.muted = isMuted;
    void setAmbientBedMuted(ambientRef, isMuted);
    if (!isMuted && isPlaying) {
      void startAmbientBed(ambientRef, false, ambientAudioUrl, "mute-state-effect");
    }
  }, [ambientAudioUrl, isMuted, isPlaying]);

  useEffect(() => {
    if (!pendingAutoPlay || !page) return;

    const timer = window.setTimeout(() => {
      setPendingAutoPlay(false);
      void playNarration({ preserveAmbient: true });
    }, PAGE_TURN_AUTO_PLAY_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [page, pendingAutoPlay, playNarration]);

  if (error) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg text-amber-900">{error}</p>
        <button
          onClick={() => router.push("/my-books")}
          className="px-5 py-2 rounded-full bg-amber-600 text-white font-medium hover:bg-amber-700 transition-colors"
        >
          返回我的绘本
        </button>
      </main>
    );
  }

  if (!book) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-amber-700">加载中...</div>
      </main>
    );
  }

  if (!page) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg text-amber-900">这本绘本没有可显示的页面</p>
        <button
          onClick={() => router.push("/my-books")}
          className="px-5 py-2 rounded-full bg-amber-600 text-white font-medium hover:bg-amber-700 transition-colors"
        >
          返回我的绘本
        </button>
      </main>
    );
  }

  const goTo = (next: number, { autoPlay = false }: GoToOptions = {}) => {
    if (next < 0 || next >= totalPages) return;
    const shouldResume = autoPlay || isPlaying;
    if (shouldResume) {
      stopNarration({ pauseAmbient: false });
    } else {
      stopNarration();
    }
    setHasFinishedBookPlayback(false);
    setPendingAutoPlay(shouldResume);
    setDirection(next > currentPage ? 1 : -1);
    setCurrentPage(next);
  };

  const toggleNarration = () => {
    if (isPlaying) {
      stopNarration();
      return;
    }

    const replayStartPage = getReplayStartPage({
      currentPage,
      hasFinishedBookPlayback,
      totalPages,
    });
    if (replayStartPage !== currentPage) {
      goTo(replayStartPage, { autoPlay: true });
      return;
    }

    void playNarration();
  };

  const preloadedPages = pages.filter(
    (_, index) =>
      index !== currentPage && Math.abs(index - currentPage) <= PAGE_TURN_IMAGE_PRELOAD_SPAN,
  );

  return (
    <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-8">
      <div className="absolute right-4 top-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/create")}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-amber-800 shadow-sm ring-1 ring-amber-200 transition-colors hover:bg-amber-50"
        >
          创作新绘本
        </button>
        <button
          type="button"
          onClick={downloadInteractiveBook}
          disabled={isDownloading}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-amber-800 shadow-sm ring-1 ring-amber-200 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDownloading ? "下载中" : "下载网页绘本"}
        </button>
        <button
          type="button"
          onClick={downloadBookVideo}
          disabled={isVideoDownloading}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-amber-800 shadow-sm ring-1 ring-amber-200 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isVideoDownloading ? "导出中" : "下载MP4"}
        </button>
      </div>
      <h1 className="text-2xl font-bold text-amber-900 mb-6">{book.title}</h1>

      <div className="relative w-full max-w-lg [contain:layout_paint] [perspective:1400px]">
        <button
          type="button"
          onClick={toggleMuted}
          aria-label={isMuted ? "取消静音" : "静音"}
          aria-pressed={isMuted}
          title={isMuted ? "取消静音" : "静音"}
          className={`absolute right-4 top-4 z-20 grid h-12 w-12 place-items-center rounded-full shadow-lg ring-1 backdrop-blur transition-colors ${
            isMuted
              ? "bg-amber-700 text-white ring-amber-800/20 hover:bg-amber-800"
              : "bg-white/88 text-amber-900 ring-white/70 hover:bg-white"
          }`}
        >
          <VolumeIcon muted={isMuted} />
        </button>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 aspect-square overflow-hidden opacity-0">
          {preloadedPages.map((preloadPage) => (
            <Image
              key={preloadPage.id}
              src={preloadPage.imageUrl}
              alt=""
              fill
              loading="eager"
              sizes="(max-width: 768px) 100vw, 512px"
              className="object-contain"
            />
          ))}
        </div>
        <motion.div
          key={currentPage}
          custom={direction}
          variants={shouldReduceMotion ? reducedPageTurnVariants : pageTurnVariants}
          initial="initial"
          animate="animate"
          transition={
            shouldReduceMotion ? { duration: 0.1 } : { duration: 0.28, ease: [0.2, 0, 0, 1] }
          }
          className="relative flex flex-col [backface-visibility:hidden] [transform-style:preserve-3d] transform-gpu will-change-transform"
        >
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-white shadow-lg">
            <Image
              src={page.imageUrl}
              alt={`Page ${page.pageNumber}`}
              fill
              fetchPriority="high"
              loading="eager"
              sizes="(max-width: 768px) 100vw, 512px"
              className="object-contain"
            />
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(90deg,rgba(120,53,15,0.1),transparent_20%,rgba(255,251,235,0.22)_50%,transparent_78%,rgba(120,53,15,0.08))] opacity-20" />
          </div>
          <div className="mt-4 p-4 bg-white rounded-xl shadow-sm text-center">
            <p className="text-lg text-gray-800 leading-relaxed">{page.text}</p>
          </div>
        </motion.div>
      </div>

      <audio
        ref={audioRef}
        src={narration.audioUrl ?? undefined}
        preload="metadata"
        onEnded={handleNarrationEnded}
        onError={() => {
          logAmbient("audio-element-error");
          setIsPlaying(false);
        }}
        muted={isMuted}
      />

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => goTo(currentPage - 1)}
          disabled={currentPage === 0}
          className="px-4 py-2 rounded-full bg-amber-100 text-amber-800 disabled:opacity-30 hover:bg-amber-200 transition-colors"
        >
          上一页
        </button>
        <span className="text-sm text-gray-500">
          {currentPage + 1} / {totalPages}
        </span>
        <button
          onClick={() => goTo(currentPage + 1)}
          disabled={currentPage === totalPages - 1}
          className="px-4 py-2 rounded-full bg-amber-100 text-amber-800 disabled:opacity-30 hover:bg-amber-200 transition-colors"
        >
          下一页
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={toggleNarration}
          disabled={!canPlayNarration}
          className="min-w-28 rounded-full bg-amber-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPlaying ? "暂停" : "播放"}
        </button>
      </div>

      {playbackNotice ? <p className="mt-3 text-sm text-amber-700">{playbackNotice}</p> : null}

      <button
        onClick={() => router.push("/my-books")}
        className="mt-6 text-sm text-amber-600 hover:underline"
      >
        返回我的绘本
      </button>
    </main>
  );
}
