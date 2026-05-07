import './styles.css';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const form = document.querySelector('#idea-form');
const input = document.querySelector('#idea-input');
const button = document.querySelector('#submit-button');
const composerView = document.querySelector('#composer-view');
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

let activeController;
let currentIdea = '';
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
    verdictStatus.textContent = `Launched as ${publishedIdea.slug}. Public page arrives next.`;
  } catch (error) {
    launchButton.disabled = false;
    verdictStatus.textContent = error.message || 'Launch failed before liftoff.';
  } finally {
    publishSubmit.disabled = false;
  }
});

autosizeInput();
updateCharCount();
