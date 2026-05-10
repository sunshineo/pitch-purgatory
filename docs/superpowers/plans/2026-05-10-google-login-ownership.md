# Google Login Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google login, one-time browser-session claiming, account activity views, account-based voting, and playful identity display without removing anonymous posting.

**Architecture:** Keep Auth.js isolated in `auth.js` and auth route handlers. Keep app data ownership in `lib/store.mjs` and expose current-session/account activity through JSON route handlers consumed by small client UI components. Claiming happens through a server route that can read and set cookies safely, so `/account` works for anonymous and signed-in visitors.

**Tech Stack:** Next.js App Router, React client components, Auth.js/NextAuth Google provider, `@auth/pg-adapter`, PostgreSQL through `pg`, Google Identity Services as a progressive sign-in prompt.

---

## File Structure

- Create `lib/db.mjs`: shared Postgres pool helper used by app storage and Auth.js adapter.
- Modify `lib/store.mjs`: use shared pool, add auth-compatible schema additions, ownership columns, claim transaction, account activity queries, and hybrid vote upserts.
- Create `auth.js`: Auth.js configuration with Google OAuth, Postgres adapter, session shaping, and Google profile scope.
- Create `app/api/auth/[...nextauth]/route.js`: Auth.js route handler.
- Create `app/actions/auth.js`: server actions for Google sign-in and sign-out buttons.
- Modify `lib/ideas-api.mjs`: resolve `pp_visitor`, resolve current Auth.js user, pass ownership into create/comment/vote store calls.
- Create `app/api/account/activity/route.js`: JSON endpoint that returns browser-session or account activity and performs first-login claim/visitor rotation.
- Create `app/SiteHeader.jsx`: server header shell with session-aware auth controls.
- Create `app/HeaderBreadcrumbs.jsx`: client route breadcrumb display.
- Create `app/GoogleOneTap.jsx`: client progressive Google prompt for signed-out visitors.
- Modify `app/layout.js`: render the global header and pass public Google client ID to the One Tap component.
- Create `app/account/page.js`: account page entrypoint.
- Create `app/account/AccountPage.jsx`: client account activity UI.
- Modify `app/PurgatoryApp.jsx`: add author avatar containers where public idea identity is shown.
- Modify `src/main.js`: render author avatar/name metadata and handle any new account-aware response fields.
- Modify `app/globals.css`: header, account page, avatar, and signed-in author styling.
- Modify `README.md`: document auth environment variables and Google OAuth redirect URI.
- Modify `package.json` and `package-lock.json`: add auth dependencies.

## External References

- Auth.js Next.js setup exports `auth`, `handlers`, `signIn`, and `signOut` from the central config: https://authjs.dev/
- Auth.js Postgres adapter package and schema: https://authjs.dev/getting-started/adapters/pg
- Google OpenID Connect profile fields include `name` and `picture` when `profile` scope is available, but fields are not guaranteed: https://developers.google.com/identity/openid-connect/openid-connect
- Google One Tap rendering is controlled by Google/browser UX and must not be covered: https://developers.google.com/identity/gsi/web/guides/display-google-one-tap

## External Setup Status

Google Cloud setup is complete for this implementation.

- Google Cloud project: `idea-purgatory`
- OAuth app name: `Pitch Purgatory`
- OAuth audience: External
- OAuth client type: Web application
- OAuth client name: `Pitch Purgatory web`
- Authorized JavaScript origins:
  - `http://localhost:3000`
  - `https://idea-purgatory.vercel.app`
- Authorized redirect URIs:
  - `http://localhost:3000/api/auth/callback/google`
  - `https://idea-purgatory.vercel.app/api/auth/callback/google`
- Local `.env` contains the required Auth.js/Google variables:
  - `AUTH_GOOGLE_ID`
  - `AUTH_GOOGLE_SECRET`
  - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
  - `AUTH_SECRET`
- Vercel project `idea-purgatory` contains the same variables for:
  - Production
  - Development
  - Preview branch `codex/migrate-nextjs`

Do not commit `.env` or copy the secret values into docs, plans, commits, prompts, or chat. Implementation workers should read these values from the local environment. Production login has the required Vercel project environment variables already; if work moves to another preview branch, add the same four variables for that branch or rely on a production deployment for OAuth testing.

---

### Task 1: Dependencies And Shared Database Pool

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/db.mjs`
- Modify: `lib/store.mjs`

- [ ] **Step 1: Install auth dependencies**

Run:

```bash
npm install next-auth @auth/pg-adapter
```

Expected:

```text
npm exits 0 and package-lock.json includes next-auth and @auth/pg-adapter.
```

- [ ] **Step 2: Create the shared pool helper**

Create `lib/db.mjs`:

```js
import pg from 'pg';

const { Pool } = pg;

let pool;

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for community features.');
  }

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
  });

  return pool;
}
```

- [ ] **Step 3: Switch `lib/store.mjs` to the shared pool**

In `lib/store.mjs`, replace the `pg` import, `Pool` setup, `pool` variable, and local `getPool()` function with:

```js
import { getPool } from './db.mjs';
```

Keep the existing `schemaReady`, `purgatoryMinimumVotes`, and all store functions.

- [ ] **Step 4: Run the build to catch import mistakes**

Run:

```bash
npm run build
```

Expected:

```text
✓ Compiled successfully
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/db.mjs lib/store.mjs
git commit -m "Add shared database pool for auth"
```

---

### Task 2: Auth.js Google OAuth Setup

**Files:**
- Create: `auth.js`
- Create: `app/api/auth/[...nextauth]/route.js`
- Create: `app/actions/auth.js`
- Modify: `README.md`

- [ ] **Step 1: Add Auth.js configuration**

Create `auth.js` at the repository root:

```js
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import PostgresAdapter from '@auth/pg-adapter';
import { getPool } from './lib/db.mjs';

function publicName(user) {
  const name = String(user?.name || '').trim();
  if (name) return name.slice(0, 80);

  const email = String(user?.email || '').trim();
  const prefix = email.split('@')[0]?.trim();
  return prefix ? prefix.slice(0, 80) : 'Claimed founder';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(getPool()),
  session: {
    strategy: 'database'
  },
  providers: [
    Google({
      authorization: {
        params: {
          scope: 'openid profile email'
        }
      }
    })
  ],
  callbacks: {
    async session({ session, user }) {
      session.user.id = String(user.id);
      session.user.name = publicName(user);
      session.user.image = user.image || null;
      return session;
    }
  },
  trustHost: true
});

export function displayNameForUser(user) {
  return publicName(user);
}
```

- [ ] **Step 2: Add the Auth.js route handler**

Create `app/api/auth/[...nextauth]/route.js`:

```js
import { handlers } from '../../../../auth.js';

export const { GET, POST } = handlers;
```

- [ ] **Step 3: Add server actions for auth controls**

Create `app/actions/auth.js`:

```js
'use server';

import { signIn, signOut } from '../../auth.js';

export async function signInWithGoogle() {
  await signIn('google', { redirectTo: '/account' });
}

export async function signOutOfGoogle() {
  await signOut({ redirectTo: '/' });
}
```

- [ ] **Step 4: Confirm and document required auth environment variables**

The Google OAuth client has already been created in the `idea-purgatory` Google Cloud project, and the local `.env` file already contains the required keys. Do not overwrite existing values with placeholders.

Add this section to `README.md` under environment variables:

````md
Auth/login:

```sh
AUTH_SECRET=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
```

Google OAuth redirect URI for local development:

```text
http://localhost:3000/api/auth/callback/google
```

Production redirect URI:

```text
https://idea-purgatory.vercel.app/api/auth/callback/google
```
````

- [ ] **Step 5: Run the build**

Run:

```bash
npm run build
```

Expected if auth env vars are absent during build:

```text
✓ Compiled successfully
```

If Auth.js requires provider env vars at build time, set local dummy values for the build command only:

```bash
AUTH_SECRET=testsecret AUTH_GOOGLE_ID=testid AUTH_GOOGLE_SECRET=testsecret NEXT_PUBLIC_GOOGLE_CLIENT_ID=testid npm run build
```

When running locally after this setup, prefer loading the real values from `.env` instead of dummy values.

- [ ] **Step 6: Commit**

```bash
git add auth.js app/api/auth app/actions/auth.js README.md
git commit -m "Add Google auth configuration"
```

---

### Task 3: Auth And Ownership Schema

**Files:**
- Modify: `lib/store.mjs`

- [ ] **Step 1: Add auth tables and ownership columns to `ensureSchema()`**

Inside the existing schema SQL in `lib/store.mjs`, add the auth tables before app-owned tables:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name varchar(255),
  email varchar(255),
  "emailVerified" timestamptz,
  image text,
  initial_visitor_claimed_at timestamptz,
  initial_visitor_id text
);

CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type varchar(255) NOT NULL,
  provider varchar(255) NOT NULL,
  "providerAccountId" varchar(255) NOT NULL,
  refresh_token text,
  access_token text,
  expires_at bigint,
  id_token text,
  scope text,
  session_state text,
  token_type text,
  UNIQUE (provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires timestamptz NOT NULL,
  "sessionToken" varchar(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS verification_token (
  identifier text NOT NULL,
  expires timestamptz NOT NULL,
  token text NOT NULL,
  PRIMARY KEY (identifier, token)
);
```

Add these app table migrations after table creation:

```sql
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS visitor_id text;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS visitor_id text;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ideas_visitor_id_idx ON ideas (visitor_id);
CREATE INDEX IF NOT EXISTS ideas_owner_user_id_idx ON ideas (owner_user_id);
CREATE INDEX IF NOT EXISTS comments_visitor_id_idx ON comments (visitor_id);
CREATE INDEX IF NOT EXISTS comments_owner_user_id_idx ON comments (owner_user_id);
CREATE INDEX IF NOT EXISTS votes_owner_user_id_idx ON votes (owner_user_id);
```

- [ ] **Step 2: Replace vote uniqueness**

Because the existing `votes` table has a named unique constraint generated by Postgres, add a safe block that drops only the old `idea_id + visitor_id` unique constraint if present:

```sql
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'votes'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (idea_id, visitor_id)';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE votes DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS votes_idea_visitor_anonymous_uidx
  ON votes (idea_id, visitor_id)
  WHERE owner_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS votes_idea_owner_uidx
  ON votes (idea_id, owner_user_id)
  WHERE owner_user_id IS NOT NULL;
```

- [ ] **Step 3: Run the build**

Run:

```bash
npm run build
```

Expected:

```text
✓ Compiled successfully
```

- [ ] **Step 4: Commit**

```bash
git add lib/store.mjs
git commit -m "Add auth ownership schema"
```

---

### Task 4: Store Ownership And Claim Queries

**Files:**
- Modify: `lib/store.mjs`

- [ ] **Step 1: Extend public idea/comment mappers**

Update `toPublicIdea(row)` to include identity fields:

```js
authorDisplayName: row.author_display_name,
authorImage: row.author_image || null,
ownerUserId: row.owner_user_id || null,
visitorId: row.visitor_id || null,
```

Update `toPublicComment(row)` similarly:

```js
authorDisplayName: row.author_display_name,
authorImage: row.author_image || null,
ownerUserId: row.owner_user_id || null,
visitorId: row.visitor_id || null,
```

- [ ] **Step 2: Join user image in idea and comment selects**

Update `ideaSelectSql(viewerVote = false)`:

```js
function ideaSelectSql(viewerVote = false) {
  return `
    i.*,
    owner.image AS author_image,
    COALESCE(COUNT(v.*) FILTER (WHERE v.vote_type = 'bless'), 0)::int AS bless_count,
    COALESCE(COUNT(v.*) FILTER (WHERE v.vote_type = 'damn'), 0)::int AS damn_count
    ${viewerVote ? `, MAX(own.vote_type) AS viewer_vote` : ''}
  `;
}
```

Every query using `ideaSelectSql()` must include:

```sql
LEFT JOIN users owner ON owner.id = i.owner_user_id
```

and keep `GROUP BY i.id` as:

```sql
GROUP BY i.id, owner.image
```

Update `listComments()` to select the avatar:

```sql
SELECT c.*, owner.image AS author_image
FROM comments c
JOIN ideas i ON i.id = c.idea_id
LEFT JOIN users owner ON owner.id = c.owner_user_id
WHERE (i.id = $1 OR i.slug = $1)
  AND c.status = 'published'
ORDER BY c.created_at ASC
LIMIT 100
```

- [ ] **Step 3: Extend create operations**

Change `createIdea()` signature:

```js
export async function createIdea({
  title,
  ideaText,
  angelMarkdown,
  devilMarkdown,
  launchNote = '',
  authorDisplayName = 'Anonymous founder',
  visitorId = null,
  ownerUserId = null,
  parentIdeaId = null,
  versionNumber = 1,
  source = 'original'
}) {
```

Insert `visitor_id` and `owner_user_id`:

```sql
INSERT INTO ideas (
  id,
  slug,
  title,
  idea_text,
  angel_markdown,
  devil_markdown,
  launch_note,
  author_display_name,
  visitor_id,
  owner_user_id,
  parent_idea_id,
  version_number,
  source
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *,
  NULL::text AS author_image,
  0::int AS bless_count,
  0::int AS damn_count,
  NULL::text AS viewer_vote
```

Change `createComment()` signature and insert:

```js
export async function createComment({
  idOrSlug,
  authorDisplayName,
  visitorId = null,
  ownerUserId = null,
  body,
  stance = 'regular'
}) {
```

```sql
INSERT INTO comments (id, idea_id, author_display_name, visitor_id, owner_user_id, body, stance)
SELECT $2, target.id, $3, $4, $5, $6, $7
FROM target
RETURNING *, NULL::text AS author_image
```

- [ ] **Step 4: Add claim function**

Add:

```js
export async function claimInitialVisitorForUser({ userId, visitorId, displayName }) {
  await ensureSchema();

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT id, initial_visitor_claimed_at FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (!userResult.rows[0]) {
      await client.query('ROLLBACK');
      return { claimed: false, ideas: 0, comments: 0, votes: 0 };
    }

    if (userResult.rows[0].initial_visitor_claimed_at) {
      await client.query('COMMIT');
      return { claimed: false, ideas: 0, comments: 0, votes: 0 };
    }

    const safeDisplayName = compactText(displayName, 80) || 'Claimed founder';

    const ideas = visitorId
      ? await client.query(
          `
            UPDATE ideas
            SET owner_user_id = $1,
                author_display_name = $2,
                updated_at = now()
            WHERE visitor_id = $3
              AND owner_user_id IS NULL
            RETURNING id
          `,
          [userId, safeDisplayName, visitorId]
        )
      : { rowCount: 0 };

    const comments = visitorId
      ? await client.query(
          `
            UPDATE comments
            SET owner_user_id = $1,
                author_display_name = $2,
                updated_at = now()
            WHERE visitor_id = $3
              AND owner_user_id IS NULL
            RETURNING id
          `,
          [userId, safeDisplayName, visitorId]
        )
      : { rowCount: 0 };

    const votes = visitorId
      ? await client.query(
          `
            UPDATE votes
            SET owner_user_id = $1,
                updated_at = now()
            WHERE visitor_id = $2
              AND owner_user_id IS NULL
            RETURNING id
          `,
          [userId, visitorId]
        )
      : { rowCount: 0 };

    await client.query(
      `
        UPDATE users
        SET initial_visitor_claimed_at = now(),
            initial_visitor_id = $2
        WHERE id = $1
      `,
      [userId, visitorId]
    );

    await client.query('COMMIT');
    return {
      claimed: true,
      ideas: ideas.rowCount,
      comments: comments.rowCount,
      votes: votes.rowCount
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 5: Add account activity query**

Add:

```js
export async function getAccountActivity({ visitorId = null, ownerUserId = null }) {
  await ensureSchema();

  const filterColumn = ownerUserId ? 'owner_user_id' : 'visitor_id';
  const filterValue = ownerUserId || visitorId;
  if (!filterValue) {
    return { ideas: [], comments: [], votes: [] };
  }

  const [ideas, comments, votes] = await Promise.all([
    getPool().query(
      `
        SELECT ${ideaSelectSql()}
        FROM ideas i
        LEFT JOIN votes v ON v.idea_id = i.id
        LEFT JOIN users owner ON owner.id = i.owner_user_id
        WHERE i.${filterColumn} = $1
          AND i.status = 'published'
        GROUP BY i.id, owner.image
        ORDER BY i.published_at DESC
        LIMIT 50
      `,
      [filterValue]
    ),
    getPool().query(
      `
        SELECT c.*, owner.image AS author_image, i.title AS idea_title, i.slug AS idea_slug
        FROM comments c
        JOIN ideas i ON i.id = c.idea_id
        LEFT JOIN users owner ON owner.id = c.owner_user_id
        WHERE c.${filterColumn} = $1
          AND c.status = 'published'
        ORDER BY c.created_at DESC
        LIMIT 50
      `,
      [filterValue]
    ),
    getPool().query(
      `
        SELECT v.*, i.title AS idea_title, i.slug AS idea_slug
        FROM votes v
        JOIN ideas i ON i.id = v.idea_id
        WHERE v.${filterColumn} = $1
          AND i.status = 'published'
        ORDER BY v.updated_at DESC
        LIMIT 100
      `,
      [filterValue]
    )
  ]);

  return {
    ideas: ideas.rows.map(toPublicIdea),
    comments: comments.rows.map((row) => ({
      ...toPublicComment(row),
      ideaTitle: row.idea_title,
      ideaSlug: row.idea_slug
    })),
    votes: votes.rows.map((row) => ({
      id: row.id,
      ideaId: row.idea_id,
      ideaTitle: row.idea_title,
      ideaSlug: row.idea_slug,
      voteType: row.vote_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  };
}
```

- [ ] **Step 6: Run the build**

Run:

```bash
npm run build
```

Expected:

```text
✓ Compiled successfully
```

- [ ] **Step 7: Commit**

```bash
git add lib/store.mjs
git commit -m "Add ownership store queries"
```

---

### Task 5: API Ownership And Hybrid Voting

**Files:**
- Modify: `lib/ideas-api.mjs`
- Modify: `lib/store.mjs`

- [ ] **Step 1: Add current user helper to `lib/ideas-api.mjs`**

Add imports:

```js
import { auth, displayNameForUser } from '../auth.js';
```

Add:

```js
async function getCurrentUser() {
  const session = await auth();
  return session?.user || null;
}
```

Keep `getVisitorId(req, res)` as the source for `pp_visitor`.

- [ ] **Step 2: Pass ownership on publish**

In `handleCreateIdea()`, before summarizing the title:

```js
const visitorId = getVisitorId(req, res);
const user = await getCurrentUser();
const ownerUserId = user?.id || null;
const authorDisplayName = user ? displayNameForUser(user) : input.authorDisplayName;
```

Change create call:

```js
const idea = await createIdea({
  ...input,
  title,
  visitorId,
  ownerUserId,
  authorDisplayName
});
```

- [ ] **Step 3: Pass ownership on comment**

In `handleCreateComment()`:

```js
const visitorId = getVisitorId(req, res);
const user = await getCurrentUser();
const ownerUserId = user?.id || null;
const authorDisplayName = user ? displayNameForUser(user) : 'Anonymous heckler';
```

Change create call:

```js
const comment = await createComment({
  idOrSlug: key,
  authorDisplayName,
  visitorId,
  ownerUserId,
  body: commentBody,
  stance
});
```

- [ ] **Step 4: Change vote store signature**

Change:

```js
export async function voteOnIdea({ idOrSlug, visitorId, ownerUserId = null, voteType }) {
```

Inside `voteOnIdea()`, branch the upsert:

```js
if (ownerUserId) {
  await client.query(
    `
      INSERT INTO votes (id, idea_id, visitor_id, owner_user_id, vote_type)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (idea_id, owner_user_id)
      WHERE owner_user_id IS NOT NULL
      DO UPDATE SET vote_type = EXCLUDED.vote_type,
                    visitor_id = EXCLUDED.visitor_id,
                    updated_at = now()
    `,
    [randomUUID(), ideaId, visitorId, ownerUserId, voteType]
  );
} else {
  await client.query(
    `
      INSERT INTO votes (id, idea_id, visitor_id, vote_type)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (idea_id, visitor_id)
      WHERE owner_user_id IS NULL
      DO UPDATE SET vote_type = EXCLUDED.vote_type,
                    updated_at = now()
    `,
    [randomUUID(), ideaId, visitorId, voteType]
  );
}
```

Update the viewer-vote join:

```sql
LEFT JOIN votes own ON own.idea_id = i.id AND (
  ($3::text IS NOT NULL AND own.owner_user_id = $3)
  OR ($3::text IS NULL AND own.visitor_id = $2 AND own.owner_user_id IS NULL)
)
```

Call that result query with:

```js
[ideaId, visitorId, ownerUserId]
```

- [ ] **Step 5: Pass ownership on votes**

In `handleVoteIdea()`:

```js
const visitorId = getVisitorId(req, res);
const user = await getCurrentUser();
const idea = await voteOnIdea({
  idOrSlug: key,
  visitorId,
  ownerUserId: user?.id || null,
  voteType
});
```

- [ ] **Step 6: Run the build**

Run:

```bash
npm run build
```

Expected:

```text
✓ Compiled successfully
```

- [ ] **Step 7: Commit**

```bash
git add lib/ideas-api.mjs lib/store.mjs
git commit -m "Wire ownership into community APIs"
```

---

### Task 6: Account Activity Endpoint

**Files:**
- Create: `app/api/account/activity/route.js`

- [ ] **Step 1: Create account activity route**

Create `app/api/account/activity/route.js`:

```js
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { auth, displayNameForUser } from '../../../../auth.js';
import { claimInitialVisitorForUser, getAccountActivity } from '../../../../lib/store.mjs';

function validVisitorId(value) {
  return typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
}

function visitorCookie(value) {
  return {
    name: 'pp_visitor',
    value,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 31536000
  };
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await auth();
  const existingVisitor = cookieStore.get('pp_visitor')?.value;
  const visitorId = validVisitorId(existingVisitor) ? existingVisitor : randomUUID();

  if (!validVisitorId(existingVisitor)) {
    cookieStore.set(visitorCookie(visitorId));
  }

  if (!session?.user?.id) {
    const activity = await getAccountActivity({ visitorId });
    return Response.json({
      mode: 'anonymous',
      visitorId,
      user: null,
      claim: null,
      activity
    });
  }

  const claim = await claimInitialVisitorForUser({
    userId: session.user.id,
    visitorId,
    displayName: displayNameForUser(session.user)
  });

  if (!claim.claimed) {
    cookieStore.set(visitorCookie(randomUUID()));
  }

  const activity = await getAccountActivity({ ownerUserId: session.user.id });
  return Response.json({
    mode: 'signed-in',
    visitorId,
    user: {
      id: session.user.id,
      name: displayNameForUser(session.user),
      image: session.user.image || null
    },
    claim,
    activity
  });
}
```

- [ ] **Step 2: Run the build**

Run:

```bash
npm run build
```

Expected:

```text
✓ Compiled successfully
```

- [ ] **Step 3: Commit**

```bash
git add app/api/account/activity/route.js
git commit -m "Add account activity endpoint"
```

---

### Task 7: Header, Auth Controls, And Google Prompt

**Files:**
- Create: `app/SiteHeader.jsx`
- Create: `app/HeaderBreadcrumbs.jsx`
- Create: `app/GoogleOneTap.jsx`
- Modify: `app/layout.js`
- Modify: `app/globals.css`

- [ ] **Step 1: Create client breadcrumbs**

Create `app/HeaderBreadcrumbs.jsx`:

```jsx
'use client';

import { usePathname } from 'next/navigation';

function labelForSegment(segment) {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .slice(0, 56);
}

export default function HeaderBreadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split('/').filter(Boolean);

  if (!parts.length) {
    return <span className="site-crumb-current">Judge</span>;
  }

  return (
    <nav className="site-breadcrumbs" aria-label="Breadcrumb">
      <a href="/">Home</a>
      {parts.map((part, index) => {
        const href = `/${parts.slice(0, index + 1).join('/')}`;
        const isLast = index === parts.length - 1;
        return (
          <span className="site-crumb" key={href}>
            <span aria-hidden="true">/</span>
            {isLast ? <span className="site-crumb-current">{labelForSegment(part)}</span> : <a href={href}>{labelForSegment(part)}</a>}
          </span>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Create Google One Tap progressive component**

Create `app/GoogleOneTap.jsx`:

```jsx
'use client';

import Script from 'next/script';
import { signIn } from 'next-auth/react';

export default function GoogleOneTap({ clientId, enabled }) {
  if (!enabled || !clientId) return null;

  function initializeOneTap() {
    if (!window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      callback: () => {
        signIn('google', { callbackUrl: '/account' });
      }
    });

    window.google.accounts.id.prompt();
  }

  return (
    <Script
      src="https://accounts.google.com/gsi/client"
      strategy="afterInteractive"
      onLoad={initializeOneTap}
    />
  );
}
```

This first pass uses One Tap as a Google-controlled prompt/nudge and then enters the normal Auth.js Google OAuth path. The normal header button remains the reliable sign-in path if Google or the browser suppresses One Tap.

- [ ] **Step 3: Create the server header**

Create `app/SiteHeader.jsx`:

```jsx
import { auth } from '../auth.js';
import { signInWithGoogle, signOutOfGoogle } from './actions/auth.js';
import GoogleOneTap from './GoogleOneTap.jsx';
import HeaderBreadcrumbs from './HeaderBreadcrumbs.jsx';

export default async function SiteHeader() {
  const session = await auth();
  const user = session?.user || null;

  return (
    <>
      <header className="site-header">
        <a className="site-brand" href="/">
          <span className="site-brand-mark" aria-hidden="true">PP</span>
          <span>Pitch Purgatory</span>
        </a>
        <HeaderBreadcrumbs />
        <nav className="site-nav" aria-label="Main navigation">
          <a href="/ideas">Ideas</a>
          <a href="/account">Account</a>
        </nav>
        <div className="site-auth">
          {user ? (
            <form action={signOutOfGoogle}>
              <span className="site-user-pill">
                {user.image ? <img src={user.image} alt="" /> : <span className="site-avatar-fallback" aria-hidden="true" />}
                <span>{user.name || 'Claimed founder'}</span>
              </span>
              <button type="submit">Sign out</button>
            </form>
          ) : (
            <form action={signInWithGoogle}>
              <button type="submit">Sign in with Google</button>
            </form>
          )}
        </div>
      </header>
      <GoogleOneTap clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID} enabled={!user} />
    </>
  );
}
```

- [ ] **Step 4: Render header in layout**

Modify `app/layout.js`:

```jsx
import './globals.css';
import SiteHeader from './SiteHeader.jsx';

export const metadata = {
  title: 'Angel / Devil Idea Judge',
  description: 'Toss a startup idea into a playful angel/devil tribunal.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Add header styles**

Add to `app/globals.css`:

```css
.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  min-height: 60px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 14px;
  align-items: center;
  padding: 10px max(16px, calc((100vw - 1400px) / 2));
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(23, 23, 23, 0.86);
  backdrop-filter: blur(18px);
}

.site-brand,
.site-nav a,
.site-breadcrumbs a {
  color: #fff8ef;
  text-decoration: none;
}

.site-brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-weight: 900;
}

.site-brand-mark {
  width: 32px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  color: #171717;
  background: linear-gradient(135deg, #ffd75d, #ff665c);
  font-size: 0.72rem;
}

.site-breadcrumbs {
  min-width: 0;
  display: flex;
  gap: 7px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 0.92rem;
  overflow: hidden;
  white-space: nowrap;
}

.site-crumb {
  display: inline-flex;
  gap: 7px;
  min-width: 0;
}

.site-crumb-current {
  overflow: hidden;
  text-overflow: ellipsis;
}

.site-nav,
.site-auth form,
.site-user-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.site-auth button {
  min-height: 38px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: #fff8ef;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  font-weight: 820;
}

.site-user-pill img,
.site-avatar-fallback {
  width: 30px;
  height: 30px;
  border-radius: 50%;
}

.site-avatar-fallback {
  display: inline-block;
  background: radial-gradient(circle at 35% 30%, #fff2a8, #ff665c 70%);
}

@media (max-width: 760px) {
  .site-header {
    grid-template-columns: 1fr auto;
  }

  .site-breadcrumbs,
  .site-nav {
    display: none;
  }
}
```

- [ ] **Step 6: Run the build**

Run:

```bash
npm run build
```

Expected:

```text
✓ Compiled successfully
```

- [ ] **Step 7: Commit**

```bash
git add app/SiteHeader.jsx app/HeaderBreadcrumbs.jsx app/GoogleOneTap.jsx app/layout.js app/globals.css
git commit -m "Add global account header"
```

---

### Task 8: Account Page UI

**Files:**
- Create: `app/account/page.js`
- Create: `app/account/AccountPage.jsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Create account page route**

Create `app/account/page.js`:

```jsx
import AccountPage from './AccountPage.jsx';

export const metadata = {
  title: 'Account - Pitch Purgatory'
};

export default function AccountRoute() {
  return <AccountPage />;
}
```

- [ ] **Step 2: Create account client UI**

Create `app/account/AccountPage.jsx`:

```jsx
'use client';

import { useEffect, useState } from 'react';

function ActivityLink({ href, children }) {
  return <a className="account-activity-link" href={href}>{children}</a>;
}

function VoteLabel({ type }) {
  return <span className={`account-vote-label account-vote-${type}`}>{type === 'bless' ? 'Blessed' : 'Damned'}</span>;
}

export default function AccountPage() {
  const [state, setState] = useState({ status: 'loading', payload: null, error: null });

  useEffect(() => {
    let active = true;

    fetch('/api/account/activity')
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || `Account load failed with HTTP ${response.status}.`);
        return payload;
      })
      .then((payload) => {
        if (active) setState({ status: 'ready', payload, error: null });
      })
      .catch((error) => {
        if (active) setState({ status: 'error', payload: null, error });
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'loading') {
    return <main className="account-page"><p className="account-empty">Summoning your paper trail...</p></main>;
  }

  if (state.status === 'error') {
    return <main className="account-page"><p className="account-empty">{state.error?.message || 'Your trail slipped behind a curtain.'}</p></main>;
  }

  const payload = state.payload;
  const activity = payload.activity || { ideas: [], comments: [], votes: [] };
  const isSignedIn = payload.mode === 'signed-in';
  const claim = payload.claim;

  return (
    <main className="account-page">
      <section className="account-hero">
        {isSignedIn && payload.user?.image ? <img className="account-avatar" src={payload.user.image} alt="" /> : <span className="account-avatar account-avatar-fallback" aria-hidden="true" />}
        <div>
          <h1>{isSignedIn ? 'My Pitches from Purgatory' : "This browser's purgatory trail"}</h1>
          <p>
            {isSignedIn
              ? `${payload.user?.name || 'Claimed founder'} has receipts.`
              : 'This trail lives on this browser until you claim it with Google.'}
          </p>
        </div>
      </section>

      {!isSignedIn ? (
        <section className="account-nudge">
          <h2>Make the trail permanent</h2>
          <p>Sign in with Google to claim this browser's pitches, heckles, and votes.</p>
          <a href="/api/auth/signin/google?callbackUrl=/account">Sign in with Google</a>
        </section>
      ) : null}

      {claim?.claimed && (claim.ideas || claim.comments || claim.votes) ? (
        <p className="account-claim">Claimed {claim.ideas} pitches, {claim.comments} heckles, and {claim.votes} votes from this browser.</p>
      ) : null}

      <section className="account-section">
        <h2>Ideas</h2>
        {activity.ideas.length ? (
          <div className="account-grid">
            {activity.ideas.map((idea) => (
              <article className="feed-card" key={idea.id}>
                <ActivityLink href={`/ideas/${idea.slug}`}>{idea.title}</ActivityLink>
                <p>{idea.ideaText}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="account-empty">No pitches claimed yet. Go throw one into the fire.</p>
        )}
      </section>

      <section className="account-section">
        <h2>Comments</h2>
        {activity.comments.length ? (
          <div className="account-list">
            {activity.comments.map((comment) => (
              <article className="comment-card" key={comment.id}>
                <ActivityLink href={`/ideas/${comment.ideaSlug}`}>{comment.ideaTitle}</ActivityLink>
                <p>{comment.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="account-empty">No heckles in the ledger.</p>
        )}
      </section>

      <section className="account-section">
        <h2>Votes</h2>
        {activity.votes.length ? (
          <div className="account-list">
            {activity.votes.map((vote) => (
              <article className="account-vote-card" key={vote.id}>
                <VoteLabel type={vote.voteType} />
                <ActivityLink href={`/ideas/${vote.ideaSlug}`}>{vote.ideaTitle}</ActivityLink>
              </article>
            ))}
          </div>
        ) : (
          <p className="account-empty">No blessings or damnations on record.</p>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Add account styles**

Add to `app/globals.css`:

```css
.account-page {
  width: min(1120px, calc(100vw - 32px));
  min-height: calc(100vh - 60px);
  display: grid;
  gap: 22px;
  align-content: start;
  margin: 0 auto;
  padding: 34px 0 56px;
}

.account-hero {
  display: flex;
  gap: 16px;
  align-items: center;
}

.account-avatar {
  width: 72px;
  height: 72px;
  flex: 0 0 auto;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.18);
}

.account-avatar-fallback {
  background: radial-gradient(circle at 35% 30%, #fff2a8, #ff665c 70%);
}

.account-hero h1 {
  white-space: normal;
}

.account-hero p,
.account-empty {
  color: rgba(255, 255, 255, 0.68);
  font-weight: 650;
}

.account-nudge,
.account-claim,
.account-section {
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
}

.account-nudge {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.account-nudge h2,
.account-section h2 {
  margin: 0;
}

.account-nudge a,
.account-activity-link {
  color: #fff8ef;
  font-weight: 880;
}

.account-grid,
.account-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.account-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.account-vote-card {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.07);
}

.account-vote-label {
  min-width: 72px;
  font-weight: 900;
}

.account-vote-bless {
  color: #ffd75d;
}

.account-vote-damn {
  color: #ff8b81;
}
```

- [ ] **Step 4: Run the build**

Run:

```bash
npm run build
```

Expected:

```text
✓ Compiled successfully
```

- [ ] **Step 5: Commit**

```bash
git add app/account app/globals.css
git commit -m "Add account activity page"
```

---

### Task 9: Public Author Avatars

**Files:**
- Modify: `app/PurgatoryApp.jsx`
- Modify: `src/main.js`
- Modify: `app/globals.css`

- [ ] **Step 1: Add avatar slot to public idea markup**

In `app/PurgatoryApp.jsx`, replace the public post meta block with:

```jsx
<div className="public-post-meta">
  <span id="public-author-avatar" className="author-avatar author-avatar-fallback" aria-hidden="true" />
  <span>
    <strong id="public-author-name">Anonymous founder</strong>
    <span id="public-idea-meta">Freshly launched from purgatory</span>
  </span>
</div>
```

- [ ] **Step 2: Add DOM references and avatar renderer**

In `src/main.js`, add:

```js
const publicAuthorAvatar = document.querySelector('#public-author-avatar');
const publicAuthorName = document.querySelector('#public-author-name');
```

Add helper:

```js
function renderAvatar(target, imageUrl, label) {
  target.textContent = '';
  target.className = 'author-avatar';

  if (!imageUrl) {
    target.classList.add('author-avatar-fallback');
    target.setAttribute('aria-hidden', 'true');
    return;
  }

  const image = document.createElement('img');
  image.src = imageUrl;
  image.alt = label ? `${label} avatar` : '';
  image.referrerPolicy = 'no-referrer';
  target.append(image);
}
```

- [ ] **Step 3: Render public idea author identity**

In `renderPublicIdea(idea)`, set:

```js
publicAuthorName.textContent = idea.authorDisplayName || 'Anonymous founder';
renderAvatar(publicAuthorAvatar, idea.authorImage, idea.authorDisplayName);
```

Keep the existing `publicIdeaMeta` timestamp/status text.

- [ ] **Step 4: Render comment avatars**

In `commentNode(comment)`, prepend:

```js
const avatar = document.createElement('span');
renderAvatar(avatar, comment.authorImage, comment.authorDisplayName);
```

Then append `avatar` before the text content:

```js
item.append(avatar, meta, body);
```

- [ ] **Step 5: Add avatar CSS**

Add to `app/globals.css`:

```css
.author-avatar {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.author-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.author-avatar-fallback {
  background: radial-gradient(circle at 35% 30%, #fff2a8, #ff665c 70%);
}

.public-post-meta {
  align-items: center;
}

.public-post-meta > span:last-child {
  display: grid;
  gap: 2px;
}

.comment-card {
  grid-template-columns: auto minmax(0, 1fr);
}

.comment-card .comment-meta,
.comment-card p:last-child {
  grid-column: 2;
}
```

- [ ] **Step 6: Run the build**

Run:

```bash
npm run build
```

Expected:

```text
✓ Compiled successfully
```

- [ ] **Step 7: Commit**

```bash
git add app/PurgatoryApp.jsx src/main.js app/globals.css
git commit -m "Show claimed author avatars"
```

---

### Task 10: Verification And Manual Flow

**Files:**
- No planned source changes unless verification reveals defects.

- [ ] **Step 1: Build**

Run:

```bash
npm run build
```

Expected:

```text
✓ Compiled successfully
```

- [ ] **Step 2: Start local dev server**

Run:

```bash
npm run dev
```

Expected:

```text
Local:        http://localhost:3000
```

- [ ] **Step 3: Manual anonymous account verification**

Open:

```text
http://localhost:3000/account
```

Expected:

- Header renders.
- Account page shows "This browser's purgatory trail".
- Empty states render if there is no current anonymous activity.
- Sign-in nudge is visible.

- [ ] **Step 4: Manual anonymous activity verification**

In the browser:

1. Open `/`.
2. Submit a test idea.
3. Launch it.
4. Vote on it.
5. Add a comment.
6. Open `/account`.

Expected:

- The anonymous account page lists the idea, comment, and vote from this browser session.

- [ ] **Step 5: Manual Google login verification**

Click "Sign in with Google".

Expected:

- Auth redirects through Google and returns to `/account`.
- Claim summary appears if rows existed.
- Claimed idea/comment public names show the Google display name.
- Header shows Google display name and profile picture when Google provides one.

- [ ] **Step 6: Manual signed-in vote verification**

Vote on an idea while signed in, then open `/account`.

Expected:

- Account page shows the vote under signed-in activity.
- Re-voting changes the same account vote instead of creating duplicate vote rows.

- [ ] **Step 7: Manual later-login behavior**

Use a separate browser profile or clear only the Auth.js session while preserving an unrelated anonymous `pp_visitor`, then sign into the same Google account.

Expected:

- No second claim summary for anonymous rows from that browser.
- Old anonymous activity from that browser remains anonymous.
- New signed-in actions attach to the account.

- [ ] **Step 8: Stop dev server and record verification state**

Run:

```bash
git status --short
```

Expected:

```text
No uncommitted files except intentional implementation work already committed by previous tasks.
```

---

## Plan Self-Review

Spec coverage:

- Google OAuth and Auth.js: Tasks 1-2.
- Postgres-backed auth tables and ownership columns: Task 3.
- One-time browser-session claim: Tasks 4 and 6.
- Header bar and breadcrumbs: Task 7.
- `/account` for anonymous and signed-in users: Tasks 6 and 8.
- Hybrid vote identity: Task 5.
- Google display names/profile pictures: Tasks 2, 4, 7, and 9.
- Google One Tap enhancement: Task 7.
- Build/manual verification: Task 10.

Implementation note:

- Google One Tap is implemented as a progressive prompt that starts the standard Auth.js Google OAuth sign-in. The header sign-in button remains the primary path, so browsers that suppress One Tap still have complete login behavior.
