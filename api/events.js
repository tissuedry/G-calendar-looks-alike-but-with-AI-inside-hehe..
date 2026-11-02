// POST {events:[...]} upserts, DELETE {ids:[...]} removes.
import { route, send, readJson, HttpError } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { store, cleanEvent, MAX_BATCH } from '../lib/store.js';

export default route(['POST', 'DELETE'], async (req, res) => {
  requireAuth(req);
  const body = await readJson(req);

  if (req.method === 'POST') {
    if (!Array.isArray(body.events) || !body.events.length || body.events.length > MAX_BATCH) throw new HttpError(400, 'Daftar kegiatan tidak valid');
    const list = body.events.map(cleanEvent);
    await store().upsert(list);
    return send(res, 200, { events: list });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter(id => typeof id === 'string' && id.length <= 64) : [];
  if (!ids.length || ids.length > MAX_BATCH) throw new HttpError(400, 'Daftar ID tidak valid');
  await store().remove(ids);
  send(res, 200, { ok: true });
});
