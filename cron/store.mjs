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
  const result = await getPool().query('SELECT idea_text FROM ideas WHERE status = $1', ['published']);
  return new Set(result.rows.map((row) => row.idea_text));
}

export async function listRandomIdeas({ limit = 5 } = {}) {
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

export async function countIdeasCreatedSince({ source, since }) {
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
