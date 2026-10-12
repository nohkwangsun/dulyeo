import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fakeProvider } from '../server/providers.js';
import { buildAudio } from '../server/build.js';
import { silence, duration } from '../server/mp3.js';

const hasFfmpeg = (() => { try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

function probeDuration(buf) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dulyeo-')), 'a.mp3');
  fs.writeFileSync(f, buf);
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
}

const paragraphs = [{ sentences: ['Hello there.', 'How are you today?'] }, { sentences: ['I am fine.'] }];
const synth = (s) => fakeProvider().synth(s);

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
