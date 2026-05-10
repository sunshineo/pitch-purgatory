'use client';

import { useEffect } from 'react';

export default function PurgatoryApp() {
  useEffect(() => {
    import('../src/main.js');
  }, []);

  return (
    <main className="app-shell">
      <section id="composer-view" className="composer-view" aria-label="Idea prompt">
        <div className="brand-lockup">
          <div className="title-stage">
            <img className="title-character title-character-left" src="/assets/angel-girl.png" alt="" />
            <h1>Idea Purgatory</h1>
            <img className="title-character title-character-right" src="/assets/devil-girl.png" alt="" />
          </div>
          <p>One idea. Two wildly biased advisors.</p>
        </div>
        <form id="idea-form" className="idea-form">
          <label className="sr-only" htmlFor="idea-input">
            Idea
          </label>
          <div className="composer-box">
            <textarea
              id="idea-input"
              name="idea"
              rows="1"
              maxLength="280"
              placeholder="Describe your idea..."
            />
            <div className="composer-meta">
              <span id="char-count">0/280</span>
              <span>Enter to send</span>
            </div>
          </div>
          <button id="submit-button" className="sr-only" type="submit">
            Judge it
          </button>
        </form>
        <a id="browse-ideas-link" className="browse-ideas-link" href="/ideas">
          Browse launched ideas
        </a>
      </section>

      <section id="ideas-board-view" className="ideas-board-view" hidden>
        <header className="ideas-board-header">
          <h2>Idea Purgatory</h2>
          <p>Three gates. One crowd. Absolutely no refunds on opinions.</p>
        </header>
        <div className="ideas-board-columns">
          <section className="ideas-column ideas-column-blessed" aria-label="Blessed ideas">
            <img className="ideas-column-character" src="/assets/angel-girl.png" alt="" />
            <h3>Blessed</h3>
            <div id="blessed-feed-list" className="feed-list feed-list-column">
              <p className="feed-empty">Loading blessed launches...</p>
            </div>
          </section>
          <section className="ideas-column ideas-column-purgatory" aria-label="Purgatory ideas">
            <div className="ideas-column-character-spacer" aria-hidden="true" />
            <h3>Purgatory</h3>
            <div id="purgatory-feed-list" className="feed-list feed-list-column">
              <p className="feed-empty">Loading purgatory launches...</p>
            </div>
          </section>
          <section className="ideas-column ideas-column-damned" aria-label="Damned ideas">
            <img className="ideas-column-character" src="/assets/devil-girl.png" alt="" />
            <h3>Damned</h3>
            <div id="damned-feed-list" className="feed-list feed-list-column">
              <p className="feed-empty">Loading damned launches...</p>
            </div>
          </section>
        </div>
      </section>

      <section id="public-idea-view" className="public-idea-view" hidden>
        <article className="public-idea">
          <section className="public-post">
            <div className="public-post-meta">
              <span id="public-author-avatar" className="author-avatar author-avatar-fallback" aria-hidden="true" />
              <span>
                <strong id="public-author-name">Anonymous founder</strong>
                <span id="public-idea-meta">Freshly launched from purgatory</span>
              </span>
            </div>
            <p id="public-idea-text" />
          </section>
          <section className="public-votes" aria-label="Community votes">
            <button id="bless-vote-button" className="vote-button vote-button-bless" type="button" aria-label="Bless this idea">
              <span className="vote-art vote-art-angel">
                <img src="/assets/angel-girl.png" alt="" />
              </span>
              <span className="vote-pill">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M7 10v12" />
                  <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
                </svg>
                <strong id="bless-vote-count">0</strong>
              </span>
            </button>
            <button id="damn-vote-button" className="vote-button vote-button-damn" type="button" aria-label="Damn this idea">
              <span className="vote-pill">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M17 14V2" />
                  <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
                </svg>
                <strong id="damn-vote-count">0</strong>
              </span>
              <span className="vote-art vote-art-devil">
                <img src="/assets/devil-girl.png" alt="" />
              </span>
            </button>
          </section>
          <div className="public-verdicts">
            <section className="public-verdict public-verdict-angel">
              <h3>Angel take</h3>
              <div id="public-angel-output" className="public-markdown" />
            </section>
            <section className="public-verdict public-verdict-devil">
              <h3>Devil take</h3>
              <div id="public-devil-output" className="public-markdown" />
            </section>
          </div>
          <section className="comments-section" aria-label="Community comments">
            <div className="comments-heading">
              <h3>Comments</h3>
            </div>
            <form id="comment-form" className="comment-form">
              <textarea id="comment-body" name="body" rows="3" maxLength="1200" placeholder="Write a comment..." />
              <button id="comment-submit" type="submit">
                Post comment
              </button>
            </form>
            <div id="comments-list" className="comments-list">
              <p className="comments-empty">No comments yet.</p>
            </div>
          </section>
        </article>
      </section>

      <section id="post-verdict-actions" className="post-verdict-actions" aria-label="Post verdict actions" hidden>
        <p id="verdict-status">The advisors are still yelling over each other...</p>
        <div className="verdict-actions">
          <button id="launch-button" type="button" disabled>
            Launch this idea
          </button>
        </div>
      </section>

      <section id="verdict-view" className="verdict-grid" aria-live="polite" hidden>
        <article className="verdict-panel angel-panel">
          <div className="panel-portrait panel-portrait-angel">
            <img src="/assets/angel-girl.png" alt="Angel" />
          </div>
          <div id="angel-output" className="verdict-output idle">
            <p>Awaiting a brave little pitch.</p>
          </div>
        </article>

        <article className="verdict-panel devil-panel">
          <div className="panel-portrait panel-portrait-devil">
            <img src="/assets/devil-girl.png" alt="Devil" />
          </div>
          <div id="devil-output" className="verdict-output idle">
            <p>Ready to find the trapdoor.</p>
          </div>
        </article>
      </section>
    </main>
  );
}
