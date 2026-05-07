import { handleGetIdea } from '../../lib/ideas-api.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  await handleGetIdea(req, res, req.query.id);
}
