// dulyeo server: static PWA + job API (script -> mp3). No framework, no database.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseScript } from './text.js';
import { buildAudio, normalizeOptions } from './build.js';
import { getProvider, VOICES } from './providers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const CACHE = path.join(DATA, 'cache');
const OUT = path.join(DATA, 'out');
const TOKEN = process.env.ACCESS_TOKEN || '';
const PORT = Number(process.env.PORT) || 8787;
const MAX_CHARS = 60000;
for (const d of [CACHE, OUT]) fs.mkdirSync(d, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg' };

const jobs = new Map();
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');

/** Wrap a provider so each sentence is synthesized once and reused across rebuilds. */
function cachedSynth(provider) {
  return async (sentence, w) => {
    const file = path.join(CACHE, sha(`${provider.id}\n${sentence}`) + '.mp3');
    try { return await fs.promises.readFile(file); } catch { /* miss */ }
    const buf = await provider.synth(sentence, w);
    await fs.promises.writeFile(file, buf);
    return buf;
  };
}

async function runJob(job, body) {
  try {
    const paragraphs = parseScript(body.markdown);
    if (!paragraphs.length) throw new Error('읽을 문장이 없습니다.');
    const provider = await getProvider(body.voice);
    const result = await buildAudio({
      paragraphs, options: body.options, synth: cachedSynth(provider),
      onProgress: (done, total) => { job.done = done; job.total = total; },
    });
    await fs.promises.writeFile(path.join(OUT, `${job.id}.mp3`), result.mp3);
    await fs.promises.writeFile(path.join(OUT, `${job.id}.json`),
      JSON.stringify({ timeline: result.timeline, units: result.units, options: result.options, duration: result.mp3.length / 6000 }));
    job.status = 'done';
  } catch (err) {
    job.status = 'error';
    job.error = err.message;
    console.error('job failed:', err);
  }
}

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const sendJson = (res, code, obj) => send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json' });

function authorized(req, url) {
  if (!TOKEN) return true;
  const header = req.headers.authorization || '';
  return header === `Bearer ${TOKEN}` || url.searchParams.get('token') === TOKEN;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 1e6) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let start = 0, end = st.size - 1, code = 200;
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    if (range && (range[1] || range[2])) {
      if (range[1]) { start = +range[1]; if (range[2]) end = Math.min(+range[2], end); }
      else { start = Math.max(0, st.size - +range[2]); }
      if (start > end) return send(res, 416, '', { 'Content-Range': `bytes */${st.size}` });
      code = 206; headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(code, headers);
    fs.createReadStream(file, { start, end }).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);

    if (p.startsWith('/api/')) {
      if (!authorized(req, url)) return sendJson(res, 401, { error: 'unauthorized' });

      if (p === '/api/ping') return sendJson(res, 200, { ok: true });
      if (p === '/api/voices') return sendJson(res, 200, VOICES);

      if (p === '/api/jobs' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        if (typeof body.markdown !== 'string' || !body.markdown.trim()) return sendJson(res, 400, { error: '텍스트가 비어 있습니다.' });
        if (body.markdown.length > MAX_CHARS) return sendJson(res, 400, { error: `텍스트가 너무 깁니다 (최대 ${MAX_CHARS}자).` });
        const job = { id: crypto.randomUUID(), status: 'running', done: 0, total: 0 };
        jobs.set(job.id, job);
        runJob(job, { markdown: body.markdown, voice: body.voice, options: normalizeOptions(body.options) });
        return sendJson(res, 202, { id: job.id });
      }

      const m = p.match(/^\/api\/jobs\/([0-9a-f-]{36})(?:\/(audio|timeline))?$/);
      if (m) {
        const [, id, what] = m;
        const job = jobs.get(id);
        if (!what) return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: 'unknown job' });
        if (job?.status !== 'done') return sendJson(res, 409, { error: 'not ready' });
        return what === 'audio'
          ? serveFile(req, res, path.join(OUT, `${id}.mp3`))
          : serveFile(req, res, path.join(OUT, `${id}.json`));
      }
      return sendJson(res, 404, { error: 'not found' });
    }

    const rel = p === '/' ? 'index.html' : p.slice(1);
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
    serveFile(req, res, file);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`dulyeo listening on http://localhost:${PORT}${TOKEN ? ' (token required for /api)' : ''}`);
  if (process.env.TTS_PROVIDER === 'fake') console.log('TTS_PROVIDER=fake: using test tones, not speech');
});
