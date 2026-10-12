// Dulyeo: build mp3 on the phone, keep it on the device, play it in the background.
import './style.css';
import { $ } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { registerSW } from './lib/sw.js';
import { initLibrary, renderLibrary } from './views/library.js';
import { initCreate, showCreate, loadIntoEditor } from './views/create.js';
import { initSettings, showStorage } from './views/settings.js';
import { initPlayer, open, currentId, isPlaying, stopIfCurrent } from './views/player.js';

const TABS = {
  library: { label: '라이브러리', icon: 'headphones' },
  create: { label: '만들기', icon: 'plus' },
  settings: { label: '설정', icon: 'sliders' },
};

const player = { open, currentId, isPlaying, stopIfCurrent };

function go(name) {
  for (const id of Object.keys(TABS)) $(`view-${id}`).hidden = id !== name;
  for (const b of document.querySelectorAll('#tabbar button')) {
    if (b.dataset.tab === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  $('make-bar').hidden = name !== 'create';
  document.body.classList.toggle('has-makebar', name === 'create');
  window.scrollTo({ top: 0 });
  if (name === 'library') renderLibrary();
  if (name === 'create') showCreate();
  if (name === 'settings') showStorage();
}

const ctx = {
  go, player,
  editTrack: (t) => { loadIntoEditor(t); go('create'); },
};

for (const b of document.querySelectorAll('#tabbar button')) {
  const t = TABS[b.dataset.tab];
  b.replaceChildren(icon(t.icon, 24), t.label);
  b.addEventListener('click', () => go(b.dataset.tab));
}
document.addEventListener('click', (e) => {
  const to = e.target.closest('[data-go]')?.dataset.go;
  if (to) go(to);
});

// Hide the bottom bars while a text field has focus (Android's keyboard would push them over the field).
const typing = (el) => el?.matches?.('textarea, select, input:not([type=range]):not([type=file])');
document.addEventListener('focusin', (e) => { if (typing(e.target)) document.body.classList.add('kbd'); });
document.addEventListener('focusout', () => setTimeout(() => { if (!typing(document.activeElement)) document.body.classList.remove('kbd'); }, 50));

initLibrary(ctx);
initCreate(ctx);
initSettings();
initPlayer();
go('library');
registerSW();
