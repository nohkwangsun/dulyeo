// Turns parsed paragraphs into one mp3 + a timeline, baking in repeats and gaps.
// Runs in the browser (and in Node for tests): no Buffer, no filesystem.
import { silence, duration, stripId3, concat } from './mp3.js';

const SENTENCE_GAP = 0.3;     // between sentences inside a paragraph-unit
const PARAGRAPH_PAUSE = 0.6;  // extra pause when the paragraph changes

export const DEFAULTS = { unit: 'sentence', repeat: 1, gap: 0.5, shadow: false };

export function normalizeOptions(o = {}) {
  const unit = ['sentence', 'paragraph'].includes(o.unit) ? o.unit : DEFAULTS.unit;
  const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
  return {
    unit,
    repeat: Math.round(clamp(o.repeat, 1, 10, DEFAULTS.repeat)),
    gap: clamp(o.gap, 0, 10, DEFAULTS.gap),
    shadow: Boolean(o.shadow),
  };
}

/** Split into listening units: one sentence each, or one whole paragraph each. */
export function toUnits(paragraphs, unit) {
  const units = [];
  paragraphs.forEach((p, pi) => {
    if (unit === 'paragraph') units.push({ paragraph: pi, sentences: p.sentences, text: p.sentences.join(' ') });
    else p.sentences.forEach((s) => units.push({ paragraph: pi, sentences: [s], text: s }));
  });
  return units;
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async (w) => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i, w);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, (_, w) => worker(w)));
  return results;
}

/**
 * @param paragraphs [{sentences}]
 * @param synth      async (sentence, workerIndex) => mp3 bytes (Uint8Array)
 * @returns { mp3: Uint8Array, timeline: [{unit, rep, start, end}], units: [{text, paragraph}] }
 */
export async function buildAudio({ paragraphs, synth, options, concurrency = 4, onProgress = () => {} }) {
  const opt = normalizeOptions(options);
  const units = toUnits(paragraphs, opt.unit);
  const unique = [...new Set(units.flatMap((u) => u.sentences))];
  const clips = new Map();
  let done = 0;
  await mapPool(unique, concurrency, async (s, _i, w) => {
    clips.set(s, stripId3(await synth(s, w)));
    onProgress(++done, unique.length);
  });

  const parts = [];
  const timeline = [];
  let t = 0;
  const push = (buf) => { parts.push(buf); t += duration(buf); };

  units.forEach((u, ui) => {
    if (ui > 0 && units[ui - 1].paragraph !== u.paragraph) push(silence(PARAGRAPH_PAUSE));
    const body = [];
    u.sentences.forEach((s, i) => { if (i) body.push(silence(SENTENCE_GAP)); body.push(clips.get(s)); });
    const clip = concat(body);
    for (let rep = 0; rep < opt.repeat; rep++) {
      const start = t;
      push(clip);
      timeline.push({ unit: ui, rep, start, end: t });
      push(silence(opt.gap + (opt.shadow ? duration(clip) : 0)));
    }
  });

  return {
    mp3: concat(parts),
    timeline,
    units: units.map(({ text, paragraph }) => ({ text, paragraph })),
    options: opt,
  };
}
