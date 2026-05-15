const model = process.env.LLM_MODEL || 'gpt-4o-mini';
const apiUrl = process.env.LLM_API_URL || 'https://api.openai.com/v1/responses';

export const trafficBuckets = {
  blessed: 0.82,
  damned: 0.18
};

export const neutralBlessProbability = 0.5;

function requireApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required.');
  }
}

function getResponseText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;

  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || '')
    .join('');
}

function parseJson(content) {
  const match = String(content || '').match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function parseRankedIds(content) {
  const parsed = parseJson(content);
  const ids = Array.isArray(parsed) ? parsed : parsed?.rankedIds || parsed?.ranked_ids;

  if (!Array.isArray(ids)) return null;
  return ids.map((id) => String(id));
}

function normalizeRankedIds({ ideas, rankedIds }) {
  const identifiers = new Map();
  for (const idea of ideas) {
    identifiers.set(idea.id, idea.id);
    if (idea.slug) identifiers.set(idea.slug, idea.id);
  }

  const seen = new Set();
  const normalized = [];

  for (const identifier of rankedIds || []) {
    const id = identifiers.get(identifier);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  for (const idea of ideas) {
    if (seen.has(idea.id)) continue;
    normalized.push(idea.id);
  }

  return normalized;
}

export function blessProbabilityForBucket(bucket) {
  return trafficBuckets[bucket] ?? neutralBlessProbability;
}

export function calculateEvaluationNeeds({ blessed = 0, damned = 0, neutral = 0 } = {}) {
  const total = blessed + damned + neutral;
  const targetBlessed = Math.floor(total / 3);
  const targetDamned = Math.floor(total / 3);
  const targetNeutral = total - targetBlessed - targetDamned;
  const blessedNeeded = Math.max(0, Math.min(neutral, targetBlessed - blessed));
  const neutralAfterBlessed = neutral - blessedNeeded;
  const damnedNeeded = Math.max(0, Math.min(neutralAfterBlessed, targetDamned - damned));

  return {
    total,
    targetBlessed,
    targetDamned,
    targetNeutral,
    blessedNeeded,
    damnedNeeded
  };
}

export function pickRankedEvaluationAssignments({ ideas, rankedIds, needs }) {
  const ranked = normalizeRankedIds({ ideas, rankedIds });
  const ideasById = new Map(ideas.map((idea) => [idea.id, idea]));
  const blessedIds = ranked.slice(0, needs.blessedNeeded);
  const damnedIds = needs.damnedNeeded > 0 ? ranked.slice(-needs.damnedNeeded).reverse() : [];
  const assignments = [];

  for (const id of blessedIds) {
    assignments.push({
      idea: ideasById.get(id),
      bucket: 'blessed',
      rank: ranked.indexOf(id) + 1,
      rankedTotal: ranked.length
    });
  }

  for (const id of damnedIds) {
    assignments.push({
      idea: ideasById.get(id),
      bucket: 'damned',
      rank: ranked.indexOf(id) + 1,
      rankedTotal: ranked.length
    });
  }

  return assignments.filter((assignment) => assignment.idea);
}

export function randomRankedIds(ideas) {
  return [...ideas]
    .map((idea) => ({ idea, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ idea }) => idea.id);
}

export async function rankIdeasForTraffic(ideas) {
  if (!ideas.length) return [];
  requireApiKey();

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_output_tokens: 2500,
      instructions:
        'Rank these anonymous bulletin-board ideas from most likely to receive genuine upvotes to most likely to receive genuine downvotes. Judge practical appeal, clarity, feasibility, audience size, trust friction, cost, regulation, and whether people would mock it. Return only compact JSON: {"rankedIds":["id-best","id-next","id-worst"]}. Include every id exactly once. No markdown.',
      input: JSON.stringify(
        ideas.map((idea) => ({
          id: idea.id,
          slug: idea.slug,
          title: idea.title,
          idea: idea.ideaText
        }))
      )
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Traffic ranking call failed: ${response.status} ${details}`);
  }

  const payload = await response.json();
  const rankedIds = parseRankedIds(getResponseText(payload));

  if (!rankedIds) {
    throw new Error('Traffic ranking returned no rankedIds array.');
  }

  return normalizeRankedIds({ ideas, rankedIds });
}
