import { randomUUID } from 'node:crypto';

import { displayNameForUser, handlers } from '../../../../auth.js';
import { getPool } from '../../../../lib/db.mjs';
import { claimInitialVisitorForUser, ensureSchema } from '../../../../lib/store.mjs';

const visitorCookieName = 'pp_visitor';
const claimSummaryCookieName = 'pp_claim_summary';
const visitorMaxAge = 31536000;
const claimSummaryMaxAge = 300;

function validVisitorId(value) {
  return typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
}

function isGoogleCallback(request) {
  return request.nextUrl?.pathname?.endsWith('/api/auth/callback/google');
}

function isSecureRequest(request) {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedProto) return forwardedProto === 'https';
  return request.nextUrl?.protocol === 'https:';
}

function serializeCookie({ name, value, maxAge, secure }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];

  if (Number.isFinite(maxAge)) {
    parts.push(`Max-Age=${maxAge}`);
  }

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function encodeClaimSummary(claim) {
  const summary = {
    ideas: Number(claim.ideas || 0),
    comments: Number(claim.comments || 0),
    votes: Number(claim.votes || 0)
  };

  return Buffer.from(JSON.stringify(summary), 'utf8').toString('base64url');
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=\s]+=)/g).map((part) => part.trim()).filter(Boolean);
}

function responseSetCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }

  return splitSetCookieHeader(response.headers.get('set-cookie'));
}

function authSessionTokenFromResponse(response) {
  for (const cookie of responseSetCookies(response)) {
    const match = cookie.match(/(?:^|,\s*)(?:__Secure-authjs\.session-token|authjs\.session-token)=([^;]+)/);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}

async function sessionUserFromToken(sessionToken) {
  const result = await getPool().query(
    `
      SELECT u.id, u.name, u.email, u.image
      FROM sessions s
      JOIN users u ON u.id = s."userId"
      WHERE s."sessionToken" = $1
        AND s.expires > now()
      LIMIT 1
    `,
    [sessionToken]
  );

  return result.rows[0] || null;
}

async function appendImmediateClaimCookies({ request, response }) {
  if (!isGoogleCallback(request) || response.status >= 400) {
    return response;
  }

  const visitorId = request.cookies.get(visitorCookieName)?.value;
  if (!validVisitorId(visitorId)) {
    return response;
  }

  const sessionToken = authSessionTokenFromResponse(response);
  if (!sessionToken) {
    return response;
  }

  const user = await sessionUserFromToken(sessionToken);
  if (!user?.id) {
    return response;
  }

  const claim = await claimInitialVisitorForUser({
    userId: user.id,
    visitorId,
    displayName: displayNameForUser(user)
  });

  if (!claim.claimed) {
    return response;
  }

  const secure = isSecureRequest(request);
  response.headers.append(
    'Set-Cookie',
    serializeCookie({
      name: visitorCookieName,
      value: randomUUID(),
      maxAge: visitorMaxAge,
      secure
    })
  );
  response.headers.append(
    'Set-Cookie',
    serializeCookie({
      name: claimSummaryCookieName,
      value: encodeClaimSummary(claim),
      maxAge: claimSummaryMaxAge,
      secure
    })
  );

  return response;
}

function wrapAuthHandler(handler) {
  return async function wrappedAuthHandler(request, context) {
    await ensureSchema();
    const response = await handler(request, context);
    return appendImmediateClaimCookies({ request, response });
  };
}

export const GET = wrapAuthHandler(handlers.GET);
export const POST = wrapAuthHandler(handlers.POST);
