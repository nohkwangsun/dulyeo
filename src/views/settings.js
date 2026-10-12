import { $, h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { segmented, bindSwitch } from '../ui/controls.js';
import { AZURE_VOICES } from '../lib/engines/azure.js';
import { getPlugin } from '../lib/engines/system.js';
import { clearClips } from '../lib/db.js';
import { settings, saveSettings } from '../settings.js';

const native = getPlugin();
const changed = () => window.dispatchEvent(new CustomEvent('dulyeo:settings'));
const DESC = {
  azure: '가장 자연스러운 음질이에요. 만들 때만 인터넷이 필요하고, 월 50만 자까지 무료예요.',
  system: '폰에 내장된 음성으로 인터넷 없이 만들어요. 음질은 설치한 음성에 따라 달라요.',
};

export function initSettings() {
  const s = settings();
  const engineSeg = segmented($('engine-seg'), [
    { id: 'azure', label: 'Azure (최고 음질)' },
    { id: 'system', label: '내장 음성', disabled: !native },
  ], s.engine, (engine) => { saveSettings({ engine }); syncEngine(); changed(); });

  function syncEngine() {
    const e = settings().engine;
    $('azure-panel').hidden = e !== 'azure';
    $('system-panel').hidden = e !== 'system';
    $('engine-desc').textContent = e === 'system' || native ? DESC[e] : `${DESC[e]} (내장 음성은 설치된 앱에서만 쓸 수 있어요.)`;
    syncAzureStatus();
  }

  $('azureVoice').replaceChildren(...AZURE_VOICES.map((v) => h('option', { value: v.id }, v.label)));
  $('azureVoice').value = s.azureVoice;
  $('azureKey').value = s.azureKey;
  $('azureRegion').value = s.azureRegion;
  $('azureVoice').addEventListener('change', () => saveSettings({ azureVoice: $('azureVoice').value }));
  $('azureKey').addEventListener('input', () => { saveSettings({ azureKey: $('azureKey').value.trim() }); syncAzureStatus(); changed(); });
  $('azureRegion').addEventListener('input', () => { saveSettings({ azureRegion: $('azureRegion').value.trim() }); syncAzureStatus(); changed(); });

  $('key-toggle').append(icon('eye', 22));
  $('key-toggle').addEventListener('click', () => {
    const hide = $('azureKey').type === 'password';
    $('azureKey').type = hide ? 'text' : 'password';
    $('key-toggle').replaceChildren(icon(hide ? 'eyeOff' : 'eye', 22));
    $('key-toggle').setAttribute('aria-label', hide ? '키 숨기기' : '키 보기');
  });

  function syncAzureStatus() {
    const ok = settings().azureKey && settings().azureRegion;
    const el = $('azure-status');
    el.className = `status ${ok ? 'ok' : 'warn'}`;
    el.textContent = ok ? '✓ 키와 지역이 입력되어 있어요' : '키와 지역을 입력하면 바로 쓸 수 있어요';
  }

  if (native) loadSystemVoices();
  $('systemVoice').addEventListener('change', () => saveSettings({ systemVoice: $('systemVoice').value }));
  $('tts-settings').addEventListener('click', () => native?.openTtsSettings().catch((e) => toast(e.message, { kind: 'error' })));

  bindSwitch($('auto-switch'), s.autoNext, (autoNext) => { saveSettings({ autoNext }); changed(); });
  window.addEventListener('dulyeo:settings', () => $('auto-switch').setAttribute('aria-checked', String(settings().autoNext)));

  $('clear-cache').addEventListener('click', async () => { await clearClips(); toast('문장 음성 캐시를 지웠어요'); showStorage(); });
  $('about').textContent = `Dulyeo ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''}`.trim();

  engineSeg.set(s.engine);
  syncEngine();
}

async function loadSystemVoices() {
  try {
    const { voices } = await native.getVoices();
    const saved = settings().systemVoice;
    $('systemVoice').replaceChildren(
      h('option', { value: '' }, '기본 음성'),
      ...voices.map((v) => h('option', { value: v.id }, `${v.name} (${v.lang})${v.offline ? '' : ' · 온라인'}`)),
    );
    $('systemVoice').value = saved;
  } catch { /* the engine may not be ready yet; the default voice still works */ }
}

export async function showStorage() {
  const el = $('storage-info');
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const mb = (b) => (b / 1048576).toFixed(b > 1e8 ? 0 : 1);
    el.textContent = `사용 중 ${mb(usage)}MB${quota ? ` / 사용 가능 ${mb(quota)}MB` : ''}`;
  } catch {
    el.textContent = '저장 공간 정보를 가져올 수 없어요.';
  }
}
