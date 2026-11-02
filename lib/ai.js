// OpenAI-compatible chat streaming for Groq and Google AI Studio (Gemini), with automatic fallback.
// The model gets one tool, `usulkan_perubahan_jadwal`. It can only PROPOSE changes: nothing is written
// until the user presses "Terapkan" in the browser.

const PROVIDERS = {
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: () => process.env.GROQ_API_KEY,
    model: () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    maxTokens: 2000, // Groq's free tier counts prompt + max_tokens against its tokens-per-minute limit
    extra: model => (/gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {}),
  },
  gemini: {
    name: 'Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    key: () => process.env.GEMINI_API_KEY,
    model: () => process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
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
  Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, model: p.model(), available: !!p.key() }));

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
              mulai: { type: 'string', description: 'Jam mulai HH:MM (24 jam)' },
              selesai: { type: 'string', description: 'Jam selesai HH:MM (24 jam)' },
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
// Status codes worth retrying on the next provider: too large, rate limited, upstream down.
const RETRYABLE = new Set([408, 413, 429, 500, 502, 503, 504]);

export async function openStream(messages, signal, pref, useTools = false) {
  const providers = providerOrder(pref);
  if (!providers.length) return { error: { status: 503, code: 'no_key', message: 'API key AI belum diatur di server (GROQ_API_KEY atau GEMINI_API_KEY).' } };
  let last;
  for (const p of providers) {
    let r;
    try {
      const send = extra => fetch(p.url, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.key() },
        body: JSON.stringify({
          model: p.model(), messages, stream: true, temperature: 0.4, max_tokens: p.maxTokens || 2000,
          ...(useTools ? { tools: TOOLS, tool_choice: 'auto' } : {}),
          ...extra,
        }),
      });
      const extra = p.extra ? p.extra(p.model()) : {};
      r = await send(extra);
      if (r.status === 400 && Object.keys(extra).length) { // a model that rejects the tuning parameter: retry once without it
        console.warn(`[ai] ${p.name} rejected ${Object.keys(extra).join(',')}, retrying without it`);
        await r.body?.cancel().catch(() => {});
        r = await send({});
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      last = { status: 502, code: 'upstream', message: `Tidak bisa menghubungi ${p.name}.` };
      continue;
    }
    if (r.ok) return { response: r, provider: p.name };
    const detail = await r.text().catch(() => '');
    console.warn(`[ai] ${p.name} ${r.status}: ${detail.slice(0, 300)}`);
    last = r.status === 429 ? { status: 429, code: 'rate_limited', message: `Batas pemakaian gratis ${p.name} tercapai. Coba lagi sebentar lagi.` }
      : r.status === 413 ? { status: 413, code: 'too_large', message: 'Data jadwal terlalu besar untuk model ini. Coba pertanyaan yang lebih spesifik.' }
      : r.status === 401 || r.status === 403 ? { status: 502, code: 'bad_key', message: `API key ${p.name} ditolak. Periksa kembali key-nya.` }
      : r.status === 400 ? { status: 400, code: 'bad_request', message: `${p.name} menolak permintaan ini.` }
      : { status: 502, code: 'upstream', message: `${p.name} sedang bermasalah (${r.status}).` };
    // a 400 with tools usually means that model can't do tool calls: try the next provider
    if (!RETRYABLE.has(r.status) && !(r.status === 400 && useTools)) break;
  }
  // every provider refused the tool request: answer as plain chat so questions still work
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
