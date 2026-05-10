import { randomUUID } from 'node:crypto';
import {
  createComment,
  createIdea,
  getIdeaByIdOrSlug,
  listComments,
  listIdeas,
  voteOnIdea
} from './store.mjs';
import { summarizeIdeaTitle } from './judge.mjs';
import { auth, displayNameForUser } from '../auth.js';

const maxIdeaChars = 280;
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

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf('=');
        if (index === -1) return [cookie, ''];
        return [cookie.slice(0, index), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

function getVisitorId(req, res) {
  const cookies = parseCookies(req.headers?.cookie);
  const existing = cookies.pp_visitor;

  if (existing && /^[a-f0-9-]{36}$/i.test(existing)) {
    return existing;
  }

  const visitorId = randomUUID();
  res.setHeader(
    'Set-Cookie',
    `pp_visitor=${encodeURIComponent(
      visitorId
    )}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`
  );
  return visitorId;
}

async function getCurrentUser() {
  const session = await auth();
  return session?.user || null;
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
    launchNote: '',
    authorDisplayName: 'Anonymous founder',
    parentIdeaId: null,
    source: 'original'
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
    const visitorId = getVisitorId(req, res);
    const user = await getCurrentUser();
    const ownerUserId = user?.id || null;
    const authorDisplayName = user ? displayNameForUser(user) : input.authorDisplayName;
    const title = await summarizeIdeaTitle(input.ideaText);
    const idea = await createIdea({
      ...input,
      title,
      visitorId,
      ownerUserId,
      authorDisplayName
    });
    res.status(201).json({ idea });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not launch this idea.' });
  }
}

export async function handleGetIdea(req, res, idOrSlug) {
  const key = cleanString(idOrSlug, 120);

  if (!key) {
    res.status(400).json({ error: 'Idea id or slug is required.' });
    return;
  }

  try {
    const idea = await getIdeaByIdOrSlug(key);
    if (!idea) {
      res.status(404).json({ error: 'Idea not found.' });
      return;
    }

    res.status(200).json({ idea });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not load this idea.' });
  }
}

export async function handleListIdeas(req, res) {
  try {
    const limit = Number(req.query?.limit || 24);
    const requestedSort = cleanString(req.query?.sort || 'recent', 24);
    const sort = ['recent', 'blessed', 'purgatory', 'damned', 'controversial'].includes(requestedSort)
      ? requestedSort
      : 'recent';
    const ideas = await listIdeas({ limit, sort });
    res.status(200).json({ ideas, sort });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not load recent ideas.' });
  }
}

export async function handleVoteIdea(req, res, idOrSlug) {
  const key = cleanString(idOrSlug, 120);
  const body = getBody(req);
  const voteType = cleanString(body.voteType, 12);

  if (!key) {
    res.status(400).json({ error: 'Idea id or slug is required.' });
    return;
  }

  if (!['bless', 'damn'].includes(voteType)) {
    res.status(400).json({ error: 'Vote must be bless or damn.' });
    return;
  }

  try {
    const visitorId = getVisitorId(req, res);
    const user = await getCurrentUser();
    const idea = await voteOnIdea({
      idOrSlug: key,
      visitorId,
      ownerUserId: user?.id || null,
      voteType
    });
    if (!idea) {
      res.status(404).json({ error: 'Idea not found.' });
      return;
    }

    res.status(200).json({ idea });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not record this vote.' });
  }
}

export async function handleListComments(req, res, idOrSlug) {
  const key = cleanString(idOrSlug, 120);

  if (!key) {
    res.status(400).json({ error: 'Idea id or slug is required.' });
    return;
  }

  try {
    const comments = await listComments(key);
    res.status(200).json({ comments });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not load comments.' });
  }
}

export async function handleCreateComment(req, res, idOrSlug) {
  const key = cleanString(idOrSlug, 120);
  const body = getBody(req);
  const commentBody = cleanString(body.body, 1200);
  const stance = cleanString(body.stance || 'regular', 16);

  if (!key) {
    res.status(400).json({ error: 'Idea id or slug is required.' });
    return;
  }

  if (commentBody.length < 2) {
    res.status(400).json({ error: 'Comment is too tiny for the arena.' });
    return;
  }

  if (!['regular', 'angel', 'devil', 'founder'].includes(stance)) {
    res.status(400).json({ error: 'Unknown comment stance.' });
    return;
  }

  try {
    const visitorId = getVisitorId(req, res);
    const user = await getCurrentUser();
    const ownerUserId = user?.id || null;
    const authorDisplayName = user ? displayNameForUser(user) : 'Anonymous heckler';
    const comment = await createComment({
      idOrSlug: key,
      authorDisplayName,
      visitorId,
      ownerUserId,
      body: commentBody,
      stance
    });

    if (!comment) {
      res.status(404).json({ error: 'Idea not found.' });
      return;
    }

    res.status(201).json({ comment });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not post this comment.' });
  }
}
