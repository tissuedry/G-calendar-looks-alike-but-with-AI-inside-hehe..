// Storage: Postgres (Supabase) when DATABASE_URL is set, otherwise a JSON file (local development only).
// The schema lives in supabase/migrations/ and is applied by you, the app never creates tables itself.
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http.js';

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const PALETTE = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'];
const STATUSES = ['rencana', 'selesai', 'tunda', 'batal'];
export const MAX_BATCH = 500;

/* ---------- validation ---------- */
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// A recurring item is stored once: {freq:'weekly'|'monthly', days:[0-6], until, skip:[dates], st:{date:status}}.
// The browser expands it into occurrences; the server only keeps the rule sane (bounded size and span).
function cleanRepeat(r, start) {
  if (typeof r !== 'object') throw new HttpError(400, 'Aturan pengulangan tidak valid');
  const freq = r.freq === 'monthly' ? 'monthly' : 'weekly';
  const days = freq === 'weekly'
    ? [...new Set((Array.isArray(r.days) ? r.days : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))]
    : [];
  if (freq === 'weekly' && !days.length) throw new HttpError(400, 'Pilih minimal satu hari pengulangan');
  const until = r.until ? r.until : ''; // empty = no end date, the activity just keeps going
  if (until && (!isDate(until) || until < start)) throw new HttpError(400, 'Tanggal akhir pengulangan harus setelah tanggal mulai');
  if (until && (Date.parse(until) - Date.parse(start)) / 864e5 > 800) throw new HttpError(400, 'Pengulangan maksimal 2 tahun');
  const skip = (Array.isArray(r.skip) ? r.skip : []).filter(isDate).slice(0, 400);
  const st = {};
  for (const [d, v] of Object.entries(r.st && typeof r.st === 'object' ? r.st : {}).slice(0, 800)) {
    if (isDate(d) && STATUSES.includes(v) && v !== 'rencana') st[d] = v;
  }
  return { freq, days, until, skip, st };
}

export function cleanEvent(e) {
  if (!e || typeof e !== 'object') throw new HttpError(400, 'Data kegiatan tidak valid');
  const id = str(e.id, 64);
  if (!id || !/^[\w-]+$/.test(id)) throw new HttpError(400, 'ID kegiatan tidak valid');
  // times are optional: none = all day, end only = a deadline, start requires end
  const start = e.start || '', end = e.end || '';
  if (!isDate(e.date) || (start && !isTime(start)) || (end && !isTime(end))) throw new HttpError(400, 'Tanggal/jam kegiatan tidak valid');
  // an event over several days (date..endDate): the start time belongs to the first day, the end time to the last
  if (e.endDate && !isDate(e.endDate)) throw new HttpError(400, 'Tanggal selesai tidak valid');
  if (e.endDate && e.endDate < e.date) throw new HttpError(400, 'Tanggal selesai harus sama atau setelah tanggal mulai');
  const multi = !!e.endDate && e.endDate > e.date && !e.repeat; // a recurring item cannot also span days
  if (multi && (Date.parse(e.endDate) - Date.parse(e.date)) / 864e5 > 365) throw new HttpError(400, 'Kegiatan beberapa hari maksimal 1 tahun');
  if (start && end && !multi && end <= start) throw new HttpError(400, 'Jam selesai harus setelah jam mulai');
  const title = str(e.title, 120).trim();
  if (!title) throw new HttpError(400, 'Judul kegiatan wajib diisi');
  const out = {
    id, title, date: e.date, start, end,
    cat: str(e.cat, 40),
    status: STATUSES.includes(e.status) ? e.status : 'rencana',
    notes: str(e.notes, 2000),
  };
  if (multi) out.endDate = e.endDate;
  if (e.repeat) out.repeat = cleanRepeat(e.repeat, e.date);
  if (e.groupId) out.groupId = str(e.groupId, 64);
  if (Number.isFinite(e.createdAt)) out.createdAt = e.createdAt;
  return out;
}

export function cleanCats(list) {
  if (!Array.isArray(list) || list.length > 50) throw new HttpError(400, 'Daftar kategori tidak valid');
  return list.map(c => {
    const id = str(c?.id, 40), label = str(c?.label, 30).trim();
    if (!id || !label) throw new HttpError(400, 'Kategori tidak valid');
    return { id, label, color: PALETTE.includes(c.color) ? c.color : 'p10' };
  });
}

/* ---------- postgres (Supabase) ---------- */
// Supabase pooler URLs may carry Prisma-style params that postgres.js would forward to the server as settings.
function connString() {
  try {
    const u = new URL(DB_URL);
    ['pgbouncer', 'supa', 'connection_limit', 'pool_timeout'].forEach(k => u.searchParams.delete(k));
    return u.toString();
  } catch { return DB_URL; }
}
const isLocalDb = () => /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(DB_URL);

let sqlRef = null;
async function pg() {
  if (!sqlRef) {
    const { default: postgres } = await import('postgres');
    sqlRef = postgres(connString(), {
      prepare: false,          // required by Supabase's transaction pooler (port 6543)
      max: 2,                  // serverless: keep few connections per instance
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: isLocalDb() ? false : 'require',
      onnotice: () => {},
    });
  }
  return sqlRef;
}

// Turns low-level driver errors into messages that tell you what to fix.
async function withDb(fn) {
  try {
    return await fn(await pg());
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error('[db]', e.code || '', e.message);
    if (e.code === '42P01') throw new HttpError(500, 'Tabel database belum ada. Jalankan migrasi supabase/migrations/20261102000000_init_agenda.sql di Supabase.', 'no_tables');
    if (['28P01', '28000', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'CONNECT_TIMEOUT', 'XX000'].includes(e.code) || /tenant or user not found/i.test(e.message || ''))
      throw new HttpError(500, 'Tidak bisa terhubung ke database. Periksa DATABASE_URL (pakai Transaction pooler dan password yang benar).', 'db_connect');
    throw e;
  }
}

const pgStore = {
  getState: () => withDb(async sql => {
    const [rows, cats] = await Promise.all([
      sql`SELECT id, data FROM events ORDER BY data->>'date', data->>'start'`,
      sql`SELECT value FROM settings WHERE key = 'cats'`,
    ]);
    return { events: rows.map(r => ({ ...r.data, id: r.id })), cats: cats[0]?.value ?? null };
  }),
  upsert: list => withDb(sql => sql`
    INSERT INTO events (id, data, updated_at)
    SELECT e->>'id', e - 'id', now() FROM jsonb_array_elements(${sql.json(list)}) AS e
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`),
  remove: ids => withDb(sql => sql`DELETE FROM events WHERE id IN ${sql(ids)}`),
  setCats: cats => withDb(sql => sql`
    INSERT INTO settings (key, value) VALUES ('cats', ${sql.json(cats)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`),
};

/* ---------- json file (local) ---------- */
const FILE = path.join(process.cwd(), '.data', 'db.json');
let queue = Promise.resolve();
async function readFile() {
  try { return JSON.parse(await fs.readFile(FILE, 'utf8')); }
  catch { return { events: {}, cats: null }; }
}
function mutate(fn) {
  const run = queue.then(async () => {
    const db = await readFile();
    fn(db);
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(db, null, 1));
  });
  queue = run.catch(() => {});
  return run;
}

const fileStore = {
  async getState() {
    const db = await readFile();
    return { events: Object.values(db.events), cats: db.cats };
  },
  upsert: list => mutate(db => list.forEach(e => { db.events[e.id] = e; })),
  remove: ids => mutate(db => ids.forEach(id => { delete db.events[id]; })),
  setCats: cats => mutate(db => { db.cats = cats; }),
};

export function store() {
  if (DB_URL) return pgStore;
  if (process.env.VERCEL) throw new HttpError(500, 'Database belum diatur. Isi DATABASE_URL (Supabase) di Environment Variables Vercel.', 'no_database');
  return fileStore;
}
