# Google Login and Ownership Design

## Goal

Add real Google login while keeping Pitch Purgatory's anonymous, low-friction posting loop intact. A visitor should be able to use the site from a browser session, see that browser's ideas, comments, and votes on `/account`, and optionally sign in with Google to permanently claim that first browser session's activity.

The first account feature is ownership visibility only. This design does not add edit, delete, private drafts, public profile pages, moderation tools, or account settings.

## Current Context

The app is a small Next.js App Router project. The main browser behavior lives in `src/main.js` and is mounted by `app/PurgatoryApp.jsx`. Community API route handlers live under `app/api/ideas*` and share logic through `lib/ideas-api.mjs`. Postgres schema creation and queries currently live in `lib/store.mjs`.

Anonymous voting already uses the `pp_visitor` cookie. Ideas and comments currently store public display names but do not record visitor ownership. Votes currently use `UNIQUE (idea_id, visitor_id)`.

## Scope

In scope:

- Google OAuth login through Auth.js.
- Postgres-backed users, accounts, sessions, and verification tokens.
- One-time claim of the current browser's anonymous ideas, comments, and votes when a Google account is first created.
- Header bar across all pages with app navigation, breadcrumbs where useful, `/account`, and auth controls.
- `/account` page for both anonymous and signed-in visitors.
- Hybrid vote identity: anonymous votes are per browser session; signed-in votes are per Google account.
- Google display names and profile pictures for signed-in/claimed content.
- Google One Tap as a sign-in enhancement on signed-out pages, with the normal header sign-in button as the fallback.

Out of scope:

- Editing or deleting ideas and comments.
- Claiming browser activity after the account's first Google login.
- Public user profile pages.
- Password auth, magic links, or non-Google OAuth providers.
- Moderation or reporting features.
- Real-money backing, notifications, or saved private drafts.

## Product Behavior

Anonymous users can continue to publish ideas, vote, and comment. Those actions are tied to the browser's `pp_visitor` cookie and remain public as anonymous founder or heckler activity.

The `/account` page is available even when signed out. In that state it shows "this browser's purgatory trail": ideas, comments, and votes tied to the current `pp_visitor`. It nudges the visitor to sign in with Google to claim the activity permanently, and makes clear that unclaimed activity is browser-bound.

On first Google account creation, the server claims the current browser session. Ideas, comments, and votes with the current `pp_visitor` get `owner_user_id` set to the new Auth.js user ID. Claimed ideas and comments also update their public `author_display_name` to the Google profile name.

After that one-time claim, the account cannot claim anonymous rows from other browsers. If the same Google user signs in later from another browser, that browser's anonymous session is cleared or rotated so its previous anonymous activity stays anonymous.

Signed-in public identity uses the Google profile display name and profile picture. If Google does not provide a name, use the email prefix or `Claimed founder`; never show the full email publicly. If Google does not provide a profile picture, show an app-styled placeholder avatar.

## Data Model

Add Auth.js tables in Postgres:

- `users`
- `accounts`
- `sessions`
- `verification_tokens`

Extend `users` with claim tracking fields:

- `initial_visitor_claimed_at timestamptz`
- `initial_visitor_id text`

Use the Auth.js user image field for the Google profile picture URL and the Auth.js user name field for the Google display name.

Extend `ideas`:

- `visitor_id text`
- `owner_user_id text REFERENCES users(id) ON DELETE SET NULL`

Extend `comments`:

- `visitor_id text`
- `owner_user_id text REFERENCES users(id) ON DELETE SET NULL`

Extend `votes`:

- `owner_user_id text REFERENCES users(id) ON DELETE SET NULL`
- keep `visitor_id text NOT NULL`

Vote uniqueness uses partial unique indexes instead of the current single uniqueness constraint:

- one anonymous vote per `idea_id + visitor_id` where `owner_user_id IS NULL`
- one account vote per `idea_id + owner_user_id` where `owner_user_id IS NOT NULL`

Because claim is one-time and only runs when an account is first created, claim behavior does not merge account votes from multiple browser sessions.

## Architecture

Keep auth isolated from the community API as much as possible.

New or changed pieces:

- `lib/auth.mjs`: Auth.js configuration, Google provider, Postgres adapter, and callbacks.
- `app/api/auth/[...nextauth]/route.js`: Auth.js route handler.
- Google Identity Services client integration: render Google One Tap for signed-out visitors where appropriate.
- `lib/store.mjs`: schema additions and ownership queries.
- `lib/ideas-api.mjs`: resolve visitor identity plus optional signed-in user, then pass ownership data to store operations.
- Account page route: render signed-in account data by `owner_user_id` or anonymous account data by `visitor_id`.
- Header component/layout support: provide global navigation and auth controls across composer, board, idea detail, and account views.

The app will continue the current lightweight schema style with `CREATE TABLE IF NOT EXISTS` in `lib/store.mjs` for this first version. Auth table setup can live in a small helper called from the same schema initialization path if that keeps `lib/store.mjs` readable. Do not add a full migration tool as part of this feature.

## User Flow

Anonymous flow:

1. Visitor receives or keeps a `pp_visitor` cookie.
2. Visitor publishes ideas, votes, and comments.
3. Rows record `visitor_id` and leave `owner_user_id` empty.
4. Visitor can open `/account` to see browser-session ideas, comments, and votes.

First Google login:

1. Visitor clicks "Sign in with Google" from the header or `/account`.
2. Auth.js creates the user.
3. Server checks that `initial_visitor_claimed_at` is empty.
4. Server claims rows matching the current `pp_visitor`.
5. Claimed ideas and comments switch public display names to the Google profile name.
6. Claimed votes become account votes by setting `owner_user_id`.
7. `/account` shows owned ideas, comments, votes, display name, and avatar.
8. Show a claim summary such as "Claimed 3 pitches, 5 heckles, and 12 votes from this browser" when at least one row is claimed.

Later Google login from another browser:

1. Auth.js signs in the existing user.
2. No anonymous rows are claimed because the account already has a claim marker.
3. The browser's anonymous `pp_visitor` is cleared or rotated.
4. New signed-in activity is tied to the account.

Sign-out:

1. The Google session ends.
2. The next anonymous action can receive a fresh `pp_visitor`.

## API Behavior

Publishing:

- Anonymous publish records `visitor_id`, `owner_user_id = null`, and `author_display_name = "Anonymous founder"`.
- Signed-in publish records `visitor_id`, `owner_user_id = user.id`, and `author_display_name = user.name` with a safe non-email fallback.

Commenting:

- Anonymous comment records `visitor_id`, `owner_user_id = null`, and `author_display_name = "Anonymous heckler"`.
- Signed-in comment records `visitor_id`, `owner_user_id = user.id`, and `author_display_name = user.name` with a safe non-email fallback.

Voting:

- Anonymous vote upserts by `idea_id + visitor_id` where `owner_user_id IS NULL`.
- Signed-in vote upserts by `idea_id + owner_user_id` where `owner_user_id IS NOT NULL`.
- A signed-in user gets one account vote per idea across browsers.
- Login transfers first-session anonymous votes once; it does not create extra votes.

Account data:

- Anonymous `/account` queries ideas, comments, and votes by `visitor_id`.
- Signed-in `/account` queries ideas, comments, and votes by `owner_user_id`.
- Vote rows are joined to idea title and slug so account history is useful.

## UI

Add a header bar across all app pages:

- App name/logo links to `/`.
- Navigation includes `/ideas` and `/account`.
- Idea detail pages can show breadcrumb-style context such as `Ideas / Pitch title`.
- Auth control appears in the header:
  - signed out: "Sign in with Google"
  - signed in: profile pill with Google name/image when available, plus sign out
- Signed-out pages can also show Google One Tap. The prompt is controlled by Google/browser UX and must not be covered, obscured, or treated as the only sign-in path.

Anonymous `/account`:

- Heading: "This browser's purgatory trail".
- Sections for ideas, comments, and votes tied to the current browser session.
- A clear Google sign-in nudge to claim the trail permanently.
- Empty state in the product voice.

Signed-in `/account`:

- Heading: "My Pitches from Purgatory".
- Sections for owned ideas, comments, and votes.
- No edit or delete actions.
- First-login claim summary when at least one row was claimed.

Public author presentation:

- Claimed/signed-in ideas and comments show the Google display name and avatar.
- The full Google email is not shown publicly.
- Missing avatars render an app-styled fallback.

The header and account page will keep the product voice playful and light. They must not look like a corporate SaaS admin area.

## Error Handling

- If auth status cannot load in the header, keep navigation usable and show a neutral signed-out control.
- If `/account` cannot load activity, show a concise playful error and keep the sign-in option available.
- If first-login claim cannot run because the visitor cookie is missing, create the account normally with zero claimed rows.
- If claim partially fails, store enough state to avoid silent endless retries. Prefer a retry-safe server operation that can complete the one-time claim before setting `initial_visitor_claimed_at`.
- If a later login occurs from another browser, do not claim that browser's old anonymous rows.

## Verification

Run `npm run build` after implementation.

Manual flows to verify:

- Anonymous visitor can see browser-session ideas, comments, and votes on `/account`.
- Anonymous visitor can publish, comment, vote, and still use the current board and idea pages.
- First Google login claims the current browser's ideas, comments, and votes.
- Claimed ideas/comments show the Google profile name publicly.
- Signed-in votes are one per account across browser sessions.
- Later Google login from another browser does not claim that browser's anonymous activity.
- Sign-out returns the browser to anonymous behavior with a fresh session on the next anonymous action.
