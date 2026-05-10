import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import PostgresAdapter from '@auth/pg-adapter';

import { getPool } from './lib/db.mjs';

const maxDisplayNameLength = 80;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicDisplayName(value) {
  return value.slice(0, maxDisplayNameLength);
}

export function displayNameForUser(user = {}) {
  const name = typeof user.name === 'string' ? user.name.trim() : '';
  if (name && !emailPattern.test(name)) return publicDisplayName(name);

  const email = typeof user.email === 'string' ? user.email : '';
  const emailPrefix = email.split('@')[0]?.trim();
  if (emailPrefix) return publicDisplayName(emailPrefix);

  return 'Claimed founder';
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
    session({ session, user }) {
      return {
        user: {
          id: user.id,
          name: displayNameForUser(user),
          image: user.image ?? null
        },
        expires: session.expires
      };
    }
  },
  trustHost: true
});
