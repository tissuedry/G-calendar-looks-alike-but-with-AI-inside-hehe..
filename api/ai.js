// GET lists the AI providers for the switch.
// POST streams the answer as NDJSON lines: {type:'text',text}, then optionally {type:'actions',actions:[...]}.
// POST body: {system, messages:[{role,content}], provider?: 'groq'|'gemini'}.
// The model can only PROPOSE schedule changes; the browser applies them after the user confirms.
import { route, send, readJson, HttpError } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { openStream, pumpStream, parseActions, listProviders, defaultProvider, TOOL_NAME, MAX_ACTIONS } from '../lib/ai.js';

const MAX_SYSTEM = 60_000, MAX_MSG = 4_000, MAX_TURNS = 12;

// notes appended to the stream by the server itself, in the language the user picked
const NOTE = {
  id: {
    unreadable: 'AI mencoba mengusulkan perubahan, tapi formatnya tidak terbaca. Coba ulangi dengan kalimat yang lebih jelas.',
    truncated: 'Jawaban terpotong. Coba minta lebih ringkas.',
    dropped: 'Koneksi ke AI terputus.',
    exhausted: 'Model kehabisan batas jawaban sebelum sempat menjawab (biasanya karena jadwal besar). Coba pilih penyedia AI lain atau tanyakan hal yang lebih spesifik.',
  },
  en: {
    unreadable: 'The AI tried to propose changes, but the format could not be read. Try again with a clearer sentence.',
    truncated: 'The answer was cut off. Try asking for a shorter one.',
    dropped: 'The connection to the AI was lost.',
    exhausted: 'The model ran out of its answer budget before it could reply (usually because the schedule is large). Try another AI provider or ask something more specific.',
  },
};

export default route(['GET', 'POST'], async (req, res) => {
  requireAuth(req);
  if (req.method === 'GET') return send(res, 200, { providers: listProviders(), default: defaultProvider() });

  const { system, messages, provider: pref, lang, tools } = await readJson(req);
  const note = NOTE[lang === 'en' ? 'en' : 'id'];
  if (typeof system !== 'string' || !Array.isArray(messages) || !messages.length) throw new HttpError(400, 'Permintaan tidak valid');
  const turns = messages.slice(-MAX_TURNS)
    .filter(m => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MSG) }));
  if (!turns.length || turns[turns.length - 1].role !== 'user') throw new HttpError(400, 'Pesan terakhir harus dari pengguna');

  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort(); });

  const msgs = [{ role: 'system', content: system.slice(0, MAX_SYSTEM) }, ...turns];
  const provider = typeof pref === 'string' ? pref : undefined;
  // the browser leaves the schedule tool out for ordinary questions (tools === false)
  const first = await openStream(msgs, ctl.signal, provider, tools !== false);
  if (first.error) return send(res, first.error.status, { error: first.error.message, code: first.error.code });

  // headers go out with the first write. The answer can come from a retry, so they are set lazily.
  let source = first, started = false;
  const begin = () => {
    if (started) return;
    started = true;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-AI-Provider', source.provider);
    res.setHeader('X-AI-Model', source.model);
  };
  const emit = o => { begin(); res.write(JSON.stringify(o) + '\n'); };
  try {
    let anyText = false;
    const onText = t => { anyText = true; emit({ type: 'text', text: t }); };
    let { finish, calls } = await pumpStream(first.response, onText);
    let proposals = calls.filter(c => c.name === TOOL_NAME);
    let actions = proposals.flatMap(c => parseActions(c.args)).slice(0, MAX_ACTIONS);
    if (!actions.length && proposals.length && !anyText) {
      // The model reached for the schedule tool but gave nothing usable and not a word of text. That is most likely an
      // ordinary question, so answer it as plain chat instead of showing an error.
      const again = await openStream(msgs, ctl.signal, provider, false);
      if (again.response) {
        source = again;
        ({ finish, calls } = await pumpStream(again.response, onText));
        proposals = [];
      }
    }
    if (actions.length) emit({ type: 'actions', actions });
    else if (proposals.length) emit({ type: 'text', text: `\n\n*(${note.unreadable})*` });
    // "length" with nothing written means the model spent its whole budget thinking; with some text it was really cut off
    if (finish === 'length') emit({ type: 'text', text: `\n\n*(${anyText || actions.length ? note.truncated : note.exhausted})*` });
  } catch (e) {
    if (!ctl.signal.aborted) emit({ type: 'text', text: `\n\n*(${note.dropped})*` });
  }
  begin();
  res.end();
});
