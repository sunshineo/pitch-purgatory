import { createIdea } from './store.mjs';

const maxIdeaChars = 800;
const maxVerdictChars = 8000;

function cleanString(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function getBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  if (typeof req.body !== 'string') return {};

  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function validatePublishPayload(body) {
  const ideaText = cleanString(body.ideaText, maxIdeaChars);
  const angelMarkdown = cleanString(body.angelMarkdown, maxVerdictChars);
  const devilMarkdown = cleanString(body.devilMarkdown, maxVerdictChars);

  if (!ideaText) {
    return { status: 400, error: 'An idea is required before launch.' };
  }

  if (!angelMarkdown || !devilMarkdown) {
    return { status: 400, error: 'Both angel and devil verdicts are required before launch.' };
  }

  return {
    ideaText,
    angelMarkdown,
    devilMarkdown,
    title: cleanString(body.title || ideaText, 96),
    launchNote: cleanString(body.launchNote, 220),
    authorDisplayName: cleanString(body.authorDisplayName, 64) || 'Anonymous founder'
  };
}

export async function handleCreateIdea(req, res) {
  const body = getBody(req);
  const input = validatePublishPayload(body);

  if (input.error) {
    res.status(input.status).json({ error: input.error });
    return;
  }

  try {
    const idea = await createIdea(input);
    res.status(201).json({ idea });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not launch this idea.' });
  }
}
