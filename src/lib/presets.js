// "How do you want to listen?" presets that map onto the options buildAudio() understands.

export const PRESETS = [
  { id: 'listen', name: '편하게 듣기', desc: '문장을 한 번씩 이어서', options: { unit: 'sentence', repeat: 1, gap: 0.4, shadow: false } },
  { id: 'repeat', name: '반복 듣기', desc: '문장마다 3번 반복', options: { unit: 'sentence', repeat: 3, gap: 0.8, shadow: false } },
  { id: 'shadow', name: '쉐도잉', desc: '2번 듣고, 따라 말할 시간까지', options: { unit: 'sentence', repeat: 2, gap: 0.5, shadow: true } },
  { id: 'paragraph', name: '문단 듣기', desc: '문단 단위로 2번', options: { unit: 'paragraph', repeat: 2, gap: 1.2, shadow: false } },
  { id: 'custom', name: '직접 설정', desc: '단위·횟수·간격을 직접', options: null },
];

export const DEFAULT_CUSTOM = { unit: 'sentence', repeat: 2, gap: 0.8, shadow: false };

export function presetOptions(id, custom = DEFAULT_CUSTOM) {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  return { ...(p.options ?? custom) };
}

/** Short human label stored with a track, e.g. "문장 ×3 · 쉐도잉". */
export function optionsLabel(o) {
  return `${o.unit === 'paragraph' ? '문단' : '문장'} ×${o.repeat}${o.shadow ? ' · 쉐도잉' : ''}`;
}
