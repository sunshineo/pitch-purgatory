import { handleCreateIdea, handleListIdeas } from '../../../lib/ideas-api.mjs';
import { runJsonHandler } from '../../../lib/next-handler-adapter.mjs';

export async function GET(request) {
  return runJsonHandler(request, handleListIdeas);
}

export async function POST(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 65536) {
    return Response.json({ error: 'Request body is too large.' }, { status: 413 });
  }

  return runJsonHandler(request, handleCreateIdea);
}
