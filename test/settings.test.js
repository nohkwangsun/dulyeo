import test from 'node:test';
import assert from 'node:assert/strict';

// settings.js keeps module-level state, and node:test runs each file in its own process, so the
// in-memory localStorage below is seeded before the first import.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

test('settings saved by older builds are migrated, not lost', async () => {
  store.set('f:azureKey', 'OLDKEY');
  store.set('f:azureRegion', 'koreacentral');
  store.set('f:repeat', '3');
  store.set('f:gap', '1.5');
  store.set('f:shadow', '1');
  store.set('f:auto', '0');
  store.set('speed', '1.25');
  const { settings, saveSettings, engineIssue } = await import('../src/settings.js');

  const s = settings();
  assert.equal(s.azureKey, 'OLDKEY');
  assert.equal(s.azureRegion, 'koreacentral');
  assert.deepEqual(s.custom, { unit: 'sentence', repeat: 3, gap: 1.5, shadow: true });
  assert.equal(s.preset, 'custom');
  assert.equal(s.autoNext, false);
  assert.equal(s.speed, 1.25);
  assert.equal(engineIssue(), null);

  saveSettings({ azureRegion: '' });
  assert.match(engineIssue(), /지역/);
  assert.equal(JSON.parse(store.get('dulyeo:settings')).azureKey, 'OLDKEY', 'persisted in the new format');
});

test('the built-in engine reports that it needs the installed app when run in a browser', async () => {
  const { engineIssue } = await import('../src/settings.js');
  assert.match(engineIssue({ engine: 'system', azureKey: '', azureRegion: '' }), /앱\(APK\)/);
});
