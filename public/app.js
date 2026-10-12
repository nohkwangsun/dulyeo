// Dulyeo client: create mp3 on the server, keep it on the device, play it in the background.
const $ = (id) => document.getElementById(id);
const audio = $('audio');

/* ---------- small helpers ---------- */
const store = {
  get: (k, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const apiUrl = (path) => (store.get('server').replace(/\/$/, '') || '') + path;
const authHeaders = () => (store.get('token') ? { Authorization: `Bearer ${store.get('token')}` } : {});

/* ---------- IndexedDB (tracks with their mp3 blobs) ---------- */
const db = new Promise((resolve, reject) => {
  const req = indexedDB.open('dulyeo', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('tracks', { keyPath: 'id' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function tx(mode, fn) {
  const d = await db;
  return new Promise((resolve, reject) => {
    const t = d.transaction('tracks', mode);
    const r = fn(t.objectStore('tracks'));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
  });
}
const putTrack = (t) => tx('readwrite', (s) => s.put(t));
const getTrack = (id) => tx('readonly', (s) => s.get(id));
const delTrack = (id) => tx('readwrite', (s) => s.delete(id));
const allTracks = () => tx('readonly', (s) => s.getAll());

/* ---------- tabs & library ---------- */
function showTab(name) {
  for (const b of document.querySelectorAll('nav button')) b.classList.toggle('active', b.dataset.tab === name);
  $('tab-library').hidden = name !== 'library';
  $('tab-create').hidden = name !== 'create';
  if (name === 'library') renderLibrary();
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

async function renderLibrary() {
  const tracks = (await allTracks()).sort((a, b) => b.createdAt - a.createdAt);
  const ul = $('tracks');
  ul.replaceChildren();
  $('empty').hidden = tracks.length > 0;
  for (const t of tracks) {
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = '<div class="name"></div><div class="muted"></div>';
    meta.firstChild.textContent = t.title;
    meta.lastChild.textContent = `${fmt(t.duration)} · ${t.optionsLabel}`;
    meta.addEventListener('click', () => openTrack(t.id));
    const del = document.createElement('button');
    del.textContent = '삭제';
    del.addEventListener('click', async () => {
      if (confirm(`"${t.title}" 삭제할까요?`)) { await delTrack(t.id); localStorage.removeItem('pos:' + t.id); renderLibrary(); }
    });
    li.append(meta, del);
    ul.append(li);
  }
}

/* ---------- create ---------- */
const FIELDS = ['voice', 'unit', 'repeat', 'gap'];
for (const f of FIELDS) { const v = store.get('f:' + f); if (v) $(f).value = v; $(f).addEventListener('change', () => store.set('f:' + f, $(f).value)); }
$('shadow').checked = store.get('f:shadow') === '1';
$('shadow').addEventListener('change', () => store.set('f:shadow', $('shadow').checked ? '1' : '0'));
for (const f of ['server', 'token']) { $(f).value = store.get(f); $(f).addEventListener('input', () => store.set(f, $(f).value)); }

fetch(apiUrl('/api/voices'), { headers: authHeaders() }).then((r) => r.json()).then((voices) => {
  const saved = store.get('f:voice');
  $('voice').replaceChildren(...voices.map((v) => new Option(v.label, v.id, false, v.id === saved)));
}).catch(() => { $('voice').replaceChildren(new Option('en-US-AriaNeural', 'en-US-AriaNeural')); });

$('paste').addEventListener('click', async () => {
  try { $('script').value = await navigator.clipboard.readText(); }
  catch { $('status').textContent = '클립보드 권한이 없어요. 입력창에 길게 눌러 직접 붙여넣어 주세요.'; }
});
$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (f) { $('script').value = await f.text(); if (!$('title').value) $('title').value = f.name.replace(/\.\w+$/, ''); }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

$('make').addEventListener('click', async () => {
  const markdown = $('script').value.trim();
  if (!markdown) { $('status').textContent = '스크립트를 입력해 주세요.'; return; }
  const options = { unit: $('unit').value, repeat: +$('repeat').value, gap: +$('gap').value, shadow: $('shadow').checked };
  $('make').disabled = true;
  try {
    $('status').textContent = '요청 중…';
    let r = await fetch(apiUrl('/api/jobs'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ markdown, voice: $('voice').value, options }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `서버 오류 ${r.status}`);
    const { id } = await r.json();

    for (;;) {
      await sleep(700);
      r = await fetch(apiUrl(`/api/jobs/${id}`), { headers: authHeaders() });
      const job = await r.json();
      if (job.status === 'error') throw new Error(job.error);
      if (job.status === 'done') break;
      $('status').textContent = job.total ? `음성 생성 중… ${job.done}/${job.total} 문장` : '준비 중…';
    }

    $('status').textContent = '내려받는 중…';
    const [meta, mp3] = await Promise.all([
      fetch(apiUrl(`/api/jobs/${id}/timeline`), { headers: authHeaders() }).then((x) => x.json()),
      fetch(apiUrl(`/api/jobs/${id}/audio`), { headers: authHeaders() }).then((x) => { if (!x.ok) throw new Error('mp3 다운로드 실패'); return x.blob(); }),
    ]);
    const first = meta.units[0]?.text || 'Untitled';
    const o = meta.options;
    const track = {
      id, createdAt: Date.now(), title: $('title').value.trim() || first.slice(0, 40),
      duration: meta.duration, timeline: meta.timeline, units: meta.units, blob: mp3,
      optionsLabel: `${o.unit === 'paragraph' ? '문단' : '문장'} ×${o.repeat}${o.shadow ? ' · 쉐도잉' : ''}`,
    };
    await putTrack(track);
    $('status').textContent = '';
    $('script').value = ''; $('title').value = '';
    showTab('library');
    openTrack(id);
  } catch (err) {
    $('status').textContent = `실패: ${err.message}`;
  } finally {
    $('make').disabled = false;
  }
});

/* ---------- player ---------- */
let track = null;
let objectUrl = '';
let firstStarts = [];          // start time of each unit's first play
let seeking = false;

const entryAt = (t) => {
  const tl = track.timeline;
  let lo = 0, hi = tl.length - 1, ans = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (tl[mid].start <= t + 0.05) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return tl[ans];
};

async function openTrack(id) {
  track = await getTrack(id);
  if (!track) return;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(track.blob);
  audio.src = objectUrl;
  firstStarts = [];
  for (const e of track.timeline) if (e.rep === 0) firstStarts[e.unit] = e.start;
  $('p-title').textContent = track.title;
  $('player').hidden = false;
  $('speed').value = store.get('speed', '1');
  audio.playbackRate = +$('speed').value;
  audio.preservesPitch = true;
  const pos = +store.get('pos:' + id, '0');
  audio.addEventListener('loadedmetadata', () => { if (pos && pos < audio.duration - 2) audio.currentTime = pos; render(); }, { once: true });
  setupMediaSession();
  audio.play().catch(() => {});
}

function render() {
  if (!track) return;
  const t = audio.currentTime, d = audio.duration || track.duration;
  const e = entryAt(t);
  $('p-text').textContent = track.units[e.unit].text;
  $('cur').textContent = fmt(t); $('dur').textContent = fmt(d);
  if (!seeking) { $('seek').max = d; $('seek').value = t; }
  $('play').textContent = audio.paused ? '▶' : '⏸';
}

let lastSave = 0;
audio.addEventListener('timeupdate', () => {
  if (!track) return;
  if ($('hold').checked) {
    const e = entryAt(audio.currentTime);
    if (audio.currentTime >= e.end) audio.currentTime = e.start;
  }
  render();
  if ('mediaSession' in navigator && audio.duration) {
    try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate }); } catch { /* unsupported */ }
  }
  if (Date.now() - lastSave > 5000) { lastSave = Date.now(); store.set('pos:' + track.id, audio.currentTime); }
});
for (const ev of ['play', 'pause']) audio.addEventListener(ev, render);
audio.addEventListener('ended', () => { if (track) store.set('pos:' + track.id, 0); render(); });

const togglePlay = () => (audio.paused ? audio.play() : audio.pause());
const jump = (dt) => { audio.currentTime = Math.min(Math.max(0, audio.currentTime + dt), audio.duration || 1e9); };
function prevUnit() {
  const e = entryAt(audio.currentTime);
  const startOfUnit = firstStarts[e.unit];
  audio.currentTime = audio.currentTime - startOfUnit > 2 || e.unit === 0 ? startOfUnit : firstStarts[e.unit - 1];
}
function nextUnit() {
  const e = entryAt(audio.currentTime);
  if (e.unit + 1 < firstStarts.length) audio.currentTime = firstStarts[e.unit + 1];
}

$('play').addEventListener('click', togglePlay);
$('back').addEventListener('click', () => jump(-10));
$('fwd').addEventListener('click', () => jump(10));
$('prev').addEventListener('click', prevUnit);
$('next').addEventListener('click', nextUnit);
$('speed').addEventListener('change', () => { audio.playbackRate = +$('speed').value; store.set('speed', $('speed').value); });
$('loop').addEventListener('change', () => { audio.loop = $('loop').checked; });
$('seek').addEventListener('input', () => { seeking = true; $('cur').textContent = fmt($('seek').value); });
$('seek').addEventListener('change', () => { audio.currentTime = +$('seek').value; seeking = false; });
$('close').addEventListener('click', () => { audio.pause(); $('player').hidden = true; });

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: 'Dulyeo', album: 'English listening',
    artwork: [{ src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml' }] });
  const handlers = {
    play: () => audio.play(), pause: () => audio.pause(),
    previoustrack: prevUnit, nexttrack: nextUnit,
    seekbackward: (d) => jump(-(d.seekOffset || 10)), seekforward: (d) => jump(d.seekOffset || 10),
    seekto: (d) => { audio.currentTime = d.seekTime; },
  };
  for (const [action, fn] of Object.entries(handlers)) {
    try { navigator.mediaSession.setActionHandler(action, fn); } catch { /* action unsupported */ }
  }
}

document.addEventListener('keydown', (e) => {
  if ($('player').hidden || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.code === 'ArrowLeft') prevUnit();
  if (e.code === 'ArrowRight') nextUnit();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
renderLibrary();
