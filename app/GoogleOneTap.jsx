'use client';

import Script from 'next/script';
import { signIn } from 'next-auth/react';

export default function GoogleOneTap({ clientId, enabled }) {
  if (!enabled || !clientId) return null;

  function fallbackToOAuth() {
    signIn('google', { callbackUrl: '/account' });
  }

  function initializeOneTap() {
    if (!window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      callback: async (response) => {
        const credential = response?.credential;
        if (!credential) {
          fallbackToOAuth();
          return;
        }

        try {
          const result = await fetch('/api/auth/google-one-tap', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ credential }),
            cache: 'no-store',
            credentials: 'same-origin'
          });

          const data = await result.json().catch(() => null);
          if (result.ok && data?.ok) {
            window.location.assign('/account');
            return;
          }
        } catch {
          // OAuth fallback below keeps sign-in available if One Tap verification fails.
        }

        fallbackToOAuth();
      }
    });

    window.google.accounts.id.prompt();
  }

  return (
    <Script
      src="https://accounts.google.com/gsi/client"
      strategy="afterInteractive"
      onLoad={initializeOneTap}
    />
  );
}
