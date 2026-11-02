import { route, send } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { store } from '../lib/store.js';

export default route(['GET'], async (req, res) => {
  requireAuth(req);
  send(res, 200, await store().getState());
});
