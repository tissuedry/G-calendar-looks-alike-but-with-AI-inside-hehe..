// Evaluation of the AI assistant against a fixed schedule: runs the REAL browser code (public/app.js, in a stubbed sandbox)
// and the REAL server path (lib/ai.js), so a prompt change can be checked before it ships.
//   node --env-file=.env tests/ai-eval.mjs --provider groq|gemini [--only id1,id2] [--out file.json]
// "Now" is fixed (Monday 2 Nov 2026, 08:00) so expected answers never drift.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const provider = arg('provider', 'groq');
const only = arg('only', '') ? arg('only').split(',') : null;
const outFile = arg('out', '');
// pure runs: with only one key present the server cannot fall back to the other provider and blur the results
if (provider === 'groq') delete process.env.GEMINI_API_KEY; else delete process.env.GROQ_API_KEY;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { openStream, pumpStream, parseActions } = await import('file://' + root.replace(/\\/g, '/') + '/lib/ai.js');

/* ---------- sandbox: load the real front-end code with an inert DOM ---------- */
const inert = () => new Proxy(function () {}, {
  get: (t, k) => k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : k === Symbol.iterator ? function* () {} : inert(),
  apply: () => inert(), construct: () => inert(), set: () => true, has: () => true,
});
const sandbox = {
  console, Intl, Date, Math, JSON, Map, Set, WeakMap, Promise, URL, TextDecoder, Array, Object, String, Number, RegExp, Error, Symbol,
  crypto: { randomUUID: () => 'u' + Math.random().toString(36).slice(2, 12) },
  document: new Proxy({ createTreeWalker: () => ({ nextNode: () => null }), querySelectorAll: () => [], querySelector: () => null, getElementById: () => inert() },
    { get: (t, k) => (k in t ? t[k] : inert()) }), navigator: { language: 'id-ID' }, location: { search: '', hash: '', href: '' }, history: inert(),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  fetch: () => Promise.reject(new Error('offline')),
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
  addEventListener() {}, removeEventListener() {}, getComputedStyle: () => ({ getPropertyValue: () => '' }),
  MutationObserver: class { observe() {} }, IntersectionObserver: class { observe() {} }, ResizeObserver: class { observe() {} },
  NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 }, Node: {}, Element: class {}, HTMLElement: class {},
  innerWidth: 1200, innerHeight: 800, AbortController, alert() {}, confirm: () => true,
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'public/i18n.js'), 'utf8'), sandbox, { filename: 'public/i18n.js' });
// app.js is one IIFE: add a hook just before its closing, so the test can reach the real functions and state
let appSrc = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const end = appSrc.lastIndexOf('})();');
appSrc = appSrc.slice(0, end) + 'globalThis.__t={aiContext,buildProposals,wantsChange,setData:(e,c,n)=>{real=e;cats=c;now=n}};\n' + appSrc.slice(end);
vm.runInContext(appSrc, sandbox, { filename: 'public/app.js' });
const T = sandbox.__t;

/* ---------- fixtures ---------- */
const NOW = '2026-11-02T08:00:00';
const series = (id, title, date, day, start, end, extra = {}) => ({ id, title, date, start, end, cat: 'jk', status: 'rencana', notes: '',
  repeat: { freq: 'weekly', days: [day], until: '2027-01-31', skip: [], st: {}, ...extra } });
const one = (id, title, date, start, end, cat = 'pn', status = 'rencana') => ({ id, title, date, start, end, cat, status, notes: '' });
const FIXTURES = {
  main: {
    cats: [{ id: 'jk', label: 'Jadwal Kuliah', color: 'p2' }, { id: 'pr', label: 'Pribadi', color: 'p3' }, { id: 'pn', label: 'Panitia', color: 'p6' }],
    events: [
      series('vd', 'VISUALISASI DATA', '2026-11-02', 1, '08:30', '11:30'),
      series('pcd', 'PENGOLAHAN CITRA DIGITAL', '2026-11-03', 2, '09:30', '12:30'),
      series('bi', 'BAHASA INGGRIS UNTUK KARIER', '2026-11-05', 4, '08:30', '11:30', { skip: ['2026-11-05'] }),
      series('tarung', 'Latihan Tarung Derajat', '2026-11-05', 4, '18:00', '20:00', { st: { '2026-11-05': 'batal' } }),
      one('ta', 'TA: draf minimal selesai (W8)', '2026-11-03', '', '23:59', 'jk'),
      ...['Bayar UKT', 'Ambil paket', 'Revisi proposal KP', 'Kumpul tugas PCD'].map((t, i) => one('l' + i, t, '2026-11-03', '', '', 'pr')),
      one('hm', 'Rapat himpunan', '2026-11-04', '19:00', '22:00'),
      one('f1', 'Tenggat form pemilihan unit sapmud', '2026-11-05', '', '10:00'),
      one('p1', 'Presentasi PCD', '2026-11-05', '13:00', '15:00', 'jk'),
      one('k1', 'Seminar karier', '2026-11-05', '15:30', '18:00', 'pr'),
      one('k2', 'Rapat panitia', '2026-11-05', '19:00', '21:30'),
      one('q1', 'Quiz Sisrek', '2026-11-06', '13:30', '15:00', 'jk'),
    ],
  },
  empty: { cats: [{ id: 'kuliah', label: 'Kuliah', color: 'p2' }, { id: 'pribadi', label: 'Pribadi', color: 'p3' }], events: [] },
};
const load = name => {
  const fx = JSON.parse(JSON.stringify(FIXTURES[name]));
  T.setData(fx.events, fx.cats, new Date(NOW));
};

/* ---------- checks ---------- */
const LEAK = /\b(tunggu,|mari kita lihat|pengguna meminta|berdasarkan instruksi|the user asks|let me check|wait,)/i;
const hasTable = t => /\|\s*-{2,}/.test(t);
const mentionsOnlyAsCancelled = (t, name) => {
  const re = new RegExp(name, 'ig'); let m;
  while ((m = re.exec(t))) { const around = t.slice(Math.max(0, m.index - 80), m.index + 120); if (!/batal|tidak berlangsung|dihapus|cancel/i.test(around)) return false; }
  return true;
};
const props = r => r.proposals;
const CASES = [
  // ---- questions (no tool) ----
  { id: 'busiest-week', q: 'akan padat di hari apa untuk minggu ini', check: (r) => [
    [/selasa/i.test(r.text) && /kamis/i.test(r.text), 'menyebut Selasa (kegiatan terbanyak) dan Kamis (jam terbanyak)'],
    [hasTable(r.text), 'ada tabel perbandingan'],
    [mentionsOnlyAsCancelled(r.text, 'tarung|bahasa inggris'), 'tidak menyebut kegiatan yang dibatalkan/dihapus sebagai kegiatan'],
    [!/\b\d+ kegiatan, \d+(,\d)? jam\b/i.test(r.text.split('|')[0]), 'kalimat pembuka tidak menguraikan "N kegiatan, N jam"'],
  ] },
  { id: 'thursday', q: 'ada apa saja hari kamis minggu ini?', check: r => [
    [/presentasi pcd/i.test(r.text) && /seminar/i.test(r.text) && /rapat panitia/i.test(r.text), 'menyebut 3 kegiatan Kamis'],
    [mentionsOnlyAsCancelled(r.text, 'tarung|bahasa inggris'), 'Tarung/B.Inggris tidak disebut sebagai kegiatan'],
  ] },
  { id: 'hours-thursday', q: 'berapa total jam kegiatan hari kamis 5 nov?', check: r => [[/\b7\b/.test(r.text), 'total 7 jam']] },
  { id: 'cancelled-q', q: 'apakah latihan tarung derajat ada hari kamis ini?', check: r => [
    [/batal|tidak (ada|berlangsung)|dihapus/i.test(r.text), 'mengatakan dibatalkan/tidak berlangsung'],
  ] },
  { id: 'fewest-month', q: 'hari dengan kegiatan terdikit di bulan ini tanggal berapa?', check: r => [
    [(r.text.match(/\b(7|8|14|15|21|22|28|29)\b/g) || []).length >= 2, 'menyebut hari kosong yang benar (mis. 7, 8, 14, 15)'],
    [!/(\b2 nov\b|senin,? 2 nov)[^\n]{0,40}(kosong|tanpa kegiatan)/i.test(r.text), 'tidak menyebut 2 Nov (ada kuliah) sebagai kosong'],
  ] },
  { id: 'general-holiday', q: 'apakah ada tanggal merah atau hari libur nasional di bulan november 2026?', check: r => [
    [!/hanya (dapat|bisa) menggunakan data/i.test(r.text), 'tidak menolak dengan alasan "hanya data kegiatan"'],
    [/tanggal merah|libur|tidak (ada|terdapat)/i.test(r.text), 'menjawab soal libur'],
  ] },
  { id: 'scope-code', q: 'berikan kodingan python fibonacci', check: r => [
    [!/```|\bdef \w+\(/.test(r.text), 'tidak menulis kode'],
    [r.text.trim().length > 0, 'ada jawaban penolakan singkat'],
  ] },
  { id: 'scope-translate', q: "terjemahkan 'selamat pagi' ke bahasa prancis", check: r => [[!/bonjour/i.test(r.text), 'tidak menerjemahkan']] },
  // ---- changes (tool) ----
  { id: 'add-time-only', q: 'besok jam 10 pagi kategori kuliah adalah chat ke pak mahmud utk HKI', check: r => { const p = props(r)[0]; return [
    [props(r).length === 1 && p.op === 'tambah', '1 usulan tambah'],
    [p?.next?.date === '2026-11-03', 'tanggal besok = 2026-11-03'],
    [p?.next?.start === '10:00' && !p?.next?.end, 'jam mulai 10:00, tanpa jam selesai'],
  ]; } },
  { id: 'add-day-only', q: 'besok kumpulkan laporan praktikum', check: r => { const p = props(r)[0]; return [
    [props(r).length === 1 && p.op === 'tambah', '1 usulan tambah'],
    [p?.next?.date === '2026-11-03' && !p?.next?.start && !p?.next?.end, 'besok, tanpa jam sama sekali'],
  ]; } },
  { id: 'add-deadline', q: 'deadline tugas basis data besok jam 17', check: r => { const p = props(r)[0]; return [
    [p?.op === 'tambah' && p.next.date === '2026-11-03', 'tambah untuk besok'],
    [!p?.next?.start && p?.next?.end === '17:00', 'hanya jam selesai 17:00 (tenggat)'],
  ]; } },
  { id: 'add-clash', q: 'tambah rapat himpunan selasa 3 nov jam 10 sampai 11', check: r => { const p = props(r)[0]; return [
    [props(r).length === 1 && p.op === 'tambah', 'langsung mengusulkan tanpa bertanya'],
    [p?.status === 'clash', 'ditahan karena bentrok dengan Pengolahan Citra Digital'],
  ]; } },
  { id: 'timetable', fixture: 'empty', q: `CAK4XBB3 - VISUALISASI DATA Jadwal: SENIN, 08:30:00-11:30:00 / (A203B) KU1.02.06
CAK4TBB3 - SISTEM PEMBERI REKOMENDASI Jadwal: JUMAT, 13:30:00-16:30:00 / IF3.02.01
CAK4OBB3 - PENGOLAHAN CITRA DIGITAL Jadwal: SELASA, 09:30:00-12:30:00 / TULT 0708
CAK4FAA4 - TUGAS AKHIR Jadwal: -
CAK4DAB3 - KERJA PRAKTIK Jadwal: -
CAK4BAB3 - BAHASA INGGRIS UNTUK KARIER Jadwal: KAMIS, 08:30:00-11:30:00 / KU3.04.19
untuk KP dan TA abaikan, sisanya buatkan berulang hingga januari 2027, cepat buatkan`, check: r => {
    const want = { 'VISUALISASI': 1, 'REKOMENDASI': 5, 'CITRA': 2, 'INGGRIS': 4 }, ps = props(r);
    return [
      [ps.length === 4 && ps.every(p => p.op === 'tambah'), '4 usulan tambah (TA & KP dilewati)'],
      [ps.every(p => p.status !== 'invalid' && p.next?.repeat), 'semua valid dan berulang'],
      [Object.entries(want).every(([k, d]) => ps.some(p => new RegExp(k, 'i').test(p.title) && p.next?.repeat?.days?.length === 1 && p.next.repeat.days[0] === d && new Date(p.next.date + 'T00:00').getDay() === d)), 'hari tiap mata kuliah benar & tanggal pertama jatuh di hari itu'],
      [ps.every(p => p.next?.repeat?.until === '2027-01-31'), 'berakhir 31 Jan 2027'],
    ];
  } },
  { id: 'delete-series', q: 'hapus jadwal bahasa inggris untuk karier', check: r => { const p = props(r)[0]; return [
    [props(r).length === 1 && p.op === 'hapus' && p.id === 'bi' && !p.skipDate, '1 usulan hapus seluruh seri B. Inggris'],
  ]; } },
  { id: 'delete-one-date', q: 'hapus visualisasi data tanggal 9 november saja, dosen libur', check: r => { const p = props(r)[0]; return [
    [props(r).length === 1 && p.op === 'hapus' && p.id === 'vd', 'hapus seri Visualisasi Data'],
    [p?.skipDate === '2026-11-09', 'hanya tanggal 9 Nov'],
  ]; } },
  { id: 'delete-group', q: 'hapus semua kegiatan tanpa jam hari selasa 3 november', check: r => { const ids = props(r).filter(p => p.op === 'hapus').map(p => p.id); return [
    [['l0', 'l1', 'l2', 'l3'].every(i => ids.includes(i)), 'mengusulkan hapus ke-4 kegiatan tanpa jam'],
    [!ids.includes('ta') && !ids.includes('pcd'), 'tidak ikut menghapus TA (tenggat) atau kuliah'],
  ]; } },
  { id: 'new-category', q: 'buat kategori baru Olahraga lalu jadwalkan futsal jumat 6 nov jam 17', check: r => { const ps = props(r); return [
    [ps.some(p => p.op === 'tambah' && /futsal/i.test(p.title) && p.next?.date === '2026-11-06' && p.next?.start === '17:00'), 'usulan futsal Jumat 17:00'],
    [ps.some(p => (p.catOp && /olahraga/i.test(p.catLabel || '')) || /olahraga/i.test(p.newCat || '')), 'kategori Olahraga akan dibuat'],
  ]; } },
  { id: 'clash-followup', prior: ['besok jam 10 rapat himpunan', '(Mengusulkan 1 perubahan jadwal.)',
      '- tambah "Rapat himpunan" Sel, 3 Nov · 10:00 : DITAHAN karena bentrok, menunggu keputusan pengguna (Bentrok dengan "PENGOLAHAN CITRA DIGITAL" (Sel 3 Nov, 09:30–12:30).)'],
    q: 'oh geser saja ke rabu jam yang sama', check: r => { const p = props(r)[0]; return [
    [p?.op === 'tambah' && p.next.date === '2026-11-04' && p.next.start === '10:00', 'usulan baru Rabu 4 Nov jam 10:00'],
  ]; } },
];

/* ---------- runner ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ask(c) {
  load(c.fixture || 'main');
  const lastWasPending = !!c.prior;
  const useTools = T.wantsChange(c.q) || lastWasPending;
  const note = c.prior ? `\n\nUsulan sebelumnya di percakapan ini dan hasilnya (dicatat aplikasi; jangan pernah menulis daftar ini atau status usulan di jawabanmu, hanya alat yang membuat usulan):\n${c.prior[2]}` : '';
  const system = T.aiContext(useTools) + note;
  const messages = [...(c.prior ? [{ role: 'user', content: c.prior[0] }, { role: 'assistant', content: c.prior[1] }] : []), { role: 'user', content: c.q }];
  const msgs = [{ role: 'system', content: system }, ...messages];
  // The server falls back to weaker models when the primary one is rate-limited. For measuring the PROMPT that would
  // blur the result, so wait for the primary model and flag the run if it never came back.
  const primary = provider === 'groq' ? 'openai/gpt-oss-120b' : useTools ? 'gemini-3.5-flash' : 'gemini-3.5-flash-lite';
  let first, fellBack = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    first = await openStream(msgs, new AbortController().signal, provider, useTools);
    if (first.error) { if (first.error.status !== 429 && first.error.code !== 'rate_limited') break; await sleep(30000); continue; }
    if (first.model === primary) { fellBack = false; break; }
    fellBack = true;
    if (attempt < 4) { try { await first.response.body.cancel(); } catch {} await sleep(30000); }
  }
  if (first.error) return { text: '', proposals: [], error: first.error.message, useTools };
  let text = '';
  const { calls } = await pumpStream(first.response, t => { text += t; });
  const actions = calls.filter(x => x.name === 'usulkan_perubahan_jadwal').flatMap(x => parseActions(x.args));
  let proposals = [];
  if (actions.length) proposals = T.buildProposals(actions);
  return { text, proposals, useTools, model: first.model, actions, fellBack };
}

const results = [];
for (const c of CASES) {
  if (only && !only.includes(c.id)) continue;
  let r, checks = [];
  try { r = await ask(c); } catch (e) { r = { text: '', proposals: [], error: String(e.message || e) }; }
  if (r.error) checks = [[false, 'galat: ' + r.error]];
  else {
    checks = c.check(r);
    if (LEAK.test(r.text)) checks.push([false, 'jawaban membocorkan proses berpikir']);
    if (c.id.startsWith('add') || c.id.includes('delete') || c.id === 'timetable') checks.push([r.useTools, 'alat usulan aktif untuk pesan ini']);
  }
  const ok = checks.every(x => x[0]);
  const skip = !ok && r.fellBack; // failed on a fallback model: not the prompt's fault, reported separately
  results.push({ id: c.id, ok, skip, model: r.model, actions: r.actions, fails: checks.filter(x => !x[0]).map(x => x[1]), text: (r.text || '').slice(0, 700),
    proposals: (r.proposals || []).map(p => `${p.op}${p.catOp ? '*' : ''} ${p.title || ''} ${p.next ? p.next.date + ' ' + (p.next.start || '') + '-' + (p.next.end || '') : ''} [${p.status}]${p.skipDate ? ' skip ' + p.skipDate : ''}`) });
  console.log(`${ok ? 'PASS' : skip ? 'SKIP' : 'FAIL'}  ${c.id}${ok ? (r.fellBack ? '  (model cadangan)' : '') : skip ? `  (model cadangan ${r.model}; tidak dihitung)` : '\n      - ' + results.at(-1).fails.join('\n      - ')}`);
  await sleep(provider === 'groq' ? 9000 : 4000);
}
const pass = results.filter(r => r.ok).length, skips = results.filter(r => r.skip).length, fails = results.length - pass - skips;
console.log(`\n${provider}: ${pass}/${results.length} lolos, ${fails} gagal, ${skips} dilewati (model cadangan)`);
if (outFile) fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
process.exit(fails === 0 ? 0 : 1);
