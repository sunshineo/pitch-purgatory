# Pitch Purgatory Roadmap

## Product Direction

Pitch Purgatory should grow from a one-shot AI critique toy into a public arena for startup ideas. The core loop:

1. Submit an idea.
2. Get funny angel and devil judgment.
3. Publish the judged idea.
4. Let the community vote, comment, roast, and improve it.
5. Rank ideas by reaction and momentum.
6. Let users fork or revise ideas.
7. Rejudge improved versions and share them again.

The product should stay playful, loud, and a little absurd. This is not a polished SaaS dashboard. It is a launchpad for ideas that may be brilliant, cursed, or both.

## Guiding Principles

- Keep the AI judgment as the hook, but make community reaction the reason to return.
- Make public sharing useful even before accounts exist.
- Use lightweight mechanics first: votes, comments, forks, leaderboards, and fake pledges.
- Avoid real-money backing until moderation, identity, trust, and legal constraints are better understood.
- Preserve the angel/devil split in product language: `Bless`, `Damn`, `Resurrect`, `Fork`, `Rejudge`, `Launch from Purgatory`.
- Keep LLM costs bounded. Publishing and browsing should not require new model calls unless the user explicitly rejudges or revises.

## Implementation Readiness

Resolved tooling and access:

- Local development works with Node/npm and the existing Vite/Express setup.
- The Codex in-app browser can open and inspect the local app at `http://localhost:5174/`.
- GitHub CLI is authenticated as `sunshineo`, with access to the referenced `sunshineo/chore-points-app` repo.
- Vercel CLI works through `npx vercel`.
- The `idea-purgatory` directory is already linked to Vercel project `idea-purgatory`.
- The Vercel project currently has `OPENAI_API_KEY` configured for Production.
- Neon CLI works through `npx neonctl` after selecting the Neon org once.
- The active Neon org is `Gordon` (`org-frosty-frog-99257736`).
- Existing Neon project visible in that org: `chore-points-app` (`still-dew-57183369`, `aws-us-east-2`).

Current Vercel project details:

```text
project name: idea-purgatory
project id: prj_DABxEWIkq1WtCmjI3tWpfi9INdu6
team id: team_EQDjfSZelbSqRuKBF0T12md0
production URL: https://idea-purgatory.vercel.app
```

Current database state:

- The app already uses Postgres via `pg` and requires `DATABASE_URL` for community features.
- `lib/store.mjs` creates the current `ideas`, `votes`, and `comments` tables with `CREATE TABLE IF NOT EXISTS`.
- `lib/ideas-api.mjs` exposes the shared publish, list, vote, and comment handlers used by both local Express and Vercel serverless routes.
- A Neon project named `idea-purgatory` is still the intended production database direction if `DATABASE_URL` points there, but future agents should not assume persistence is missing.
- Use local development storage that does not require committing secrets. A local `.env` can point at a Neon dev database, but `.env` files must remain uncommitted.
- The generated `.neon` context file is local CLI state and should not be committed unless there is an explicit decision to make repo-local Neon context part of the project.

Current implemented scope:

- Includes post-verdict publishing, Postgres persistence, public idea pages, `/ideas` board columns, recent/ranked feeds, bless/damn votes, and flat comments.
- Does not yet include forks, rejudging, real accounts, fake backing, real-money backing, admin moderation, or automated board activity.
- Uses anonymous/session-based identity for votes through the `pp_visitor` cookie.

## Phase 0: Current App Baseline

Current behavior:

- User submits a startup idea.
- `src/main.js` posts `{ idea }` to `/api/judge`.
- `lib/judge.mjs` validates the input, runs the startup-idea classifier, then streams angel and devil LLM responses.
- The browser renders streamed markdown with `marked` and sanitizes it with `DOMPurify`.
- After the stream completes, the user can launch the judged idea as a public post through `POST /api/ideas`.
- Public ideas have reloadable pages, bless/damn voting, flat comments, and `/ideas` board columns for Blessed, Purgatory, and Damned.

Main limitations:

- The board has community mechanics, but no natural activity generator yet.
- Public write endpoints need stronger rate limiting and moderation before broader traffic.
- Comments are flat only; `parent_comment_id` exists in the schema, but replies are not a real UI flow yet.
- Forks and rejudging are still future work.

## Phase 1: Shipped Community Baseline

Already implemented:

- Publish completed judgments as durable `ideas`.
- Store published idea text, verdict markdown, author display name, launch note, and version metadata in Postgres.
- Fetch individual public ideas with `GET /api/ideas/:idOrSlug`.
- List ideas with `GET /api/ideas`.
- Sort and bucket feeds by recent, blessed, damned, controversial, and purgatory.
- Vote with `POST /api/ideas/:idOrSlug/votes`.
- Comment with `GET/POST /api/ideas/:idOrSlug/comments`.
- Use anonymous visitor cookies for one vote row per idea per visitor.

Important current implementation details:

- `lib/store.mjs` owns schema creation and SQL queries.
- `lib/ideas-api.mjs` owns request parsing, payload validation, cookie-based visitor identity, and JSON responses.
- `server.mjs` wires the local Express routes.
- `api/ideas.js`, `api/ideas/[id].js`, `api/ideas/[id]/votes.js`, and `api/ideas/[id]/comments.js` wire the Vercel serverless routes.

## Phase 2: Traffic, Moderation, and Activity Quality

Goal: make the board feel alive while the site is still unpromoted and anonymous.

Board activity model:

- Seed a small amount of board activity on a schedule, with randomness and daily caps.
- Prefer curated ideas and templated comments first so automation does not create unnecessary LLM spend.
- Only use LLM generation for occasional high-quality seed posts or comments, behind strict per-day limits.
- Current implementation has a 200-item seed bank and a local Mac runner that can run every 30 minutes. It averages 2-3 new seeded ideas per day, casts 0-10 random votes, and posts 0-2 short LLM-written comments per run.

Automation work:

- Added a local runner script: `npm run seed:once`; use `launchd` `StartInterval` for the 30-minute schedule.
- Kept all seeded activity implementation files under `cron/` so they stay separate from app/runtime code.
- Added an `activity_runs` table so each run is auditable.
- Added a local seed bank of funny startup ideas, bot display names, and vote patterns.
- Each run chooses at most a few actions: maybe publish one seed idea, add 2 comments, and add 5 votes.
- Skip or reduce automation when there has already been enough recent real activity.
- Keep app records normal: cron-created ideas, votes, and comments should use the same storage path and shape as anonymous user activity.

Moderation work:

- Add rate limits before public launch pressure increases.
- Add report buttons on ideas and comments.
- Keep `status` fields as the moderation mechanism instead of hard deletes.
- Add a tiny admin-only moderation endpoint/view before scaling comments.

Definition of done:

- The board gets a slow trickle of seeded activity.
- Automation has daily caps, a kill switch, and logs.
- Synthetic activity does not trigger unbounded LLM calls.
- Public vote and comment endpoints have basic abuse protection.

## Phase 3: Forks, Revisions, and Rejudging

Goal: make ideas evolve.

Forking model:

- Anyone can fork a public idea into a revised pitch.
- Forked ideas keep a parent link.
- Forked ideas can be judged again by angel/devil.
- Idea pages show lineage: original, forks, and latest revisions.

User flow:

1. Visitor sees a promising or ridiculous idea.
2. Visitor clicks `Fork this pitch`.
3. App pre-fills the original idea text.
4. Visitor edits the idea.
5. Visitor submits it for angel/devil judgment.
6. Fork can be published as a new public idea linked to the original.

Frontend work:

- Add `Fork this pitch` to public idea pages.
- Add `Revise and rejudge` for the original author/session.
- Add lineage UI:
  - `Born from`
  - `Forks`
  - `Best resurrection`

Backend work:

- Add `parent_idea_id` to ideas.
- Store version metadata.
- Track rejudge count to prevent runaway LLM usage.
- Optionally require a lightweight session token for repeated rejudging.

Suggested additional `ideas` fields:

```text
parent_idea_id
version_number
rejudge_count
source
```

Definition of done:

- Users can fork a public idea.
- Forks are judged independently.
- Original ideas link to their forks.
- Forks link back to the original.

## Phase 4: Profiles, Saves, and Notifications

Goal: support identity and repeat participation once the public loop is working.

User features:

- claim a display name
- see submitted ideas
- save private drafts
- follow ideas
- get notified about comments, votes, and forks

Authentication options:

- Start with anonymous sessions and display names.
- Add real auth once users need persistent identity across devices.
- Keep public browsing and voting low-friction.

Suggested `users` fields:

```text
id
display_name
handle
email
auth_provider
created_at
updated_at
```

Suggested `follows` fields:

```text
id
user_id
idea_id
created_at
```

Definition of done:

- Returning users can find their ideas.
- Users can follow an idea.
- Users can distinguish their own ideas from community ideas.

## Phase 5: Fake Backing and Demand Signals

Goal: test Kickstarter-like behavior without real-money complexity.

Start with fake backing:

- `I'd put $5 into this`
- `I'd preorder this`
- `I want to build this`
- `I know customers for this`

Why fake backing first:

- It avoids payment processing, refunds, fraud, tax, securities, and fulfillment problems.
- It still creates useful demand signals.
- It fits the joke: people can throw imaginary money at cursed ideas.

User flow:

1. Visitor opens an idea.
2. Visitor clicks a backing signal.
3. App records the pledge type and optional amount.
4. Idea pages show total fake pledged demand.

Suggested `backing_signals` fields:

```text
id
idea_id
visitor_id
signal_type
amount_cents
note
created_at
```

Definition of done:

- Users can express purchase or funding intent without payment.
- Idea pages show demand signals.
- Ranked feeds can include `Most Fake-Funded`.

## Phase 6: Real Backing Experiments

Goal: only explore real money after community behavior proves demand.

Prerequisites:

- real authentication
- clear terms of service
- moderation workflow
- fraud prevention
- payment provider integration
- refund policy
- creator identity and payout flow
- compliance review

Possible models:

- tips for idea authors
- refundable preorder deposits
- bounty pool for builders
- paid validation reports
- sponsored idea challenges

Recommendation:

- Do not ship real backing in the first public version.
- Use fake backing and waitlists to learn what people actually want.
- Add money only when the product has enough trust and moderation to handle disputes.

## API Roadmap

Initial endpoints:

```text
POST /api/judge
POST /api/ideas
GET /api/ideas
GET /api/ideas/:idOrSlug
POST /api/ideas/:id/votes
GET /api/ideas/:id/comments
POST /api/ideas/:id/comments
POST /api/ideas/:id/forks
```

Later endpoints:

```text
GET /api/users/:handle
POST /api/ideas/:id/follows
POST /api/ideas/:id/backing-signals
GET /api/feed/:feedName
```

Implementation notes:

- Keep `POST /api/judge` streaming-focused.
- Make publish and community endpoints normal JSON APIs.
- Reuse validation helpers for all user-generated text.
- Add rate limiting before opening public write endpoints.
- Add pagination on all feed and comment list endpoints.

## Data Model Summary

Core tables:

- `ideas`
- `votes`
- `comments`
- `visitors` or `sessions`

Later tables:

- `users`
- `follows`
- `backing_signals`
- `moderation_events`

Indexes to plan for:

- `ideas.slug`
- `ideas.created_at`
- `ideas.parent_idea_id`
- `votes.idea_id`
- `votes.visitor_id`
- `comments.idea_id`
- `comments.created_at`

## Moderation and Safety

Public user-generated content changes the risk profile of the app.

Minimum protections:

- input length limits
- per-IP or per-session rate limits
- hidden/deleted status fields instead of hard deletes
- admin moderation view
- spam and abuse filters
- report button on ideas and comments

LLM-specific protections:

- Never expose `OPENAI_API_KEY` to the browser.
- Do not let public comments trigger LLM calls by default.
- Cap rejudges per idea/session.
- Keep `MAX_OUTPUT_TOKENS` conservative.
- Store final model output so public page loads do not re-run generation.

## Metrics

Core loop metrics:

- ideas submitted
- judgments completed
- publish conversion rate
- public page views
- votes per public idea
- comments per public idea
- forks per public idea
- rejudges per fork
- share clicks

Quality metrics:

- percentage of ideas with at least one community action
- percentage of users who submit or vote again within 7 days
- feed click-through rate
- moderation actions per 100 public posts
- LLM cost per published idea

## Suggested Build Order

1. Add basic rate limiting for public publish, vote, and comment endpoints.
2. Add moderation/reporting primitives for ideas and comments.
3. Add an auditable seeded-activity system with daily caps and a kill switch.
4. Add a small curated seed bank for ideas, comments, and vote patterns.
5. Add a protected cron endpoint to trickle labeled board activity.
6. Add visible freshness signals and lively board animations around new activity.
7. Add forks and rejudging.
8. Add anonymous session ownership for "my launched ideas."
9. Add fake backing signals only after moderation basics are in place.
10. Evaluate whether real-money backing is worth the complexity.

## Open Decisions

- Whether to keep `CREATE TABLE IF NOT EXISTS` in `lib/store.mjs` or introduce a tiny migration flow before the schema grows.
- Whether to require auth before publishing.
- Whether ideas should be editable after publishing or versioned only.
- Whether comments should stay flat in the UI or expose the existing `parent_comment_id` as threaded replies.
- Whether public idea pages should be server-rendered for better sharing previews.
- How much automated board activity is appropriate per day.
- Whether to expose automation publicly later, once the product has real users and a moderation story.
- How much moderation should be automated versus admin-reviewed.

## Near-Term MVP Scope

The smallest version worth shipping:

- existing judged idea publishing
- existing public share pages
- existing recent and bucketed idea feeds
- existing bless/damn votes
- existing comments
- basic rate limiting
- report buttons and status-based moderation
- seeded activity for normal bulletin-board motion
- anonymous/session-based identity only
- no real accounts
- no fake backing
- no real money

That version completes the first real loop:

`Submit idea -> get judged -> publish -> share -> community votes/comments -> idea appears in ranked feeds -> seeded and real activity keep the board moving`

After that loop works, consider accounts, fake backing signals, and only later real-money experiments.
