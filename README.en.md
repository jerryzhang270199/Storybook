[中文](README.md) | [English](README.en.md)

<p align="center">
  <img src="./public/brand/logo-square.png" alt="Storybook AI logo" width="120" />
</p>

<h1 align="center">Storybook AI</h1>

Storybook AI turns the people you cherish and the moments you cannot bear to forget into a personal AI picture book. A child's first steps, a meal shared around the family table, a street corner you once walked through with someone you love, or a chapter of growth and goodbye that belongs only to you: these memories should not fade with time. They deserve to be kept with warmth and care.

## Demo Videos

<div align="center">
  <video src="https://github.com/user-attachments/assets/7e12fdde-bf96-45e1-92a6-6e173137023b" controls width="760"></video>
  <sub><strong>A Children's Day gift for my little nephew: a story about us</strong></sub>
</div>

<br>
<br>

<div align="center">
  <video src="https://github.com/user-attachments/assets/f8cbb074-9714-49a0-901e-5c5a8a3a6364" controls width="360"></video>
  <sub><strong>A Children's Day gift for the boy I used to be</strong></sub>
</div>

## Product Capabilities

- Generate complete picture books from text ideas and reference photos
- Automatically create story text, page illustrations, and optional narration audio
- Read books in the browser with page-turn playback and autoplay
- Save books as self-contained HTML, or export MP4 when narration is configured
- Local-first: the database and generated files default to your own machine
- Reuse the repo as a Doubao / Volcengine Ark picture-book app template

## Quick Start

Prepare:

- Node.js 24+
- npm 11+
- Docker Desktop, or your own PostgreSQL
- Volcengine Ark API key
- A text/chat model ID for story generation, and an image generation model ID

Start the local app:

```bash
git clone https://github.com/jerryzhang270199/Storybook.git
cd Storybook

npm install
npm run init:local
```

Open `.env` and fill at least:

```bash
DOUBAO_API_KEY=""
DOUBAO_STORY_MODEL=""
DOUBAO_IMAGE_MODEL=""
```

Get these values from the Volcengine consoles:

1. Register or sign in to Volcengine, open [Ark API Key Management](https://www.volcengine.com/docs/82379/1361424), then create or copy an API key into `DOUBAO_API_KEY`.
2. In the Ark console, enable a text/chat model. Put that model's Model ID, or your custom inference endpoint ID, into `DOUBAO_STORY_MODEL`.
3. In the Ark console, enable an image generation or image editing model. Put that model's Model ID, or your custom inference endpoint ID, into `DOUBAO_IMAGE_MODEL`.
4. To enable narration, open [Doubao Speech API Key](https://www.volcengine.com/docs/6561/1816214), then create or copy a speech API key into `DOUBAO_TTS_API_KEY`. This is separate from the Ark `DOUBAO_API_KEY`; do not reuse one for the other.

For Doubao keys, model IDs, and TTS settings, see the [Doubao setup guide](docs/doubao-setup.zh-CN.md).

After editing `.env`, check the configuration and start the app:

```bash
npm run doctor
npm run doctor:doubao
npm run setup:local
npm run dev
```

Open `http://localhost:3000/create` to create a book.

## Useful Commands

```bash
npm run init:local # create .env and check Docker
npm run doctor      # check local .env values
npm run doctor:doubao # verify Doubao key and story model with a minimal request
npm run db:up       # start local Postgres
npm run db:setup    # generate Prisma client and apply migrations
npm run db:studio   # inspect local data
npm run setup:local # check config, start Postgres, and apply migrations
npm run dev         # start localhost
npm test            # run tests
npm run lint        # run ESLint
npm run build       # production build
```

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
