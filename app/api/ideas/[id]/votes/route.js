import { handleVoteIdea } from '../../../../../lib/ideas-api.mjs';
import { runJsonHandler } from '../../../../../lib/next-handler-adapter.mjs';

export async function POST(request, { params }) {
  const { id } = await params;
  return runJsonHandler(request, handleVoteIdea, id);
}
