// Helpers for gluing CBR MP3 clips (audio-24khz-48kbitrate-mono-mp3) together.
// All clips share one format, so byte concatenation yields a valid, seekable file.

export const BYTES_PER_SECOND = 6000;            // 48 kbit/s
const FRAME_BYTES = 144;                         // MPEG-2 Layer III, 24 kHz, 48 kbit/s, mono
const FRAME_SECONDS = 576 / 24000;               // 24 ms
// Header FF F3 64 C0 followed by zeros = a frame that decodes to silence.
const SILENT_FRAME = Buffer.concat([Buffer.from([0xff, 0xf3, 0x64, 0xc0]), Buffer.alloc(FRAME_BYTES - 4)]);

export function silence(seconds) {
  const frames = Math.max(0, Math.round(seconds / FRAME_SECONDS));
  return Buffer.concat(Array.from({ length: frames }, () => SILENT_FRAME));
}

/** Drop an ID3v2 tag (if the TTS service added one) so clips concatenate cleanly. */
export function stripId3(buf) {
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    return buf.subarray(10 + size);
  }
  return buf;
}

export function duration(buf) {
  return buf.length / BYTES_PER_SECOND;
}
