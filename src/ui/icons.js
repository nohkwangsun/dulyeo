// Inline SVG icons (24x24, currentColor). Unicode glyphs like ⏮ ⏸ render as emoji on some Androids.
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';

const PATHS = {
  play: `<path ${F} d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z"/>`,
  pause: `<rect ${F} x="6.5" y="5" width="4" height="14" rx="1.2"/><rect ${F} x="13.5" y="5" width="4" height="14" rx="1.2"/>`,
  prev: `<rect ${F} x="5" y="5" width="2.6" height="14" rx="1.1"/><path ${F} d="M19 6.2v11.6a.8.8 0 0 1-1.2.7L9 12.7a.8.8 0 0 1 0-1.4l8.8-5.8a.8.8 0 0 1 1.2.7z"/>`,
  next: `<rect ${F} x="16.4" y="5" width="2.6" height="14" rx="1.1"/><path ${F} d="M5 6.2v11.6a.8.8 0 0 0 1.2.7L15 12.7a.8.8 0 0 0 0-1.4L6.2 5.5A.8.8 0 0 0 5 6.2z"/>`,
  back10: `<path ${S} d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path ${S} d="M3.5 4v4.8h4.8"/><text x="12" y="15.4" text-anchor="middle" font-size="7.5" font-weight="700" ${F} font-family="system-ui,sans-serif">10</text>`,
  fwd10: `<path ${S} d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path ${S} d="M20.5 4v4.8h-4.8"/><text x="12" y="15.4" text-anchor="middle" font-size="7.5" font-weight="700" ${F} font-family="system-ui,sans-serif">10</text>`,
  down: `<path ${S} d="m6 9 6 6 6-6"/>`,
  headphones: `<path ${S} d="M4 16v-4a8 8 0 0 1 16 0v4"/><rect ${S} x="3" y="14" width="4.2" height="7" rx="1.6"/><rect ${S} x="16.8" y="14" width="4.2" height="7" rx="1.6"/>`,
  plus: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} d="M12 8v8M8 12h8"/>`,
  sliders: `<path ${S} d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle ${S} cx="16" cy="7" r="2.3"/><circle ${S} cx="8" cy="17" r="2.3"/>`,
  paste: `<rect ${S} x="8" y="3" width="8" height="4" rx="1.2"/><path ${S} d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>`,
  file: `<path ${S} d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path ${S} d="M14 3v5h5"/>`,
  pencil: `<path ${S} d="M4 20h4L19 9l-4-4L4 16z"/><path ${S} d="m13.5 6.5 4 4"/>`,
  trash: `<path ${S} d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>`,
  repeat: `<path ${S} d="m17 2 3 3-3 3"/><path ${S} d="M4 11V9a4 4 0 0 1 4-4h12"/><path ${S} d="m7 22-3-3 3-3"/><path ${S} d="M20 13v2a4 4 0 0 1-4 4H4"/>`,
  repeatOne: `<path ${S} d="m17 2 3 3-3 3"/><path ${S} d="M4 11V9a4 4 0 0 1 4-4h12"/><path ${S} d="m7 22-3-3 3-3"/><path ${S} d="M20 13v2a4 4 0 0 1-4 4H4"/><text x="12" y="15" text-anchor="middle" font-size="7.5" font-weight="700" ${F} font-family="system-ui,sans-serif">1</text>`,
  queue: `<path ${S} d="M4 6h11M4 12h11M4 18h7"/><path ${F} d="M18 13.5v7l4.2-3.5z"/>`,
  eye: `<path ${S} d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z"/><circle ${S} cx="12" cy="12" r="3"/>`,
  eyeOff: `<path ${S} d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.3 7.7A17 17 0 0 0 2 12s4 6 10 6a9.6 9.6 0 0 0 4.1-.9"/><path ${S} d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>`,
  minus: `<path ${S} d="M5 12h14"/>`,
  add: `<path ${S} d="M12 5v14M5 12h14"/>`,
  info: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} d="M12 11v5"/><circle ${F} cx="12" cy="7.8" r="1.1"/>`,
  check: `<path ${S} d="m5 12.5 4.5 4.5L19 7.5"/>`,
  waves: `<path ${S} d="M5 9v6M9 5v14M13 8v8M17 4v16M21 10v4" transform="translate(-1 0)"/>`,
};

export function icon(name, size = 24) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" focusable="false">${PATHS[name] ?? ''}</svg>`;
  return span;
}
