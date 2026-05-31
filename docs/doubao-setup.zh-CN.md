# 豆包 / 火山引擎方舟配置指南

Storybook AI 使用豆包 / 火山引擎方舟完成三件事：

- `DOUBAO_API_KEY`：调用方舟故事和图片模型的 API Key
- `DOUBAO_STORY_MODEL`：生成故事文本的聊天/文本模型，或对应的推理接入点 ID
- `DOUBAO_IMAGE_MODEL`：生成绘本图片的图片模型，或对应的推理接入点 ID

TTS 朗读是可选能力。没有配置 `DOUBAO_TTS_API_KEY` 时，仍然可以生成绘本，只是朗读音频和 MP4 导出可能不可用。

## 1. 准备方舟 API Key

在火山引擎控制台进入方舟相关页面，创建或复制可用的 API Key，然后填入 `.env`：

```bash
DOUBAO_API_KEY="你的方舟 API Key"
```

这个 key 只放在服务端 `.env` 里。不要把它写进前端代码，也不要改成 `NEXT_PUBLIC_` 开头。

## 2. 填写故事模型

`DOUBAO_STORY_MODEL` 需要是能返回文本的聊天/文本模型，或你在方舟里创建的推理接入点 ID。

```bash
DOUBAO_STORY_MODEL="你的文本模型或推理接入点 ID"
```

如果这里填成图片模型，生成故事时通常会失败，错误可能表现为“故事生成返回格式异常”或模型不支持当前请求格式。

## 3. 填写图片模型

`DOUBAO_IMAGE_MODEL` 需要是支持图片生成或图片编辑的模型，或对应的推理接入点 ID。

```bash
DOUBAO_IMAGE_MODEL="你的图片模型或推理接入点 ID"
```

默认图片尺寸是：

```bash
DOUBAO_IMAGE_SIZE="2K"
```

`DOUBAO_IMAGE_SIZE=2K` 是为了适配 Seedream 5 一类模型的最低尺寸要求。如果你换了图片模型，按该模型文档支持的尺寸调整。

## 4. 可选：配置 TTS 朗读

朗读音频使用豆包语音产品，和方舟 API Key 不是同一个配置。

```bash
DOUBAO_TTS_API_KEY=""
DOUBAO_TTS_RESOURCE_ID="seed-tts-2.0"
DOUBAO_TTS_VOICE_TYPE="zh_female_shaoergushi_uranus_bigtts"
```

不填 `DOUBAO_TTS_API_KEY` 不会阻止绘本生成。

## 5. 检查本地配置

修改 `.env` 后运行：

```bash
npm run doctor
npm run doctor:doubao
```

`npm run doctor:doubao` 默认只发起一次低 token 的故事模型文本请求，用于验证 `DOUBAO_API_KEY` 和 `DOUBAO_STORY_MODEL`。默认不会发起图片生成请求，避免诊断命令直接产生图片生成成本。

默认也不会发起 TTS 请求。如果你已经配置 `DOUBAO_TTS_API_KEY`，并愿意发起一次真实语音合成请求来验证 TTS，运行：

```bash
npm run doctor:doubao -- --check-tts
```

如果你愿意发起一次真实图片生成请求来验证 `DOUBAO_IMAGE_MODEL`，运行：

```bash
npm run doctor:doubao -- --check-image
```

如果输出“本地配置检查通过”和“故事模型验证通过”，就可以继续：

```bash
npm run setup:local
npm run dev
```

## 常见错误

### 401 或认证失败

通常是 `DOUBAO_API_KEY` 无效、复制时多了空格，或者模型不属于这个账号。重新复制 key，并确认故事模型和图片模型都在同一个火山账号下开通。

### 模型不存在或无权限

确认 `DOUBAO_STORY_MODEL` 和 `DOUBAO_IMAGE_MODEL` 是模型 ID 或推理接入点 ID，不是模型展示名。也要确认账号已经开通对应模型权限。

### 图片尺寸配置不兼容

保留：

```bash
DOUBAO_IMAGE_SIZE="2K"
```

如果仍然失败，检查你使用的图片模型文档，换成该模型支持的尺寸。

### quota / 额度 / 计费问题

如果报错包含 `quota`、额度、余额或计费相关提示，请到火山控制台检查账号余额、计费状态和模型用量限制。

### 请求超时

图片生成可能需要较长时间。可以先重试；如果经常超时，再在 `.env` 中适当调大：

```bash
DOUBAO_STORY_TIMEOUT_MS="90000"
DOUBAO_IMAGE_TIMEOUT_MS="180000"
```
