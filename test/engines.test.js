import test from 'node:test';
import assert from 'node:assert/strict';
import { azureEngine } from '../src/lib/engines/azure.js';
import { encodeMp3 } from '../src/lib/engines/system.js';
import { parseWav } from '../src/lib/wav.js';
import { hasFfmpeg, probeDuration, toneWav } from './helpers.js';

test('azure engine sends SSML with the key and escapes text', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return new Response(new Uint8Array(500)); };
  const e = azureEngine({ key: ' K ', region: 'koreacentral', voice: 'en-US-AriaNeural', fetchImpl });
  const out = await e.synth('Tom & "Jerry" <3');
  assert.equal(out.length, 500);
  assert.equal(seen.url, 'https://koreacentral.tts.speech.microsoft.com/cognitiveservices/v1');
  assert.equal(seen.init.headers['Ocp-Apim-Subscription-Key'], 'K');
  assert.equal(seen.init.headers['X-Microsoft-OutputFormat'], 'audio-24khz-48kbitrate-mono-mp3');
  assert.match(seen.init.body, /xml:lang="en-US"/);
  assert.match(seen.init.body, /Tom &amp; &quot;Jerry&quot; &lt;3/);
});

test('azure engine reports bad keys and quota without retrying', async () => {
  let calls = 0;
  const mk = (status) => azureEngine({ key: 'k', region: 'r', voice: 'en-US-AriaNeural', fetchImpl: async () => { calls++; return new Response('', { status }); } });
  await assert.rejects(mk(401).synth('x'), /키/);
  await assert.rejects(mk(429).synth('x'), /한도/);
  assert.equal(calls, 2);
});

test('azure engine requires key and region', () => {
  assert.throws(() => azureEngine({ key: '', region: 'r', voice: 'en-US-AriaNeural' }), /키/);
});

test('wav from the platform TTS becomes 24 kHz mp3 of the same length', { skip: !hasFfmpeg }, () => {
  for (const rate of [16000, 22050, 24000, 44100]) {
    const { sampleRate, samples } = parseWav(toneWav(2, rate));
    assert.equal(sampleRate, rate);
    const mp3 = encodeMp3(samples, sampleRate);
    assert.ok(Math.abs(probeDuration(mp3) - 2) < 0.15, `${rate}: ${probeDuration(mp3)}`);
  }
});
