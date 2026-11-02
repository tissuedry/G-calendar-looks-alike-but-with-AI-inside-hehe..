// Local server: serves public/ and runs api/*.js the same way Vercel does. Usage: npm run dev
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (no extra dependency).
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* no .env, fine */ }

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const PORT = Number(process.env.PORT) || 3000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const api = url.pathname.match(/^\/api\/([\w-]+)\/?$/);
  if (api) {
    const file = path.join(root, 'api', api[1] + '.js');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
    req.query = Object.fromEntries(url.searchParams);
    const mod = await import(pathToFileURL(file).href);
    return mod.default(req, res);
  }
  let file = path.normalize(path.join(root, 'public', decodeURIComponent(url.pathname)));
  if (!file.startsWith(path.join(root, 'public'))) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  const ai = [process.env.GROQ_API_KEY && 'Groq', process.env.GEMINI_API_KEY && 'Gemini'].filter(Boolean).join(' + ') || 'belum ada API key';
  console.log(`Agenda Saya berjalan di http://localhost:${PORT}`);
  console.log(`  Penyimpanan: ${process.env.DATABASE_URL ? 'Postgres (DATABASE_URL)' : '.data/db.json'} · AI: ${ai} · Login: ${process.env.APP_PASSWORD ? 'aktif' : 'nonaktif'}`);
});
