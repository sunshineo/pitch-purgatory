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
- The `pitch-purgatory` directory is already linked to Vercel project `pitch-purgatory`.
- The Vercel project currently has `OPENAI_API_KEY` configured for Production.
- Neon CLI works through `npx neonctl` after selecting the Neon org once.
- The active Neon org is `Gordon` (`org-frosty-frog-99257736`).
- Existing Neon project visible in that org: `chore-points-app` (`still-dew-57183369`, `aws-us-east-2`).

Current Vercel project details:

```text
project name: pitch-purgatory
project id: prj_DABxEWIkq1WtCmjI3tWpfi9INdu6
team id: team_EQDjfSZelbSqRuKBF0T12md0
production URL: https://on-your-shoulders.vercel.app
```

Database direction:

- Create a new Neon project named `pitch-purgatory` in the same Neon org, rather than sharing the `chore-points-app` database.
- Neon Free currently allows 100 projects, 100 CU-hours per month per project, and 0.5 GB storage per project, so a second small project should stay free if usage remains inside the free limits.
- Add the new database connection string to the Vercel `pitch-purgatory` project as `DATABASE_URL`.
- Use local development storage that does not require committing secrets. A local `.env` can point at the Neon dev database, but `.env` files must remain uncommitted.
- The generated `.neon` context file is local CLI state and should not be committed unless there is an explicit decision to make repo-local Neon context part of the project.

Implementation scope for roadmap items 1-8:

- Includes post-verdict actions, persistence, public idea pages, recent feed, voting, ranked feeds, comments, forks, and rejudging.
- Does not include real accounts.
- Does not include fake backing or real-money backing.
- Use anonymous/session-based identity only where needed to prevent trivial repeated voting and to connect a user's own just-created idea to post-verdict actions.

## Phase 0: Current App Baseline

Current behavior:

- User submits a startup idea.
- `src/main.js` posts `{ idea }` to `/api/judge`.
- `lib/judge.mjs` validates the input, runs the startup-idea classifier, then streams angel and devil LLM responses.
- The browser renders streamed markdown with `marked` and sanitizes it with `DOMPurify`.
- After the stream completes, the user can read the two takes, but there is no durable artifact or next action.

Main limitation:

- The app has a great punchline, but no retention loop. Once the verdicts are read, the session is basically over.

## Phase 1: Publishable Judgments MVP

Goal: turn a completed judgment into a public artifact with a shareable URL.

User flow:

1. User submits an idea.
2. Angel and devil stream their takes.
3. When both streams finish, show a `Launch this idea` action.
4. User can optionally add:
   - idea title
   - display name
   - one-line launch note
5. App creates a public idea page.
6. Public page shows:
   - original idea
   - angel take
   - devil take
   - created date
   - share link

Frontend work:

- Track stream completion in `src/main.js`.
- Store the final `idea`, `angel`, and `devil` strings in memory after judging.
- Add a post-verdict action bar:
  - `Launch this idea`
  - `Revise pitch`
  - `Copy link` once published
- Add a publish modal or inline publish panel.
- Add a route/view for public idea pages, either through simple client-side routing or server-rendered JSON hydration.

Backend work:

- Add persistent storage.
- Add `POST /api/ideas` to publish a judged idea.
- Add `GET /api/ideas/:slugOrId` to fetch a public idea.
- Validate and size-limit all publish fields.
- Sanitize on render, not on storage, so raw markdown can be preserved while output remains safe.

Suggested first storage options:

- SQLite for local-first simplicity.
- Vercel Postgres, Neon, or another managed Postgres option for production.
- Avoid adding a heavy ORM at first unless the schema starts growing quickly.

Suggested `ideas` fields:

```text
id
slug
title
idea_text
angel_markdown
devil_markdown
launch_note
author_display_name
status
created_at
updated_at
published_at
```

Definition of done:

- A judged idea can be published.
- The public URL is reloadable and shareable.
- Publishing does not trigger extra LLM calls.
- Build passes with `npm run build`.

## Phase 2: Voting and Leaderboards

Goal: give the community a fast reaction loop.

Voting model:

- `Bless it`: this idea might ascend.
- `Damn it`: this idea belongs in the pit.
- Optional third reaction later: `Fund the chaos`.

User flow:

1. Visitor opens a public idea page.
2. Visitor votes once per idea.
3. Vote counts update immediately.
4. Idea appears on ranked feeds.

Frontend work:

- Add vote buttons to public idea pages.
- Add optimistic vote updates.
- Add a homepage/feed view:
  - `Freshly Judged`
  - `Most Blessed`
  - `Most Damned`
  - `Most Controversial`
  - `Actually... Maybe?`

Backend work:

- Add `POST /api/ideas/:id/votes`.
- Add `GET /api/ideas` with sort options.
- Store anonymous vote identity using a signed cookie or local session token.
- Rate-limit vote endpoints.

Suggested `votes` fields:

```text
id
idea_id
visitor_id
vote_type
created_at
updated_at
```

Ranking ideas:

- Start with simple score formulas:
  - blessed score = bless count
  - damned score = damn count
  - controversial score = high total votes with close bless/damn split
  - fresh score = recent ideas with some activity
- Add time decay once the feed has enough volume.

Definition of done:

- Public ideas can receive votes.
- Visitors cannot spam repeated votes trivially.
- Homepage has at least one ranked feed.
- Vote counts survive reloads.

## Phase 3: Comments and Community Debate

Goal: turn ideas into discussion threads.

Comment types:

- regular comment
- angel-side comment
- devil-side comment
- founder update

User flow:

1. Visitor reads a judged idea.
2. Visitor leaves a comment.
3. Other visitors can reply or react.
4. The idea page becomes a debate, not just a static artifact.

Frontend work:

- Add comment composer under each idea.
- Add compact threaded comments.
- Add labels like `Angel investor energy`, `Devil's advocate`, and `Founder note`.
- Keep comments visually lively but readable.

Backend work:

- Add `POST /api/ideas/:id/comments`.
- Add `GET /api/ideas/:id/comments`.
- Add basic moderation filters and rate limits.
- Add soft-delete or hidden status for moderation.

Suggested `comments` fields:

```text
id
idea_id
parent_comment_id
author_display_name
body
stance
status
created_at
updated_at
```

Moderation requirements:

- Size-limit comments.
- Reject obvious spam.
- Hide comments with unsafe content.
- Add admin-only moderation tools before the public audience grows.

Definition of done:

- Public idea pages support comments.
- Comments are stored, reloadable, and rate-limited.
- Moderation can hide abusive or spammy content without deleting the whole idea.

## Phase 4: Forks, Revisions, and Rejudging

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

## Phase 5: Profiles, Saves, and Notifications

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

## Phase 6: Fake Backing and Demand Signals

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

## Phase 7: Real Backing Experiments

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

1. Add stream-complete state and post-verdict actions.
2. Add persistence for published ideas.
3. Add public idea pages.
4. Add homepage feed for recent ideas.
5. Add voting.
6. Add ranked feeds.
7. Add comments.
8. Add forks and rejudging.
9. Add anonymous sessions or accounts.
10. Add fake backing signals.
11. Evaluate whether real-money backing is worth the complexity.

## Open Decisions

- Exact database library/migration approach for this plain ESM Vite/Express app.
- Whether to require auth before publishing.
- Whether ideas should be editable after publishing or versioned only.
- Whether comments should be flat first or threaded from day one.
- Whether public idea pages should be server-rendered for better sharing previews.
- What the first ranking formula should be.
- How much moderation should be automated versus admin-reviewed.

## Near-Term MVP Scope

The smallest version worth shipping:

- publish judged idea
- public share page
- recent ideas feed
- bless/damn votes
- basic rate limiting
- comments
- forks and rejudging
- anonymous/session-based identity only
- no real accounts
- no fake backing
- no real money

That version completes the first real loop:

`Submit idea -> get judged -> publish -> share -> community votes/comments -> idea appears in ranked feeds -> someone forks it -> revised idea gets rejudged`

After that loop works, consider accounts, fake backing signals, and only later real-money experiments.
