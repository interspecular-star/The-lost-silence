// Палитра цветов и конструктор градиентов: быстрый выбор «на глаз»
// вместо ручного ввода hex/CSS. Используется в инспекторе (фон сцены,
// цвета текста/заливки/рамки/темы) и в панели стилей текста.

import { h, textInput } from './ui';

export interface Swatch { c: string; name: string }

/** Курируемая палитра под стиль игры: тёмные фоны, приглушённые тона, акценты */
export const PALETTE: Swatch[] = [
  // фоны
  { c: '#04070c', name: 'Глубокая ночь' },
  { c: '#0b1016', name: 'Ночь (базовый фон)' },
  { c: '#0a1622', name: 'Тёмная сталь' },
  { c: '#101820', name: 'Графит' },
  { c: '#152030', name: 'Синий сумрак' },
  { c: '#1d2430', name: 'Серо-синий' },
  { c: '#0e1418', name: 'Стерильный (Nexus)' },
  { c: '#14201c', name: 'Тёмная зелень' },
  { c: '#201a12', name: 'Тёплая гарь' },
  { c: '#2a1c12', name: 'Ржавый сумрак' },
  { c: '#1c1420', name: 'Тёмный фиолет' },
  { c: '#140b0d', name: 'Багровая тьма' },
  // текст и приглушённые
  { c: '#e6edf3', name: 'Светлый текст' },
  { c: '#f7f2e7', name: 'Тёплый белый' },
  { c: '#9aa7b4', name: 'Приглушённый' },
  { c: '#5c6773', name: 'Тусклый' },
  { c: '#8892a0', name: 'Сталь' },
  // акценты
  { c: '#4fd1c5', name: 'Бирюза (акцент игры)' },
  { c: '#7ee8dc', name: 'Светлая бирюза' },
  { c: '#61afef', name: 'Голубой' },
  { c: '#98c379', name: 'Зелёный' },
  { c: '#f4d35e', name: 'Амбер' },
  { c: '#d19a66', name: 'Охра' },
  { c: '#b0563b', name: 'Ржавчина' },
  { c: '#e06c75', name: 'Красный (тревога)' },
  { c: '#c678dd', name: 'Фиолетовый' },
];

export interface GradientPreset { css: string; name: string }

export const GRADIENT_PRESETS: GradientPreset[] = [
  { css: 'linear-gradient(180deg, #04070c, #0a1622)', name: 'Ночь' },
  { css: 'linear-gradient(180deg, #071018, #0e2233)', name: 'Глубина' },
  { css: 'linear-gradient(160deg, #0d1117, #1d2430)', name: 'Мастерская' },
  { css: 'linear-gradient(180deg, #0b0f14, #2a1c12)', name: 'Гарь на рассвете' },
  { css: 'linear-gradient(180deg, #12100e, #3a2317)', name: 'Ржавый закат' },
  { css: 'linear-gradient(180deg, #140b0d, #2b1216)', name: 'Тревога' },
  { css: 'linear-gradient(180deg, #0e1418, #1c2b33)', name: 'Стерильный Nexus' },
  { css: 'linear-gradient(180deg, #0c120c, #1e2c1a)', name: 'Заросшая зона' },
  { css: 'radial-gradient(ellipse at 50% 30%, #16222e, #05080d)', name: 'Свет сверху' },
];

const HEX6 = /^#[0-9a-f]{6}$/i;

// ---------- всплывающая палитра ----------
let openPopover: HTMLElement | null = null;

function closePopover() {
  openPopover?.remove();
  openPopover = null;
  document.removeEventListener('mousedown', onDocDown, true);
}
function onDocDown(e: MouseEvent) {
  if (openPopover && !openPopover.contains(e.target as Node)) closePopover();
}

/** Открывает сетку образцов рядом с кнопкой; onPick получает hex */
export function openPalettePopover(anchor: HTMLElement, onPick: (hex: string) => void) {
  closePopover();
  const pop = h('div', {
    style: 'position:fixed;z-index:10000;background:var(--panel,#161b22);border:1px solid var(--border,#2a3038);'
      + 'border-radius:8px;padding:8px;box-shadow:0 12px 40px rgba(0,0,0,.5);'
      + 'display:grid;grid-template-columns:repeat(7,22px);gap:5px;',
  });
  for (const sw of PALETTE) {
    const b = h('button', {
      title: `${sw.name} — ${sw.c}`,
      style: `width:22px;height:22px;border-radius:5px;border:1px solid rgba(255,255,255,.18);cursor:pointer;background:${sw.c};padding:0;`,
    });
    b.onclick = () => { closePopover(); onPick(sw.c); };
    pop.appendChild(b);
  }
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.left = `${Math.min(r.left, innerWidth - pw - 8)}px`;
  pop.style.top = `${r.bottom + 6 + ph > innerHeight ? r.top - ph - 6 : r.bottom + 6}px`;
  openPopover = pop;
  document.addEventListener('mousedown', onDocDown, true);
}

/** Кнопка-палитра ▦ (для встраивания рядом с любым цветовым полем) */
export function paletteButton(onPick: (hex: string) => void): HTMLElement {
  const b = h('button', {
    class: 'btn small',
    title: 'Палитра готовых цветов',
    style: 'flex:0 0 auto;padding:2px 7px;',
    text: '▦',
  });
  b.onclick = (e) => { e.preventDefault(); openPalettePopover(b, onPick); };
  return b;
}

/** Цветовое поле: [▦ палитра][пипетка][текст]. Замена старому colorRow. */
export function colorField(value: string, onChange: (v: string) => void): HTMLElement {
  const wrap = h('div', { style: 'display:flex;gap:6px;align-items:center;' });
  const native = h('input', { class: 'ed', type: 'color', style: 'flex:0 0 36px;' }) as HTMLInputElement;
  native.value = HEX6.test(value) ? value : '#4fd1c5';
  const text = textInput(value, onChange);
  native.oninput = () => { text.value = native.value; };
  native.onchange = () => onChange(native.value);
  wrap.append(paletteButton((hex) => onChange(hex)), native, text);
  return wrap;
}

// ---------- фон сцены: цвет или градиент ----------

interface ParsedGradient { kind: 'linear' | 'radial'; angle: number; a: string; b: string }

function parseGradient(v: string): ParsedGradient | null {
  let m = v.match(/^linear-gradient\(\s*(\d+)deg\s*,\s*([^,]+?)\s*,\s*(.+?)\s*\)$/i);
  if (m) return { kind: 'linear', angle: Number(m[1]), a: m[2], b: m[3] };
  m = v.match(/^radial-gradient\([^,]*,\s*([^,]+?)\s*,\s*(.+?)\s*\)$/i);
  if (m) return { kind: 'radial', angle: 180, a: m[1], b: m[2] };
  return null;
}

function composeGradient(g: ParsedGradient): string {
  return g.kind === 'radial'
    ? `radial-gradient(ellipse at 50% 30%, ${g.a}, ${g.b})`
    : `linear-gradient(${g.angle}deg, ${g.a}, ${g.b})`;
}

/**
 * Полный виджет фона сцены: вкладки «Цвет | Градиент», образцы, свой цвет,
 * конструктор градиента (направление + 2 цвета) и пресеты. Пишет CSS-строку.
 */
export function backgroundField(value: string, onChange: (v: string) => void): HTMLElement {
  const root = h('div', { style: 'display:flex;flex-direction:column;gap:8px;' });
  const parsed = parseGradient(value);
  let mode: 'color' | 'gradient' = parsed ? 'gradient' : 'color';
  // рабочее состояние конструктора (живёт до перерисовки инспектора)
  const grad: ParsedGradient = parsed ?? { kind: 'linear', angle: 180, a: '#04070c', b: '#0a1622' };

  const render = () => {
    root.textContent = '';

    // вкладки
    const tabs = h('div', { style: 'display:flex;gap:4px;' });
    for (const [key, label] of [['color', 'Цвет'], ['gradient', 'Градиент']] as const) {
      const b = h('button', {
        class: 'btn small' + (mode === key ? ' accent' : ''),
        style: 'flex:1;',
        text: label,
      });
      b.onclick = () => { mode = key; render(); };
      tabs.appendChild(b);
    }
    root.appendChild(tabs);

    // предпросмотр текущего значения
    const preview = h('div', {
      style: `height:26px;border-radius:6px;border:1px solid var(--border,#2a3038);background:${mode === 'gradient' ? composeGradient(grad) : value};`,
      title: mode === 'gradient' ? composeGradient(grad) : value,
    });
    root.appendChild(preview);

    if (mode === 'color') {
      // сетка образцов
      const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(9,1fr);gap:5px;' });
      for (const sw of PALETTE) {
        const cell = h('button', {
          title: `${sw.name} — ${sw.c}`,
          style: `aspect-ratio:1;border-radius:5px;border:1px solid rgba(255,255,255,${value.toLowerCase() === sw.c ? '.85' : '.15'});cursor:pointer;background:${sw.c};padding:0;`,
        });
        cell.onclick = () => onChange(sw.c);
        grid.appendChild(cell);
      }
      root.appendChild(grid);
      root.appendChild(colorField(value, onChange));
    } else {
      // пресеты градиентов
      const presets = h('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:5px;' });
      for (const p of GRADIENT_PRESETS) {
        const cell = h('button', {
          title: p.name,
          style: `height:22px;border-radius:5px;border:1px solid rgba(255,255,255,${value === p.css ? '.85' : '.15'});cursor:pointer;background:${p.css};padding:0;`,
        });
        cell.onclick = () => onChange(p.css);
        presets.appendChild(cell);
      }
      root.appendChild(presets);

      // конструктор
      const commit = () => onChange(composeGradient(grad));
      const dirRow = h('div', { style: 'display:flex;gap:4px;' });
      const dirs: [string, () => void][] = [
        ['↓', () => { grad.kind = 'linear'; grad.angle = 180; }],
        ['↘', () => { grad.kind = 'linear'; grad.angle = 135; }],
        ['→', () => { grad.kind = 'linear'; grad.angle = 90; }],
        ['↗', () => { grad.kind = 'linear'; grad.angle = 45; }],
        ['◉', () => { grad.kind = 'radial'; }],
      ];
      for (const [glyph, apply] of dirs) {
        const active = glyph === '◉' ? grad.kind === 'radial'
          : grad.kind === 'linear' && { '↓': 180, '↘': 135, '→': 90, '↗': 45 }[glyph] === grad.angle;
        const b = h('button', {
          class: 'btn small' + (active ? ' accent' : ''),
          style: 'flex:1;',
          text: glyph,
          title: glyph === '◉' ? 'Радиальный (свет из центра)' : 'Направление градиента',
        });
        b.onclick = () => { apply(); commit(); };
        dirRow.appendChild(b);
      }
      root.appendChild(dirRow);
      root.appendChild(colorField(grad.a, (v) => { grad.a = v; commit(); }));
      root.appendChild(colorField(grad.b, (v) => { grad.b = v; commit(); }));
    }
  };
  render();
  return root;
}
