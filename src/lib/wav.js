// Minimal WAV (PCM 16-bit) parsing and resampling for engines that return WAV.

export function parseWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('WAV 형식이 아닙니다.');
  let o = 12, sampleRate = 0, channels = 1, bits = 16;
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    let size = v.getUint32(o + 4, true);
    if (id === 'fmt ') {
      channels = v.getUint16(o + 10, true);
      sampleRate = v.getUint32(o + 12, true);
      bits = v.getUint16(o + 22, true);
    } else if (id === 'data') {
      if (bits !== 16) throw new Error('16-bit PCM WAV만 지원합니다.');
      size = Math.min(size, bytes.length - (o + 8));      // some writers leave the size at 0 / 0xFFFFFFFF
      const n = Math.floor(size / 2 / channels);
      const mono = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += v.getInt16(o + 8 + (i * channels + c) * 2, true);
        mono[i] = sum / channels;
      }
      return { sampleRate, samples: mono };
    }
    o += 8 + size + (size & 1);
  }
  throw new Error('WAV에 오디오 데이터가 없습니다.');
}

/** Linear-interpolation resample; plenty for speech. */
export function resample(samples, from, to) {
  if (from === to) return samples;
  const n = Math.floor(samples.length * to / from);
  const out = new Int16Array(n);
  const ratio = from / to;
  for (let i = 0; i < n; i++) {
    const x = i * ratio, i0 = Math.floor(x), i1 = Math.min(i0 + 1, samples.length - 1);
    out[i] = samples[i0] + (samples[i1] - samples[i0]) * (x - i0);
  }
  return out;
}
