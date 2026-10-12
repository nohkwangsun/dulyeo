import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaMetadata } from '../src/lib/media.js';

// Regression: a URL artwork (or none at all) makes the native media plugin throw and crashes the Android app.
test('media metadata always has an artwork array and never a URL', () => {
  const m = mediaMetadata({ title: 'Hello' });
  assert.equal(m.title, 'Hello');
  assert.ok(Array.isArray(m.artwork));
  assert.equal(m.artwork.length, 0);
  assert.doesNotMatch(JSON.stringify(m), /https?:/);
});
