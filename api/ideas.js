import { handleCreateIdea } from '../lib/ideas-api.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > 65536) {
    res.status(413).json({ error: 'Request body is too large.' });
    return;
  }

  await handleCreateIdea(req, res);
}
