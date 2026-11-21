// POST {audio: base64, mime, lang} -> {text}. Turns a voice recording from the AI chat into text.
// Uses Groq Whisper (GROQ_API_KEY, the same key as the chat). If Groq is unavailable or fails and GEMINI_API_KEY is set,
// Gemini is tried as a fallback. Optional: GROQ_STT_MODEL, GEMINI_STT_MODEL.
import { route, send, readJson, HttpError } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';

const MAX_B64 = 3_000_000; // Vercel accepts bodies up to 4.5 MB; a 2 minute voice note is about 0.7 MB
const MIN_BYTES = 1500;     // anything smaller is just a click, not speech
const EXT = { webm: 'webm', ogg: 'ogg', mp4: 'mp4', mpeg: 'mp3', mp3: 'mp3', wav: 'wav', 'x-wav': 'wav', 'x-m4a': 'm4a', m4a: 'm4a', aac: 'm4a', flac: 'flac' };
// words the calendar uses; a short hint like this makes Whisper spell names and terms the way the user writes them
const HINT = 'Jadwal kegiatan: rapat, kuliah, futsal, besok, lusa, hari Senin, jam sepuluh, pindahkan, hapus, tambahkan, ulangi setiap minggu.';

function clean(t) {
  return String(t || '').replace(/\s+/g, ' ').trim();
}

async function groq(buf, mime, lang) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { skip: 'no_key' };
  const ext = EXT[mime.split('/')[1]] || 'webm';
  const models = [...new Set([...(process.env.GROQ_STT_MODEL || '').split(',').map(s => s.trim()).filter(Boolean), 'whisper-large-v3-turbo', 'whisper-large-v3'])];
  let last = null;
  for (const model of models) {
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime }), `voice.${ext}`);
    form.append('model', model);
    form.append('language', lang);
    form.append('temperature', '0');
    form.append('response_format', 'json');
    form.append('prompt', lang === 'id' ? HINT : '');
    let r;
    try {
      r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(40_000),
      });
    } catch { last = { status: 0 }; continue; }
    if (r.ok) { const d = await r.json().catch(() => ({})); return { text: clean(d.text) }; }
    last = { status: r.status };
    if (r.status === 401 || r.status === 403) break; // a bad key will not get better with another model
  }
  return { fail: last?.status || 0 };
}

async function gemini(buf, mime, lang) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { skip: 'no_key' };
  const model = (process.env.GEMINI_STT_MODEL || 'gemini-3.5-flash').trim();
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [
        { text: `Transcribe this audio exactly as spoken (${lang === 'id' ? 'Indonesian' : 'English'}). Reply with the transcript only, no comments. If there is no speech, reply with an empty string.` },
        { inlineData: { mimeType: mime, data: buf.toString('base64') } },
      ] }], generationConfig: { temperature: 0 } }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!r.ok) return { fail: r.status };
    const d = await r.json().catch(() => ({}));
    return { text: clean((d?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join(' ')) };
  } catch { return { fail: 0 }; }
}

export default route(['POST'], async (req, res) => {
  requireAuth(req);
  const { audio, mime: m, lang: l } = await readJson(req);
  if (typeof audio !== 'string' || !audio || audio.length > MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(audio)) throw new HttpError(400, 'Rekaman tidak valid atau terlalu panjang.', 'bad_audio');
  const mime = String(m || 'audio/webm').split(';')[0].trim().toLowerCase();
  if (!/^(audio|video)\/(webm|ogg|mp4|mpeg|mp3|wav|x-wav|x-m4a|m4a|aac|flac)$/.test(mime)) throw new HttpError(400, 'Format rekaman tidak didukung.', 'bad_audio');
  const buf = Buffer.from(audio, 'base64');
  if (buf.length < MIN_BYTES) return send(res, 200, { text: '', empty: true });
  const lang = l === 'en' ? 'en' : 'id';

  const a = await groq(buf, mime, lang);
  if (typeof a.text === 'string') return send(res, 200, { text: a.text, empty: !a.text });
  const b = await gemini(buf, mime, lang);
  if (typeof b.text === 'string') return send(res, 200, { text: b.text, empty: !b.text });

  if (a.skip && b.skip) throw new HttpError(503, 'GROQ_API_KEY (atau GEMINI_API_KEY) belum diatur di server, jadi suara belum bisa diubah jadi teks.', 'no_key');
  const s = a.fail ?? b.fail;
  if (s === 401 || s === 403) throw new HttpError(502, 'API key ditolak. Periksa GROQ_API_KEY di pengaturan server.', 'bad_key');
  if (s === 429) throw new HttpError(429, 'Batas pemakaian gratis untuk suara tercapai. Coba lagi beberapa saat lagi.', 'rate_limited');
  throw new HttpError(502, 'Layanan pengubah suara sedang tidak bisa dijangkau. Coba lagi.', 'stt_failed');
});
