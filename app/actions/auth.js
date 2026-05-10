'use server';

import { signIn, signOut } from '../../auth.js';

export async function signInWithGoogle() {
  await signIn('google', { redirectTo: '/account' });
}

export async function signOutOfGoogle() {
  await signOut({ redirectTo: '/' });
}
