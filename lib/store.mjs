import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

let pool;
let schemaReady;

function getPool() {
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

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
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
    status: row.status,
    parentIdeaId: row.parent_idea_id,
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
  source = 'original'
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
        source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *,
        0::int AS bless_count,
        0::int AS damn_count,
        NULL::text AS viewer_vote
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
      source
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
      WHERE i.id = $1 OR i.slug = $1
      GROUP BY i.id
      LIMIT 1
    `,
    [idOrSlug]
  );

  return result.rows[0] ? toPublicIdea(result.rows[0]) : null;
}

export async function listIdeas({ limit = 24 } = {}) {
  await ensureSchema();

  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 50);
  const result = await getPool().query(
    `
      SELECT ${ideaSelectSql()}
      FROM ideas i
      LEFT JOIN votes v ON v.idea_id = i.id
      WHERE i.status = 'published'
      GROUP BY i.id
      ORDER BY i.published_at DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows.map(toPublicIdea);
}

export async function voteOnIdea({ idOrSlug, visitorId, voteType }) {
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
    await client.query(
      `
        INSERT INTO votes (id, idea_id, visitor_id, vote_type)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (idea_id, visitor_id)
        DO UPDATE SET vote_type = EXCLUDED.vote_type, updated_at = now()
      `,
      [randomUUID(), ideaId, visitorId, voteType]
    );

    const result = await client.query(
      `
        SELECT ${ideaSelectSql(true)}
        FROM ideas i
        LEFT JOIN votes v ON v.idea_id = i.id
        LEFT JOIN votes own ON own.idea_id = i.id AND own.visitor_id = $2
        WHERE i.id = $1
        GROUP BY i.id
        LIMIT 1
      `,
      [ideaId, visitorId]
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
