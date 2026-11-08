// POST {text, kind: 'week'|'month', current: boolean, lang, provider?} -> {insight, provider, model}
// Turns the numbers of a report (already computed in the browser) into a short structured explanation.
// The model only interprets; it never sees the whole schedule and cannot change it.
import { route, send, readJson, HttpError } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { openStream, pumpStream } from '../lib/ai.js';

const MAX_TEXT = 12_000;
const VERDICTS = ['good', 'fair', 'attention'];

function systemPrompt(lang, kind, current) {
  if (lang === 'en') {
    const unit = kind === 'week' ? 'week' : 'month';
    return `You are a concise, honest personal-schedule analyst. The user gives you a ${unit} report from their calendar. All numbers were computed by the app: do NOT recompute them and do NOT invent numbers or events that are not in the report. After the numbers comes the EVENT LIST of that period (it may be cut off at the end): read it to be specific, e.g. name the events that were missed or postponed, spot days where deadlines pile up, clashes, or a category that is crowding out the others. ${current ? 'This period is still running, so events that are not due yet are not failures.' : ''}
Reply with ONE JSON object only (no markdown, no other text):
{"headline":"one-sentence conclusion","verdict":"good|fair|attention","good":["..."],"watch":["..."],"tips":["..."],"focus":"one sentence on what to focus on next ${unit}"}
Rules: verdict is "good" when completion is high and little was missed, "attention" when many events were missed or postponed, otherwise "fair". "good" has 1-3 things that went well, "watch" has 0-3 things to keep an eye on, "tips" has 2-3 concrete actions the user can take right away. Each item is at most 140 characters, written in English, and names the category or day when relevant.
Quality: every point must rest on a number or a real event from the report (quote the event title in quotes when you mention one). No generic advice such as "manage your time better". If something is not visible in the data, say nothing about it instead of guessing. Do not repeat the same point in two lists.`;
  }
  const unit = kind === 'week' ? 'minggu' : 'bulan';
  return `Kamu analis jadwal pribadi yang ringkas dan jujur. Pengguna memberi laporan ${unit} dari kalender mereka. Semua angka sudah dihitung oleh aplikasi: JANGAN menghitung ulang, JANGAN mengarang angka atau kegiatan yang tidak ada di laporan. Setelah angka ada DAFTAR KEGIATAN (EVENT LIST) periode itu, yang bisa terpotong di akhir: bacalah supaya sarannya spesifik, misalnya sebut kegiatan yang terlewat atau ditunda, hari ketika tenggat menumpuk, jadwal bentrok, atau kategori yang menggeser kategori lain. ${current ? 'Periode ini masih berjalan, jadi kegiatan yang belum jatuh tempo bukan kegagalan.' : ''}
Balas HANYA dengan satu objek JSON (tanpa markdown, tanpa teks lain):
{"headline":"kesimpulan satu kalimat","verdict":"good|fair|attention","good":["..."],"watch":["..."],"tips":["..."],"focus":"satu kalimat fokus untuk ${unit} depan"}
Aturan: verdict "good" bila penyelesaian tinggi dan sedikit yang terlewat, "attention" bila banyak yang terlewat atau ditunda, selain itu "fair". "good" berisi 1-3 hal yang berjalan baik, "watch" berisi 0-3 hal yang perlu diperhatikan, "tips" berisi 2-3 saran konkret yang bisa langsung dilakukan. Setiap butir maksimal 140 karakter, bahasa Indonesia, sebut kategori atau hari bila relevan.
Mutu: setiap butir harus bertumpu pada angka atau kegiatan nyata di laporan (kutip judul kegiatan dalam tanda kutip bila disebut). Jangan beri saran umum seperti "atur waktu lebih baik". Bila sesuatu tidak terlihat di data, jangan dibahas daripada menebak. Jangan mengulang butir yang sama di dua daftar.`;
}

function extractJson(t) {
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}
const strs = (v, n, len) => (Array.isArray(v) ? v : []).map(x => (typeof x === 'string' ? x.trim().slice(0, len) : '')).filter(Boolean).slice(0, n);

export default route(['POST'], async (req, res) => {
  requireAuth(req);
  const { text, kind, current, lang, provider, verdict } = await readJson(req);
  if (typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'Laporan tidak valid');
  const k = kind === 'month' ? 'month' : 'week';
  const fixed = VERDICTS.includes(verdict) ? verdict : null; // computed by the app from the numbers

  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
  const en = lang === 'en';
  const hint = fixed ? (en ? `\nThe overall verdict is already decided by the app: "${fixed}". Write the headline and the points so they agree with it.` : `\nPenilaian keseluruhan sudah ditentukan aplikasi: "${fixed}". Tulis kesimpulan dan butirnya agar sesuai dengan itu.`) : '';
  const msgs = [
    { role: 'system', content: systemPrompt(en ? 'en' : 'id', k, current === true) + hint },
    { role: 'user', content: text.slice(0, MAX_TEXT) },
  ];

  // low temperature = steadier answers; one retry if the model breaks the JSON format
  let j = null, last = null, info = null;
  for (let attempt = 0; attempt < 2 && !j; attempt++) {
    const r = await openStream(msgs, ctl.signal, typeof provider === 'string' ? provider : undefined, false, false, 0.2);
    if (r.error) return send(res, r.error.status, { error: r.error.message, code: r.error.code });
    let out = '', finish = null;
    try { ({ finish } = await pumpStream(r.response, t => { out += t; })); }
    catch { if (ctl.signal.aborted) return; throw new HttpError(502, 'Koneksi ke AI terputus.', 'dropped'); }
    last = { out, finish };
    const c = extractJson(out);
    if (typeof c?.headline === 'string' && c.headline.trim()) { j = c; info = r; }
  }
  if (!j) {
    if (last.finish === 'length' && !last.out.trim()) throw new HttpError(502, 'Model kehabisan batas jawaban. Coba pilih penyedia AI lain.', 'exhausted');
    throw new HttpError(502, 'Jawaban AI tidak bisa dibaca. Coba buat ulang.', 'bad_format');
  }
  const first = info;
  const headline = j.headline.trim().slice(0, 200);
  send(res, 200, {
    insight: {
      headline,
      verdict: fixed || (VERDICTS.includes(j.verdict) ? j.verdict : 'fair'),
      good: strs(j.good, 3, 200),
      watch: strs(j.watch, 3, 200),
      tips: strs(j.tips, 3, 200),
      focus: typeof j.focus === 'string' ? j.focus.trim().slice(0, 200) : '',
    },
    provider: first.provider,
    model: first.model,
  });
});
