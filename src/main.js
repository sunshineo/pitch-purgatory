import './styles.css';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const form = document.querySelector('#idea-form');
const input = document.querySelector('#idea-input');
const button = document.querySelector('#submit-button');
const composerView = document.querySelector('#composer-view');
const publicIdeaView = document.querySelector('#public-idea-view');
const verdictView = document.querySelector('#verdict-view');
const charCount = document.querySelector('#char-count');
const angelOutput = document.querySelector('#angel-output');
const devilOutput = document.querySelector('#devil-output');
const postVerdictActions = document.querySelector('#post-verdict-actions');
const verdictStatus = document.querySelector('#verdict-status');
const launchButton = document.querySelector('#launch-button');
const reviseButton = document.querySelector('#revise-button');
const newIdeaButton = document.querySelector('#new-idea-button');
const publishPanel = document.querySelector('#publish-panel');
const publishForm = document.querySelector('#publish-form');
const publishTitle = document.querySelector('#publish-title');
const publishAuthor = document.querySelector('#publish-author');
const publishNote = document.querySelector('#publish-note');
const publishSubmit = document.querySelector('#publish-submit');
const publishCancel = document.querySelector('#publish-cancel');
const recentFeed = document.querySelector('#recent-feed');
const recentFeedList = document.querySelector('#recent-feed-list');
const refreshFeedButton = document.querySelector('#refresh-feed-button');
const feedTitle = document.querySelector('#feed-title');
const feedTabs = [...document.querySelectorAll('.feed-tab')];
const homeButton = document.querySelector('#home-button');
const copyPublicLinkButton = document.querySelector('#copy-public-link-button');
const publicIdeaMeta = document.querySelector('#public-idea-meta');
const publicIdeaTitle = document.querySelector('#public-idea-title');
const publicIdeaAuthor = document.querySelector('#public-idea-author');
const publicIdeaNote = document.querySelector('#public-idea-note');
const publicIdeaText = document.querySelector('#public-idea-text');
const publicAngelOutput = document.querySelector('#public-angel-output');
const publicDevilOutput = document.querySelector('#public-devil-output');
const blessVoteButton = document.querySelector('#bless-vote-button');
const damnVoteButton = document.querySelector('#damn-vote-button');
const blessVoteCount = document.querySelector('#bless-vote-count');
const damnVoteCount = document.querySelector('#damn-vote-count');
const refreshCommentsButton = document.querySelector('#refresh-comments-button');
const commentForm = document.querySelector('#comment-form');
const commentAuthor = document.querySelector('#comment-author');
const commentStance = document.querySelector('#comment-stance');
const commentBody = document.querySelector('#comment-body');
const commentSubmit = document.querySelector('#comment-submit');
const commentsList = document.querySelector('#comments-list');

let activeController;
let currentIdea = '';
let currentPublicIdea;
let activeFeedSort = 'recent';
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

function setPostVerdictState(state, message) {
  postVerdictActions.hidden = false;
  postVerdictActions.dataset.state = state;
  verdictStatus.textContent = message;
  launchButton.disabled = state !== 'complete';
}

function showComposer() {
  composerView.hidden = false;
  publicIdeaView.hidden = true;
  verdictView.hidden = true;
  postVerdictActions.hidden = true;
  publishPanel.hidden = true;
  loadRecentIdeas();
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
  publishPanel.hidden = true;
  postVerdictActions.dataset.state = 'idle';
  verdictStatus.textContent = 'The advisors are still yelling over each other...';
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
  publicIdeaView.hidden = true;
  publishPanel.hidden = true;
  setPostVerdictState('error', 'The tribunal tripped over its own robes.');
  angelOutput.classList.add('error');
  devilOutput.classList.add('error');
  angelOutput.textContent = message;
  devilOutput.textContent = 'The debate crashed before the roast could finish.';
}

function suggestedTitle(idea) {
  const words = idea.replace(/\s+/g, ' ').trim().split(' ');
  return words.slice(0, 8).join(' ').replace(/[.,;:!?]+$/g, '');
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
  meta.textContent = `${comment.authorDisplayName} - ${comment.stance} - ${new Date(
    comment.createdAt
  ).toLocaleString()}`;

  const body = document.createElement('p');
  body.textContent = comment.body;

  item.append(meta, body);
  return item;
}

function renderComments(comments) {
  commentsList.textContent = '';
  if (!comments.length) {
    commentsList.innerHTML = '<p class="comments-empty">No comments yet. The courtroom is eerily polite.</p>';
    return;
  }

  commentsList.append(...comments.map(commentNode));
}

function renderPublicIdea(idea) {
  currentPublicIdea = idea;
  document.title = `${idea.title} - Pitch Purgatory`;
  publicIdeaMeta.textContent = `Launched by ${idea.authorDisplayName} on ${new Date(
    idea.publishedAt
  ).toLocaleDateString()}`;
  publicIdeaTitle.textContent = idea.title;
  publicIdeaAuthor.textContent = `Founder: ${idea.authorDisplayName}`;
  publicIdeaNote.textContent = idea.launchNote || 'No launch note. Bold. Suspicious.';
  publicIdeaText.textContent = idea.ideaText;
  publicAngelOutput.innerHTML = renderMarkdown(idea.angelMarkdown);
  publicDevilOutput.innerHTML = renderMarkdown(idea.devilMarkdown);
  renderVoteState(idea);
  composerView.hidden = true;
  verdictView.hidden = true;
  postVerdictActions.hidden = true;
  publishPanel.hidden = true;
  publicIdeaView.hidden = false;
}

function ideaCard(idea) {
  const link = document.createElement('a');
  link.className = 'feed-card';
  link.href = `/ideas/${idea.slug}`;

  const title = document.createElement('strong');
  title.textContent = idea.title;

  const pitch = document.createElement('span');
  pitch.textContent = idea.ideaText;

  const meta = document.createElement('small');
  meta.textContent = `${idea.votes?.bless ?? 0} blessed / ${idea.votes?.damn ?? 0} damned - ${
    idea.authorDisplayName
  }`;

  link.append(title, pitch, meta);
  return link;
}

async function loadRecentIdeas() {
  if (recentFeed.hidden) return;

  recentFeedList.innerHTML = '<p class="feed-empty">Summoning fresh launches...</p>';
  const feedNames = {
    recent: 'Freshly judged',
    blessed: 'Most blessed',
    damned: 'Most damned',
    controversial: 'Most controversial'
  };
  feedTitle.textContent = feedNames[activeFeedSort] || feedNames.recent;
  feedTabs.forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.feedSort === activeFeedSort);
  });

  try {
    const response = await fetch(`/api/ideas?limit=12&sort=${encodeURIComponent(activeFeedSort)}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Feed failed with HTTP ${response.status}.`);
    }

    recentFeedList.textContent = '';
    if (!payload.ideas?.length) {
      recentFeedList.innerHTML = '<p class="feed-empty">No public launches yet. Be the first brave fool.</p>';
      return;
    }

    recentFeedList.append(...payload.ideas.map(ideaCard));
  } catch (error) {
    recentFeedList.innerHTML = `<p class="feed-empty">${error.message || 'The feed is sulking.'}</p>`;
  }
}

async function loadPublicIdea(slug) {
  publicIdeaView.hidden = false;
  composerView.hidden = true;
  verdictView.hidden = true;
  postVerdictActions.hidden = true;
  publishPanel.hidden = true;
  publicIdeaTitle.textContent = 'Loading idea...';
  publicIdeaMeta.textContent = 'Fetching the pitch from purgatory';
  publicIdeaAuthor.textContent = '';
  publicIdeaNote.textContent = '';
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
    publicIdeaTitle.textContent = 'This idea escaped purgatory.';
    publicIdeaMeta.textContent = error.message || 'Could not load this public idea.';
  }
}

async function loadComments() {
  if (!currentPublicIdea) return;

  commentsList.innerHTML = '<p class="comments-empty">Loading courtroom transcripts...</p>';
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

  document.title = 'Angel / Devil Startup Judge';
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
        setPostVerdictState('complete', 'Verdict complete. This pitch can now be launched from purgatory.');
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
  publicIdeaView.hidden = true;
  verdictView.hidden = false;
  setPostVerdictState('streaming', 'The advisors are still yelling over each other...');
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
      setPostVerdictState('complete', 'Verdict complete. This pitch can now be launched from purgatory.');
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

launchButton.addEventListener('click', () => {
  if (!streamComplete) return;
  publishTitle.value = suggestedTitle(currentIdea);
  publishAuthor.value = '';
  publishNote.value = '';
  publishPanel.hidden = false;
  publishTitle.focus();
});

reviseButton.addEventListener('click', () => {
  activeController?.abort();
  input.value = currentIdea;
  autosizeInput();
  updateCharCount();
  verdictView.hidden = true;
  postVerdictActions.hidden = true;
  publishPanel.hidden = true;
  composerView.hidden = false;
  input.disabled = false;
  input.focus();
});

newIdeaButton.addEventListener('click', () => {
  activeController?.abort();
  input.value = '';
  currentIdea = '';
  autosizeInput();
  updateCharCount();
  resetOutputs();
  verdictView.hidden = true;
  postVerdictActions.hidden = true;
  publishPanel.hidden = true;
  composerView.hidden = false;
  input.disabled = false;
  input.focus();
});

publishCancel.addEventListener('click', () => {
  publishPanel.hidden = true;
});

publishForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!streamComplete || publishedIdea) return;

  publishSubmit.disabled = true;
  launchButton.disabled = true;
  verdictStatus.textContent = 'Launching this pitch into the public void...';

  try {
    const response = await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: publishTitle.value,
        authorDisplayName: publishAuthor.value,
        launchNote: publishNote.value,
        ideaText: currentIdea,
        angelMarkdown: streamText.angel,
        devilMarkdown: streamText.devil
      })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Launch failed with HTTP ${response.status}.`);
    }

    publishedIdea = payload.idea;
    publishPanel.hidden = true;
    launchButton.textContent = 'Launched';
    verdictStatus.textContent = `Launched as ${publishedIdea.slug}.`;
    history.pushState({}, '', `/ideas/${publishedIdea.slug}`);
    renderPublicIdea(publishedIdea);
    loadRecentIdeas();
  } catch (error) {
    launchButton.disabled = false;
    verdictStatus.textContent = error.message || 'Launch failed before liftoff.';
  } finally {
    publishSubmit.disabled = false;
  }
});

recentFeedList.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/ideas/"]');
  if (!link) return;
  event.preventDefault();
  history.pushState({}, '', link.getAttribute('href'));
  route();
});

refreshFeedButton.addEventListener('click', loadRecentIdeas);

feedTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    activeFeedSort = tab.dataset.feedSort;
    loadRecentIdeas();
  });
});

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

refreshCommentsButton.addEventListener('click', loadComments);

commentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentPublicIdea) return;

  commentSubmit.disabled = true;
  try {
    const response = await fetch(`/api/ideas/${currentPublicIdea.slug}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorDisplayName: commentAuthor.value,
        stance: commentStance.value,
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

homeButton.addEventListener('click', () => {
  history.pushState({}, '', '/');
  input.value = '';
  currentIdea = '';
  autosizeInput();
  updateCharCount();
  resetOutputs();
  showComposer();
  input.focus();
});

copyPublicLinkButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(window.location.href);
  copyPublicLinkButton.textContent = 'Copied';
  window.setTimeout(() => {
    copyPublicLinkButton.textContent = 'Copy link';
  }, 1500);
});

window.addEventListener('popstate', route);

autosizeInput();
updateCharCount();
route();
