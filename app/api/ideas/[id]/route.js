import { handleGetIdea } from '../../../../lib/ideas-api.mjs';
import { runJsonHandler } from '../../../../lib/next-handler-adapter.mjs';

export async function GET(request, { params }) {
  const { id } = await params;
  return runJsonHandler(request, handleGetIdea, id);
}
