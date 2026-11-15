// POST {year, hint?, name?, age?, regen?} -> {theme, cached}
// The birthday theme of a year is made by the AI ONCE and stored (settings 'theme-<year>'), so every later open and every
// device shows the same theme. It is made again only when the hint changed or regen is true.
import { route, send, readJson, HttpError } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { store } from '../lib/store.js';
import { openStream, pumpStream } from '../lib/ai.js';

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const isEmoji = s => typeof s === 'string' && s.length <= 14 && /\p{Extended_Pictographic}/u.test(s);

function extractJson(t) {
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

function prompt({ year, hint, name, age }) {
  return `Kamu desainer tema perayaan yang kreatif dan hangat. Buat tema tampilan kalender untuk ulang tahun${name ? ' ' + name : ''} pada tahun ${year}${Number.isInteger(age) && age > 0 ? ` (ulang tahun ke-${age})` : ''}.
${hint ? `TEMA DARI PENGGUNA (wajib jadi tema utama): ${hint}.` : `Jadikan nuansa tema sesuatu yang sedang viral atau ramai di tahun ${year} HANYA jika kamu benar-benar tahu; jangan mengarang peristiwa. Jika tidak yakin apa yang viral di tahun itu, pakai tema perayaan yang meriah dan ceria.`}
Hindari politik partisan, SARA, dan hal yang merendahkan. Jika temanya isu serius (mis. bencana atau kebakaran hutan), buat pesannya penuh kepedulian dan harapan, bukan merayakan bencana, dan tetap sisipkan ucapan ulang tahun yang hangat.
Balas HANYA satu objek JSON (tanpa markdown):
{"tema":"nama tema 2-4 kata","headline":"ucapan utama maksimal 70 karakter, boleh ada emoji","pesan":"satu kalimat hangat maksimal 140 karakter","emojis":["6 sampai 8 emoji yang cocok dengan temanya"],"hue":0-360 (angka warna utama yang cocok),"tren":"satu kalimat singkat tentang apa yang melatari tema ini, maksimal 100 karakter"}
Bahasa Indonesia.`;
}

export default route(['POST'], async (req, res) => {
  requireAuth(req);
  const b = await readJson(req);
  const year = Number(b.year), now = new Date().getFullYear();
  if (!Number.isInteger(year) || Math.abs(year - now) > 1) throw new HttpError(400, 'Tahun tidak valid');
  const hint = str(b.hint, 80), key = 'theme-' + year, db = store();

  if (b.regen !== true) {
    const hit = await db.getSetting(key);
    if (hit && hit.headline && (hit.hint || '') === hint) return send(res, 200, { theme: hit, cached: true });
  }

  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
  const msgs = [
    { role: 'system', content: prompt({ year, hint, name: str(b.name, 40), age: Number.isInteger(b.age) ? b.age : null }) },
    { role: 'user', content: `Buat temanya untuk tahun ${year}.` },
  ];
  const r = await openStream(msgs, ctl.signal, undefined, false, false, 0.9);
  if (r.error) return send(res, r.error.status, { error: r.error.message, code: r.error.code });
  let out = '';
  try { await pumpStream(r.response, t => { out += t; }); }
  catch { if (ctl.signal.aborted) return; throw new HttpError(502, 'Koneksi ke AI terputus.', 'dropped'); }

  const j = extractJson(out);
  const headline = str(j?.headline, 90);
  if (!headline) throw new HttpError(502, 'Jawaban AI tidak bisa dibaca. Coba lagi.', 'bad_format');
  const hue = Number.isFinite(Number(j.hue)) ? Math.min(360, Math.max(0, Math.round(Number(j.hue)))) : 330;
  const emojis = (Array.isArray(j.emojis) ? j.emojis : []).filter(isEmoji).slice(0, 8);
  const theme = {
    year, hint, headline, hue,
    tema: str(j.tema, 40), pesan: str(j.pesan, 180), tren: str(j.tren, 120),
    emojis: emojis.length ? emojis : ['🎂', '🎉', '🎈', '🎁', '✨', '🥳'],
    provider: r.provider, model: r.model, at: Date.now(),
  };
  await db.setSetting(key, theme);
  send(res, 200, { theme, cached: false });
});
