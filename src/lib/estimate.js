// Rough length of the mp3 that buildAudio() will produce, shown before the user commits.
import { normalizeOptions, toUnits, SENTENCE_GAP, PARAGRAPH_PAUSE } from './build.js';

const CHARS_PER_SECOND = 14.5;   // ~150 words per minute of English

export const speechSeconds = (text) => text.length / CHARS_PER_SECOND;

/** Mirrors the layout in buildAudio(); `speech` is injectable so tests can compare against real output. */
export function estimateSeconds(paragraphs, options, speech = speechSeconds) {
  const opt = normalizeOptions(options);
  const units = toUnits(paragraphs, opt.unit);
  let total = 0;
  units.forEach((u, i) => {
    if (i > 0 && units[i - 1].paragraph !== u.paragraph) total += PARAGRAPH_PAUSE;
    const clip = u.sentences.reduce((n, s, k) => n + speech(s) + (k ? SENTENCE_GAP : 0), 0);
    total += opt.repeat * (clip + opt.gap + (opt.shadow ? clip : 0));
  });
  return total;
}

export function formatEstimate(seconds) {
  const m = Math.round(seconds / 60);
  if (seconds < 60) return `약 ${Math.max(5, Math.round(seconds / 5) * 5)}초`;
  return m >= 60 ? `약 ${Math.floor(m / 60)}시간 ${m % 60}분` : `약 ${m}분`;
}
