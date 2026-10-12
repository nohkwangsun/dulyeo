import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const hasFfmpeg = (() => { try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dulyeo-'));

export function probeDuration(bytes) {
  const f = path.join(tmp(), 'a.bin');
  fs.writeFileSync(f, bytes);
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
}

/** A tone whose length follows the text, as 24 kHz/48 kbit/s mono mp3 (what the real engines return). */
export function toneMp3(text) {
  const secs = Math.max(0.6, text.length * 0.055).toFixed(2);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${300 + (text.length % 7) * 60}:duration=${secs}`,
    '-ar', '24000', '-ac', '1', '-b:a', '48k', '-write_xing', '0', '-id3v2_version', '0', '-f', 'mp3', 'pipe:1'], { maxBuffer: 1 << 24 });
  return new Uint8Array(r.stdout);
}

/** A mono 16-bit WAV tone at an arbitrary sample rate, like Android's synthesizeToFile output. */
export function toneWav(seconds, sampleRate) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
    '-ar', String(sampleRate), '-ac', '1', '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1'], { maxBuffer: 1 << 26 });
  return new Uint8Array(r.stdout);
}
