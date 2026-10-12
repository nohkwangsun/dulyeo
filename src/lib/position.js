// Last listening position per track (seconds), kept in localStorage.
const key = (id) => `pos:${id}`;
export function getPos(id) { try { return Number(localStorage.getItem(key(id))) || 0; } catch { return 0; } }
export function setPos(id, t) { try { localStorage.setItem(key(id), String(t)); } catch { /* private mode */ } }
export function clearPos(id) { try { localStorage.removeItem(key(id)); } catch { /* private mode */ } }
