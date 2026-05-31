# Contributing

Thanks for helping improve Storybook AI.

## Local Setup

1. Run `npm run init:local` to create `.env`.
2. Fill the Doubao / Volcengine Ark values.
3. Start Postgres with `docker compose up -d`.
4. Run `npm install`, `npm run db:setup`, and `npm run dev`.

## Checks

Run these before opening a pull request:

```bash
npm test
npm run lint
npm run build
```

## Scope

This repository is the local-first open-source template. Keep changes focused on:

- Story and image generation quality
- Local setup reliability
- Reader playback and export behavior
- Provider configuration clarity
- Security fixes

Avoid adding hosted-product assumptions such as private domains, payment QR codes, or hard dependencies on one deployment provider.
Avoid adding account systems, quotas, or hosted queue dependencies unless the project scope changes.
