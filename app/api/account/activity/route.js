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

  const displayName = displayNameForUser(session.user);
  const claim = await claimInitialVisitorForUser({
    userId: session.user.id,
    visitorId,
    displayName
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
      name: displayName,
      image: session.user.image || null
    },
    claim,
    activity
  });
}
