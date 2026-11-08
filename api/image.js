// POST {prompt, lang} -> {image: base64, mime, text}. Image generation with Gemini (gemini-2.5-flash-image).
// Used only when the chat is set to Gemini and the message asks for a picture. Needs GEMINI_API_KEY.
// Optional: GEMINI_IMAGE_MODEL to try another image model.
import { route, send, readJson, HttpError } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';

const MODEL = () => process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const MAX_PROMPT = 1000;

export default route(['POST'], async (req, res) => {
  requireAuth(req);
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError(503, 'GEMINI_API_KEY belum diatur di server, jadi gambar tidak bisa dibuat.', 'no_key');

  const { prompt } = await readJson(req);
  const p = String(prompt || '').trim().slice(0, MAX_PROMPT);
  if (!p) throw new HttpError(400, 'Deskripsi gambar kosong');

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL())}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: p }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => { throw new HttpError(502, 'Layanan Gemini tidak terjangkau.', 'image_unreachable'); });

  if (!r.ok) {
    if (r.status === 429) throw new HttpError(429, 'Batas pemakaian gambar Gemini tercapai. Coba lagi nanti.', 'rate_limited');
    if (r.status === 400 || r.status === 401 || r.status === 403) throw new HttpError(502, 'Gemini menolak permintaan gambar (cek GEMINI_API_KEY dan nama model).', 'bad_key');
    throw new HttpError(502, `Gagal membuat gambar (${r.status}).`, 'image_failed');
  }
  const data = await r.json().catch(() => ({}));
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find(x => x.inlineData?.data);
  const text = parts.filter(x => x.text).map(x => x.text).join('\n').trim();
  if (!img) throw new HttpError(502, text || 'Gemini tidak mengembalikan gambar. Coba jelaskan gambarnya dengan kalimat yang lebih jelas.', 'no_image');
  send(res, 200, { image: img.inlineData.data, mime: img.inlineData.mimeType || 'image/png', text });
});
