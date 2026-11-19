// GET -> {lead}, PUT {lead} -> {lead}. The "remind me N minutes before" choice (0 = off), kept on the server so the
// Telegram reminders (api/remind.js) follow the same setting as the bell in the app. lead is null until it was chosen once.
import { route, send, readJson, HttpError } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { store } from '../lib/store.js';

export const LEADS = [0, 5, 10, 30];
export const KEY = 'notify_lead';

export default route(['GET', 'PUT'], async (req, res) => {
  requireAuth(req);
  if (req.method === 'GET') {
    const v = await store().getSetting(KEY);
    return send(res, 200, { lead: LEADS.includes(v) ? v : null });
  }
  const { lead } = await readJson(req);
  if (!LEADS.includes(lead)) throw new HttpError(400, 'Nilai pengingat tidak valid');
  await store().setSetting(KEY, lead);
  send(res, 200, { lead });
});
