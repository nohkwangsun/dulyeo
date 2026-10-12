// Dulyeo client: build mp3 on the phone, keep it on the device, play it in the background.
import './style.css';
import { registerSW } from './lib/sw.js';
import { parseScript } from './lib/text.js';
import { buildAudio } from './lib/build.js';
import { duration } from './lib/mp3.js';
import { putTrack, getTrack, delTrack, allTracks, withClipCache } from './lib/db.js';
import { azureEngine, AZURE_VOICES } from './lib/engines/azure.js';
import { systemEngine, getPlugin } from './lib/engines/system.js';
import { MediaSession } from '@jofr/capacitor-media-session';
import { Clipboard } from '@capacitor/clipboard';

const $ = (id) => document.getElementById(id);
const audio = $('audio');

/* ---------- small helpers ---------- */
const store = {
  get: (k, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/* ---------- tabs & library ---------- */
function showTab(name) {
  for (const b of document.querySelectorAll('nav button')) b.classList.toggle('active', b.dataset.tab === name);
  $('tab-library').hidden = name !== 'library';
  $('tab-create').hidden = name !== 'create';
  if (name === 'library') renderLibrary();
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

let libraryOrder = [];       // track ids in the order shown; "auto-play next" follows it

async function renderLibrary() {
  const tracks = (await allTracks()).sort((a, b) => b.createdAt - a.createdAt);
  libraryOrder = tracks.map((t) => t.id);
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
    const edit = document.createElement('button');
    edit.textContent = '편집';
    edit.disabled = !t.markdown;
    edit.addEventListener('click', () => { $('script').value = t.markdown; $('title').value = t.title; showTab('create'); });
    const del = document.createElement('button');
    del.textContent = '삭제';
    del.addEventListener('click', async () => {
      if (confirm(`"${t.title}" 삭제할까요?`)) { await delTrack(t.id); localStorage.removeItem('pos:' + t.id); renderLibrary(); }
    });
    li.append(meta, edit, del);
    ul.append(li);
  }
}

/* ---------- create ---------- */
const nativePlugin = getPlugin();           // only inside the Android app
const FIELDS = ['engine', 'azureKey', 'azureRegion', 'azureVoice', 'unit', 'repeat', 'gap'];
for (const f of FIELDS) { const v = store.get('f:' + f); if (v) $(f).value = v; $(f).addEventListener('change', () => store.set('f:' + f, $(f).value)); }
$('shadow').checked = store.get('f:shadow') === '1';
$('shadow').addEventListener('change', () => store.set('f:shadow', $('shadow').checked ? '1' : '0'));

$('azure-keys').open = !store.get('f:azureKey');   // first run: show where to enter the key
$('azureVoice').replaceChildren(...AZURE_VOICES.map((v) => new Option(v.label, v.id)));
$('azureVoice').value = store.get('f:azureVoice') || AZURE_VOICES[0].id;

if (!nativePlugin) {
  $('engine').querySelector('option[value=system]').disabled = true;
  if ($('engine').value === 'system') $('engine').value = 'azure';
}
async function loadSystemVoices() {
  if (!nativePlugin) return;
  try {
    const { voices } = await nativePlugin.getVoices();
    const saved = store.get('f:systemVoice');
    $('systemVoice').replaceChildren(new Option('기본 음성', ''), ...voices.map((v) => new Option(`${v.name} (${v.lang})${v.offline ? '' : ' · 온라인'}`, v.id, false, v.id === saved)));
  } catch { /* plugin not ready */ }
}
$('systemVoice').addEventListener('change', () => store.set('f:systemVoice', $('systemVoice').value));
$('ttsSettings').addEventListener('click', () => nativePlugin?.openTtsSettings());
function syncEngineUi() {
  const sys = $('engine').value === 'system';
  $('azure-box').hidden = sys;
  $('system-box').hidden = !sys;
}
$('engine').addEventListener('change', syncEngineUi);
syncEngineUi();
loadSystemVoices();

function currentEngine() {
  if ($('engine').value === 'system') return systemEngine({ voice: $('systemVoice').value });
  return azureEngine({ key: $('azureKey').value, region: $('azureRegion').value, voice: $('azureVoice').value });
}

$('paste').addEventListener('click', async () => {
  try {
    const { value, type } = await Clipboard.read();
    if (!value || !String(type || 'text/plain').startsWith('text')) throw new Error('no text');
    $('script').value = value;
  }
  catch { $('status').textContent = '클립보드에서 텍스트를 읽지 못했어요. 입력창을 길게 눌러 직접 붙여넣어 주세요.'; }
});
$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (f) { $('script').value = await f.text(); if (!$('title').value) $('title').value = f.name.replace(/\.\w+$/, ''); }
});

$('make').addEventListener('click', async () => {
  const markdown = $('script').value.trim();
  if (!markdown) { $('status').textContent = '스크립트를 입력해 주세요.'; return; }
  const options = { unit: $('unit').value, repeat: +$('repeat').value, gap: +$('gap').value, shadow: $('shadow').checked };
  $('make').disabled = true;
  let wake;
  try {
    const paragraphs = parseScript(markdown);
    if (!paragraphs.length) throw new Error('읽을 문장이 없습니다.');
    const engine = withClipCache(currentEngine());
    wake = await navigator.wakeLock?.request('screen').catch(() => null);   // keep generating while the screen is on
    $('status').textContent = '준비 중…';
    const result = await buildAudio({
      paragraphs, options, synth: engine.synth, concurrency: engine.concurrency,
      onProgress: (done, total) => { $('status').textContent = `음성 생성 중… ${done}/${total} 문장 (화면을 켜 두세요)`; },
    });
    const first = result.units[0]?.text || 'Untitled';
    const o = result.options;
    await putTrack({
      id: crypto.randomUUID(), createdAt: Date.now(), title: $('title').value.trim() || first.slice(0, 40),
      markdown, duration: duration(result.mp3), timeline: result.timeline, units: result.units,
      blob: new Blob([result.mp3], { type: 'audio/mpeg' }),
      optionsLabel: `${o.unit === 'paragraph' ? '문단' : '문장'} ×${o.repeat}${o.shadow ? ' · 쉐도잉' : ''}`,
    });
    $('status').textContent = '';
    $('script').value = ''; $('title').value = '';
    showTab('library');
    const newest = (await allTracks()).sort((a, b) => b.createdAt - a.createdAt)[0];
    openTrack(newest.id);
  } catch (err) {
    $('status').textContent = `실패: ${err.message}`;
  } finally {
    wake?.release?.();
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
  audio.addEventListener('loadedmetadata', () => { if (pos && pos < trackDuration() - 2) audio.currentTime = pos; render(); }, { once: true });
  setupMediaSession();
  audio.play().catch(() => {});
}

// Some engines report Infinity/NaN for a moment while a blob loads; the saved length is always right.
const trackDuration = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : track.duration);

function render() {
  if (!track) return;
  const t = audio.currentTime, d = trackDuration();
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
  const d = trackDuration();
  MediaSession.setPositionState({ duration: d, position: Math.min(audio.currentTime, d), playbackRate: audio.playbackRate }).catch(() => {});
  if (Date.now() - lastSave > 5000) { lastSave = Date.now(); store.set('pos:' + track.id, audio.currentTime); }
});
for (const ev of ['play', 'pause']) audio.addEventListener(ev, () => {
  render();
  // 'pause' fires right before 'ended'; keep the notification/foreground service alive when another track follows
  if (audio.ended && nextTrackId()) return;
  MediaSession.setPlaybackState({ playbackState: audio.paused ? 'paused' : 'playing' }).catch(() => {});
});
const nextTrackId = () => {
  if (!track || !$('auto').checked || $('loop').checked) return null;
  return libraryOrder[libraryOrder.indexOf(track.id) + 1] ?? null;
};
audio.addEventListener('ended', () => {
  if (!track) return;
  store.set('pos:' + track.id, 0);
  const next = nextTrackId();
  if (next) openTrack(next); else render();
});

const togglePlay = () => (audio.paused ? audio.play() : audio.pause());
const jump = (dt) => { audio.currentTime = Math.min(Math.max(0, audio.currentTime + dt), trackDuration()); };
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
$('auto').checked = store.get('f:auto', '1') === '1';
$('auto').addEventListener('change', () => store.set('f:auto', $('auto').checked ? '1' : '0'));
$('seek').addEventListener('input', () => { seeking = true; $('cur').textContent = fmt($('seek').value); });
$('seek').addEventListener('change', () => { audio.currentTime = +$('seek').value; seeking = false; });
$('close').addEventListener('click', () => { audio.pause(); $('player').hidden = true; });

function setupMediaSession() {
  MediaSession.setMetadata({ title: track.title, artist: 'Dulyeo', album: 'English listening',
    artwork: [{ src: new URL('icon.svg', location.href).href, sizes: '512x512', type: 'image/svg+xml' }] }).catch(() => {});
  const handlers = {
    play: () => audio.play(), pause: () => audio.pause(),
    previoustrack: prevUnit, nexttrack: nextUnit,
    seekbackward: (d) => jump(-(d?.seekOffset || 10)), seekforward: (d) => jump(d?.seekOffset || 10),
    seekto: (d) => { audio.currentTime = d.seekTime; },
  };
  for (const [action, fn] of Object.entries(handlers)) MediaSession.setActionHandler({ action }, fn).catch(() => {});
}

document.addEventListener('keydown', (e) => {
  if ($('player').hidden || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.code === 'ArrowLeft') prevUnit();
  if (e.code === 'ArrowRight') nextUnit();
});

registerSW();
renderLibrary();
