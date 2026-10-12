import { $, h, fmtTime, timeAgo } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { allTracks, putTrack, delTrack } from '../lib/db.js';
import { getPos, clearPos } from '../lib/position.js';

let ctx;

export function initLibrary(c) {
  ctx = c;
  $('empty-art').append(icon('headphones', 64));
  window.addEventListener('dulyeo:player', markCurrent);
}

function markCurrent() {
  const id = ctx.player.currentId();
  const playing = ctx.player.isPlaying();
  for (const li of document.querySelectorAll('.track')) {
    const cur = li.dataset.id === id;
    li.classList.toggle('current', cur);
    li.querySelector('.eq')?.classList.toggle('playing', cur && playing);
  }
}

export async function renderLibrary() {
  const tracks = (await allTracks()).sort((a, b) => b.createdAt - a.createdAt);
  $('empty').hidden = tracks.length > 0;
  const total = tracks.reduce((n, t) => n + t.duration, 0);
  $('lib-summary').textContent = tracks.length ? `${tracks.length}개 · 총 ${Math.max(1, Math.round(total / 60))}분` : '';

  $('tracks').replaceChildren(...tracks.map((t) => {
    const pct = Math.min(100, Math.round((getPos(t.id) / t.duration) * 100)) || 0;
    const art = h('span', { class: 'track-art' }, icon('play', 22), h('span', { class: 'eq' }, h('i'), h('i'), h('i')));
    const li = h('li', { class: 'track', 'data-id': t.id },
      h('button', { class: 'track-main', 'aria-label': `재생: ${t.title}`, onclick: () => ctx.player.open(t.id) },
        art,
        h('span', { class: 'track-text' },
          h('span', { class: 'track-title' }, t.title),
          h('span', { class: 'track-meta' }, `${fmtTime(t.duration)} · ${t.optionsLabel} · ${timeAgo(t.createdAt)}`))),
      h('button', { class: 'icon-btn', 'aria-label': `편집: ${t.title}`, disabled: !t.markdown, onclick: () => ctx.editTrack(t) }, icon('pencil', 20)),
      h('button', { class: 'icon-btn', 'aria-label': `삭제: ${t.title}`, onclick: () => remove(t) }, icon('trash', 20)),
      h('span', { class: 'track-progress', 'aria-hidden': 'true' }, h('i', { style: `width:${pct}%` })));
    return li;
  }));
  markCurrent();
}

async function remove(t) {
  ctx.player.stopIfCurrent(t.id);
  await delTrack(t.id);
  clearPos(t.id);
  await renderLibrary();
  toast(`"${t.title}" 삭제했어요`, {
    duration: 6000,
    action: { label: '실행취소', onClick: async () => { await putTrack(t); await renderLibrary(); } },
  });
}
