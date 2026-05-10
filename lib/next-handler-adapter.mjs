function headersToObject(headers) {
  return Object.fromEntries(Array.from(headers.entries()).map(([key, value]) => [key.toLowerCase(), value]));
}

function queryToObject(url) {
  return Object.fromEntries(new URL(url).searchParams.entries());
}

async function readJsonBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return {};

  try {
    return await request.json();
  } catch {
    return {};
  }
}

function makeResponseShim() {
  const headers = new Headers();
  let statusCode = 200;
  let body = null;

  return {
    setHeader(name, value) {
      headers.set(name, value);
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = JSON.stringify(payload);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return this;
    },
    toResponse() {
      return new Response(body, {
        status: statusCode,
        headers
      });
    }
  };
}

export async function runJsonHandler(request, handler, ...args) {
  const req = {
    method: request.method,
    headers: headersToObject(request.headers),
    query: queryToObject(request.url),
    body: await readJsonBody(request)
  };
  const res = makeResponseShim();

  await handler(req, res, ...args);
  return res.toResponse();
}
