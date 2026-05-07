# AGENTS.md

Guidance for coding agents working in this repository.

## Project Overview

Pitch Purgatory is a small Vite app that takes a startup idea and streams two LLM critiques: an optimistic angel take and a skeptical devil take.

This started as a gimmick project with an anime angel and anime devil. Keep it light, funny, playful, lively, and animated; do not sand it down into boring professional SaaS UI. It is fine to propose new fun features when they fit the product voice and do not add much complexity.

The frontend lives in `src/` and `index.html`. The local API server is `server.mjs`. The Vercel serverless entrypoint is `api/judge.js`. Shared validation, prompt loading, OpenAI Responses API calls, and SSE parsing live in `lib/judge.mjs`.

## Commands

- `npm run dev`: start both the Express API on `http://localhost:8787` and Vite on `http://localhost:5173`.
- `npm run dev:api`: start only the local Express API.
- `npm run dev:web`: start only the Vite frontend.
- `npm run build`: build the frontend into `dist/`.
- `npm start`: run the Express server, serving `dist/`.

Run `npm run build` after changes that touch frontend code, shared API code, package config, or Vite/Vercel config.

## Environment

The API requires `OPENAI_API_KEY`.

Optional environment variables:

- `LLM_MODEL`: defaults to `gpt-4o-mini`.
- `LLM_API_URL`: defaults to `https://api.openai.com/v1/responses`.
- `MAX_OUTPUT_TOKENS`: defaults to `800`.
- `PORT`: local Express API port, defaults to `8787`.

Do not commit `.env` files or secrets.

LLM calls cost real money. The API key is expected to have restricted permissions and a budget cap, but the code still needs to treat it as sensitive. Keep all LLM calls server-side, avoid exposing key material to the browser, validate and size-limit user input before calling the model, and be cautious about changes that increase call count, token count, or retry behavior.

## Architecture Notes

- `src/main.js` posts `{ idea }` to `/api/judge` and reads a `text/event-stream` response.
- Vite proxies `/api` to `http://localhost:8787` in development.
- `server.mjs` and `api/judge.js` intentionally share the same logic from `lib/judge.mjs`.
- `validateStartupIdea()` performs a small classifier call before streaming the angel/devil responses.
- `streamVerdicts()` runs angel and devil LLM streams concurrently and emits chunks tagged with `side`.
- Frontend markdown rendering uses `marked` plus `DOMPurify`; keep streamed model output sanitized before inserting HTML.

## Prompt Editing

Role prompts are markdown files:

- `prompts/angel.md`
- `prompts/devil.md`

`lib/judge.mjs` reads these files at module load with static `new URL(...)` references. Keep those references static so serverless bundling/file tracing can include the markdown files reliably.

When editing prompts, preserve the role split:

- angel: exaggerated optimism, investor hype, hidden strengths, punchy and emoji-forward.
- devil: exaggerated skepticism, market failure modes, harsh but funny critique, punchy and emoji-forward.

Keep both prompts short enough to be easy to iterate. The app expects each response to stay under 500 words.

## Deployment Notes

`vercel.json` configures Vite output from `dist/` and sets `api/judge.js` max duration to 60 seconds. If the API changes, make sure both local Express behavior and Vercel serverless behavior still match.

## Code Style

- This repo uses ESM JavaScript (`"type": "module"`).
- Keep changes small and plain; there is no TypeScript, linter, or test suite currently configured.
- Prefer existing browser APIs and small functions over adding new dependencies.
- Avoid moving shared API logic out of `lib/judge.mjs` unless both `server.mjs` and `api/judge.js` are updated together.
- Keep user-facing copy concise and consistent with the playful angel/devil product voice.
