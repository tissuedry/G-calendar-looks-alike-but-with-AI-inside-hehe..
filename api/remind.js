// Cron endpoint for the Telegram messages. Call it every minute from an external cron (e.g. cron-job.org) with the header
//   Authorization: Bearer <CRON_SECRET>.   Add ?dry=1 to see what would be sent without sending anything.
// It sends (1) a morning summary of today's events (DIGEST_TIME, default 05:30) and (2) a reminder before each event,
// in three steps (30, 15 and 5 minutes before by default). This is separate from the bell in the web app, which only controls
// the browser notifications. It does not use the login cookie: the secret is the only way in.
import crypto from 'node:crypto';
import { route, send, HttpError } from '../lib/http.js';
import { store } from '../lib/store.js';

const TZ = process.env.APP_TIMEZONE || 'Asia/Jakarta';
// minutes before the start at which a reminder is sent (REMIND_STEPS="30,15,5"), largest first
const STEPS = [...new Set((process.env.REMIND_STEPS || '30,15,5').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= 240))].sort((a, b) => b - a);
const SENT_KEY = 'tg_sent';
const DIGEST_TIME = (process.env.DIGEST_TIME || '05:30').trim(); // 'HH:MM' in TZ, or 'off'
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

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
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dayName = date => { const [y, m, d] = date.split('-').map(Number); return `${DAYS[dow(date)]}, ${d} ${MONTHS[m - 1]} ${y}`; };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

// the event (or the matching occurrence of a recurring one) on a given date, or null. Mirrors the browser's expandSeries / expandSpan.
function onDate(e, date) {
  const r = e.repeat;
  if (!r) {
    if (e.endDate && e.endDate > e.date) { // several days: the start time is on the first day, the end time on the last
      if (date < e.date || date > e.endDate) return null;
      return { ...e, dayNo: daysBetween(e.date, date) + 1, dayN: daysBetween(e.date, e.endDate) + 1, start: date === e.date ? e.start : '', end: date === e.endDate ? e.end : '' };
    }
    return e.date === date ? e : null;
  }
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
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    let d = ''; try { d = (await r.json()).description || ''; } catch { /* ignore */ }
    throw new HttpError(502, `Telegram menolak pesan (${r.status}) ${d}`.trim(), 'telegram');
  }
}

// the morning summary: everything planned today, by time; untimed ones at the end
function digestText(today, events, catName) {
  const items = [];
  for (const base of events || []) {
    if (base.del || !base.title) continue;
    const e = onDate(base, today);
    if (!e || e.status !== 'rencana') continue;
    const when = e.start ? `${e.start}${e.end ? '–' + e.end : ''}` : e.end ? `tenggat ${e.end}` : 'tanpa jam';
    const sortKey = e.start ? mins(e.start) : e.end ? mins(e.end) : 2000;
    const cat = catName(e.cat);
    items.push({ sortKey, line: `• ${when} · ${e.title}${e.dayN ? ` (hari ${e.dayNo}/${e.dayN})` : ''}${cat ? ' · ' + cat : ''}` });
  }
  items.sort((a, b) => a.sortKey - b.sortKey);
  const head = `📅 ${dayName(today)}`;
  if (!items.length) return { text: `${head}\nHari ini tidak ada kegiatan.`, n: 0 };
  const lines = items.slice(0, 40).map(x => x.line);
  if (items.length > 40) lines.push(`+${items.length - 40} lainnya`);
  return { text: `${head}\n${items.length} kegiatan hari ini\n\n${lines.join('\n')}`, n: items.length };
}

export default route(['GET', 'POST'], async (req, res) => {
  if (!authorised(req)) throw new HttpError(401, 'Tidak diizinkan', 'unauthorized');
  const dry = /[?&]dry=1\b/.test(req.url || '');
  const { date: today, min: nowM } = nowLocal();
  const { events, cats } = await store().getState();
  const catName = id => (cats || []).find(c => c.id === id)?.label || '';
  const sent = (await store().getSetting(SENT_KEY)) || {};
  const out = { now: `${today} ${hhmm(nowM)}`, steps: STEPS, sent: 0, due: [], dry };
  let changed = false;
  const save = async () => { // forget old days, then store which messages were already sent
    const keep = addDay(today, -1);
    for (const k of Object.keys(sent)) if (k.slice(0, 10) < keep) delete sent[k];
    await store().setSetting(SENT_KEY, sent);
    changed = false;
  };

  // 1) summary of today, once per day, from DIGEST_TIME on. If nothing ran at that time (cron created later, outage), it goes out on the first run after it.
  const dKey = `${today}|digest`;
  if (/^\d{2}:\d{2}$/.test(DIGEST_TIME) && !sent[dKey] && nowM >= mins(DIGEST_TIME)) {
    const d = digestText(today, events, catName);
    out.digest = d.n;
    if (dry) out.preview = d.text;
    if (!dry) { await telegram(d.text); sent[dKey] = 1; changed = true; out.sent++; }
  }

  // 2) reminders at each step before an event starts
  const due = [];
  for (const [offset, d] of [[0, today], [1440, addDay(today, 1)]]) { // tomorrow too, for reminders just after midnight
    for (const base of events || []) {
      if (base.del || !base.title) continue;
      const e = onDate(base, d);
      if (!e || e.status !== 'rencana') continue;
      const t = e.start || e.end; // a start time, or only an end time = a deadline
      if (!t) continue;
      const left = offset + mins(t) - nowM;
      if (left <= 0 || !STEPS.length || left > STEPS[0]) continue;
      // the step we are in = the smallest one that is still >= the time left. Only that one is sent; the bigger ones are
      // marked done too, so an event made 10 minutes before the start gets one reminder, not three.
      const step = [...STEPS].reverse().find(s => left <= s);
      const id = `${d}|${base.id}|${e.start || ''}|${e.end || ''}`;
      if (sent[`${id}|${step}`]) continue;
      due.push({ e, t, left, keys: STEPS.filter(s => s >= step).map(s => `${id}|${s}`), cat: catName(e.cat) });
    }
  }
  due.sort((a, b) => a.left - b.left || a.e.title.localeCompare(b.e.title));
  out.due = due.map(x => `${x.t} ${x.e.title}`);

  if (due.length && !dry) {
    let text;
    if (due.length === 1) {
      const { e, left, cat } = due[0];
      const when = `${e.start || e.end}${e.start && e.end ? '–' + e.end : ''}`;
      text = `⏰ ${e.start ? 'Mulai' : 'Tenggat'} ${left} menit lagi\n${e.title}\n${when}${cat ? ' · ' + cat : ''}`;
    } else {
      const lines = due.slice(0, 6).map(({ e, t, left }) => `• ${t}${e.start ? '' : ' (tenggat)'} ${e.title} · ${left} menit lagi`);
      if (due.length > 6) lines.push(`+${due.length - 6} lainnya`);
      text = `⏰ ${due.length} kegiatan segera dimulai\n${lines.join('\n')}`;
    }
    try {
      await telegram(text); // if this throws nothing is marked as sent, so the next minute tries again
      due.forEach(x => x.keys.forEach(k => { sent[k] = 1; }));
      changed = true; out.sent += due.length;
    } finally {
      if (changed) await save(); // keeps the summary's mark even when the reminder failed
    }
  }

  if (changed) await save();
  send(res, 200, out);
});
