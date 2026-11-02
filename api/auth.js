import { route, send, readJson, HttpError } from '../lib/http.js';
import { authEnabled, isAuthed, checkCredentials, makeToken, sessionCookie } from '../lib/auth.js';

export default route(['GET', 'POST', 'DELETE'], async (req, res) => {
  if (req.method === 'GET') return send(res, 200, { authEnabled: authEnabled(), authed: isAuthed(req) });

  if (req.method === 'DELETE') return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(null) });

  if (!authEnabled()) return send(res, 200, { ok: true });
  const { username, password } = await readJson(req);
  if (!checkCredentials(username, password)) {
    await new Promise(r => setTimeout(r, 700)); // slow down guessing
    throw new HttpError(401, 'Username atau kata sandi salah', 'bad_password');
  }
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(makeToken()) });
});
