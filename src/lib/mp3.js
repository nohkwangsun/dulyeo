// Helpers for gluing CBR MP3 clips (24 kHz, 48 kbit/s, mono) together.
// All clips share one format, so byte concatenation yields a valid, seekable file.

export const BYTES_PER_SECOND = 6000;            // 48 kbit/s
const FRAME_BYTES = 144;                         // MPEG-2 Layer III, 24 kHz, 48 kbit/s, mono
const FRAME_SECONDS = 576 / 24000;               // 24 ms
// Header FF F3 64 C0 followed by zeros = a frame that decodes to silence.
const SILENT_FRAME = new Uint8Array(FRAME_BYTES);
SILENT_FRAME.set([0xff, 0xf3, 0x64, 0xc0]);

export function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function silence(seconds) {
  const frames = Math.max(0, Math.round(seconds / FRAME_SECONDS));
  return concat(Array.from({ length: frames }, () => SILENT_FRAME));
}

/** Drop an ID3v2 tag (if a TTS service added one) so clips concatenate cleanly. */
export function stripId3(buf) {
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    return buf.subarray(10 + size);
  }
  return buf;
}

export function duration(buf) {
  return buf.length / BYTES_PER_SECOND;
}
