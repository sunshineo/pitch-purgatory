import './styles.css';
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
const boardHomeButton = document.querySelector('#board-home-button');
const refreshBoardButton = document.querySelector('#refresh-board-button');
const blessedFeedList = document.querySelector('#blessed-feed-list');
const purgatoryFeedList = document.querySelector('#purgatory-feed-list');
const damnedFeedList = document.querySelector('#damned-feed-list');
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

function showError(message) {
  verdictView.hidden = false;
  composerView.hidden = true;
  ideasBoardView.hidden = true;
  publicIdeaView.hidden = true;
  setPostVerdictState('error', currentIdea || 'The tribunal tripped over its own robes.');
  setVerdictMode(true);
  angelOutput.classList.add('error');
  devilOutput.classList.add('error');
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

function commentNode(comment) {
  const item = document.createElement('article');
  item.className = `comment-card comment-${comment.stance}`;

  const meta = document.createElement('p');
  meta.className = 'comment-meta';
  meta.textContent = `${comment.authorDisplayName} - ${new Date(comment.createdAt).toLocaleString()}`;

  const body = document.createElement('p');
  body.textContent = comment.body;

  item.append(meta, body);
  return item;
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
  const link = document.createElement('a');
  link.className = 'feed-card';
  link.href = `/ideas/${idea.slug}`;

  const pitch = document.createElement('strong');
  pitch.textContent = idea.ideaText;

  const meta = document.createElement('small');
  meta.textContent = `${idea.votes?.bless ?? 0} blessed / ${idea.votes?.damn ?? 0} damned`;

  link.append(pitch, meta);
  return link;
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
      throw new Error(payload?.error || `The judge returned HTTP ${response.status}.`);
    }

    if (!response.body) {
      throw new Error('The judge did not return a stream.');
    }

    await readSse(response);
  } catch (error) {
    if (error.name !== 'AbortError') {
      showError(error.message || 'Something went sideways.');
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
  const link = event.target.closest('a[href^="/ideas/"]');
  if (!link) return;
  event.preventDefault();
  history.pushState({}, '', link.getAttribute('href'));
  route();
});

refreshBoardButton.addEventListener('click', loadIdeasBoard);

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

boardHomeButton.addEventListener('click', () => {
  history.pushState({}, '', '/');
  input.value = '';
  currentIdea = '';
  autosizeInput();
  updateCharCount();
  resetOutputs();
  showComposer();
  input.focus();
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
