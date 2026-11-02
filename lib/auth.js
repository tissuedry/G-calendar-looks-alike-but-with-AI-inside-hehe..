// Single-user username + password login. Disabled when APP_PASSWORD is empty (handy for local use).
import crypto from 'node:crypto';
import { HttpError } from './http.js';

const COOKIE = 'agenda_session';
const MAX_AGE = 60 * 60 * 24 * 30;

export const authEnabled = () => !!process.env.APP_PASSWORD;

const secret = () => process.env.AUTH_SECRET || 'pw:' + process.env.APP_PASSWORD;
const sign = v => crypto.createHmac('sha256', secret()).update(v).digest('base64url');
const sha = v => crypto.createHash('sha256').update(String(v ?? '')).digest();

export function makeToken() {
  const exp = String(Date.now() + MAX_AGE * 1000);
  return exp + '.' + sign(exp);
}

function validToken(t) {
  if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig) return false;
  const good = sign(exp);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  return Number(exp) > Date.now();
}

function getCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export const isAuthed = req => !authEnabled() || validToken(getCookie(req, COOKIE));

export function requireAuth(req) {
  // never run an open instance on Vercel: anyone with the URL could read the calendar and burn the AI quota
  if (process.env.VERCEL && !process.env.APP_PASSWORD) throw new HttpError(503, 'APP_PASSWORD belum diatur di Vercel. Isi APP_USERNAME dan APP_PASSWORD di Environment Variables lalu Redeploy.', 'no_password');
  if (!isAuthed(req)) throw new HttpError(401, 'Silakan masuk dulu', 'unauthorized');
}

// Username is optional: when APP_USERNAME is empty only the password is checked.
export function checkCredentials(username, password) {
  const userOk = crypto.timingSafeEqual(sha(String(username ?? '').trim().toLowerCase()), sha((process.env.APP_USERNAME || '').trim().toLowerCase()));
  const passOk = crypto.timingSafeEqual(sha(password), sha(process.env.APP_PASSWORD));
  return (userOk || !process.env.APP_USERNAME) && passOk;
}

export function sessionCookie(token) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  const val = token ? `${token}; Max-Age=${MAX_AGE}` : '; Max-Age=0';
  return `${COOKIE}=${val}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}
