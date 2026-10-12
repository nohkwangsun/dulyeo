// Full-screen player (script view + transport) and the mini player. One <audio> element for everything.
import { MediaSession } from '@jofr/capacitor-media-session';
import { $, h, fmtTime } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { getTrack, allTracks } from '../lib/db.js';
import { getPos, setPos } from '../lib/position.js';
import { mediaMetadata } from '../lib/media.js';
import { settings, saveSettings } from '../settings.js';

const SPEEDS = [0.7, 0.8, 0.9, 1, 1.2, 1.5];
const audio = $('audio');

// A speed saved by an older build (0.6, 1.25 …) may not be a chip any more: use the closest one.
const nearestSpeed = (v) => SPEEDS.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), SPEEDS[0]);

let track = null;
let objectUrl = '';
let firstStarts = [];     // start time of each unit's first play
let repsOf = [];          // how many times each unit plays
let lines = [];           // transcript elements by unit
let queue = [];           // track ids in library order, for "next track"
let expanded = false;
let seeking = false;
let lastUnit = -1;
let userScrollUntil = 0;  // don't fight the user's own scrolling
let lastSave = 0;

const notify = () => window.dispatchEvent(new CustomEvent('dulyeo:player'));
export const currentId = () => track?.id ?? null;
export const isPlaying = () => Boolean(track) && !audio.paused;

/* ---------- helpers ---------- */
const trackDuration = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : track.duration);

function entryAt(t) {
  const tl = track.timeline;
  let lo = 0, hi = tl.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tl[mid].start <= t + 0.05) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return tl[ans];
}

function nextTrackId() {
  if (!track || !settings().autoNext || audio.loop) return null;
  return queue[queue.indexOf(track.id) + 1] ?? null;
}

/* ---------- open / close ---------- */
export async function open(id, { expand = true } = {}) {
  const t = await getTrack(id);
  if (!t) { toast('트랙을 찾지 못했어요.', { kind: 'error' }); return; }
  track = t;

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(t.blob);
  audio.src = objectUrl;
  audio.playbackRate = nearestSpeed(settings().speed);
  audio.preservesPitch = true;

  firstStarts = []; repsOf = [];
  for (const e of t.timeline) {
    if (e.rep === 0) firstStarts[e.unit] = e.start;
    repsOf[e.unit] = (repsOf[e.unit] ?? 0) + 1;
  }
  buildTranscript();
  $('p-title').textContent = t.title;
  $('mini-title').textContent = t.title;
  $('mini').hidden = false;
  document.body.classList.add('has-mini');
  syncSpeedChips();
  syncPills();

  const pos = getPos(id);
  audio.addEventListener('loadedmetadata', () => {
    if (pos && pos < trackDuration() - 2) audio.currentTime = pos;
    render(true);
  }, { once: true });
  lastUnit = -1;
  render(true);
  setupMediaSession();
  queue = (await allTracks()).sort((a, b) => b.createdAt - a.createdAt).map((x) => x.id);
  if (expand) setExpanded(true);
  audio.play().catch(() => { /* needs a tap: the play button is right there */ });
  notify();
}

export function stopIfCurrent(id) {
  if (track?.id !== id) return;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  track = null;
  $('mini').hidden = true;
  document.body.classList.remove('has-mini');
  setExpanded(false);
  MediaSession.setPlaybackState({ playbackState: 'none' }).catch(() => {});
  notify();
}

function setExpanded(open, fromPop = false) {
  if (open === expanded) return;
  expanded = open;
  $('player').hidden = !open;
  if (open && !fromPop) history.pushState({ dulyeoPlayer: true }, '');     // so the Android back button collapses us
  if (!open && !fromPop && history.state?.dulyeoPlayer) history.back();
  if (open) requestAnimationFrame(() => scrollToCurrent(true));
}

/* ---------- transcript ---------- */
function buildTranscript() {
  lines = track.units.map((u, i) => {
    const gapAfter = track.units[i + 1] && track.units[i + 1].paragraph !== u.paragraph;
    return h('p', {
      class: `line${gapAfter ? ' gap-after' : ''}`, role: 'button', tabindex: '0', 'aria-label': `${i + 1}번째: ${u.text}`,
      onclick: () => seekToUnit(i),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seekToUnit(i); } },
    }, u.text);
  });
  $('transcript').replaceChildren(...lines);
  $('transcript').scrollTop = 0;
}

function scrollToCurrent(instant) {
  const el = lines[lastUnit];
  if (!el) return;
  const box = $('transcript');
  const top = box.scrollTop + (el.getBoundingClientRect().top - box.getBoundingClientRect().top) - box.clientHeight / 2 + el.clientHeight / 2;
  box.scrollTo({ top: Math.max(0, top), behavior: instant ? 'auto' : 'smooth' });
}

for (const ev of ['touchstart', 'wheel', 'pointerdown']) {
  $('transcript').addEventListener(ev, () => { userScrollUntil = Date.now() + 4000; }, { passive: true });
}

/* ---------- rendering ---------- */
function render(force = false) {
  if (!track) return;
  const t = audio.currentTime, d = trackDuration();
  const e = entryAt(t);

  if (e.unit !== lastUnit || force) {
    lines[lastUnit]?.classList.remove('current');
    lines[e.unit]?.classList.add('current');
    lastUnit = e.unit;
    $('mini-sub').textContent = track.units[e.unit].text;
    if (expanded && Date.now() > userScrollUntil) scrollToCurrent(false);
  }

  const total = repsOf[e.unit] ?? 1;
  const inGap = t >= e.end - 0.02;
  const bits = [];
  if (total > 1) bits.push(`반복 ${e.rep + 1}/${total}`);
  if (inGap && track.options?.shadow) bits.push('따라 말해 보세요');
  $('rep').textContent = bits.join(' · ');

  $('cur').textContent = fmtTime(t);
  $('dur').textContent = fmtTime(d);
  if (!seeking) {
    $('seek').max = d;
    $('seek').value = t;
    $('seek').style.setProperty('--pct', `${Math.min(100, (t / d) * 100)}%`);
  }
  $('mini-bar').style.width = `${Math.min(100, (t / d) * 100)}%`;

  const paused = audio.paused;
  $('play').replaceChildren(icon(paused ? 'play' : 'pause', 34));
  $('play').setAttribute('aria-label', paused ? '재생' : '일시정지');
  $('mini-play').replaceChildren(icon(paused ? 'play' : 'pause', 24));
  $('mini-play').setAttribute('aria-label', paused ? '재생' : '일시정지');
  $('mini-eq').classList.toggle('playing', !paused);
}

/* ---------- transport ---------- */
const togglePlay = () => (audio.paused ? audio.play().catch(() => {}) : audio.pause());
const jump = (dt) => { audio.currentTime = Math.min(Math.max(0, audio.currentTime + dt), trackDuration()); };

function seekToUnit(i) {
  audio.currentTime = firstStarts[i] ?? 0;
  audio.play().catch(() => {});
}
function prevUnit() {
  const e = entryAt(audio.currentTime);
  const start = firstStarts[e.unit];
  audio.currentTime = audio.currentTime - start > 2 || e.unit === 0 ? start : firstStarts[e.unit - 1];
}
function nextUnit() {
  const e = entryAt(audio.currentTime);
  if (e.unit + 1 < firstStarts.length) audio.currentTime = firstStarts[e.unit + 1];
}

audio.addEventListener('timeupdate', () => {
  if (!track) return;
  if ($('hold').getAttribute('aria-pressed') === 'true') {
    const e = entryAt(audio.currentTime);
    if (audio.currentTime >= e.end) audio.currentTime = e.start;
  }
  render();
  const d = trackDuration();
  MediaSession.setPositionState({ duration: d, position: Math.min(audio.currentTime, d), playbackRate: audio.playbackRate }).catch(() => {});
  if (Date.now() - lastSave > 5000) { lastSave = Date.now(); setPos(track.id, audio.currentTime); }
});

for (const ev of ['play', 'pause']) {
  audio.addEventListener(ev, () => {
    render();
    notify();
    // 'pause' fires right before 'ended'; keep the notification/foreground service alive when another track follows
    if (audio.ended && nextTrackId()) return;
    MediaSession.setPlaybackState({ playbackState: audio.paused ? 'paused' : 'playing' }).catch(() => {});
  });
}

audio.addEventListener('ended', () => {
  if (!track) return;
  setPos(track.id, 0);
  const next = nextTrackId();
  if (next) open(next, { expand: expanded }); else render();
});

audio.addEventListener('error', () => {
  if (track) toast('이 트랙을 재생하지 못했어요. 다시 만들어 보세요.', { kind: 'error', duration: 5000 });
});

/* ---------- controls ---------- */
function syncSpeedChips() {
  const cur = nearestSpeed(settings().speed);
  $('speeds').replaceChildren(...SPEEDS.map((v) => h('button', {
    class: 'chip', role: 'radio', 'aria-checked': String(v === cur), 'aria-label': `${v}배속`,
    onclick: () => { saveSettings({ speed: v }); audio.playbackRate = v; syncSpeedChips(); },
  }, `${v}×`)));
}

function syncPills() {
  $('loop').replaceChildren(icon('repeat', 18), '전체 반복');
  $('hold').replaceChildren(icon('repeatOne', 18), '문장 고정');
  $('auto').replaceChildren(icon('queue', 18), '다음 트랙');
  $('auto').setAttribute('aria-pressed', String(settings().autoNext));
}
const togglePill = (btn) => {
  const on = btn.getAttribute('aria-pressed') !== 'true';
  btn.setAttribute('aria-pressed', String(on));
  return on;
};

function setupMediaSession() {
  MediaSession.setMetadata(mediaMetadata(track)).catch(() => {});
  const handlers = {
    play: () => audio.play(), pause: () => audio.pause(),
    previoustrack: prevUnit, nexttrack: nextUnit,
    seekbackward: (d) => jump(-(d?.seekOffset || 10)), seekforward: (d) => jump(d?.seekOffset || 10),
    seekto: (d) => { audio.currentTime = d.seekTime; },
  };
  for (const [action, fn] of Object.entries(handlers)) MediaSession.setActionHandler({ action }, fn).catch(() => {});
}

export function initPlayer() {
  $('close').append(icon('down', 28));
  $('prev').append(icon('prev', 26));
  $('back').append(icon('back10', 30));
  $('fwd').append(icon('fwd10', 30));
  $('next').append(icon('next', 26));
  syncPills();
  syncSpeedChips();

  $('play').addEventListener('click', togglePlay);
  $('mini-play').addEventListener('click', togglePlay);
  $('back').addEventListener('click', () => jump(-10));
  $('fwd').addEventListener('click', () => jump(10));
  $('prev').addEventListener('click', prevUnit);
  $('next').addEventListener('click', nextUnit);
  $('close').addEventListener('click', () => setExpanded(false));
  $('mini-open').addEventListener('click', () => setExpanded(true));
  $('loop').addEventListener('click', (e) => { audio.loop = togglePill(e.currentTarget); });
  $('hold').addEventListener('click', (e) => togglePill(e.currentTarget));
  $('auto').addEventListener('click', (e) => saveSettings({ autoNext: togglePill(e.currentTarget) }));
  $('seek').addEventListener('input', () => { seeking = true; $('cur').textContent = fmtTime($('seek').value); $('seek').style.setProperty('--pct', `${($('seek').value / $('seek').max) * 100}%`); });
  $('seek').addEventListener('change', () => { audio.currentTime = +$('seek').value; seeking = false; });

  window.addEventListener('popstate', () => { if (expanded) setExpanded(false, true); });
  window.addEventListener('dulyeo:settings', syncPills);
  document.addEventListener('keydown', (e) => {
    if (!expanded || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowLeft') prevUnit();
    if (e.code === 'ArrowRight') nextUnit();
    if (e.code === 'Escape') setExpanded(false);
  });
}
