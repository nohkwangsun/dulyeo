import { Clipboard } from '@capacitor/clipboard';
import { $, h, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { segmented, stepper, bindSwitch } from '../ui/controls.js';
import { parseScript } from '../lib/text.js';
import { buildAudio } from '../lib/build.js';
import { duration } from '../lib/mp3.js';
import { estimateSeconds, formatEstimate } from '../lib/estimate.js';
import { PRESETS, presetOptions, optionsLabel } from '../lib/presets.js';
import { putTrack, withClipCache } from '../lib/db.js';
import { settings, saveSettings, engineIssue, buildEngine } from '../settings.js';

let ctx;
let controls = {};

const options = () => presetOptions(settings().preset, settings().custom);

export function initCreate(c) {
  ctx = c;
  $('paste').append(icon('paste', 20), '붙여넣기');
  $('file-btn').prepend(icon('file', 20), '파일 열기');
  $('banner-icon').append(icon('info', 22));
  renderPresets();

  controls.unit = segmented($('unit-seg'), [{ id: 'sentence', label: '문장' }, { id: 'paragraph', label: '문단' }], settings().custom.unit, (unit) => patchCustom({ unit }));
  controls.repeat = stepper($('repeat-step'), { min: 1, max: 10, step: 1, value: settings().custom.repeat, format: (v) => `${v}번`, label: '반복 횟수' }, (repeat) => patchCustom({ repeat }));
  controls.gap = stepper($('gap-step'), { min: 0, max: 5, step: 0.2, value: settings().custom.gap, format: (v) => `${v.toFixed(1)}초`, label: '간격' }, (gap) => patchCustom({ gap }));
  controls.shadow = bindSwitch($('shadow-switch'), settings().custom.shadow, (shadow) => patchCustom({ shadow }));
  syncCustomPanel();

  const refresh = debounce(updateScriptInfo, 200);
  $('script').addEventListener('input', () => { $('script-error').hidden = true; refresh(); });
  $('clear').addEventListener('click', () => { $('script').value = ''; updateScriptInfo(); $('script').focus(); });
  $('paste').addEventListener('click', pasteFromClipboard);
  $('file').addEventListener('change', openFile);
  $('file-btn').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
  $('make').addEventListener('click', make);
  $('pg-cancel').addEventListener('click', () => abort?.abort());
  window.addEventListener('dulyeo:settings', updateBanner);
}

/** Called whenever the Create tab is shown. */
export function showCreate() {
  updateBanner();
  updateScriptInfo();
}

export function loadIntoEditor({ markdown, title }) {
  $('script').value = markdown;
  $('title').value = title;
  updateScriptInfo();
}

/* ---------- presets & custom options ---------- */
function renderPresets() {
  $('presets').replaceChildren(...PRESETS.map((p) => h('button', {
    type: 'button', class: `preset${p.id === 'custom' ? ' wide' : ''}`, role: 'radio', 'aria-checked': String(settings().preset === p.id),
    onclick: () => {
      saveSettings({ preset: p.id }); renderPresets(); syncCustomPanel(); updateScriptInfo();
      if (p.id === 'custom') $('custom-panel').scrollIntoView({ block: 'center', behavior: 'smooth' });   // the panel opens below the fold
    },
  }, h('b', {}, p.name), h('span', {}, p.desc))));
}
function syncCustomPanel() { $('custom-panel').hidden = settings().preset !== 'custom'; }
function patchCustom(patch) { saveSettings({ custom: { ...settings().custom, ...patch } }); updateScriptInfo(); }

/* ---------- script input ---------- */
function updateScriptInfo() {
  const text = $('script').value;
  $('clear').hidden = !text;
  const paragraphs = parseScript(text);
  if (!paragraphs.length) {
    $('script-stats').textContent = text.trim() ? '읽을 문장이 없어요' : '비어 있음';
    $('make-sub').textContent = '';
    return;
  }
  const sentences = paragraphs.reduce((n, p) => n + p.sentences.length, 0);
  $('script-stats').textContent = `${sentences}문장 · ${paragraphs.length}문단`;
  $('make-sub').textContent = `예상 길이 ${formatEstimate(estimateSeconds(paragraphs, options()))}`;
}

function updateBanner() {
  const issue = engineIssue();
  $('engine-banner').hidden = !issue;
  $('banner-msg').textContent = issue ?? '';
}

async function pasteFromClipboard() {
  try {
    const { value, type } = await Clipboard.read();
    if (!value || !String(type || 'text/plain').startsWith('text')) throw new Error('no text');
    $('script').value = value;
    $('script-error').hidden = true;
    updateScriptInfo();
    toast('붙여넣었어요');
  } catch {
    toast('클립보드에서 텍스트를 읽지 못했어요. 입력창을 길게 눌러 직접 붙여넣어 주세요.', { kind: 'error', duration: 5000 });
  }
}

async function openFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  $('script').value = await f.text();
  if (!$('title').value) $('title').value = f.name.replace(/\.\w+$/, '');
  e.target.value = '';
  updateScriptInfo();
}

/* ---------- build ---------- */
let abort = null;

function showProgress(on) {
  $('progress').hidden = !on;
  if (on) setProgress(0, 0);
}
function setProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  $('pg-bar').style.width = `${pct}%`;
  document.querySelector('#progress .bar').setAttribute('aria-valuenow', String(pct));
  $('pg-text').textContent = total ? `음성 생성 중… ${done}/${total} 문장` : '준비 중…';
}

async function make() {
  const markdown = $('script').value.trim();
  const fail = (msg) => { $('script-error').textContent = msg; $('script-error').hidden = false; $('script').focus(); };
  if (!markdown) return fail('스크립트를 입력해 주세요.');
  const paragraphs = parseScript(markdown);
  if (!paragraphs.length) return fail('읽을 영어 문장을 찾지 못했어요.');
  const issue = engineIssue();
  if (issue) { updateBanner(); toast(issue, { kind: 'error', duration: 5000 }); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }

  $('make').disabled = true;
  abort = new AbortController();
  let wake;
  try {
    const engine = withClipCache(buildEngine());
    wake = await navigator.wakeLock?.request('screen').catch(() => null);   // keep generating while the screen is on
    showProgress(true);
    const result = await buildAudio({
      paragraphs, options: options(), synth: engine.synth, concurrency: engine.concurrency, signal: abort.signal,
      onProgress: setProgress,
    });
    const id = crypto.randomUUID();
    await putTrack({
      id, createdAt: Date.now(), title: $('title').value.trim() || (result.units[0]?.text ?? 'Untitled').slice(0, 40),
      markdown, duration: duration(result.mp3), timeline: result.timeline, units: result.units,
      blob: new Blob([result.mp3], { type: 'audio/mpeg' }),
      options: result.options, optionsLabel: optionsLabel(result.options),
    });
    $('script').value = ''; $('title').value = '';
    updateScriptInfo();
    showProgress(false);
    ctx.go('library');
    ctx.player.open(id);
  } catch (err) {
    showProgress(false);
    if (err.name === 'AbortError') toast('만들기를 취소했어요');
    else toast(`만들지 못했어요: ${err.message}`, { kind: 'error', duration: 7000 });
  } finally {
    wake?.release?.();
    abort = null;
    $('make').disabled = false;
  }
}
