// Android's built-in text-to-speech via the native DulyeoTts plugin (free, works offline).
// The plugin returns a WAV per sentence; we resample to 24 kHz mono and encode to the
// shared MP3 format with lamejs so clips can be concatenated like the other engines.
import { Mp3Encoder } from '@breezystack/lamejs';
import { parseWav, resample } from '../wav.js';

const RATE = 24000;

export function getPlugin() {
  const cap = globalThis.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.registerPlugin('DulyeoTts');
}

export function encodeMp3(samples, sampleRate) {
  const pcm = resample(samples, sampleRate, RATE);
  const enc = new Mp3Encoder(1, RATE, 48);
  const out = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const b = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (b.length) out.push(b);
  }
  out.push(enc.flush());
  const total = out.reduce((n, b) => n + b.length, 0);
  const merged = new Uint8Array(total);
  let o = 0;
  for (const b of out) { merged.set(b, o); o += b.length; }
  return merged;
}

const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function systemEngine({ voice, plugin = getPlugin() }) {
  if (!plugin) throw new Error('안드로이드 내장 음성은 설치된 앱(APK)에서만 쓸 수 있어요.');
  return {
    id: `system:${voice || 'default'}`,
    concurrency: 1,   // the platform TTS queue is serial
    async synth(text) {
      const { wavBase64 } = await plugin.synthesize({ text, voice: voice || '' });
      const { sampleRate, samples } = parseWav(fromBase64(wavBase64));
      return encodeMp3(samples, sampleRate);
    },
  };
}
