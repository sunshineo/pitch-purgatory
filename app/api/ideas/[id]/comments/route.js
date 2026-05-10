import { handleCreateComment, handleListComments } from '../../../../../lib/ideas-api.mjs';
import { runJsonHandler } from '../../../../../lib/next-handler-adapter.mjs';

export async function GET(request, { params }) {
  const { id } = await params;
  return runJsonHandler(request, handleListComments, id);
}

export async function POST(request, { params }) {
  const { id } = await params;
  return runJsonHandler(request, handleCreateComment, id);
}
