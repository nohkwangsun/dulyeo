import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAudio } from '../src/lib/build.js';
import { estimateSeconds, formatEstimate, speechSeconds } from '../src/lib/estimate.js';
import { duration } from '../src/lib/mp3.js';
import { PRESETS, presetOptions, optionsLabel } from '../src/lib/presets.js';
import { normalizeOptions } from '../src/lib/build.js';

const paragraphs = [{ sentences: ['Hello there my friend.', 'How are you doing today?'] }, { sentences: ['I am doing fine, thank you very much.'] }];
// A "clip" whose length follows the estimate model exactly (144-byte frames of 24 ms).
const fakeSynth = async (s) => new Uint8Array(Math.round(speechSeconds(s) / 0.024) * 144);

for (const preset of PRESETS.filter((p) => p.options)) {
  test(`estimate matches the built length for preset "${preset.id}"`, async () => {
    const built = await buildAudio({ paragraphs, synth: fakeSynth, options: preset.options });
    const est = estimateSeconds(paragraphs, preset.options);
    // silence is rounded to 24 ms frames, so allow a little slack per pause
    assert.ok(Math.abs(duration(built.mp3) - est) < 0.06 * built.timeline.length + 0.5, `${duration(built.mp3)} vs ${est}`);
  });
}

test('every preset is accepted as-is by the builder', () => {
  for (const p of PRESETS.filter((x) => x.options)) assert.deepEqual(normalizeOptions(p.options), p.options);
});

test('custom preset uses the given custom options', () => {
  assert.deepEqual(presetOptions('custom', { unit: 'paragraph', repeat: 4, gap: 2, shadow: true }), { unit: 'paragraph', repeat: 4, gap: 2, shadow: true });
  assert.equal(optionsLabel({ unit: 'sentence', repeat: 2, shadow: true }), '문장 ×2 · 쉐도잉');
});

test('estimate is formatted for humans', () => {
  assert.equal(formatEstimate(40), '약 40초');
  assert.equal(formatEstimate(12 * 60 + 10), '약 12분');
  assert.equal(formatEstimate(75 * 60), '약 1시간 15분');
});

test('aborting stops synthesis and rejects with AbortError', async () => {
  const ctl = new AbortController();
  let calls = 0;
  const synth = async () => { calls++; if (calls === 2) ctl.abort(); return new Uint8Array(600); };
  const many = [{ sentences: Array.from({ length: 20 }, (_, i) => `Sentence number ${i}.`) }];
  await assert.rejects(buildAudio({ paragraphs: many, synth, concurrency: 1, signal: ctl.signal }), { name: 'AbortError' });
  assert.ok(calls < 20, `stopped early (${calls} calls)`);
});
