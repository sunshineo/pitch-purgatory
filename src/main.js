import DOMPurify from 'dompurify';
import { marked } from 'marked';

const form = document.querySelector('#idea-form');
const input = document.querySelector('#idea-input');
const button = document.querySelector('#submit-button');
const composerView = document.querySelector('#composer-view');
const ideasBoardView = document.querySelector('#ideas-board-view');
const publicIdeaView = document.querySelector('#public-idea-view');
const verdictView = document.querySelector('#verdict-view');
const charCount = document.querySelector('#char-count');
const angelOutput = document.querySelector('#angel-output');
const devilOutput = document.querySelector('#devil-output');
const postVerdictActions = document.querySelector('#post-verdict-actions');
const verdictStatus = document.querySelector('#verdict-status');
const launchButton = document.querySelector('#launch-button');
const browseIdeasLink = document.querySelector('#browse-ideas-link');
const blessedFeedList = document.querySelector('#blessed-feed-list');
const purgatoryFeedList = document.querySelector('#purgatory-feed-list');
const damnedFeedList = document.querySelector('#damned-feed-list');
const publicAuthorAvatar = document.querySelector('#public-author-avatar');
const publicAuthorName = document.querySelector('#public-author-name');
const publicIdeaMeta = document.querySelector('#public-idea-meta');
const publicIdeaText = document.querySelector('#public-idea-text');
const publicAngelOutput = document.querySelector('#public-angel-output');
const publicDevilOutput = document.querySelector('#public-devil-output');
const blessVoteButton = document.querySelector('#bless-vote-button');
const damnVoteButton = document.querySelector('#damn-vote-button');
const blessVoteCount = document.querySelector('#bless-vote-count');
const damnVoteCount = document.querySelector('#damn-vote-count');
const commentForm = document.querySelector('#comment-form');
const commentBody = document.querySelector('#comment-body');
const commentSubmit = document.querySelector('#comment-submit');
const commentsList = document.querySelector('#comments-list');

let activeController;
let currentIdea = '';
let currentPublicIdea;
let streamComplete = false;
let publishedIdea;
const streamText = {
  angel: '',
  devil: ''
};

const placeholders = {
  angel: 'Polishing the halo...',
  devil: 'Sharpening objections...'
};

const purgatoryMinimumVotes = 3;
const purgatoryRopeFloor = 0.2;

function setLoading(isLoading) {
  document.body.classList.toggle('is-streaming', isLoading);
  button.disabled = isLoading;
  input.disabled = isLoading;
}

function syncVerdictLayout() {
  if (postVerdictActions.hidden || verdictView.hidden) return;

  document.documentElement.style.setProperty(
    '--post-verdict-height',
    `${Math.ceil(postVerdictActions.offsetHeight)}px`
  );
}

function setVerdictMode(isActive) {
  document.body.classList.toggle('verdict-mode', isActive);
  if (isActive) {
    requestAnimationFrame(syncVerdictLayout);
  } else {
    document.documentElement.style.removeProperty('--post-verdict-height');
  }
}

function setPostVerdictState(state, message) {
  postVerdictActions.hidden = false;
  postVerdictActions.dataset.state = state;
  verdictStatus.textContent = message;
  launchButton.disabled = state !== 'complete';
  requestAnimationFrame(syncVerdictLayout);
}

function showComposer() {
  setVerdictMode(false);
  composerView.hidden = false;
  ideasBoardView.hidden = true;
  publicIdeaView.hidden = true;
  verdictView.hidden = true;
  postVerdictActions.hidden = true;
}

function autosizeInput() {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
}

function updateCharCount() {
  charCount.textContent = `${input.value.length}/${input.maxLength}`;
}

function resetOutputs() {
  streamComplete = false;
  publishedIdea = null;
  streamText.angel = '';
  streamText.devil = '';
  postVerdictActions.hidden = true;
  postVerdictActions.dataset.state = 'idle';
  verdictStatus.textContent = currentIdea;
  launchButton.disabled = true;
  launchButton.textContent = 'Launch this idea';
  angelOutput.textContent = placeholders.angel;
  devilOutput.textContent = placeholders.devil;
  angelOutput.classList.remove('idle', 'error');
  devilOutput.classList.remove('idle', 'error');
  angelOutput.dataset.empty = 'true';
  devilOutput.dataset.empty = 'true';
}

function renderMarkdown(text) {
  return DOMPurify.sanitize(
    marked.parse(text, {
      breaks: true,
      gfm: true
    })
  );
}

function appendChunk(side, text) {
  const target = side === 'angel' ? angelOutput : devilOutput;
  const panel = target.closest('.verdict-panel');

  if (target.dataset.empty === 'true') {
    target.dataset.empty = 'false';
  }

  streamText[side] += text;
  target.innerHTML = renderMarkdown(streamText[side]);
  panel.scrollTop = panel.scrollHeight;
}

function showError(message, options = {}) {
  verdictView.hidden = false;
  composerView.hidden = true;
  ideasBoardView.hidden = true;
  publicIdeaView.hidden = true;
  setPostVerdictState('error', currentIdea || 'The tribunal tripped over its own robes.');
  setVerdictMode(true);
  angelOutput.classList.add('error');
  devilOutput.classList.add('error');

  if (options.rejected) {
    angelOutput.textContent = `The pitch bouncer blocked this one: ${message}`;
    devilOutput.textContent = 'No debate started. Try phrasing it as a startup idea, not a jailbreak spell.';
    return;
  }

  angelOutput.textContent = message;
  devilOutput.textContent = 'The debate crashed before the roast could finish.';
}

function publicIdeaUrl(idea) {
  return `${window.location.origin}/ideas/${idea.slug}`;
}

function renderVoteState(idea) {
  blessVoteCount.textContent = idea.votes?.bless ?? 0;
  damnVoteCount.textContent = idea.votes?.damn ?? 0;
  blessVoteButton.classList.toggle('is-selected', idea.viewerVote === 'bless');
  damnVoteButton.classList.toggle('is-selected', idea.viewerVote === 'damn');
}

function renderAvatar(target, imageUrl, label) {
  target.textContent = '';
  target.className = 'author-avatar';

  if (!imageUrl) {
    target.classList.add('author-avatar-fallback');
    target.setAttribute('aria-hidden', 'true');
    return;
  }

  target.removeAttribute('aria-hidden');
  const image = document.createElement('img');
  image.src = imageUrl;
  image.alt = label ? `${label} avatar` : '';
  image.referrerPolicy = 'no-referrer';
  target.append(image);
}

function commentNode(comment) {
  const item = document.createElement('article');
  item.className = `comment-card comment-${comment.stance}`;
  const authorName = comment.authorDisplayName || 'Anonymous founder';

  const avatar = document.createElement('span');
  renderAvatar(avatar, comment.authorImage, authorName);

  const meta = document.createElement('p');
  meta.className = 'comment-meta';
  meta.textContent = `${authorName} - ${new Date(comment.createdAt).toLocaleString()}`;

  const body = document.createElement('p');
  body.textContent = comment.body;

  item.append(avatar, meta, body);
  return item;
}

function voteButton(type, count) {
  const button = document.createElement('button');
  const isBless = type === 'bless';
  button.className = `feed-vote feed-vote-${type}`;
  button.type = 'button';
  button.dataset.voteType = type;
  button.setAttribute('aria-label', `${isBless ? 'Bless' : 'Damn'} this idea`);

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('viewBox', '0 0 24 24');

  const paths = isBless
    ? [
        'M7 10v12',
        'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z'
      ]
    : [
        'M17 14V2',
        'M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z'
      ];

  paths.forEach((d) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    icon.append(path);
  });

  const number = document.createElement('strong');
  number.dataset.voteCount = type;
  number.textContent = count;

  button.append(icon, number);
  return button;
}

function purgatoryThreshold(totalVotes) {
  if (totalVotes < purgatoryMinimumVotes) return 1;
  return Math.max(purgatoryRopeFloor, 1 / Math.sqrt(totalVotes));
}

function voteMeter(idea) {
  const bless = idea.votes?.bless ?? 0;
  const damn = idea.votes?.damn ?? 0;
  const total = bless + damn;
  const blessShare = total === 0 ? 50 : (bless / total) * 100;
  const threshold = purgatoryThreshold(total);
  const bandWidth = Math.min(threshold, 1) * 100;
  const bandStart = (100 - bandWidth) / 2;

  const meter = document.createElement('span');
  meter.className = 'feed-vote-meter';
  meter.setAttribute(
    'aria-label',
    `Vote split: ${Math.round(blessShare)} percent blessed, ${Math.round(
      100 - blessShare
    )} percent damned. Purgatory band is plus or minus ${Math.round((bandWidth / 2) * 10) / 10} percentage points from center.`
  );
  meter.style.setProperty('--bless-share', `${blessShare}%`);
  meter.style.setProperty('--band-start', `${bandStart}%`);
  meter.style.setProperty('--band-width', `${bandWidth}%`);
  meter.innerHTML = '<span class="feed-vote-meter-bless"></span><span class="feed-vote-meter-band"></span>';

  return meter;
}

function voteTotalLabel(idea) {
  const total = (idea.votes?.bless ?? 0) + (idea.votes?.damn ?? 0);
  const label = document.createElement('span');
  label.className = 'feed-vote-total';
  label.textContent = `${total} ${total === 1 ? 'vote' : 'votes'}`;
  return label;
}

function renderComments(comments) {
  commentsList.textContent = '';
  if (!comments.length) {
    commentsList.innerHTML = '<p class="comments-empty">No comments yet.</p>';
    return;
  }

  commentsList.append(...comments.map(commentNode));
}

function renderPublicIdea(idea) {
  setVerdictMode(false);
  currentPublicIdea = idea;
  document.title = 'Idea Purgatory';
  const authorName = idea.authorDisplayName || 'Anonymous founder';
  publicAuthorName.textContent = authorName;
  renderAvatar(publicAuthorAvatar, idea.authorImage, authorName);
  publicIdeaMeta.textContent = new Date(idea.publishedAt).toLocaleDateString();
  publicIdeaText.textContent = idea.ideaText;
  publicAngelOutput.innerHTML = renderMarkdown(idea.angelMarkdown);
  publicDevilOutput.innerHTML = renderMarkdown(idea.devilMarkdown);
  renderVoteState(idea);
  composerView.hidden = true;
  verdictView.hidden = true;
  postVerdictActions.hidden = true;
  publicIdeaView.hidden = false;
}

function ideaCard(idea) {
  const card = document.createElement('article');
  card.className = 'feed-card';
  card.dataset.ideaSlug = idea.slug;

  const link = document.createElement('a');
  link.className = 'feed-card-link';
  link.href = `/ideas/${idea.slug}`;

  const pitch = document.createElement('strong');
  pitch.textContent = idea.ideaText;
  link.append(pitch);

  const votes = document.createElement('span');
  votes.className = 'feed-votes';
  votes.append(voteButton('bless', idea.votes?.bless ?? 0), voteTotalLabel(idea), voteButton('damn', idea.votes?.damn ?? 0));

  card.append(link, voteMeter(idea), votes);
  return card;
}

function syncBoardIdeaVotes(idea) {
  document.querySelectorAll(`.feed-card[data-idea-slug="${CSS.escape(idea.slug)}"]`).forEach((card) => {
    const blessCount = card.querySelector('[data-vote-count="bless"]');
    const damnCount = card.querySelector('[data-vote-count="damn"]');
    if (blessCount) blessCount.textContent = idea.votes?.bless ?? 0;
    if (damnCount) damnCount.textContent = idea.votes?.damn ?? 0;

    const meter = card.querySelector('.feed-vote-meter');
    if (meter) {
      meter.replaceWith(voteMeter(idea));
    }

    const totalLabel = card.querySelector('.feed-vote-total');
    if (totalLabel) {
      const total = (idea.votes?.bless ?? 0) + (idea.votes?.damn ?? 0);
      totalLabel.textContent = `${total} ${total === 1 ? 'vote' : 'votes'}`;
    }
  });
}

function renderBoardColumn(target, ideas, emptyText) {
  target.textContent = '';
  if (!ideas.length) {
    target.innerHTML = `<p class="feed-empty">${emptyText}</p>`;
    return;
  }

  target.append(...ideas.map(ideaCard));
}

async function loadBoardColumn(target, sort, emptyText) {
  target.innerHTML = '<p class="feed-empty">Summoning launches...</p>';

  try {
    const response = await fetch(`/api/ideas?limit=12&sort=${encodeURIComponent(sort)}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Feed failed with HTTP ${response.status}.`);
    }

    renderBoardColumn(target, payload.ideas || [], emptyText);
  } catch (error) {
    target.innerHTML = `<p class="feed-empty">${error.message || 'The feed is sulking.'}</p>`;
  }
}

async function loadIdeasBoard() {
  if (ideasBoardView.hidden) return;

  await Promise.all([
    loadBoardColumn(blessedFeedList, 'blessed', 'No blessed launches yet. The halo committee is waiting.'),
    loadBoardColumn(purgatoryFeedList, 'purgatory', 'No ideas stuck in the middle yet. Suspiciously decisive.'),
    loadBoardColumn(damnedFeedList, 'damned', 'No damned launches yet. The pit is taking applications.')
  ]);
}

function showIdeasBoard() {
  setVerdictMode(false);
  document.title = 'Idea Purgatory';
  composerView.hidden = true;
  publicIdeaView.hidden = true;
  verdictView.hidden = true;
  postVerdictActions.hidden = true;
  ideasBoardView.hidden = false;
  loadIdeasBoard();
}

async function loadPublicIdea(slug) {
  setVerdictMode(false);
  publicIdeaView.hidden = false;
  composerView.hidden = true;
  ideasBoardView.hidden = true;
  verdictView.hidden = true;
  postVerdictActions.hidden = true;
  publicIdeaMeta.textContent = 'Loading...';
  publicIdeaText.textContent = '';
  publicAngelOutput.textContent = '';
  publicDevilOutput.textContent = '';

  try {
    const response = await fetch(`/api/ideas/${encodeURIComponent(slug)}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Idea load failed with HTTP ${response.status}.`);
    }
    renderPublicIdea(payload.idea);
    loadComments();
  } catch (error) {
    publicIdeaText.textContent = error.message || 'Could not load this public idea.';
    publicIdeaMeta.textContent = 'This idea escaped purgatory.';
  }
}

async function loadComments() {
  if (!currentPublicIdea) return;

  commentsList.innerHTML = '<p class="comments-empty">Loading comments...</p>';
  try {
    const response = await fetch(`/api/ideas/${currentPublicIdea.slug}/comments`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Comments failed with HTTP ${response.status}.`);
    }
    renderComments(payload.comments || []);
  } catch (error) {
    commentsList.innerHTML = `<p class="comments-empty">${error.message || 'Comments refused to load.'}</p>`;
  }
}

function route() {
  const match = window.location.pathname.match(/^\/ideas\/([^/]+)\/?$/);
  if (match) {
    loadPublicIdea(decodeURIComponent(match[1]));
    return;
  }

  if (window.location.pathname === '/ideas' || window.location.pathname === '/ideas/') {
    showIdeasBoard();
    return;
  }

  document.title = 'Angel / Devil Idea Judge';
  showComposer();
}

async function readSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      const lines = event.split('\n');
      const dataLine = lines.find((line) => line.startsWith('data: '));
      if (!dataLine) continue;

      const payload = JSON.parse(dataLine.slice(6));
      if (payload.type === 'chunk') appendChunk(payload.side, payload.text);
      if (payload.type === 'error') throw new Error(payload.message);
      if (payload.type === 'done') {
        streamComplete = true;
        setPostVerdictState('complete', currentIdea);
      }
    }
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const idea = input.value.trim();
  if (!idea) return;

  activeController?.abort();
  activeController = new AbortController();
  currentIdea = idea;

  resetOutputs();
  composerView.hidden = true;
  ideasBoardView.hidden = true;
  publicIdeaView.hidden = true;
  verdictView.hidden = false;
  setPostVerdictState('streaming', currentIdea);
  setVerdictMode(true);
  setLoading(true);

  try {
    const response = await fetch('/api/judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea }),
      signal: activeController.signal
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const error = new Error(payload?.error || `The judge returned HTTP ${response.status}.`);
      error.code = payload?.code;
      error.status = response.status;
      throw error;
    }

    if (!response.body) {
      throw new Error('The judge did not return a stream.');
    }

    await readSse(response);
  } catch (error) {
    if (error.name !== 'AbortError') {
      showError(error.message || 'Something went sideways.', {
        rejected: error.code === 'idea_rejected' || error.status === 422
      });
    }
  } finally {
    if (!streamComplete && streamText.angel && streamText.devil) {
      setPostVerdictState('complete', currentIdea);
    }
    setLoading(false);
    activeController = null;
  }
});

input.addEventListener('input', () => {
  autosizeInput();
  updateCharCount();
});

input.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  form.requestSubmit();
});

launchButton.addEventListener('click', async () => {
  if (!streamComplete || publishedIdea) return;

  launchButton.disabled = true;
  launchButton.textContent = 'Launching...';

  try {
    const response = await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ideaText: currentIdea,
        angelMarkdown: streamText.angel,
        devilMarkdown: streamText.devil,
        source: 'original'
      })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Launch failed with HTTP ${response.status}.`);
    }

    publishedIdea = payload.idea;
    launchButton.textContent = 'Launched';
    history.pushState({}, '', `/ideas/${publishedIdea.slug}`);
    renderPublicIdea(publishedIdea);
  } catch (error) {
    launchButton.disabled = false;
    launchButton.textContent = 'Launch this idea';
    verdictStatus.textContent = error.message || 'Launch failed before liftoff.';
  }
});

browseIdeasLink.addEventListener('click', (event) => {
  event.preventDefault();
  history.pushState({}, '', '/ideas');
  route();
});

ideasBoardView.addEventListener('click', (event) => {
  const vote = event.target.closest('[data-vote-type]');
  if (vote) {
    event.preventDefault();
    submitBoardVote(vote);
    return;
  }

  const link = event.target.closest('a[href^="/ideas/"]');
  if (!link) return;
  event.preventDefault();
  history.pushState({}, '', link.getAttribute('href'));
  route();
});

async function submitBoardVote(button) {
  const card = button.closest('.feed-card');
  const slug = card?.dataset.ideaSlug;
  const voteType = button.dataset.voteType;
  if (!slug || !voteType) return;

  const buttons = card.querySelectorAll('[data-vote-type]');
  buttons.forEach((item) => {
    item.disabled = true;
  });

  try {
    const response = await fetch(`/api/ideas/${encodeURIComponent(slug)}/votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voteType })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Vote failed with HTTP ${response.status}.`);
    }
    syncBoardIdeaVotes(payload.idea);
  } catch {
    loadIdeasBoard();
  } finally {
    buttons.forEach((item) => {
      item.disabled = false;
    });
  }
}

async function submitVote(voteType) {
  if (!currentPublicIdea) return;

  blessVoteButton.disabled = true;
  damnVoteButton.disabled = true;

  try {
    const response = await fetch(`/api/ideas/${currentPublicIdea.slug}/votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voteType })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Vote failed with HTTP ${response.status}.`);
    }
    renderPublicIdea(payload.idea);
  } finally {
    blessVoteButton.disabled = false;
    damnVoteButton.disabled = false;
  }
}

blessVoteButton.addEventListener('click', () => {
  submitVote('bless');
});

damnVoteButton.addEventListener('click', () => {
  submitVote('damn');
});

commentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentPublicIdea) return;

  commentSubmit.disabled = true;
  try {
    const response = await fetch(`/api/ideas/${currentPublicIdea.slug}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: commentBody.value
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Comment failed with HTTP ${response.status}.`);
    }
    commentBody.value = '';
    commentsList.prepend(commentNode(payload.comment));
  } catch (error) {
    commentsList.innerHTML = `<p class="comments-empty">${error.message || 'Comment failed.'}</p>`;
  } finally {
    commentSubmit.disabled = false;
  }
});

publicIdeaView.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/ideas/"]');
  if (!link) return;
  event.preventDefault();
  history.pushState({}, '', link.getAttribute('href'));
  route();
});

window.addEventListener('popstate', route);
window.addEventListener('resize', syncVerdictLayout);

autosizeInput();
updateCharCount();
route();
