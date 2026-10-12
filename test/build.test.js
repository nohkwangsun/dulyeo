import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAudio } from '../src/lib/build.js';
import { silence, duration } from '../src/lib/mp3.js';
import { hasFfmpeg, probeDuration, toneMp3 } from './helpers.js';

const paragraphs = [{ sentences: ['Hello there.', 'How are you today?'] }, { sentences: ['I am fine.'] }];
const synth = async (s) => toneMp3(s);

test('repeat and gap are baked into the timeline', { skip: !hasFfmpeg }, async () => {
  const r = await buildAudio({ paragraphs, synth, options: { unit: 'sentence', repeat: 2, gap: 1 } });
  assert.equal(r.units.length, 3);
  assert.equal(r.timeline.length, 6);
  for (let i = 1; i < r.timeline.length; i++) assert.ok(r.timeline[i].start >= r.timeline[i - 1].end + 1 - 0.03);
  assert.deepEqual(r.timeline.map((t) => t.rep), [0, 1, 0, 1, 0, 1]);
});

test('computed duration matches the real decoded duration', { skip: !hasFfmpeg }, async () => {
  const r = await buildAudio({ paragraphs, synth, options: { unit: 'paragraph', repeat: 2, gap: 0.5, shadow: true } });
  assert.equal(r.units.length, 2);
  assert.ok(Math.abs(probeDuration(r.mp3) - duration(r.mp3)) < 0.1, `${probeDuration(r.mp3)} vs ${duration(r.mp3)}`);
});

test('silence frames have the requested length', { skip: !hasFfmpeg }, () => {
  assert.ok(Math.abs(probeDuration(silence(2)) - 2) < 0.1);
});

test('identical sentences are synthesized once', async () => {
  let calls = 0;
  await buildAudio({ paragraphs: [{ sentences: ['Same.', 'Same.', 'Other.'] }], options: { repeat: 3 },
    synth: async (s) => { calls++; return new Uint8Array(600); } });
  assert.equal(calls, 2);
});
