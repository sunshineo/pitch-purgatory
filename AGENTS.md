# AGENTS.md

Guidance for coding agents working in this repository.

## Project Overview

Pitch Purgatory is a small Next.js app that takes a startup idea, streams two LLM critiques, and lets completed judgments become public board posts with community votes and comments. The two critiques are an optimistic angel take and a skeptical devil take.

This started as a gimmick project with an anime angel and anime devil. Keep it light, funny, playful, lively, and animated; do not sand it down into boring professional SaaS UI. It is fine to propose new fun features when they fit the product voice and do not add much complexity.

The Next.js app lives in `app/`. The browser behavior still lives in `src/main.js` and is mounted by `app/PurgatoryApp.jsx`. API entrypoints live in `app/api/`. Shared validation, prompt loading, OpenAI Responses API calls, and SSE parsing live in `lib/judge.mjs`. Public idea publishing, listing, voting, comments, and Postgres access live in `lib/ideas-api.mjs` and `lib/store.mjs`.

## Commands

- `npm run dev`: start the Next.js app, defaulting to `http://localhost:3000`.
- `npm run seed:backfill-evaluations`: create missing cron-only vote bucket evaluations for published ideas.
- `npm run seed:once`: run one seeded board activity pass from the local machine.
- `npm run build`: build the Next.js app.
- `npm start`: serve the production Next.js app.

Run `npm run build` after changes that touch frontend code, shared API code, package config, or Next/Vercel config.

## Environment

The API requires:

- `OPENAI_API_KEY`
- `DATABASE_URL`

Optional environment variables:

- `LLM_MODEL`: defaults to `gpt-4o-mini`.
- `LLM_API_URL`: defaults to `https://api.openai.com/v1/responses`.
- `MAX_OUTPUT_TOKENS`: defaults to `800`.
- `SEED_BOARD_ENABLED`: set to `false` to disable seeded board activity.
- `SEED_IDEA_PROBABILITY`: defaults to about `0.052`, which averages 2-3 seeded ideas per day when the cron runs every 30 minutes.
- `SEED_MAX_IDEAS_PER_DAY`: defaults to `4`.

Do not commit `.env` files or secrets.

LLM calls cost real money. The API key is expected to have restricted permissions and a budget cap, but the code still needs to treat it as sensitive. Keep all LLM calls server-side, avoid exposing key material to the browser, validate and size-limit user input before calling the model, and be cautious about changes that increase call count, token count, or retry behavior.

## Architecture Notes

- `src/main.js` posts `{ idea }` to `/api/judge` and reads a `text/event-stream` response.
- After both verdict streams finish, `src/main.js` can publish the judged idea through `POST /api/ideas`.
- Published ideas are stored in Postgres through `lib/store.mjs` and can be browsed on the `/ideas` board.
- `lib/store.mjs` currently creates and uses `ideas`, `votes`, and `comments` tables directly through `pg`; there is no ORM or separate migration tool yet.
- Community endpoints are exposed by Next route handlers in `app/api/` and share logic through `lib/ideas-api.mjs`: `GET/POST /api/ideas`, `GET /api/ideas/:idOrSlug`, `POST /api/ideas/:idOrSlug/votes`, and `GET/POST /api/ideas/:idOrSlug/comments`.
- Votes use an anonymous `pp_visitor` cookie so one visitor can switch between `bless` and `damn` without creating repeated vote rows.
- Seeded board activity is isolated under `cron/` and runnable from this Mac with `npm run seed:once`; use `launchd` `StartInterval` for repeated runs.
- `cron/seed-data.mjs` contains 200 seed ideas plus comment authors. The cron may publish one seed idea after running the same validation, angel/devil judgment, and title summary pipeline as a normal user launch.
- Each cron run casts 0-10 random votes and posts 0-2 LLM-written short comments on random existing ideas.
- Cron vote shaping uses `cron_idea_evaluations`, a cron-owned table keyed by idea ID. The neutral evaluator assigns one of five buckets; if evaluation fails, cron stores a random fallback bucket. Cron also targets underrepresented board columns when choosing vote candidates. Do not add these bucket fields to the public app schema.
- `app/api/judge/route.js` intentionally shares the same judge logic from `lib/judge.mjs`.
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

`vercel.json` identifies the project as a Next.js app. `app/api/judge/route.js` exports a 60-second max duration for the streaming LLM endpoint. Seeded board activity is expected to run from this Mac through the scripts in `cron/`. If the API changes, make sure the Next route handlers and shared community handlers still match.

## Code Style

- This repo uses ESM JavaScript (`"type": "module"`).
- Keep changes small and plain; there is no TypeScript, linter, or test suite currently configured.
- Prefer existing browser APIs and small functions over adding new dependencies.
- Avoid moving shared judge logic out of `lib/judge.mjs` unless `app/api/judge/route.js` is updated too.
- Avoid moving shared community API logic out of `lib/ideas-api.mjs` or storage logic out of `lib/store.mjs` unless the `app/api/ideas*` route handlers are updated too.
- Keep user-facing copy concise and consistent with the playful angel/devil product voice.
