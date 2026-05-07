import { handleCreateComment, handleListComments } from '../../../lib/ideas-api.mjs';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    await handleListComments(req, res, req.query.id);
    return;
  }

  if (req.method === 'POST') {
    await handleCreateComment(req, res, req.query.id);
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method not allowed.' });
}
