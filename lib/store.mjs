import { randomUUID } from 'node:crypto';
import { getPool } from './db.mjs';

let schemaReady;

const purgatoryMinimumVotes = 3;
const purgatoryRopeFloor = 0.2;

function purgatoryThresholdSql(totalVotesSql) {
  return `CASE
    WHEN ${totalVotesSql} < ${purgatoryMinimumVotes} THEN 2
    ELSE GREATEST(${purgatoryRopeFloor}, 1 / SQRT(${totalVotesSql}::float))
  END`;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
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

      CREATE TABLE IF NOT EXISTS ideas (
        id text PRIMARY KEY,
        slug text NOT NULL UNIQUE,
        title text NOT NULL,
        idea_text text NOT NULL,
        angel_markdown text NOT NULL,
        devil_markdown text NOT NULL,
        launch_note text NOT NULL DEFAULT '',
        author_display_name text NOT NULL DEFAULT 'Anonymous founder',
        status text NOT NULL DEFAULT 'published',
        parent_idea_id text REFERENCES ideas(id) ON DELETE SET NULL,
        version_number integer NOT NULL DEFAULT 1,
        rejudge_count integer NOT NULL DEFAULT 0,
        source text NOT NULL DEFAULT 'original',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS ideas_created_at_idx ON ideas (created_at DESC);
      CREATE INDEX IF NOT EXISTS ideas_parent_idea_id_idx ON ideas (parent_idea_id);

      CREATE TABLE IF NOT EXISTS votes (
        id text PRIMARY KEY,
        idea_id text NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
        visitor_id text NOT NULL,
        vote_type text NOT NULL CHECK (vote_type IN ('bless', 'damn')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (idea_id, visitor_id)
      );

      CREATE INDEX IF NOT EXISTS votes_idea_id_idx ON votes (idea_id);
      CREATE INDEX IF NOT EXISTS votes_visitor_id_idx ON votes (visitor_id);

      CREATE TABLE IF NOT EXISTS comments (
        id text PRIMARY KEY,
        idea_id text NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
        parent_comment_id text REFERENCES comments(id) ON DELETE CASCADE,
        author_display_name text NOT NULL DEFAULT 'Anonymous heckler',
        body text NOT NULL,
        stance text NOT NULL DEFAULT 'regular' CHECK (stance IN ('regular', 'angel', 'devil', 'founder')),
        status text NOT NULL DEFAULT 'published',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS comments_idea_id_created_at_idx ON comments (idea_id, created_at DESC);

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
    `);
  }

  await schemaReady;
}

function compactText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function makeSlug(seed) {
  const base =
    compactText(seed, 72)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 54) || 'cursed-pitch';
  const suffix = randomUUID().slice(0, 8);
  return `${base}-${suffix}`;
}

export function toPublicIdea(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    ideaText: row.idea_text,
    angelMarkdown: row.angel_markdown,
    devilMarkdown: row.devil_markdown,
    launchNote: row.launch_note,
    authorDisplayName: row.author_display_name,
    authorImage: row.author_image || null,
    ownerUserId: row.owner_user_id || null,
    visitorId: row.visitor_id || null,
    status: row.status,
    versionNumber: row.version_number,
    rejudgeCount: row.rejudge_count,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    votes: {
      bless: Number(row.bless_count || 0),
      damn: Number(row.damn_count || 0)
    },
    viewerVote: row.viewer_vote || null
  };
}

function ideaSelectSql(viewerVote = false) {
  return `
    i.*,
    owner.image AS author_image,
    COALESCE(COUNT(v.*) FILTER (WHERE v.vote_type = 'bless'), 0)::int AS bless_count,
    COALESCE(COUNT(v.*) FILTER (WHERE v.vote_type = 'damn'), 0)::int AS damn_count
    ${viewerVote ? `, MAX(own.vote_type) AS viewer_vote` : ''}
  `;
}

export async function createIdea({
  title,
  ideaText,
  angelMarkdown,
  devilMarkdown,
  launchNote = '',
  authorDisplayName = 'Anonymous founder',
  parentIdeaId = null,
  versionNumber = 1,
  source = 'original',
  visitorId = null,
  ownerUserId = null
}) {
  await ensureSchema();

  const id = randomUUID();
  const cleanedTitle = compactText(title || ideaText, 96) || 'Untitled pitch';
  const slug = makeSlug(cleanedTitle);

  const result = await getPool().query(
    `
      INSERT INTO ideas (
        id,
        slug,
        title,
        idea_text,
        angel_markdown,
        devil_markdown,
        launch_note,
        author_display_name,
        parent_idea_id,
        version_number,
        source,
        visitor_id,
        owner_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *,
        0::int AS bless_count,
        0::int AS damn_count,
        NULL::text AS viewer_vote,
        NULL::text AS author_image
    `,
    [
      id,
      slug,
      cleanedTitle,
      ideaText,
      angelMarkdown,
      devilMarkdown,
      compactText(launchNote, 220),
      compactText(authorDisplayName, 64) || 'Anonymous founder',
      parentIdeaId,
      versionNumber,
      source,
      visitorId,
      ownerUserId
    ]
  );

  return toPublicIdea(result.rows[0]);
}

export async function getIdeaByIdOrSlug(idOrSlug) {
  await ensureSchema();

  const result = await getPool().query(
    `
      SELECT ${ideaSelectSql()}
      FROM ideas i
      LEFT JOIN votes v ON v.idea_id = i.id
      LEFT JOIN users owner ON owner.id = i.owner_user_id
      WHERE i.id = $1 OR i.slug = $1
      GROUP BY i.id, owner.image
      LIMIT 1
    `,
    [idOrSlug]
  );

  return result.rows[0] ? toPublicIdea(result.rows[0]) : null;
}

function sortClause(sort) {
  if (sort === 'blessed') {
    return 'ranked.bless_count DESC, ranked.published_at DESC';
  }

  if (sort === 'damned') {
    return 'ranked.damn_count DESC, ranked.published_at DESC';
  }

  if (sort === 'controversial') {
    return '(ranked.bless_count + ranked.damn_count) DESC, ABS(ranked.bless_count - ranked.damn_count) ASC, ranked.published_at DESC';
  }

  if (sort === 'purgatory') {
    return 'ranked.vote_distance ASC, (ranked.bless_count + ranked.damn_count) DESC, ranked.published_at DESC';
  }

  return 'ranked.published_at DESC';
}

function bucketWhereClause(sort) {
  if (sort === 'blessed') {
    return 'WHERE ranked.vote_margin >= ranked.rope_threshold';
  }

  if (sort === 'damned') {
    return 'WHERE ranked.vote_margin <= -ranked.rope_threshold';
  }

  if (sort === 'purgatory') {
    return 'WHERE ranked.vote_distance < ranked.rope_threshold';
  }

  return '';
}

export async function listIdeas({ limit = 24, sort = 'recent' } = {}) {
  await ensureSchema();

  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 50);
  const orderBy = sortClause(sort);
  const bucketWhere = bucketWhereClause(sort);
  const totalVotesSql = 'COUNT(v.*)';
  const result = await getPool().query(
    `
      SELECT *
      FROM (
        SELECT ${ideaSelectSql()},
          ${totalVotesSql}::int AS total_votes,
          CASE
            WHEN ${totalVotesSql} = 0 THEN 0
            ELSE (
              COALESCE(COUNT(v.*) FILTER (WHERE v.vote_type = 'bless'), 0)::float -
              COALESCE(COUNT(v.*) FILTER (WHERE v.vote_type = 'damn'), 0)::float
            ) / ${totalVotesSql}
          END AS vote_margin,
          CASE
            WHEN ${totalVotesSql} = 0 THEN 0
            ELSE ABS(
              COALESCE(COUNT(v.*) FILTER (WHERE v.vote_type = 'bless'), 0)::float -
              COALESCE(COUNT(v.*) FILTER (WHERE v.vote_type = 'damn'), 0)::float
            ) / ${totalVotesSql}
          END AS vote_distance,
          ${purgatoryThresholdSql(totalVotesSql)} AS rope_threshold
        FROM ideas i
        LEFT JOIN votes v ON v.idea_id = i.id
        LEFT JOIN users owner ON owner.id = i.owner_user_id
        WHERE i.status = 'published'
        GROUP BY i.id, owner.image
      ) ranked
      ${bucketWhere}
      ORDER BY ${orderBy}
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows.map(toPublicIdea);
}

export async function voteOnIdea({ idOrSlug, visitorId, ownerUserId = null, voteType }) {
  await ensureSchema();

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const idea = await client.query('SELECT id FROM ideas WHERE id = $1 OR slug = $1 LIMIT 1', [idOrSlug]);
    if (!idea.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const ideaId = idea.rows[0].id;
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

    const result = await client.query(
      `
        SELECT ${ideaSelectSql(true)}
        FROM ideas i
        LEFT JOIN votes v ON v.idea_id = i.id
        LEFT JOIN votes own ON own.idea_id = i.id AND (
          ($3::text IS NOT NULL AND own.owner_user_id = $3)
          OR ($3::text IS NULL AND own.visitor_id = $2 AND own.owner_user_id IS NULL)
        )
        LEFT JOIN users owner ON owner.id = i.owner_user_id
        WHERE i.id = $1
        GROUP BY i.id, owner.image
        LIMIT 1
      `,
      [ideaId, visitorId, ownerUserId]
    );
    await client.query('COMMIT');
    return toPublicIdea(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function toPublicComment(row) {
  return {
    id: row.id,
    ideaId: row.idea_id,
    parentCommentId: row.parent_comment_id,
    authorDisplayName: row.author_display_name,
    authorImage: row.author_image || null,
    ownerUserId: row.owner_user_id || null,
    visitorId: row.visitor_id || null,
    body: row.body,
    stance: row.stance,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listComments(idOrSlug) {
  await ensureSchema();

  const result = await getPool().query(
    `
      SELECT c.*, owner.image AS author_image
      FROM comments c
      JOIN ideas i ON i.id = c.idea_id
      LEFT JOIN users owner ON owner.id = c.owner_user_id
      WHERE (i.id = $1 OR i.slug = $1)
        AND c.status = 'published'
      ORDER BY c.created_at ASC
      LIMIT 100
    `,
    [idOrSlug]
  );

  return result.rows.map(toPublicComment);
}

export async function createComment({
  idOrSlug,
  authorDisplayName,
  body,
  stance = 'regular',
  visitorId = null,
  ownerUserId = null
}) {
  await ensureSchema();

  const result = await getPool().query(
    `
      WITH target AS (
        SELECT id FROM ideas WHERE id = $1 OR slug = $1 LIMIT 1
      )
      INSERT INTO comments (id, idea_id, author_display_name, body, stance, visitor_id, owner_user_id)
      SELECT $2, target.id, $3, $4, $5, $6, $7
      FROM target
      RETURNING *, NULL::text AS author_image
    `,
    [idOrSlug, randomUUID(), authorDisplayName, body, stance, visitorId, ownerUserId]
  );

  return result.rows[0] ? toPublicComment(result.rows[0]) : null;
}

export async function claimInitialVisitorForUser({ userId, visitorId, displayName }) {
  await ensureSchema();

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const user = await client.query(
      `
        SELECT id, initial_visitor_claimed_at, initial_visitor_id
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [userId]
    );

    if (!user.rows[0]) {
      await client.query('ROLLBACK');
      return { claimed: false, ideas: 0, comments: 0, votes: 0 };
    }

    if (user.rows[0].initial_visitor_claimed_at || user.rows[0].initial_visitor_id) {
      await client.query('COMMIT');
      return { claimed: false, ideas: 0, comments: 0, votes: 0 };
    }

    const publicDisplayName = compactText(displayName, 64);
    const ideas = await client.query(
      `
        UPDATE ideas
        SET owner_user_id = $1,
          author_display_name = COALESCE(NULLIF($3, ''), author_display_name),
          updated_at = now()
        WHERE visitor_id = $2
          AND owner_user_id IS NULL
        RETURNING id
      `,
      [userId, visitorId, publicDisplayName]
    );

    const comments = await client.query(
      `
        UPDATE comments
        SET owner_user_id = $1,
          author_display_name = COALESCE(NULLIF($3, ''), author_display_name),
          updated_at = now()
        WHERE visitor_id = $2
          AND owner_user_id IS NULL
        RETURNING id
      `,
      [userId, visitorId, publicDisplayName]
    );

    await client.query(
      `
        DELETE FROM votes anonymous_vote
        USING votes owned_vote
        WHERE anonymous_vote.idea_id = owned_vote.idea_id
          AND owned_vote.owner_user_id = $1
          AND anonymous_vote.visitor_id = $2
          AND anonymous_vote.owner_user_id IS NULL
      `,
      [userId, visitorId]
    );

    const votes = await client.query(
      `
        UPDATE votes
        SET owner_user_id = $1,
          updated_at = now()
        WHERE visitor_id = $2
          AND owner_user_id IS NULL
        RETURNING id
      `,
      [userId, visitorId]
    );

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

export async function getAccountActivity({ visitorId = null, ownerUserId = null } = {}) {
  if (!visitorId && !ownerUserId) {
    return { ideas: [], comments: [], votes: [] };
  }

  await ensureSchema();

  const filter = ownerUserId
    ? { column: 'owner_user_id', value: ownerUserId }
    : { column: 'visitor_id', value: visitorId };

  const [ideas, comments, votes] = await Promise.all([
    getPool().query(
      `
        SELECT ${ideaSelectSql()}
        FROM ideas i
        LEFT JOIN votes v ON v.idea_id = i.id
        LEFT JOIN users owner ON owner.id = i.owner_user_id
        WHERE i.status = 'published'
          AND i.${filter.column} = $1
        GROUP BY i.id, owner.image
        ORDER BY i.published_at DESC
        LIMIT 50
      `,
      [filter.value]
    ),
    getPool().query(
      `
        SELECT c.*,
          i.title AS idea_title,
          i.slug AS idea_slug,
          owner.image AS author_image
        FROM comments c
        JOIN ideas i ON i.id = c.idea_id
        LEFT JOIN users owner ON owner.id = c.owner_user_id
        WHERE c.status = 'published'
          AND i.status = 'published'
          AND c.${filter.column} = $1
        ORDER BY c.created_at DESC
        LIMIT 50
      `,
      [filter.value]
    ),
    getPool().query(
      `
        SELECT v.id,
          v.idea_id,
          i.title AS idea_title,
          i.slug AS idea_slug,
          v.vote_type,
          v.created_at,
          v.updated_at
        FROM votes v
        JOIN ideas i ON i.id = v.idea_id
        WHERE i.status = 'published'
          AND v.${filter.column} = $1
        ORDER BY v.updated_at DESC
        LIMIT 100
      `,
      [filter.value]
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
