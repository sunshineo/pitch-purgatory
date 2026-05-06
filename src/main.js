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

let activeController;
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

function autosizeInput() {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
}

function updateCharCount() {
  charCount.textContent = `${input.value.length}/${input.maxLength}`;
}

function resetOutputs() {
  streamText.angel = '';
  streamText.devil = '';
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
  angelOutput.classList.add('error');
  devilOutput.classList.add('error');
  angelOutput.textContent = message;
  devilOutput.textContent = 'The debate crashed before the roast could finish.';
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
    }
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const idea = input.value.trim();
  if (!idea) return;

  activeController?.abort();
  activeController = new AbortController();

  resetOutputs();
  composerView.hidden = true;
  verdictView.hidden = false;
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

autosizeInput();
updateCharCount();
