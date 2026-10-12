// All user settings in one JSON blob. Older builds kept loose keys ("f:azureKey" …); migrate them once
// so that updating the app does not make people re-enter their Azure key.
import { azureEngine, AZURE_VOICES } from './lib/engines/azure.js';
import { systemEngine, getPlugin } from './lib/engines/system.js';
import { DEFAULT_CUSTOM } from './lib/presets.js';

const KEY = 'dulyeo:settings';
const DEFAULTS = {
  engine: 'azure',
  azureKey: '', azureRegion: '', azureVoice: AZURE_VOICES[0].id,
  systemVoice: '',
  preset: 'repeat', custom: { ...DEFAULT_CUSTOM },
  autoNext: true, speed: 1,
};

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

function legacy() {
  const f = (k) => read('f:' + k);
  if (!f('azureKey') && !f('engine') && !f('repeat')) return null;
  const num = (v, d) => (Number.isFinite(+v) && v !== null ? +v : d);
  return {
    engine: f('engine') === 'system' ? 'system' : 'azure',
    azureKey: f('azureKey') ?? '', azureRegion: f('azureRegion') ?? '',
    azureVoice: f('azureVoice') || DEFAULTS.azureVoice, systemVoice: f('systemVoice') ?? '',
    custom: { unit: f('unit') === 'paragraph' ? 'paragraph' : 'sentence', repeat: num(f('repeat'), 2), gap: num(f('gap'), 0.8), shadow: f('shadow') === '1' },
    preset: 'custom',
    autoNext: f('auto') !== '0', speed: num(read('speed'), 1),
  };
}

let state;
export function settings() {
  if (state) return state;
  let saved = null;
  try { saved = JSON.parse(read(KEY) || 'null'); } catch { /* corrupt: fall back */ }
  state = { ...DEFAULTS, ...(saved ?? legacy() ?? {}) };
  state.custom = { ...DEFAULT_CUSTOM, ...state.custom };
  return state;
}

export function saveSettings(patch) {
  Object.assign(settings(), patch);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  return state;
}

export const isNative = () => Boolean(getPlugin());

/** Why the chosen engine cannot be used right now, or null when it is ready. */
export function engineIssue(s = settings()) {
  if (s.engine === 'system') return isNative() ? null : '안드로이드 내장 음성은 설치된 앱(APK)에서만 쓸 수 있어요.';
  if (!s.azureKey.trim() || !s.azureRegion.trim()) return 'Azure 키와 지역(region)을 설정에서 입력해 주세요.';
  return null;
}

export function buildEngine(s = settings()) {
  if (s.engine === 'system') return systemEngine({ voice: s.systemVoice });
  return azureEngine({ key: s.azureKey, region: s.azureRegion, voice: s.azureVoice });
}
