// Cron endpoint: sends Telegram reminders for events that start soon. Call it every minute from an external cron
// (e.g. cron-job.org) with the header  Authorization: Bearer <CRON_SECRET>.  Add ?dry=1 to see what would be sent
// without sending anything. It does not use the login cookie: the secret is the only way in.
import crypto from 'node:crypto';
import { route, send, HttpError } from '../lib/http.js';
import { store } from '../lib/store.js';

const TZ = process.env.APP_TIMEZONE || 'Asia/Jakarta';
const DEFAULT_LEAD = Math.min(120, Math.max(1, Number(process.env.REMIND_MINUTES) || 10)); // used until the bell in the app was set once
const SENT_KEY = 'tg_sent';
const LEAD_KEY = 'notify_lead'; // set by the bell menu in the app (api/notify.js): 0 = off

// "now" in the user's time zone (the server runs in UTC)
function nowLocal() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
const addDay = (date, n) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const dow = date => new Date(date + 'T00:00:00Z').getUTCDay();
const mins = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// the event (or the matching occurrence of a recurring one) on a given date, or null. Mirrors the browser's expandSeries.
function onDate(e, date) {
  const r = e.repeat;
  if (!r) return e.date === date ? e : null;
  if (date < e.date || (r.until && date > r.until) || (r.skip || []).includes(date)) return null;
  const ok = r.freq === 'monthly' ? date.slice(8) === e.date.slice(8) : (r.days || []).includes(dow(date));
  return ok ? { ...e, status: (r.st && r.st[date]) || 'rencana' } : null;
}

function authorised(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) throw new HttpError(503, 'CRON_SECRET belum diatur di Environment Variables.', 'no_secret');
  const a = Buffer.from(String(req.headers.authorization || ''));
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function telegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) throw new HttpError(503, 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diatur.', 'no_telegram');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    let d = ''; try { d = (await r.json()).description || ''; } catch { /* ignore */ }
    throw new HttpError(502, `Telegram menolak pesan (${r.status}) ${d}`.trim(), 'telegram');
  }
}

export default route(['GET', 'POST'], async (req, res) => {
  if (!authorised(req)) throw new HttpError(401, 'Tidak diizinkan', 'unauthorized');
  const dry = /[?&]dry=1\b/.test(req.url || '');
  const { date: today, min: nowM } = nowLocal();
  const { events, cats } = await store().getState();
  const catName = id => (cats || []).find(c => c.id === id)?.label || '';
  const sent = (await store().getSetting(SENT_KEY)) || {};
  const chosen = await store().getSetting(LEAD_KEY);
  const LEAD = Number.isInteger(chosen) && chosen >= 0 ? chosen : DEFAULT_LEAD;
  if (LEAD === 0) return send(res, 200, { sent: 0, due: [], off: true }); // reminders switched off in the app

  const due = [];
  for (const [offset, d] of [[0, today], [1440, addDay(today, 1)]]) { // tomorrow too, for reminders just after midnight
    for (const base of events || []) {
      if (base.del || !base.title) continue;
      const e = onDate(base, d);
      if (!e || e.status !== 'rencana') continue;
      const t = e.start || e.end; // a start time, or only an end time = a deadline
      if (!t) continue;
      const left = offset + mins(t) - nowM;
      if (left <= 0 || left > LEAD) continue;
      const key = `${d}|${base.id}|${e.start || ''}|${e.end || ''}`;
      if (sent[key]) continue;
      due.push({ e, t, left, key, cat: catName(e.cat) });
    }
  }
  due.sort((a, b) => a.left - b.left || a.e.title.localeCompare(b.e.title));
  if (!due.length || dry) return send(res, 200, { now: `${today} ${String(Math.floor(nowM / 60)).padStart(2, '0')}:${String(nowM % 60).padStart(2, '0')}`, sent: 0, due: due.map(x => `${x.t} ${x.e.title}`), dry });

  let text;
  if (due.length === 1) {
    const { e, t, left, cat } = due[0];
    const when = `${e.start || e.end}${e.start && e.end ? '–' + e.end : ''}`;
    text = `⏰ ${e.start ? 'Mulai' : 'Tenggat'} ${left} menit lagi\n${e.title}\n${when}${cat ? ' · ' + cat : ''}`;
  } else {
    const lines = due.slice(0, 6).map(({ e, t }) => `• ${t}${e.start ? '' : ' (tenggat)'} ${e.title}`);
    if (due.length > 6) lines.push(`+${due.length - 6} lainnya`);
    text = `⏰ ${due.length} kegiatan segera dimulai\n${lines.join('\n')}`;
  }
  await telegram(text); // if this throws nothing is marked as sent, so the next minute tries again

  due.forEach(x => { sent[x.key] = 1; });
  const keep = addDay(today, -1);
  for (const k of Object.keys(sent)) if (k.slice(0, 10) < keep) delete sent[k]; // forget old days
  await store().setSetting(SENT_KEY, sent);
  send(res, 200, { sent: due.length, due: due.map(x => `${x.t} ${x.e.title}`) });
});
