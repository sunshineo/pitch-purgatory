import { handleVoteIdea } from '../../../lib/ideas-api.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  await handleVoteIdea(req, res, req.query.id);
}
