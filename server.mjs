import 'dotenv/config';
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleCreateIdea, handleGetIdea, handleListIdeas } from './lib/ideas-api.mjs';
import {
  requireApiKey,
  streamVerdicts,
  validateIdeaInput,
  validateStartupIdea,
  writeEvent
} from './lib/judge.mjs';

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);

try {
  requireApiKey();
} catch {
  console.error('OPENAI_API_KEY is required. Refusing to start without a real LLM key.');
  process.exit(1);
}

app.use(express.json({ limit: '64kb' }));

app.get('/api/ideas', handleListIdeas);
app.post('/api/ideas', handleCreateIdea);
app.get('/api/ideas/:idOrSlug', (req, res) => {
  handleGetIdea(req, res, req.params.idOrSlug);
});

app.post('/api/judge', async (req, res) => {
  const input = validateIdeaInput(req.body?.idea);

  if (input.error) {
    res.status(input.status).json({ error: input.error });
    return;
  }

  try {
    const verdict = await validateStartupIdea(input.idea);
    if (!verdict.allowed) {
      res.status(422).json({ error: verdict.reason });
      return;
    }
  } catch (error) {
    res.status(502).json({ error: error.message || 'Could not validate the startup idea.' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  try {
    await streamVerdicts(input.idea, (side, text) => {
      writeEvent(res, { type: 'chunk', side, text });
    });
    writeEvent(res, { type: 'done' });
  } catch (error) {
    writeEvent(res, {
      type: 'error',
      message: error.message || 'The debate failed.'
    });
  } finally {
    res.end();
  }
});

app.use(express.static(join(__dirname, 'dist')));

app.get('*splat', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body is too large.' });
    return;
  }

  res.status(400).json({ error: 'Invalid JSON request.' });
});

app.listen(port, () => {
  console.log(`Angel/devil API listening on http://localhost:${port}`);
});
