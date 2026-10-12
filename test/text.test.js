import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToParagraphs, splitSentences, parseScript } from '../src/lib/text.js';

test('markdown is reduced to speakable paragraphs', () => {
  const md = `---
title: x
---
# Morning Routine

I **really** like [coffee](https://example.com) and \`tea\`.
It is hot. ![img](a.png)

- first item
- second item

\`\`\`js
console.log('skip me');
\`\`\`

> Quoted text here.
`;
  assert.deepEqual(markdownToParagraphs(md), [
    'Morning Routine.',
    'I really like coffee and tea. It is hot.',
    'first item',
    'second item',
    'Quoted text here.',
  ]);
});

test('abbreviations do not split sentences', () => {
  assert.deepEqual(splitSentences('Mr. Kim met Dr. Lee. They talked, e.g. about work. Fine!'),
    ['Mr. Kim met Dr. Lee.', 'They talked, e.g. about work.', 'Fine!']);
});

test('plain text without markdown works', () => {
  const s = parseScript('Hello there. How are you?\n\nI am fine.');
  assert.equal(s.length, 2);
  assert.deepEqual(s[0].sentences, ['Hello there.', 'How are you?']);
});
