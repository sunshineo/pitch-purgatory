import { auth } from '../auth.js';
import { signInWithGoogle, signOutOfGoogle } from './actions/auth.js';
import GoogleOneTap from './GoogleOneTap.jsx';
import HeaderBreadcrumbs from './HeaderBreadcrumbs.jsx';

export default async function SiteHeader() {
  let session = null;

  try {
    session = await auth();
  } catch {
    session = null;
  }

  const user = session?.user || null;

  return (
    <>
      <header className="site-header">
        <a className="site-brand" href="/">
          <span className="site-brand-mark" aria-hidden="true">
            PP
          </span>
          <span>Pitch Purgatory</span>
        </a>

        <HeaderBreadcrumbs />

        <nav className="site-nav" aria-label="Main navigation">
          <a href="/ideas">Ideas</a>
          <a href="/account">Account</a>
        </nav>

        <div className="site-auth">
          {user ? (
            <form action={signOutOfGoogle}>
              <span className="site-user-pill">
                {user.image ? (
                  <img src={user.image} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="site-avatar-fallback" aria-hidden="true" />
                )}
                <span>{user.name || 'Claimed founder'}</span>
              </span>
              <button type="submit">Sign out</button>
            </form>
          ) : (
            <form action={signInWithGoogle}>
              <button type="submit">Sign in with Google</button>
            </form>
          )}
        </div>
      </header>

      <GoogleOneTap clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID} enabled={!user} />
    </>
  );
}
