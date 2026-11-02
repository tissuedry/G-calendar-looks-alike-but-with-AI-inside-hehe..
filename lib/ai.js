// OpenAI-compatible chat streaming for Groq and Google AI Studio (Gemini), with automatic fallback.
// The model gets one tool, `usulkan_perubahan_jadwal`. It can only PROPOSE changes: nothing is written
// until the user presses "Terapkan" in the browser.

// Models are tried in this order. Free-tier quotas are per MODEL, so having several means that when one runs out
// (or is retired) the assistant simply moves on to the next. Only models that exist for the account are useful here;
// the lists were checked against the provider's own model list.
// GROQ_MODEL / GEMINI_MODEL are OPTIONAL: set one (or a comma-separated list) to put your own model(s) first.
const DEFAULT_MODELS = {
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  gemini: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash'],
};
const modelList = id => {
  const mine = (process.env[id.toUpperCase() + '_MODEL'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return [...new Set([...mine, ...DEFAULT_MODELS[id]])];
};

const PROVIDERS = {
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: () => process.env.GROQ_API_KEY,
    models: () => modelList('groq'),
    maxTokens: 2000, // Groq's free tier counts prompt + max_tokens against its tokens-per-minute limit
    extra: model => (/gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {}),
  },
  gemini: {
    name: 'Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    key: () => process.env.GEMINI_API_KEY,
    models: () => modelList('gemini'),
    // Gemini's hidden "thinking" tokens count against max_tokens. With a big schedule the default thinking can use the
    // whole budget before a single word of the answer is written (finish_reason "length", empty text).
    maxTokens: 6000,
    extra: () => ({ reasoning_effort: 'low' }),
  },
};

export const defaultProvider = () => {
  const pref = (process.env.AI_PROVIDER || 'groq').toLowerCase();
  return PROVIDERS[pref] ? pref : 'groq';
};

// For the UI switch: every provider, whether it has a key, and which model it runs.
export const listProviders = () =>
  Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, model: p.models()[0], models: p.models(), available: !!p.key() }));

// Chosen (or default) provider first, then any other provider that has a key.
export function providerOrder(pref) {
  const first = PROVIDERS[pref] ? pref : defaultProvider();
  return [first, ...Object.keys(PROVIDERS).filter(k => k !== first)]
    .filter(k => PROVIDERS[k]?.key())
    .map(k => PROVIDERS[k]);
}

/* ---------- schedule-change tool ---------- */
export const TOOL_NAME = 'usulkan_perubahan_jadwal';
export const MAX_ACTIONS = 20;
const TOOLS = [{
  type: 'function',
  function: {
    name: TOOL_NAME,
    description: 'Usulkan perubahan jadwal: tambah, ubah, atau hapus kegiatan. Perubahan TIDAK langsung diterapkan; pengguna harus menyetujui tiap usulan.',
    parameters: {
      type: 'object',
      properties: {
        aksi: {
          type: 'array',
          description: `Daftar usulan, maksimal ${MAX_ACTIONS}.`,
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: ['tambah', 'ubah', 'hapus'] },
              ref: { type: 'string', description: 'Nomor kegiatan dari data (mis. "#12"). Wajib untuk ubah dan hapus.' },
              judul: { type: 'string' },
              tanggal: { type: 'string', description: 'Format YYYY-MM-DD' },
              mulai: { type: 'string', description: 'Jam mulai HH:MM (24 jam). Isi HANYA jika pengguna menyebut jamnya (mis. "jam 10" -> 10:00). Kosongkan jika hanya hari yang disebut.' },
              selesai: { type: 'string', description: 'Jam selesai HH:MM (24 jam). Isi hanya jika pengguna menyebut jam selesai, durasi, atau rentang. Jika tidak ada jam mulai, ini dipakai sebagai jam tenggat. Jangan mengarang.' },
              ulangi: { type: 'string', description: 'JANGAN isi kecuali kegiatan itu memang rutin/berulang; kalau bukan, hilangkan field ini. Nilai: harian | hari_kerja | mingguan | bulanan | kustom. Hanya untuk "tambah" yang rutin/berulang. harian=tiap hari, hari_kerja=Senin-Jumat, mingguan=tiap minggu di hari tanggal itu, bulanan=tiap bulan di tanggal itu, kustom=pakai "hari". Dibuat sebagai SATU seri, jangan buat banyak usulan.' },
              hari: { type: 'array', items: { type: 'string' }, description: 'Untuk ulangi=kustom: hari-harinya, mis. ["senin","selasa","jumat"].' },
              sampai: { type: 'string', description: 'Tanggal akhir pengulangan YYYY-MM-DD. Kosongkan jika tidak ada batas akhir (kegiatan terus berjalan). Untuk "ubah" seri: tanggal akhir yang baru.' },
              kategori: { type: 'string', description: 'Nama kategori yang sudah ada' },
              status: { type: 'string', enum: ['rencana', 'selesai', 'tunda', 'batal'] },
              catatan: { type: 'string' },
              alasan: { type: 'string', description: 'Alasan singkat usulan ini' },
            },
            required: ['op'],
          },
        },
      },
      required: ['aksi'],
    },
  },
}];

const OPS = ['tambah', 'ubah', 'hapus'];
const STATUSES = ['rencana', 'selesai', 'tunda', 'batal'];
const text = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : undefined);
function clock(v) {
  const m = String(v ?? '').trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return undefined;
  return m[1].padStart(2, '0') + ':' + m[2];
}

// Shape check only. The browser resolves refs against the real schedule and the server validates again on save.
export function parseActions(argsText) {
  let obj;
  try { obj = JSON.parse(argsText || '{}'); } catch { return []; }
  const list = Array.isArray(obj?.aksi) ? obj.aksi : Array.isArray(obj) ? obj : [];
  const out = [];
  for (const a of list) {
    const op = String(a?.op ?? '').toLowerCase();
    if (!OPS.includes(op)) continue;
    const item = { op };
    const set = (k, v) => { if (v !== undefined && v !== '') item[k] = v; };
    set('ref', String(a.ref ?? a.id ?? '').replace(/^#/, '').trim().slice(0, 64));
    set('judul', text(a.judul, 120));
    set('tanggal', /^\d{4}-\d{2}-\d{2}$/.test(a.tanggal) ? a.tanggal : undefined);
    set('mulai', clock(a.mulai));
    set('selesai', clock(a.selesai));
    set('ulangi', ['harian', 'hari_kerja', 'mingguan', 'bulanan', 'kustom'].includes(a.ulangi) ? a.ulangi : undefined);
    if (Array.isArray(a.hari)) item.hari = a.hari.map(v => text(String(v), 12)).filter(Boolean).slice(0, 7);
    set('sampai', /^\d{4}-\d{2}-\d{2}$/.test(a.sampai) ? a.sampai : undefined);
    set('kategori', text(a.kategori, 40));
    set('status', STATUSES.includes(a.status) ? a.status : undefined);
    if (typeof a.catatan === 'string') item.catatan = a.catatan.trim().slice(0, 2000);
    set('alasan', text(a.alasan, 200));
    out.push(item);
    if (out.length >= MAX_ACTIONS) break;
  }
  return out;
}

/* ---------- streaming ---------- */
const MAX_ATTEMPTS = 4; // requests per question across all models and providers (keeps us inside the function's time limit)
const HEADER_TIMEOUT = Number(process.env.AI_HEADER_TIMEOUT_MS) || 15_000; // a model that never answers is skipped

// A model that just failed is skipped for a while (per server instance), so a model whose daily quota is gone does not
// cost a wasted request on every single question.
const cooling = new Map();
const coolKey = (p, model) => p.name + ':' + model;
const isCooling = (p, model) => (cooling.get(coolKey(p, model)) || 0) > Date.now();
const cool = (p, model, ms) => cooling.set(coolKey(p, model), Date.now() + ms);

// "Please retry in 23h7m21.1s" (Gemini) or "Please try again in 7m12.5s" (Groq) -> milliseconds
export function waitFrom(text) {
  const m = /(?:retry in|try again in)\s+([0-9hms.]+)/i.exec(text || '');
  if (!m) return 60_000;
  let ms = 0;
  for (const [, n, unit] of m[1].matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) ms += Number(n) * { h: 3_600_000, m: 60_000, s: 1000, ms: 1 }[unit];
  return Math.min(Math.max(ms, 5000), 12 * 3_600_000);
}

// One request to one model. Returns { response } or { error, stopProvider }.
async function tryModel(p, model, messages, signal, useTools) {
  const ctl = new AbortController();
  signal?.addEventListener('abort', () => ctl.abort(), { once: true });
  const send = extra => {
    const timer = setTimeout(() => ctl.abort(), HEADER_TIMEOUT);
    return fetch(p.url, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.key() },
      body: JSON.stringify({
        model, messages, stream: true, temperature: 0.4, max_tokens: p.maxTokens || 2000,
        ...(useTools ? { tools: TOOLS, tool_choice: 'auto' } : {}),
        ...extra,
      }),
    }).finally(() => clearTimeout(timer));
  };
  let r;
  try {
    const extra = p.extra ? p.extra(model) : {};
    r = await send(extra);
    if (r.status === 400 && Object.keys(extra).length) { // a model that rejects the tuning parameter: retry once without it
      console.warn(`[ai] ${p.name}/${model} rejected ${Object.keys(extra).join(',')}, retrying without it`);
      await r.body?.cancel().catch(() => {});
      r = await send({});
    }
  } catch (e) {
    if (signal?.aborted) throw e;
    cool(p, model, 30_000);
    console.warn(`[ai] ${p.name}/${model} no response`);
    return { error: { status: 502, code: 'upstream', message: `Tidak bisa menghubungi ${p.name}.` } };
  }
  if (r.ok) return { response: r };

  const detail = await r.text().catch(() => '');
  const s = r.status;
  console.warn(`[ai] ${p.name}/${model} ${s}: ${detail.slice(0, 300)}`);
  if (s === 429) cool(p, model, waitFrom(detail));
  else if (s === 404) cool(p, model, 6 * 3_600_000); // model retired or not available to this account
  else if (s === 413) cool(p, model, 30_000);
  else if (s >= 500 || s === 408) cool(p, model, 30_000);
  const error = s === 429 ? { status: 429, code: 'rate_limited', message: `Batas pemakaian gratis ${p.name} tercapai. Coba lagi sebentar lagi.` }
    : s === 413 ? { status: 413, code: 'too_large', message: 'Data jadwal terlalu besar untuk model ini. Coba pertanyaan yang lebih spesifik.' }
    : s === 401 || s === 403 ? { status: 502, code: 'bad_key', message: `API key ${p.name} ditolak. Periksa kembali key-nya.` }
    : s === 400 ? { status: 400, code: 'bad_request', message: `${p.name} menolak permintaan ini.` }
    : { status: 502, code: 'upstream', message: `${p.name} sedang bermasalah (${s}).` };
  return { error, stopProvider: s === 401 || s === 403 }; // a bad key is the same for every model of that provider
}

// Walks providers (chosen one first) and, inside each, its models, until one answers.
// Returns { response, provider, model } or { error }.
export async function openStream(messages, signal, pref, useTools = false) {
  const providers = providerOrder(pref);
  if (!providers.length) return { error: { status: 503, code: 'no_key', message: 'API key AI belum diatur di server (GROQ_API_KEY atau GEMINI_API_KEY).' } };
  let last, attempts = 0;
  outer: for (const p of providers) {
    const models = p.models().filter(m => !isCooling(p, m));
    if (!models.length) { last ||= { status: 429, code: 'rate_limited', message: `Batas pemakaian gratis ${p.name} tercapai. Coba lagi sebentar lagi.` }; continue; }
    for (const model of models) {
      if (attempts++ >= MAX_ATTEMPTS) break outer;
      const res = await tryModel(p, model, messages, signal, useTools);
      if (res.response) return { response: res.response, provider: p.name, model };
      last = res.error;
      if (res.stopProvider) break;
    }
  }
  // every model refused the tool request: answer as plain chat so questions still work
  if (useTools && last?.status === 400) return openStream(messages, signal, pref, false);
  return { error: last };
}

// Reads the provider's SSE stream. Text deltas go to onText; tool-call fragments are collected.
// Returns { finish, calls: [{name, args}] }.
export async function pumpStream(response, onText) {
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = '', finish = null;
  const calls = [];
  const handle = data => {
    let choice;
    try { choice = JSON.parse(data).choices?.[0]; } catch { return; } // keep-alive / partial lines
    if (!choice) return;
    const d = choice.delta;
    if (d?.content) onText(d.content);
    for (const tc of d?.tool_calls || []) {
      // OpenAI/Groq send an index and stream the arguments in pieces; Gemini may omit the index.
      let i = tc.index;
      if (i === undefined) i = tc.function?.name || !calls.length ? calls.length : calls.length - 1;
      const c = (calls[i] ||= { name: '', args: '' });
      if (tc.function?.name) c.name = tc.function.name;
      if (tc.function?.arguments) c.args += tc.function.arguments;
    }
    if (choice.finish_reason) finish = choice.finish_reason;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data !== '[DONE]') handle(data);
    }
  }
  return { finish, calls: calls.filter(Boolean) };
}
