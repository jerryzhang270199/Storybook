export {
  DEFAULT_AMBIENT_AUDIO_URL,
  DEFAULT_AMBIENT_AUDIO_VOLUME,
} from "./ambient-audio";
import {
  DEFAULT_AMBIENT_AUDIO_URL,
  DEFAULT_AMBIENT_AUDIO_VOLUME,
} from "./ambient-audio";

export type ReaderPageNarrationInput = {
  audioUrl?: string | null;
  text: string;
};

export type InteractiveBookDownload = {
  ambientAudioUrl?: string | null;
  title: string;
  pages: Array<{
    audioUrl?: string | null;
    imageUrl: string;
    text: string;
  }>;
};

export function getNextPageAfterNarration({
  autoPlay,
  currentPage,
  totalPages,
}: {
  autoPlay: boolean;
  currentPage: number;
  totalPages: number;
}): number {
  if (!autoPlay) return currentPage;

  const nextPage = currentPage + 1;
  return nextPage < totalPages ? nextPage : currentPage;
}

export function getReplayStartPage({
  currentPage,
  hasFinishedBookPlayback,
  totalPages,
}: {
  currentPage: number;
  hasFinishedBookPlayback: boolean;
  totalPages: number;
}): number {
  const finalPage = totalPages - 1;
  return hasFinishedBookPlayback && currentPage === finalPage ? 0 : currentPage;
}

export function getPageNarration(page: ReaderPageNarrationInput): {
  audioUrl: string | null;
  text: string | null;
} {
  const audioUrl = page.audioUrl?.trim() || null;
  const text = page.text.trim() || null;

  return { audioUrl, text };
}

export function estimateNarrationDurationMs(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;

  const chineseCharacters = normalized.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const wordCount = normalized
    .replace(/[\u4e00-\u9fff]/g, " ")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const unitCount = chineseCharacters + wordCount;
  return Math.min(16000, Math.max(1600, unitCount * 260));
}

export function getInteractiveBookFilename(title: string): string {
  const safeTitle = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);

  return `${safeTitle || "interactive-picture-book"}.html`;
}

export function getBookVideoFilename(title: string): string {
  const safeTitle = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);

  return `${safeTitle || "picture-book-video"}.mp4`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildInteractiveBookHtml(book: InteractiveBookDownload): string {
  const title = book.title.trim() || "互动绘本";
  const ambientAudioUrl = book.ambientAudioUrl?.trim() || DEFAULT_AMBIENT_AUDIO_URL;
  const pages = book.pages.map((page) => ({
    imageUrl: page.imageUrl,
    audioUrl: page.audioUrl?.trim() || null,
    text: page.text,
  }));
  const serializedBook = serializeForScript({ ambientAudioUrl, title, pages });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #fff8df;
      color: #332313;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    main { width: min(92vw, 680px); text-align: center; position: relative; perspective: 1100px; }
    h1 { margin: 0 0 18px; font-size: clamp(24px, 5vw, 36px); }
    .book-page-turn {
      position: relative;
      transform-origin: center center;
      transform-style: preserve-3d;
      backface-visibility: hidden;
      transition: transform .42s cubic-bezier(.22, 1, .36, 1), opacity .42s ease, filter .42s ease;
      will-change: transform, opacity;
    }
    .book-page-turn::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: 18px;
      background: linear-gradient(90deg, rgba(61, 37, 12, .12), transparent 28%, rgba(255, 255, 255, .22));
      opacity: .18;
    }
    .stage { position: relative; width: 100%; aspect-ratio: 1; border-radius: 18px; overflow: hidden; box-shadow: 0 18px 44px rgba(101, 62, 22, .2); background: #fff; }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .text { min-height: 72px; margin: 16px 0 0; padding: 16px 18px; border-radius: 14px; background: #fff; font-size: clamp(17px, 3.6vw, 22px); line-height: 1.65; box-shadow: 0 8px 24px rgba(101, 62, 22, .09); }
    .top-actions { position: absolute; inset-block-start: 8px; inset-inline-end: 8px; z-index: 2; display: flex; gap: 8px; }
    button {
      border: 0;
      border-radius: 999px;
      background: #fff7ed;
      color: #8a3f08;
      padding: 10px 14px;
      min-width: 74px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 3px 12px rgba(101, 62, 22, .12);
    }
    button:disabled { opacity: .35; cursor: not-allowed; }
    .primary { background: #d97706; color: white; }
    .controls { margin-top: 18px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; }
    .count { min-width: 60px; color: #7a6a5a; font-size: 14px; }
    @media (prefers-reduced-motion: reduce) {
      .book-page-turn { transition: none; }
    }
  </style>
</head>
<body>
  <main>
    <h1 id="title"></h1>
    <div id="pageShell" class="book-page-turn">
      <div class="stage">
        <div class="top-actions">
          <button id="muteButton" type="button">静音</button>
        </div>
        <img id="image" alt="">
      </div>
      <div id="text" class="text"></div>
    </div>
    <div class="controls">
      <button id="previousButton" type="button">上一页</button>
      <span id="count" class="count"></span>
      <button id="nextButton" type="button">下一页</button>
      <button id="playButton" class="primary" type="button">播放</button>
    </div>
    <audio id="audio" preload="auto"></audio>
  </main>
  <script>
    const book = ${serializedBook};
    const title = document.getElementById("title");
    const pageShell = document.getElementById("pageShell");
    const image = document.getElementById("image");
    const text = document.getElementById("text");
    const count = document.getElementById("count");
    const audio = document.getElementById("audio");
    const playButton = document.getElementById("playButton");
    const muteButton = document.getElementById("muteButton");
    const previousButton = document.getElementById("previousButton");
    const nextButton = document.getElementById("nextButton");

    let currentPage = 0;
    let isPaused = true;
    let isMuted = false;
    let silentTimer = 0;
    let turnTimer = 0;
    let ambient = null;
    const ambientAudioUrl = book.ambientAudioUrl || "${DEFAULT_AMBIENT_AUDIO_URL}";
    const AMBIENT_AUDIO_VOLUME = ${DEFAULT_AMBIENT_AUDIO_VOLUME};

    function estimateDuration(value) {
      const text = value.trim();
      if (!text) return 0;
      const chinese = (text.match(/[\\u4e00-\\u9fff]/g) || []).length;
      const words = text.replace(/[\\u4e00-\\u9fff]/g, " ").replace(/[^\\p{Letter}\\p{Number}\\s]/gu, " ").trim().split(/\\s+/).filter(Boolean).length;
      return Math.min(16000, Math.max(1600, (chinese + words) * 260));
    }

    function logAmbient(event, details = {}) {
      console.info("[book-ambient]", event, {
        source: ambientAudioUrl,
        volume: AMBIENT_AUDIO_VOLUME,
        muted: isMuted,
        page: currentPage + 1,
        ...details,
      });
    }

    function createAmbientAudioContext() {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("Web Audio API is not available");
      }
      return new AudioContextCtor();
    }

    async function loadAmbientAudioBuffer(context) {
      const response = await fetch(ambientAudioUrl);
      if (!response.ok) {
        throw new Error("Failed to load ambient audio: " + response.status);
      }
      return context.decodeAudioData(await response.arrayBuffer());
    }

    function setAmbientMuted(muted) {
      if (!ambient) {
        logAmbient("set-muted-without-audio", { muted });
        return false;
      }
      ambient.gain.gain.value = muted ? 0 : AMBIENT_AUDIO_VOLUME;
      logAmbient("volume-set", { muted, contextState: ambient.context.state, playing: ambient.isPlaying });
      return !muted && ambient.isPlaying;
    }

    async function startAmbientBed(reason = "playback") {
      logAmbient("start-requested", { existing: Boolean(ambient), reason });
      if (isMuted) {
        setAmbientMuted(true);
        return false;
      }

      if (!ambient) {
        const context = createAmbientAudioContext();
        const gain = context.createGain();
        gain.gain.value = AMBIENT_AUDIO_VOLUME;
        gain.connect(context.destination);
        ambient = {
          bufferPromise: loadAmbientAudioBuffer(context),
          context,
          gain,
          isPlaying: false,
          source: null,
        };
        logAmbient("audio-context-created", { reason, contextState: context.state });
      }

      setAmbientMuted(false);
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
          if (ambient && ambient.source === source) {
            ambient.source = null;
            ambient.isPlaying = false;
          }
        };
        source.start(0);
        ambient.source = source;
        ambient.isPlaying = true;
        logAmbient("web-audio-started", { contextState: ambient.context.state });
        return true;
      } catch (error) {
        logAmbient("web-audio-failed", { message: String(error), contextState: ambient.context.state });
        return false;
      }
    }

    function pauseAmbientBed(reason = "pause") {
      if (!ambient) return;
      if (ambient.source) {
        try {
          ambient.source.stop();
        } catch {}
        ambient.source.disconnect();
        ambient.source = null;
      }
      ambient.isPlaying = false;
      logAmbient("pause-requested", { reason, contextState: ambient.context.state });
    }

    function clearPlayback() {
      pauseAmbientBed("clear-playback");
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      clearTimeout(silentTimer);
    }

    function animatePageTurn(turnDirection, updatePage) {
      clearTimeout(turnTimer);
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        updatePage();
        return;
      }

      const exitAngle = turnDirection > 0 ? -82 : 82;
      const enterAngle = turnDirection > 0 ? 72 : -72;
      pageShell.style.transformOrigin = turnDirection > 0 ? "left center" : "right center";
      pageShell.style.opacity = "0";
      pageShell.style.filter = "drop-shadow(0 22px 28px rgba(77, 45, 16, .18))";
      pageShell.style.transform = "rotateY(" + exitAngle + "deg) translateX(" + (turnDirection > 0 ? -20 : 20) + "px)";

      turnTimer = window.setTimeout(() => {
        updatePage();
        pageShell.style.transition = "none";
        pageShell.style.transformOrigin = turnDirection > 0 ? "right center" : "left center";
        pageShell.style.opacity = "0";
        pageShell.style.transform = "rotateY(" + enterAngle + "deg) translateX(" + (turnDirection > 0 ? 20 : -20) + "px)";
        pageShell.offsetHeight;
        pageShell.style.transition = "";
        window.requestAnimationFrame(() => {
          pageShell.style.opacity = "1";
          pageShell.style.filter = "drop-shadow(0 10px 18px rgba(77, 45, 16, .08))";
          pageShell.style.transform = "rotateY(0deg) translateX(0)";
        });
      }, 210);
    }

    function goToPage(nextPage) {
      if (nextPage < 0 || nextPage >= book.pages.length) return;
      const shouldResume = !isPaused;
      const turnDirection = nextPage > currentPage ? 1 : -1;
      if (shouldResume) clearPlayback();
      currentPage = nextPage;
      animatePageTurn(turnDirection, () => {
        renderPage();
        if (shouldResume) playCurrentPage();
      });
    }

    function onPageEnded() {
      pauseAmbientBed("page-ended");
      if (currentPage < book.pages.length - 1) {
        goToPage(currentPage + 1);
      } else {
        isPaused = true;
        playButton.textContent = "播放";
      }
    }

    async function playCurrentPage() {
      clearPlayback();
      const page = book.pages[currentPage];
      isPaused = false;
      playButton.textContent = "暂停";
      if (page.audioUrl) {
        audio.src = page.audioUrl;
        audio.muted = isMuted;
        const ambientStarted = startAmbientBed("before-audio-play");
        const narrationStarted = audio.play();
        narrationStarted
          .then(async () => {
            await ambientStarted;
            logAmbient("narration-audio-played");
          })
          .catch(() => {
            pauseAmbientBed("audio-play-failed");
            logAmbient("narration-audio-failed");
            isPaused = true;
            playButton.textContent = "播放";
          });
        return;
      }
      await startAmbientBed("silent-page");
      silentTimer = window.setTimeout(onPageEnded, estimateDuration(page.text));
    }

    function renderPage() {
      const page = book.pages[currentPage];
      title.textContent = book.title;
      image.src = page.imageUrl;
      image.alt = book.title + " 第 " + (currentPage + 1) + " 页";
      text.textContent = page.text;
      count.textContent = (currentPage + 1) + " / " + book.pages.length;
      previousButton.disabled = currentPage === 0;
      nextButton.disabled = currentPage === book.pages.length - 1;
      muteButton.textContent = isMuted ? "取消静音" : "静音";
    }

    audio.addEventListener("ended", onPageEnded);
    playButton.addEventListener("click", () => {
      if (isPaused) {
        playCurrentPage();
      } else {
        isPaused = true;
        playButton.textContent = "播放";
        clearPlayback();
      }
    });
    muteButton.addEventListener("click", () => {
      isMuted = !isMuted;
      audio.muted = isMuted;
      void setAmbientMuted(isMuted);
      if (!isMuted && !isPaused) void startAmbientBed("unmuted");
      renderPage();
    });
    previousButton.addEventListener("click", () => goToPage(currentPage - 1));
    nextButton.addEventListener("click", () => goToPage(currentPage + 1));

    renderPage();
  </script>
</body>
</html>`;
}
