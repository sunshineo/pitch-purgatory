'use client';

import Script from 'next/script';
import { signIn } from 'next-auth/react';

export default function GoogleOneTap({ clientId, enabled }) {
  if (!enabled || !clientId) return null;

  function initializeOneTap() {
    if (!window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      callback: () => {
        signIn('google', { callbackUrl: '/account' });
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
