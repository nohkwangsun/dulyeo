import { $, h } from './dom.js';

/** Brief message at the bottom, optionally with one action ("실행취소"). */
export function toast(message, { action, duration = 3500, kind = 'info' } = {}) {
  const host = $('toasts');
  const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, h('span', {}, message));
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  if (action) el.append(h('button', { class: 'toast-action', onclick: () => { close(); action.onClick(); } }, action.label));
  host.replaceChildren(el);      // one at a time
  setTimeout(close, duration);
  return close;
}
