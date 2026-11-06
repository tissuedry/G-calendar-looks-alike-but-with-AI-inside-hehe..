// POST {audio: base64, mime, lang} -> {text}. Speech-to-text through Groq Whisper, for browsers whose own
// SpeechRecognition is missing or blocked (Brave, Firefox). Needs GROQ_API_KEY, the same key the chat uses.
import { route, send, readJson, HttpError } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';

const MAX_BYTES = 1_500_000; // about a minute of speech as webm/opus
const MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';
const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };

export default route(['POST'], async (req, res) => {
  requireAuth(req);
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new HttpError(503, 'GROQ_API_KEY belum diatur di server, jadi suara tidak bisa diubah jadi teks.', 'no_key');

  const { audio, mime, lang } = await readJson(req);
  if (typeof audio !== 'string' || !audio) throw new HttpError(400, 'Rekaman kosong');
  const buf = Buffer.from(audio, 'base64');
  if (!buf.length) throw new HttpError(400, 'Rekaman kosong');
  if (buf.length > MAX_BYTES) throw new HttpError(413, 'Rekaman terlalu panjang. Bicara lebih singkat.');

  const type = String(mime || 'audio/webm').split(';')[0].trim().toLowerCase();
  const form = new FormData();
  form.append('file', new Blob([buf], { type }), `suara.${EXT[type] || 'webm'}`);
  form.append('model', MODEL);
  form.append('language', lang === 'en' ? 'en' : 'id');
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key },
    body: form,
    signal: AbortSignal.timeout(30_000),
  }).catch(() => { throw new HttpError(502, 'Layanan pengenalan suara tidak terjangkau.', 'stt_unreachable'); });

  if (!r.ok) {
    if (r.status === 429) throw new HttpError(429, 'Batas pemakaian gratis tercapai. Coba lagi beberapa saat lagi.', 'rate_limited');
    if (r.status === 401 || r.status === 403) throw new HttpError(502, 'API key Groq ditolak.', 'bad_key');
    throw new HttpError(502, `Gagal mengubah suara jadi teks (${r.status}).`, 'stt_failed');
  }
  const data = await r.json().catch(() => ({}));
  send(res, 200, { text: String(data.text || '').trim() });
});
