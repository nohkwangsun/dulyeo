// Markdown -> paragraphs -> sentences, ready for TTS.

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'inc', 'ltd', 'co',
  'e.g', 'i.e', 'u.s', 'u.k', 'no', 'fig', 'approx', 'dept', 'est',
]);

function stripInline(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<https?:[^>]*>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=$|[\s).,!?;:])/g, '$1$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\[\^[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Markdown (or plain text) -> array of paragraph strings, in reading order. */
export function markdownToParagraphs(markdown) {
  let md = String(markdown ?? '').replace(/\r\n?/g, '\n');
  md = md.replace(/^---\n[\s\S]*?\n---\n/, '');
  md = md.replace(/<!--[\s\S]*?-->/g, '');
  md = md.replace(/^(```|~~~)[^\n]*\n[\s\S]*?\n\1[^\n]*$/gm, '');

  const out = [];
  let buf = [];
  const flush = () => {
    if (buf.length) out.push(stripInline(buf.join(' ')));
    buf = [];
  };

  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^([-*_]\s*){3,}$/.test(line)) { flush(); continue; }       // horizontal rule
    if (line.startsWith('|')) { flush(); continue; }                // table row
    const heading = line.match(/^#{1,6}\s+(.*?)\s*#*$/);
    if (heading) {
      flush();
      const t = stripInline(heading[1]);
      if (t) out.push(/[.!?:;]$/.test(t) ? t : t + '.');
      continue;
    }
    const item = line.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/);
    if (item) { flush(); buf.push(item[1]); flush(); continue; }
    buf.push(line.replace(/^>+\s?/, ''));
  }
  flush();
  return out.filter((p) => /[\p{L}\p{N}]/u.test(p));
}

/** Paragraph string -> sentences, keeping common abbreviations ("Mr. Kim") together. */
export function splitSentences(paragraph) {
  const seg = new Intl.Segmenter('en', { granularity: 'sentence' });
  const parts = [...seg.segment(paragraph)].map((s) => s.segment.trim()).filter(Boolean);
  const merged = [];
  for (const part of parts) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const lastWord = prev.match(/([\p{L}.]+)\.$/u)?.[1]?.toLowerCase();
      if (lastWord && ABBREVIATIONS.has(lastWord)) {
        merged[merged.length - 1] = `${prev} ${part}`;
        continue;
      }
    }
    merged.push(part);
  }
  return merged.filter((s) => /[\p{L}\p{N}]/u.test(s));
}

/** Markdown -> [{ sentences: string[] }] */
export function parseScript(markdown) {
  return markdownToParagraphs(markdown)
    .map((p) => ({ sentences: splitSentences(p) }))
    .filter((p) => p.sentences.length);
}
