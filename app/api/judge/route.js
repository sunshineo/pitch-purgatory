import {
  streamVerdicts,
  validateIdeaInput,
  validateStartupIdea
} from '../../../lib/judge.mjs';

export const maxDuration = 60;

function sse(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function POST(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 4096) {
    return Response.json({ error: 'Request body is too large.' }, { status: 413 });
  }

  const body = await readBody(request);
  const input = validateIdeaInput(body.idea);

  if (input.error) {
    return Response.json({ error: input.error }, { status: input.status });
  }

  try {
    const verdict = await validateStartupIdea(input.idea);
    if (!verdict.allowed) {
      return Response.json({ code: 'idea_rejected', error: verdict.reason }, { status: 422 });
    }
  } catch (error) {
    return Response.json({ error: error.message || 'Could not validate the startup idea.' }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload) => {
        controller.enqueue(encoder.encode(sse(payload)));
      };

      try {
        await streamVerdicts(input.idea, (side, text) => {
          send({ type: 'chunk', side, text });
        });
        send({ type: 'done' });
      } catch (error) {
        send({
          type: 'error',
          message: error.message || 'The debate failed.'
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
