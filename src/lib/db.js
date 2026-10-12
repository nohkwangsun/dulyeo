// IndexedDB: finished tracks (with their mp3 blob) and a per-sentence clip cache.
const open = () => new Promise((resolve, reject) => {
  const req = indexedDB.open('dulyeo', 2);
  req.onupgradeneeded = () => {
    const d = req.result;
    if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'id' });
    if (!d.objectStoreNames.contains('clips')) d.createObjectStore('clips');
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
let dbPromise;
async function run(store, mode, fn) {
  const d = await (dbPromise ??= open());
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
  });
}

export const putTrack = (t) => run('tracks', 'readwrite', (s) => s.put(t));
export const getTrack = (id) => run('tracks', 'readonly', (s) => s.get(id));
export const delTrack = (id) => run('tracks', 'readwrite', (s) => s.delete(id));
export const allTracks = () => run('tracks', 'readonly', (s) => s.getAll());
export const getClip = (key) => run('clips', 'readonly', (s) => s.get(key));
export const putClip = (key, bytes) => run('clips', 'readwrite', (s) => s.put(bytes, key));
export const clearClips = () => run('clips', 'readwrite', (s) => s.clear());

/** Wrap an engine so each sentence is synthesized once per engine/voice, then reused. */
export function withClipCache(engine) {
  return {
    ...engine,
    async synth(text, w) {
      const key = `${engine.id}\n${text}`;
      const hit = await getClip(key).catch(() => undefined);
      if (hit) return hit;
      const bytes = await engine.synth(text, w);
      await putClip(key, bytes).catch(() => {});
      return bytes;
    },
  };
}
