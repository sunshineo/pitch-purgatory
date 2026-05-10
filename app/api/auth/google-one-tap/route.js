import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

import { getPool } from '../../../../lib/db.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const sessionMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
const maxCredentialLength = 10000;
const googleTokenInfoUrl = 'https://oauth2.googleapis.com/tokeninfo';
const allowedIssuers = new Set(['accounts.google.com', 'https://accounts.google.com']);

function jsonResponse(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0'
    }
  });
}

function getGoogleClientId() {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID || '';
}

function textOrNull(value, maxLength = 255) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function isEmailVerified(value) {
  return value === true || value === 'true';
}

function isSecureRequest(request) {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedProto) return forwardedProto === 'https';
  return request.nextUrl.protocol === 'https:';
}

function sessionCookieName(request) {
  return isSecureRequest(request) ? '__Secure-authjs.session-token' : 'authjs.session-token';
}

async function verifyGoogleCredential(credential, clientId) {
  const url = new URL(googleTokenInfoUrl);
  url.searchParams.set('id_token', credential);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error('google_tokeninfo_rejected');
  }

  const token = await response.json();
  if (token.aud !== clientId) {
    throw new Error('google_audience_mismatch');
  }

  const sub = textOrNull(token.sub);
  if (!sub) {
    throw new Error('google_subject_missing');
  }

  if (token.iss && !allowedIssuers.has(token.iss)) {
    throw new Error('google_issuer_invalid');
  }

  const email = textOrNull(token.email);
  if (email && !isEmailVerified(token.email_verified)) {
    throw new Error('google_email_unverified');
  }

  return {
    sub,
    email,
    name: textOrNull(token.name),
    image: textOrNull(token.picture, 2048),
    emailVerified: email ? new Date() : null
  };
}

async function ensureAuthSchema(client) {
  await client.query(`
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
  `);
}

async function upsertAuthSession(profile) {
  const client = await getPool().connect();
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + sessionMaxAgeMs);

  try {
    await client.query('BEGIN');
    await ensureAuthSchema(client);

    const accountResult = await client.query(
      'SELECT "userId" FROM accounts WHERE provider = $1 AND "providerAccountId" = $2 FOR UPDATE',
      ['google', profile.sub]
    );

    let userId = accountResult.rows[0]?.userId;

    if (userId) {
      await client.query(
        `
          UPDATE users
          SET
            name = COALESCE($2, name),
            email = COALESCE($3, email),
            "emailVerified" = COALESCE($4, "emailVerified"),
            image = COALESCE($5, image)
          WHERE id = $1
        `,
        [userId, profile.name, profile.email, profile.emailVerified, profile.image]
      );
    } else {
      userId = randomUUID();

      await client.query(
        `
          INSERT INTO users (id, name, email, "emailVerified", image)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [userId, profile.name, profile.email, profile.emailVerified, profile.image]
      );

      await client.query(
        `
          INSERT INTO accounts (id, "userId", type, provider, "providerAccountId", scope)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [randomUUID(), userId, 'oidc', 'google', profile.sub, 'openid profile email']
      );
    }

    await client.query(
      `
        INSERT INTO sessions (id, "userId", expires, "sessionToken")
        VALUES ($1, $2, $3, $4)
      `,
      [randomUUID(), userId, expires, sessionToken]
    );

    await client.query('COMMIT');
    return { sessionToken, expires };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function POST(request) {
  const clientId = getGoogleClientId();
  if (!clientId) {
    return jsonResponse({ ok: false, error: 'google_client_not_configured' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }

  const credential = typeof body?.credential === 'string' ? body.credential : '';
  if (!credential || credential.length > maxCredentialLength) {
    return jsonResponse({ ok: false, error: 'invalid_credential' }, 400);
  }

  try {
    const profile = await verifyGoogleCredential(credential, clientId);
    const { sessionToken, expires } = await upsertAuthSession(profile);
    const response = jsonResponse({ ok: true });
    const secure = isSecureRequest(request);

    response.cookies.set({
      name: sessionCookieName(request),
      value: sessionToken,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure,
      expires
    });

    return response;
  } catch {
    return jsonResponse({ ok: false, error: 'one_tap_failed' }, 401);
  }
}

export async function GET() {
  return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
}

export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
