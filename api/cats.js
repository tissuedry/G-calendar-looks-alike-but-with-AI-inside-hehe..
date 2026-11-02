import { route, send, readJson } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { store, cleanCats } from '../lib/store.js';

export default route(['PUT'], async (req, res) => {
  requireAuth(req);
  const cats = cleanCats((await readJson(req)).cats);
  await store().setCats(cats);
  send(res, 200, { cats });
});
