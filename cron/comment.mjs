const model = process.env.LLM_MODEL || 'gpt-4o-mini';
const apiUrl = process.env.LLM_API_URL || 'https://api.openai.com/v1/responses';

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

export async function writeRelatedComment(idea) {
  requireApiKey();

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.85,
      max_output_tokens: 80,
      instructions:
        'Write one short anonymous bulletin-board comment about this startup idea. Use one of these tones at random: excited, skeptical, confused, practical, joking, concerned, curious, mildly spicy. Make it specific to the idea and natural. Do not use markdown, hashtags, slurs, harassment, or claims of being a real customer. Maximum 24 words. Return only the comment text.',
      input: `Startup idea: ${idea}`
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Comment call failed: ${response.status} ${details}`);
  }

  const payload = await response.json();
  return String(getResponseText(payload) || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .slice(0, 220)
    .trim();
}
