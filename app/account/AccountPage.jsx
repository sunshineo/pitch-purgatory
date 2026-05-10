'use client';

import { useEffect, useState } from 'react';

function ActivityLink({ href, children }) {
  return (
    <a className="account-activity-link" href={href}>
      {children}
    </a>
  );
}

function VoteLabel({ type }) {
  const isBlessed = type === 'bless';

  return (
    <span className={`account-vote-label account-vote-${isBlessed ? 'bless' : 'damn'}`}>
      {isBlessed ? 'Blessed' : 'Damned'}
    </span>
  );
}

function emptyActivity() {
  return { ideas: [], comments: [], votes: [] };
}

export default function AccountPage() {
  const [state, setState] = useState({ status: 'loading', payload: null, error: null });

  useEffect(() => {
    let active = true;

    fetch('/api/account/activity')
      .then(async (response) => {
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || `Account load failed with HTTP ${response.status}.`);
        }

        return payload;
      })
      .then((payload) => {
        if (active) {
          setState({ status: 'ready', payload, error: null });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ status: 'error', payload: null, error });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <main className="account-page">
        <p className="account-empty">Summoning your paper trail...</p>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="account-page">
        <p className="account-empty">
          {state.error?.message || 'Your trail slipped behind a curtain.'}
        </p>
      </main>
    );
  }

  const payload = state.payload || {};
  const activity = payload.activity || emptyActivity();
  const isSignedIn = payload.mode === 'signed-in';
  const claim = payload.claim;
  const userName = payload.user?.name || 'Claimed founder';

  return (
    <main className="account-page">
      <section className="account-hero">
        {isSignedIn && payload.user?.image ? (
          <img
            className="account-avatar"
            src={payload.user.image}
            alt=""
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="account-avatar account-avatar-fallback" aria-hidden="true" />
        )}
        <div>
          <h1>{isSignedIn ? 'My pitches from purgatory' : "This browser's trail"}</h1>
          <p>
            {isSignedIn
              ? `${userName} has receipts.`
              : 'A suspicious little ledger of pitches, heckles, and votes from this browser.'}
          </p>
        </div>
      </section>

      {!isSignedIn ? (
        <section className="account-nudge">
          <div>
            <h2>Make it permanent</h2>
            <p>Sign in with Google to claim this chaos before the browser forgets.</p>
          </div>
          <a href="/api/auth/signin/google?callbackUrl=/account">Sign in with Google</a>
        </section>
      ) : null}

      {claim?.claimed && (claim.ideas || claim.comments || claim.votes) ? (
        <p className="account-claim">
          Claimed {claim.ideas} pitches, {claim.comments} heckles, and {claim.votes} votes from
          this browser.
        </p>
      ) : null}

      <section className="account-section">
        <h2>Ideas</h2>
        {activity.ideas.length ? (
          <div className="account-grid">
            {activity.ideas.map((idea) => (
              <article className="feed-card" key={idea.id}>
                <ActivityLink href={`/ideas/${idea.slug}`}>{idea.title}</ActivityLink>
                <p>{idea.ideaText}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="account-empty">No pitches in the ledger yet.</p>
        )}
      </section>

      <section className="account-section">
        <h2>Comments</h2>
        {activity.comments.length ? (
          <div className="account-list">
            {activity.comments.map((comment) => (
              <article className="comment-card" key={comment.id}>
                <ActivityLink href={`/ideas/${comment.ideaSlug}`}>{comment.ideaTitle}</ActivityLink>
                <p>{comment.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="account-empty">No heckles on record.</p>
        )}
      </section>

      <section className="account-section">
        <h2>Votes</h2>
        {activity.votes.length ? (
          <div className="account-list">
            {activity.votes.map((vote) => (
              <article className="account-vote-card" key={vote.id}>
                <VoteLabel type={vote.voteType} />
                <ActivityLink href={`/ideas/${vote.ideaSlug}`}>{vote.ideaTitle}</ActivityLink>
              </article>
            ))}
          </div>
        ) : (
          <p className="account-empty">No blessings or damnations yet.</p>
        )}
      </section>
    </main>
  );
}
