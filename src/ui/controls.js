// Small reusable controls built from buttons, so they are big enough for thumbs.
import { h } from './dom.js';
import { icon } from './icons.js';

/** Segmented control. items: [{ id, label, disabled }]. Returns { set(id) }. */
export function segmented(host, items, value, onChange) {
  let current = value;
  const draw = () => host.replaceChildren(...items.map((it) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(it.id === current), disabled: it.disabled,
    onclick: () => { current = it.id; draw(); onChange(it.id); },
  }, it.label)));
  draw();
  return { set(id) { current = id; draw(); } };
}

/** − value + stepper. */
export function stepper(host, { min, max, step, value, format = String, label }, onChange) {
  let v = value;
  const out = h('output', { 'aria-live': 'polite' });
  const minus = h('button', { type: 'button', 'aria-label': `${label} 줄이기` }, icon('minus', 20));
  const plus = h('button', { type: 'button', 'aria-label': `${label} 늘리기` }, icon('add', 20));
  const draw = () => {
    out.textContent = format(v);
    minus.disabled = v <= min + 1e-9;
    plus.disabled = v >= max - 1e-9;
  };
  const move = (dir) => { v = Math.round(Math.min(max, Math.max(min, v + dir * step)) * 100) / 100; draw(); onChange(v); };
  minus.addEventListener('click', () => move(-1));
  plus.addEventListener('click', () => move(1));
  host.replaceChildren(minus, out, plus);
  draw();
  return { set(x) { v = x; draw(); } };
}

/** role=switch button. */
export function bindSwitch(btn, value, onChange) {
  const set = (on) => btn.setAttribute('aria-checked', String(on));
  set(value);
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-checked') !== 'true';
    set(on);
    onChange(on);
  });
  return { set };
}
