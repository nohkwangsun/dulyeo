// TTS providers. Each returns { id, synth(sentence, workerIndex) -> mp3 Buffer }.
// Output must be audio-24khz-48kbitrate-mono-mp3 so clips can be concatenated.
import { spawn } from 'node:child_process';

const escapeXml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

async function readAll(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

export async function edgeProvider({ voice, workers = 4 }) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const clients = [];
  const client = async (w) => {
    if (!clients[w]) {
      const c = new MsEdgeTTS();
      await c.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      clients[w] = c;
    }
    return clients[w];
  };
  return {
    id: `edge:${voice}`,
    async synth(sentence, w = 0) {
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const c = await client(w);
          const { audioStream } = c.toStream(escapeXml(sentence));
          const buf = await readAll(audioStream);
          if (buf.length < 200) throw new Error('empty audio');
          return buf;
        } catch (err) {
          lastErr = err;
          clients[w] = undefined; // reconnect next attempt
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      throw new Error(`TTS failed for "${sentence.slice(0, 40)}": ${lastErr?.message}`);
    },
  };
}

/** Offline stand-in for development/tests: a short tone whose length follows the text. Needs ffmpeg. */
export function fakeProvider() {
  return {
    id: 'fake',
    synth(sentence) {
      const secs = Math.max(0.6, sentence.length * 0.055).toFixed(2);
      return new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${300 + (sentence.length % 7) * 60}:duration=${secs}`,
          '-ar', '24000', '-ac', '1', '-b:a', '48k', '-write_xing', '0', '-id3v2_version', '0', '-f', 'mp3', 'pipe:1']);
        readAll(ff.stdout).then(resolve, reject);
        ff.on('error', reject);
      });
    },
  };
}

export const VOICES = [
  { id: 'en-US-AriaNeural', label: 'Aria (US, female)' },
  { id: 'en-US-JennyNeural', label: 'Jenny (US, female)' },
  { id: 'en-US-GuyNeural', label: 'Guy (US, male)' },
  { id: 'en-US-AndrewNeural', label: 'Andrew (US, male)' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia (UK, female)' },
  { id: 'en-GB-RyanNeural', label: 'Ryan (UK, male)' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha (AU, female)' },
];

export async function getProvider(voice) {
  if (process.env.TTS_PROVIDER === 'fake') return fakeProvider();
  const allowed = VOICES.some((v) => v.id === voice) ? voice : VOICES[0].id;
  return edgeProvider({ voice: allowed });
}
