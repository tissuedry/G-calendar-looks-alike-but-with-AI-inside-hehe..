// Small helpers so handlers run the same on Vercel and on the local dev server.

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function readJson(req) {
  if (req.body !== undefined && req.body !== null && !(req.body instanceof Uint8Array)) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body || '{}'); } catch { throw new HttpError(400, 'JSON tidak valid'); }
    }
    return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 2_000_000) throw new HttpError(413, 'Data terlalu besar');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'JSON tidak valid'); }
}

export function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

// Wraps a handler: method check + uniform error responses.
export function route(methods, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) return send(res, 405, { error: 'Metode tidak didukung' }, { Allow: methods.join(', ') });
      await fn(req, res);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      if (res.headersSent) return res.end();
      const status = e instanceof HttpError ? e.status : 500;
      // our own HttpErrors carry user-facing messages (even 500s); anything else stays generic
      send(res, status, { error: e instanceof HttpError ? e.message : 'Terjadi kesalahan di server', code: e.code });
    }
  };
}
