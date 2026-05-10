import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import PostgresAdapter from '@auth/pg-adapter';

import { getPool } from './lib/db.mjs';

export function displayNameForUser(user = {}) {
  const name = typeof user.name === 'string' ? user.name.trim() : '';
  if (name) return name;

  const email = typeof user.email === 'string' ? user.email : '';
  const emailPrefix = email.split('@')[0]?.trim();
  if (emailPrefix) return emailPrefix;

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
      session.user.id = user.id;
      session.user.name = displayNameForUser(user);
      session.user.image = user.image ?? null;

      return session;
    }
  }
});
