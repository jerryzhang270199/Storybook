"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_REFERENCE_IMAGES, validateUploadedImages } from "@/lib/uploads";
import {
  DEFAULT_PAGE_COUNT,
  MAX_PAGE_COUNT,
  MIN_PAGE_COUNT,
  type PageCount,
} from "@/lib/page-count";
import {
  DEFAULT_STORY_STYLE_ID,
  STYLE_OPTIONS,
  type StoryStyleId,
} from "@/lib/story-styles";
import {
  DEFAULT_TTS_VOICE_ID,
  TTS_VOICE_OPTIONS,
  type TtsVoiceId,
} from "@/lib/tts-voices";
import { GENERATION_JOB_STATUS, type GenerationJobStatus } from "@/lib/generation-job";
import { REFERENCE_CHARACTER_ROLE_OPTIONS } from "@/lib/reference-characters";

type SelectedPhoto = {
  id: string;
  file: File;
  isCustomRole: boolean;
  nickname: string;
  previewUrl: string;
  roleLabel: string;
};

type GenerationJobResponse = {
  bookId?: string | null;
  code?: "LOCAL_CONFIGURATION_REQUIRED" | string;
  error?: string | null;
  jobId?: string;
  status?: GenerationJobStatus;
};

const DEFAULT_PHOTO_USAGE = "character";
const ALL_PRIMARY_REFERENCE = "all";

function getPhotoId(file: File) {
  return `${file.name}-${file.lastModified}-${file.size}-${crypto.randomUUID()}`;
}

function readPhotoPreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to read image preview"));
    };
    reader.onerror = () => reject(new Error("Failed to read image preview"));
    reader.readAsDataURL(file);
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPhotoDisplayName(photo: SelectedPhoto, index: number) {
  return photo.nickname.trim() || photo.roleLabel.trim() || `参考图${index + 1}`;
}

export default function CreatePage() {
  const router = useRouter();
  const photoInputId = useId();
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState<StoryStyleId>(DEFAULT_STORY_STYLE_ID);
  const [ttsVoice, setTtsVoice] = useState<TtsVoiceId>(DEFAULT_TTS_VOICE_ID);
  const [pageCount, setPageCount] = useState<PageCount>(DEFAULT_PAGE_COUNT);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [primaryPhotoId, setPrimaryPhotoId] = useState<string>(ALL_PRIMARY_REFERENCE);
  const [isDraggingPhotos, setIsDraggingPhotos] = useState(false);
  const [loading, setLoading] = useState(false);

  const addPhotos = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) {
      return;
    }

    const validation = validateUploadedImages([
      ...photos.map((photo) => photo.file),
      ...selectedFiles,
    ]);
    if (!validation.ok) {
      alert(validation.error);
      return;
    }

    try {
      const nextPhotos = await Promise.all(
        selectedFiles.map(async (file) => ({
          id: getPhotoId(file),
          file,
          isCustomRole: false,
          nickname: "",
          previewUrl: await readPhotoPreview(file),
          roleLabel: "",
        })),
      );
      setPhotos((current) => [...current, ...nextPhotos]);
    } catch {
      alert("图片预览读取失败，请重新选择图片。");
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await addPhotos(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const handlePhotoDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (photos.length < MAX_REFERENCE_IMAGES && event.dataTransfer.types.includes("Files")) {
      setIsDraggingPhotos(true);
    }
  };

  const handlePhotoDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = photos.length >= MAX_REFERENCE_IMAGES ? "none" : "copy";
    if (photos.length < MAX_REFERENCE_IMAGES && event.dataTransfer.types.includes("Files")) {
      setIsDraggingPhotos(true);
    }
  };

  const handlePhotoDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingPhotos(false);
  };

  const handlePhotoDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingPhotos(false);
    if (photos.length >= MAX_REFERENCE_IMAGES) {
      return;
    }

    await addPhotos(Array.from(event.dataTransfer.files));
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => current.filter((photo) => photo.id !== id));
    setPrimaryPhotoId((current) => (current === id ? ALL_PRIMARY_REFERENCE : current));
  };

  const updatePhotoCharacter = (
    id: string,
    updates: Partial<Pick<SelectedPhoto, "isCustomRole" | "nickname" | "roleLabel">>,
  ) => {
    setPhotos((current) =>
      current.map((photo) => (photo.id === id ? { ...photo, ...updates } : photo)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || photos.length === 0) return;

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("description", description);
      formData.append("style", style);
      formData.append("ttsVoice", ttsVoice);
      formData.append("pageCount", String(pageCount));
      formData.append("photoUsage", DEFAULT_PHOTO_USAGE);
      formData.append(
        "referenceCharacters",
        JSON.stringify({
          primaryReference:
            primaryPhotoId === ALL_PRIMARY_REFERENCE ||
            photos.findIndex((photo) => photo.id === primaryPhotoId) < 0
              ? "all"
              : String(photos.findIndex((photo) => photo.id === primaryPhotoId) + 1),
          characters: photos.map((photo, index) => ({
            nickname: photo.nickname.trim(),
            referenceIndex: index + 1,
            roleLabel: photo.roleLabel.trim() || "参考角色",
          })),
        }),
      );
      photos.forEach((photo) => formData.append("photos", photo.file));

      const res = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const payload = (await res.json()) as GenerationJobResponse;

      if (payload.code === "LOCAL_CONFIGURATION_REQUIRED") {
        alert(payload.error || "本地配置还没完成，请检查 .env，然后运行 npm run doctor。");
        return;
      }

      if (!res.ok && res.status !== 409) {
        const err = payload;
        throw new Error(err.error || "Generation failed");
      }

      if (!payload.jobId) {
        throw new Error("Generation job was not created");
      }

      for (let attempt = 0; attempt < 240; attempt += 1) {
        await wait(2000);
        const jobRes = await fetch(`/api/generation-jobs/${payload.jobId}`, {
          cache: "no-store",
        });
        if (!jobRes.ok) {
          throw new Error("生成状态查询失败");
        }

        const job = (await jobRes.json()) as GenerationJobResponse;

        if (job.status === GENERATION_JOB_STATUS.completed) {
          if (!job.bookId) throw new Error("生成完成但没有找到绘本");
          router.push(`/book/${job.bookId}`);
          return;
        }

        if (job.status === GENERATION_JOB_STATUS.failed) {
          throw new Error(job.error || "Failed to generate book");
        }
      }

      throw new Error("生成时间过长，请稍后到我的绘本查看结果。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      alert(message.startsWith("生成失败") ? message : `生成失败：${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-amber-900">创作绘本</h1>
          <button
            type="button"
            onClick={() => router.push("/my-books")}
            className="rounded-full border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
          >
            我的绘本
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" aria-busy={loading}>
          {/* Photo Upload */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              上传参考照片
            </label>
            <div
              onDragEnter={handlePhotoDragEnter}
              onDragOver={handlePhotoDragOver}
              onDragLeave={handlePhotoDragLeave}
              onDrop={handlePhotoDrop}
              className={`rounded-xl border-2 border-dashed bg-white p-3 transition-colors ${
                isDraggingPhotos
                  ? "border-amber-500 bg-amber-50"
                  : "border-amber-300"
              }`}
            >
              {photos.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {photos.map((photo, index) => (
                      <div
                        key={photo.id}
                        className="space-y-3 rounded-lg bg-amber-50 p-3"
                      >
                        <div className="relative flex min-h-40 items-center justify-center overflow-hidden rounded-lg bg-white">
                          <Image
                            src={photo.previewUrl}
                            alt={`参考照片 ${index + 1}`}
                            width={480}
                            height={360}
                            unoptimized
                            sizes="(max-width: 768px) 100vw, 320px"
                            className="max-h-52 w-auto max-w-full object-contain"
                          />
                          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-amber-900 shadow-sm">
                            {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removePhoto(photo.id)}
                            className="absolute right-2 top-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-red-50 hover:text-red-700"
                          >
                            移除
                          </button>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-700">这是谁？</p>
                          <div className="flex flex-wrap gap-2">
                            {REFERENCE_CHARACTER_ROLE_OPTIONS.map((role) => {
                              const selected =
                                role.id === "custom"
                                  ? photo.isCustomRole
                                  : !photo.isCustomRole && photo.roleLabel === role.label;

                              if (role.id === "custom" && photo.isCustomRole) {
                                return (
                                  <input
                                    key={role.id}
                                    value={photo.roleLabel}
                                    onChange={(event) =>
                                      updatePhotoCharacter(photo.id, {
                                        roleLabel: event.target.value,
                                      })
                                    }
                                    placeholder="输入身份关系"
                                    aria-label={`输入参考照片 ${index + 1} 的身份关系`}
                                    autoFocus
                                    className="min-w-24 rounded-full border border-amber-500 bg-white px-3 py-1 text-xs font-medium text-amber-800 outline-none transition-colors focus:ring-2 focus:ring-amber-200"
                                  />
                                );
                              }

                              return (
                                <button
                                  key={role.id}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() =>
                                    updatePhotoCharacter(photo.id, {
                                      isCustomRole: role.id === "custom",
                                      roleLabel: role.id === "custom" ? "" : role.label,
                                    })
                                  }
                                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                    selected
                                      ? "border-amber-500 bg-white text-amber-800"
                                      : "border-amber-200 bg-white/70 text-gray-600 hover:border-amber-400"
                                  }`}
                                >
                                  {role.label}
                                </button>
                              );
                            })}
                          </div>
                          <label className="block text-xs font-medium text-gray-700">
                            怎么称呼
                            <input
                              value={photo.nickname}
                              onChange={(event) =>
                                updatePhotoCharacter(photo.id, {
                                  nickname: event.target.value,
                                })
                              }
                              placeholder="比如：小宇、周一、宝宝"
                              className="mt-1 w-full rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                    {photos.length < MAX_REFERENCE_IMAGES && (
                      <label
                        htmlFor={photoInputId}
                        className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/60 p-4 text-center transition-colors hover:border-amber-500 hover:bg-amber-100"
                      >
                        <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white text-3xl font-light leading-none text-amber-700 shadow-sm">
                          +
                        </span>
                        <span className="text-sm font-medium text-amber-800">继续添加</span>
                        <span className="mt-1 text-xs text-gray-500">
                          还可添加 {MAX_REFERENCE_IMAGES - photos.length} 张
                        </span>
                        <span className="mt-1 text-xs text-gray-400">支持拖拽添加</span>
                      </label>
                    )}
                  </div>
                  <p className="text-center text-xs text-gray-500">
                    已选择 {photos.length}/{MAX_REFERENCE_IMAGES} 张
                  </p>
                  <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3">
                    <p className="text-xs font-medium text-gray-700">谁是主角？</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setPrimaryPhotoId(ALL_PRIMARY_REFERENCE)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          primaryPhotoId === ALL_PRIMARY_REFERENCE
                            ? "border-amber-500 bg-white text-amber-800"
                            : "border-amber-200 bg-white/70 text-gray-600 hover:border-amber-400"
                        }`}
                      >
                        一起
                      </button>
                      {photos.map((photo, index) => (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => setPrimaryPhotoId(photo.id)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            primaryPhotoId === photo.id
                              ? "border-amber-500 bg-white text-amber-800"
                              : "border-amber-200 bg-white/70 text-gray-600 hover:border-amber-400"
                          }`}
                        >
                          {getPhotoDisplayName(photo, index)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor={photoInputId}
                  className="flex min-h-60 cursor-pointer flex-col items-center justify-center rounded-lg p-4 text-center transition-colors hover:bg-amber-50"
                >
                  <p className="text-amber-600 font-medium">点击或拖拽上传参考照片</p>
                  <p className="text-xs text-gray-400 mt-1">
                    最多 {MAX_REFERENCE_IMAGES} 张，支持 JPG, PNG, WebP，每张最大 8MB
                  </p>
                </label>
              )}
              <input
                id={photoInputId}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoChange}
                disabled={photos.length >= MAX_REFERENCE_IMAGES}
                className="hidden"
              />
            </div>
          </div>

          {/* Story Description */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              场景描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="你想记录下哪个瞬间？写下一个人、一段记忆又或是一个小愿望。也许是孩子第一次摇摇晃晃地走向你，也许是和爱人第一次认真牵起手，也许是过去那个一直在等着被抱抱的自己。"
              rows={4}
              className="w-full p-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-amber-300 focus:border-amber-300 outline-none resize-none"
            />
          </div>

          {/* Page Count */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor="page-count"
                className="block text-sm font-medium text-gray-700"
              >
                绘本页数
              </label>
              <div className="text-right">
                <div className="text-2xl font-semibold text-amber-800">{pageCount} 页</div>
                <div className="text-xs text-gray-500">{pageCount} 张图</div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-5">
              <input
                id="page-count"
                type="range"
                min={MIN_PAGE_COUNT}
                max={MAX_PAGE_COUNT}
                step={1}
                value={pageCount}
                onChange={(event) => setPageCount(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-amber-500"
                aria-valuemin={MIN_PAGE_COUNT}
                aria-valuemax={MAX_PAGE_COUNT}
                aria-valuenow={pageCount}
                aria-valuetext={`${pageCount} 页，${pageCount} 张图`}
              />
              <div className="mt-3 flex justify-between text-xs text-gray-500">
                <span>{MIN_PAGE_COUNT} 页</span>
                <span>{MAX_PAGE_COUNT} 页</span>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              默认 4 张图，更适合朋友圈分享。
            </p>
          </div>

          {/* TTS Voice Picker */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              朗读声音
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {TTS_VOICE_OPTIONS.map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  onClick={() => setTtsVoice(voice.id)}
                  className={`flex min-h-16 items-center justify-between gap-3 rounded-lg border-2 px-4 py-3 text-left text-sm font-medium transition-colors ${
                    ttsVoice === voice.id
                      ? "border-amber-500 bg-amber-50 text-amber-800"
                      : "border-gray-200 bg-white text-gray-600 hover:border-amber-300"
                  }`}
                >
                  <span>{voice.label}</span>
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white shadow-sm ring-1 ${
                      ttsVoice === voice.id ? "ring-amber-200" : "ring-gray-100"
                    }`}
                  >
                    <Image
                      src={voice.avatarUrl}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      width={36}
                      height={36}
                      unoptimized
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Style Picker */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              绘本风格
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {STYLE_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStyle(s.id)}
                  className={`flex min-h-[80px] items-center gap-3 rounded-lg border-2 p-2.5 text-sm transition-colors ${
                    style === s.id
                      ? "border-amber-500 bg-amber-50 text-amber-800"
                      : "border-gray-200 bg-white text-gray-600 hover:border-amber-300"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
                    <div className="font-medium">{s.name}</div>
                    <div className="mt-1 max-w-60 text-xs leading-5 opacity-70">{s.description}</div>
                  </div>
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-white/60 shadow-sm ring-1 ring-current/10 sm:h-14 sm:w-14">
                    <Image
                      src={s.thumbnailUrl}
                      alt={`${s.name} 风格示例`}
                      fill
                      sizes="56px"
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !description || photos.length === 0}
            className="w-full py-3 bg-amber-600 text-white rounded-full text-lg font-medium hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "生成中..." : "生成绘本"}
          </button>
        </form>
      </div>
    </main>
  );
}
