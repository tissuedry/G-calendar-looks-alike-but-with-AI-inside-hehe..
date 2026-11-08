// POST {text, kind: 'week'|'month', current: boolean, lang, provider?} -> {insight, provider, model}
// Turns the numbers of a report (already computed in the browser) into a short structured explanation.
// The model only interprets; it never sees the whole schedule and cannot change it.
import { route, send, readJson, HttpError } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { openStream, pumpStream } from '../lib/ai.js';

const MAX_TEXT = 4000;
const VERDICTS = ['good', 'fair', 'attention'];

function systemPrompt(lang, kind, current) {
  if (lang === 'en') {
    const unit = kind === 'week' ? 'week' : 'month';
    return `You are a concise, honest personal-schedule analyst. The user gives you a ${unit} report from their calendar. All numbers were computed by the app: do NOT recompute them and do NOT invent numbers or events that are not in the report. ${current ? 'This period is still running, so events that are not due yet are not failures.' : ''}
Reply with ONE JSON object only (no markdown, no other text):
{"headline":"one-sentence conclusion","verdict":"good|fair|attention","good":["..."],"watch":["..."],"tips":["..."],"focus":"one sentence on what to focus on next ${unit}"}
Rules: verdict is "good" when completion is high and little was missed, "attention" when many events were missed or postponed, otherwise "fair". "good" has 1-3 things that went well, "watch" has 0-3 things to keep an eye on, "tips" has 2-3 concrete actions the user can take right away. Each item is at most 140 characters, written in English, and names the category or day when relevant.`;
  }
  const unit = kind === 'week' ? 'minggu' : 'bulan';
  return `Kamu analis jadwal pribadi yang ringkas dan jujur. Pengguna memberi laporan ${unit} dari kalender mereka. Semua angka sudah dihitung oleh aplikasi: JANGAN menghitung ulang, JANGAN mengarang angka atau kegiatan yang tidak ada di laporan. ${current ? 'Periode ini masih berjalan, jadi kegiatan yang belum jatuh tempo bukan kegagalan.' : ''}
Balas HANYA dengan satu objek JSON (tanpa markdown, tanpa teks lain):
{"headline":"kesimpulan satu kalimat","verdict":"good|fair|attention","good":["..."],"watch":["..."],"tips":["..."],"focus":"satu kalimat fokus untuk ${unit} depan"}
Aturan: verdict "good" bila penyelesaian tinggi dan sedikit yang terlewat, "attention" bila banyak yang terlewat atau ditunda, selain itu "fair". "good" berisi 1-3 hal yang berjalan baik, "watch" berisi 0-3 hal yang perlu diperhatikan, "tips" berisi 2-3 saran konkret yang bisa langsung dilakukan. Setiap butir maksimal 140 karakter, bahasa Indonesia, sebut kategori atau hari bila relevan.`;
}

function extractJson(t) {
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}
const strs = (v, n, len) => (Array.isArray(v) ? v : []).map(x => (typeof x === 'string' ? x.trim().slice(0, len) : '')).filter(Boolean).slice(0, n);

export default route(['POST'], async (req, res) => {
  requireAuth(req);
  const { text, kind, current, lang, provider } = await readJson(req);
  if (typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'Laporan tidak valid');
  const k = kind === 'month' ? 'month' : 'week';

  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
  const msgs = [
    { role: 'system', content: systemPrompt(lang === 'en' ? 'en' : 'id', k, current === true) },
    { role: 'user', content: text.slice(0, MAX_TEXT) },
  ];
  const first = await openStream(msgs, ctl.signal, typeof provider === 'string' ? provider : undefined, false, false);
  if (first.error) return send(res, first.error.status, { error: first.error.message, code: first.error.code });

  let out = '', finish = null;
  try { ({ finish } = await pumpStream(first.response, t => { out += t; })); }
  catch { if (ctl.signal.aborted) return; throw new HttpError(502, 'Koneksi ke AI terputus.', 'dropped'); }

  const j = extractJson(out);
  const headline = typeof j?.headline === 'string' ? j.headline.trim().slice(0, 200) : '';
  if (!headline) {
    if (finish === 'length' && !out.trim()) throw new HttpError(502, 'Model kehabisan batas jawaban. Coba pilih penyedia AI lain.', 'exhausted');
    throw new HttpError(502, 'Jawaban AI tidak bisa dibaca. Coba buat ulang.', 'bad_format');
  }
  send(res, 200, {
    insight: {
      headline,
      verdict: VERDICTS.includes(j.verdict) ? j.verdict : 'fair',
      good: strs(j.good, 3, 200),
      watch: strs(j.watch, 3, 200),
      tips: strs(j.tips, 3, 200),
      focus: typeof j.focus === 'string' ? j.focus.trim().slice(0, 200) : '',
    },
    provider: first.provider,
    model: first.model,
  });
});
