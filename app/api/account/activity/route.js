import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

import { auth, displayNameForUser } from '../../../../auth.js';
import { claimInitialVisitorForUser, getAccountActivity } from '../../../../lib/store.mjs';

export const dynamic = 'force-dynamic';

const PRIVATE_JSON_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0'
};

function validVisitorId(value) {
  return typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
}

function hasActivity(activity) {
  return Boolean(
    activity?.ideas?.length || activity?.comments?.length || activity?.votes?.length
  );
}

function withoutVisitorId(record) {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const { visitorId: _visitorId, ...publicRecord } = record;
  return publicRecord;
}

function sanitizeAccountActivity(activity) {
  return {
    ...activity,
    ideas: Array.isArray(activity?.ideas) ? activity.ideas.map(withoutVisitorId) : [],
    comments: Array.isArray(activity?.comments) ? activity.comments.map(withoutVisitorId) : []
  };
}

function privateJson(body) {
  return Response.json(body, { headers: PRIVATE_JSON_HEADERS });
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
    return privateJson({
      mode: 'anonymous',
      user: null,
      claim: null,
      activity: sanitizeAccountActivity(activity)
    });
  }

  const displayName = displayNameForUser(session.user);
  const claim = await claimInitialVisitorForUser({
    userId: session.user.id,
    visitorId,
    displayName
  });

  if (claim.claimed) {
    cookieStore.set(visitorCookie(randomUUID()));
  } else {
    const anonymousActivity = await getAccountActivity({ visitorId });
    if (hasActivity(anonymousActivity)) {
      cookieStore.set(visitorCookie(randomUUID()));
    }
  }

  const activity = await getAccountActivity({ ownerUserId: session.user.id });
  return privateJson({
    mode: 'signed-in',
    user: {
      id: session.user.id,
      name: displayName,
      image: session.user.image || null
    },
    claim,
    activity: sanitizeAccountActivity(activity)
  });
}
