# Idea Purgatory

Idea Purgatory is a small Next.js app for tossing a startup idea into a playful angel/devil tribunal. The app streams two LLM critiques: an optimistic angel take and a skeptical devil take. Published ideas can be browsed on a public board with Blessed, Purgatory, and Damned columns driven by community thumbs-up/thumbs-down votes.

The tone is intentionally light, funny, and animated. This is not meant to feel like a polished enterprise SaaS dashboard.

## Features

- Single idea composer with streamed angel and devil verdicts.
- Server-side OpenAI Responses API calls so API keys stay out of the browser.
- Published idea pages with sanitized markdown verdict output.
- Community voting and comments.
- Public `/ideas` board with mutually exclusive vote buckets.
- Seeded board activity cron for slow anonymous traffic simulation.
- Next.js App Router pages and Route Handlers for the UI and API.

## Tech Stack

- Next.js App Router in `app/`.
- Vanilla browser interaction code in `src/main.js`, mounted by `app/PurgatoryApp.jsx`.
- API Route Handlers in `app/api/`.
- Shared judge, validation, prompt loading, OpenAI streaming, and SSE helpers in `lib/judge.mjs`.
- Community idea storage and vote bucketing in `lib/store.mjs`.
- Express-style community handler adapter in `lib/next-handler-adapter.mjs`.
- Markdown rendering via `marked` plus `DOMPurify`.
- PostgreSQL via `pg`.

## Commands

```sh
npm run dev
npm run seed:backfill-evaluations
npm run seed:once
npm run build
npm start
```

- `npm run dev` starts Next.js, defaulting to `http://localhost:3000`.
- `npm run seed:backfill-evaluations` creates missing cron-only vote bucket evaluations for published ideas.
- `npm run seed:once` runs one seeded board activity pass from this machine.
- `npm run build` builds the Next.js app.
- `npm start` serves the production Next.js app.

Run `npm run build` after frontend, shared API, package, Next.js, or Vercel config changes.

## Environment

Required:

```sh
OPENAI_API_KEY=...
DATABASE_URL=...
AUTH_SECRET=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
AUTH_URL=http://localhost:3000
```

Google OAuth redirect URIs:

```text
Local: http://localhost:3000/api/auth/callback/google
Production: https://idea-purgatory.vercel.app/api/auth/callback/google
```

Optional:

```sh
LLM_MODEL=gpt-4o-mini
LLM_API_URL=https://api.openai.com/v1/responses
MAX_OUTPUT_TOKENS=800
SEED_BOARD_ENABLED=true
SEED_IDEA_PROBABILITY=0.0520833333
SEED_MAX_IDEAS_PER_DAY=4
```

Do not commit `.env` files or secrets. Keep all LLM calls server-side and be careful with changes that increase model call count, token count, or retry behavior.

## Architecture

The frontend posts ideas to `/api/judge` and reads a `text/event-stream` response from a Next.js Route Handler.

`app/api/judge/route.js` uses the shared logic from `lib/judge.mjs`. That shared module validates the idea, loads `prompts/angel.md` and `prompts/devil.md`, calls the OpenAI Responses API, and parses streamed SSE output.

Published ideas and community interactions use `lib/store.mjs` through `lib/ideas-api.mjs`. The Next route handlers call that shared API layer through `lib/next-handler-adapter.mjs`.

Seeded board activity lives in `cron/`. Run one pass locally with `npm run seed:once`. It randomly publishes from the 200-item seed bank in `cron/seed-data.mjs` at about 2-3 ideas per day when scheduled every 30 minutes, casts 0-10 random votes, and asks the LLM for 0-2 short idea-specific comments. Those writes go through the same app storage functions as normal anonymous activity.

Cron keeps its vote-shaping metadata in `cron_idea_evaluations`, a cron-owned table keyed by idea ID. The neutral evaluator assigns each idea to `mostly_blessed`, `mildly_blessed`, `controversial`, `mildly_damned`, or `mostly_damned`; if the evaluator fails, cron stores a random fallback bucket. The public app schema does not depend on these buckets.

For a Mac that should keep seeding without an open terminal, use `launchd` to run one pass every 30 minutes:

```sh
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.idea-purgatory.seed-board.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.idea-purgatory.seed-board</string>
  <key>WorkingDirectory</key>
  <string>/Users/gordon/code/idea-purgatory</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd /Users/gordon/code/idea-purgatory &amp;&amp; npm run seed:once</string>
  </array>
  <key>StartInterval</key>
  <integer>1800</integer>
  <key>StandardOutPath</key>
  <string>/Users/gordon/code/idea-purgatory/seed-board.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/gordon/code/idea-purgatory/seed-board.err.log</string>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.idea-purgatory.seed-board.plist
```

Unload it with:

```sh
launchctl unload ~/Library/LaunchAgents/com.idea-purgatory.seed-board.plist
```

## Vote Buckets and ROPE

The `/ideas` board has three mutually exclusive columns:

- Blessed: the idea is meaningfully ahead on thumbs up.
- Damned: the idea is meaningfully ahead on thumbs down.
- Purgatory: the vote split is effectively tied.

Purgatory does not use exact equality. Exact equality works for tiny vote counts, but it breaks down as vote totals grow. A split like `499` blessed and `501` damned is not exactly equal, but it is still basically undecided. On the other hand, a single `1 / 0` vote should not immediately launch an idea out of Purgatory.

To handle that, the board uses a sample-size-aware Region of Practical Equivalence, or ROPE:

```js
const purgatoryMinimumVotes = 3;
const purgatoryRopeFloor = 0.20;
const voteMargin = totalVotes === 0 ? 0 : (blessCount - damnCount) / totalVotes;
const voteDistance = Math.abs(voteMargin);
const ropeThreshold =
  totalVotes < purgatoryMinimumVotes ? Infinity : Math.max(purgatoryRopeFloor, 1 / Math.sqrt(totalVotes));
```

Bucket rules:

- Purgatory: `voteDistance < ropeThreshold`
- Blessed: `voteMargin >= ropeThreshold`
- Damned: `voteMargin <= -ropeThreshold`

That means ideas with fewer than 3 total votes always stay in Purgatory. After that, the Purgatory band shrinks smoothly as vote count grows, but it never gets narrower than a 20 percentage-point normalized margin. A 50/50 split stays in Purgatory, as does a close 49.9/50.1 split.

The SQL implementation lives in `lib/store.mjs`. Purgatory is sorted by closest normalized vote distance first, then by total votes, then by publish date. Idea cards also render a compact vote meter: yellow shows the blessed share, red shows the damned share, and the translucent center band shows the current Purgatory range for that vote total.

## Prompts

Role prompts are markdown files:

- `prompts/angel.md`
- `prompts/devil.md`

Keep prompts short and aligned with the split personality:

- Angel: exaggerated optimism, investor hype, hidden strengths, punchy and emoji-forward.
- Devil: exaggerated skepticism, market failure modes, harsh but funny critique, punchy and emoji-forward.

The app expects each response to stay under 500 words.

## Deployment

`vercel.json` identifies the project as a Next.js app. `app/api/judge/route.js` exports a 60-second max duration for the streaming LLM endpoint. Seeded board activity is expected to run locally from this Mac. If API behavior changes, verify the relevant Next route handler and shared library behavior.
