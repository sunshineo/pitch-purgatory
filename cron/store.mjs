import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

let pool;
let schemaReady;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for seeded activity.');
  }

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
  });

  return pool;
}

async function ensureCronSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS activity_runs (
        id text PRIMARY KEY,
        status text NOT NULL,
        actions jsonb NOT NULL DEFAULT '[]'::jsonb,
        error_message text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS activity_runs_created_at_idx ON activity_runs (created_at DESC);

      CREATE TABLE IF NOT EXISTS cron_idea_evaluations (
        idea_id text PRIMARY KEY,
        slug text NOT NULL,
        bucket text NOT NULL CHECK (
          bucket IN (
            'blessed',
            'damned'
          )
        ),
        reason text NOT NULL DEFAULT '',
        fallback boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS cron_idea_evaluations_slug_idx ON cron_idea_evaluations (slug);

      ALTER TABLE cron_idea_evaluations
        DROP CONSTRAINT IF EXISTS cron_idea_evaluations_bucket_check;

      DELETE FROM cron_idea_evaluations
      WHERE bucket NOT IN ('blessed', 'damned');

      ALTER TABLE cron_idea_evaluations
        ADD CONSTRAINT cron_idea_evaluations_bucket_check
        CHECK (bucket IN ('blessed', 'damned'));
    `);
  }

  await schemaReady;
}

export async function closeCronStore() {
  if (!pool) return;
  await pool.end();
  pool = undefined;
  schemaReady = undefined;
}

export async function listExistingIdeaTexts() {
  await ensureCronSchema();

  const result = await getPool().query('SELECT idea_text FROM ideas WHERE status = $1', ['published']);
  return new Set(result.rows.map((row) => row.idea_text));
}

export async function listRandomIdeas({ limit = 5 } = {}) {
  await ensureCronSchema();

  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 50);
  const result = await getPool().query(
    `
      SELECT
        i.id,
        i.slug,
        i.title,
        i.idea_text,
        COALESCE(COUNT(v.*) FILTER (WHERE v.vote_type = 'bless'), 0)::int AS bless_count,
        COALESCE(COUNT(v.*) FILTER (WHERE v.vote_type = 'damn'), 0)::int AS damn_count
      FROM ideas i
      LEFT JOIN votes v ON v.idea_id = i.id
      WHERE i.status = 'published'
      GROUP BY i.id
      ORDER BY random()
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    ideaText: row.idea_text,
    votes: {
      bless: Number(row.bless_count || 0),
      damn: Number(row.damn_count || 0)
    }
  }));
}

export async function getEvaluationDistribution() {
  await ensureCronSchema();

  const result = await getPool().query(`
    SELECT
      COALESCE(COUNT(e.*) FILTER (WHERE e.bucket = 'blessed'), 0)::int AS blessed,
      COALESCE(COUNT(e.*) FILTER (WHERE e.bucket = 'damned'), 0)::int AS damned,
      COALESCE(COUNT(i.*) FILTER (WHERE e.idea_id IS NULL), 0)::int AS neutral
    FROM ideas i
    LEFT JOIN cron_idea_evaluations e ON e.idea_id = i.id
    WHERE i.status = 'published'
  `);

  return {
    blessed: Number(result.rows[0]?.blessed || 0),
    damned: Number(result.rows[0]?.damned || 0),
    neutral: Number(result.rows[0]?.neutral || 0)
  };
}

export async function listRandomVoteIdeas({ limit = 5 } = {}) {
  await ensureCronSchema();

  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 50);
  const result = await getPool().query(
    `
      SELECT
        i.id,
        i.slug,
        i.title,
        i.idea_text,
        e.bucket,
        e.fallback,
        COALESCE(COUNT(v.*) FILTER (WHERE v.vote_type = 'bless'), 0)::int AS bless_count,
        COALESCE(COUNT(v.*) FILTER (WHERE v.vote_type = 'damn'), 0)::int AS damn_count
      FROM ideas i
      LEFT JOIN votes v ON v.idea_id = i.id
      LEFT JOIN cron_idea_evaluations e ON e.idea_id = i.id
      WHERE i.status = 'published'
      GROUP BY i.id, e.bucket, e.fallback
      ORDER BY random()
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    ideaText: row.idea_text,
    bucket: row.bucket || null,
    fallback: Boolean(row.fallback),
    votes: {
      bless: Number(row.bless_count || 0),
      damn: Number(row.damn_count || 0)
    }
  }));
}

export async function countIdeasCreatedSince({ source, since }) {
  await ensureCronSchema();

  if (source !== 'cron') {
    throw new Error('Cron idea counts only support source="cron".');
  }

  const result = await getPool().query(
    `
      SELECT COUNT(*)::int AS count
      FROM activity_runs ar
      CROSS JOIN LATERAL jsonb_array_elements(ar.actions) AS action
      WHERE ar.created_at >= $1
        AND action->>'type' = 'create_idea'
    `,
    [since]
  );

  return Number(result.rows[0]?.count || 0);
}

export async function listIdeasMissingEvaluations({ limit = 1000 } = {}) {
  await ensureCronSchema();

  const safeLimit = Math.min(Math.max(Number(limit) || 1000, 1), 1000);
  const result = await getPool().query(
    `
      SELECT i.id, i.slug, i.title, i.idea_text
      FROM ideas i
      LEFT JOIN cron_idea_evaluations e ON e.idea_id = i.id
      WHERE i.status = 'published'
        AND e.idea_id IS NULL
      ORDER BY i.published_at ASC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    ideaText: row.idea_text
  }));
}

export async function upsertIdeaEvaluation({ ideaId, slug, bucket, reason = '', fallback = false }) {
  await ensureCronSchema();

  const result = await getPool().query(
    `
      INSERT INTO cron_idea_evaluations (idea_id, slug, bucket, reason, fallback)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (idea_id)
      DO UPDATE SET
        slug = EXCLUDED.slug,
        bucket = EXCLUDED.bucket,
        reason = EXCLUDED.reason,
        fallback = EXCLUDED.fallback,
        updated_at = now()
      RETURNING *
    `,
    [ideaId, slug, bucket, String(reason || '').slice(0, 500), fallback]
  );

  return result.rows[0];
}

export async function recordActivityRun({ status, actions = [], errorMessage = '' }) {
  await ensureCronSchema();

  const result = await getPool().query(
    `
      INSERT INTO activity_runs (id, status, actions, error_message)
      VALUES ($1, $2, $3::jsonb, $4)
      RETURNING *
    `,
    [randomUUID(), status, JSON.stringify(actions), String(errorMessage || '').slice(0, 1000)]
  );

  return result.rows[0];
}
