const model = process.env.LLM_MODEL || 'gpt-4o-mini';
const apiUrl = process.env.LLM_API_URL || 'https://api.openai.com/v1/responses';

export const trafficBuckets = {
  mostly_blessed: 0.72,
  mildly_blessed: 0.62,
  controversial: 0.5,
  mildly_damned: 0.38,
  mostly_damned: 0.28
};

const bucketNames = Object.keys(trafficBuckets);

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
  const match = String(content || '').match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export function randomTrafficBucket() {
  return bucketNames[Math.floor(Math.random() * bucketNames.length)];
}

export function blessProbabilityForBucket(bucket) {
  return trafficBuckets[bucket] ?? trafficBuckets.controversial;
}

export async function evaluateIdeaTraffic(idea) {
  requireApiKey();

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_output_tokens: 120,
      instructions:
        'Evaluate this startup or project idea neutrally for likely anonymous bulletin-board voting. Return only compact JSON with keys "bucket" and "reason". bucket must be exactly one of: mostly_blessed, mildly_blessed, controversial, mildly_damned, mostly_damned. mostly_blessed means broad appeal and practical credibility. mildly_blessed means plausible but not a slam dunk. controversial means likely split reactions. mildly_damned means notable weaknesses. mostly_damned means likely rejected or mocked. Keep reason under 120 characters.',
      input: `Idea: ${idea}`
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Traffic evaluation call failed: ${response.status} ${details}`);
  }

  const payload = await response.json();
  const parsed = parseJson(getResponseText(payload));
  const bucket = parsed?.bucket;

  if (!bucketNames.includes(bucket)) {
    throw new Error('Traffic evaluation returned an unknown bucket.');
  }

  return {
    bucket,
    reason: String(parsed.reason || '').replace(/\s+/g, ' ').slice(0, 160).trim()
  };
}
