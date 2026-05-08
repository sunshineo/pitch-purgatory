import {
  streamVerdicts,
  validateIdeaInput,
  validateStartupIdea,
  writeEvent
} from '../lib/judge.mjs';

export const config = {
  maxDuration: 60
};

function getBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  if (typeof req.body !== 'string') return {};

  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > 4096) {
    res.status(413).json({ error: 'Request body is too large.' });
    return;
  }

  const body = getBody(req);
  const input = validateIdeaInput(body.idea);

  if (input.error) {
    res.status(input.status).json({ error: input.error });
    return;
  }

  try {
    const verdict = await validateStartupIdea(input.idea);
    if (!verdict.allowed) {
      res.status(422).json({ code: 'idea_rejected', error: verdict.reason });
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
}
