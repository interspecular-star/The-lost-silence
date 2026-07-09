// ============================================================
// «Материалы» блоков: spatial-поверхность (стекло) + анимированные
// рамки. Этап 1 — диалоговый блок; дальше варианты ответа, кнопки,
// фракции (roadmap). Идеи рамок «Комета»/«Разряд» — по мотивам
// reactbits.dev StarBorder/ElectricBorder, реализация — свой CSS/SVG.
// ============================================================

import { BoxStyle } from '../core/types';

/** Подписи рамок для редактора */
export const BOX_BORDER_LABELS: Record<string, string> = {
  none: 'Без анимации',
  shimmer: 'Перелив — подсветка течёт по рамке',
  star: 'Комета — светящаяся точка обегает контур',
  electric: 'Разряд — рамка дрожит живым током',
  scan: 'Скан — редкая вспышка по верхней линии',
  pulse: 'Дыхание — рамка мягко пульсирует',
};

export const BOX_SURFACE_LABELS: Record<string, string> = {
  default: 'Классика (как было)',
  spatial: 'Spatial — стекло, скругления, рамка',
};

export interface ApplyBoxOpts {
  /** panel — диалоговый блок (полоса, скругление сверху); button — вариант/кнопка (пилюля) */
  kind?: 'panel' | 'button';
}

/** Фон с учётом стекла: для spatial подмешивает прозрачность, иначе возвращает базу */
export function glassBg(base: string, style: BoxStyle | undefined): string {
  if ((style?.surface ?? 'default') !== 'spatial') return base;
  const glass = Math.min(40, Math.max(0, style?.glass ?? 14));
  return `color-mix(in srgb, ${base} ${100 - glass}%, transparent)`;
}

/**
 * Применяет материал к блоку. Вызывать ПОСЛЕ того, как блок получил
 * свои базовые инлайн-стили (мы переопределяем их точечно).
 * accent — цвет рамки (фракция или акцент темы).
 */
export function applyBoxFx(box: HTMLElement, style: BoxStyle | undefined, accent: string, opts: ApplyBoxOpts = {}) {
  ensureBoxFxStyles();
  const kind = opts.kind ?? 'panel';
  const surface = style?.surface ?? 'default';
  const border = style?.border ?? 'none';
  box.style.setProperty('--bfx-accent', accent);

  const radius = Math.max(0, style?.radius ?? (kind === 'button' ? 10 : 16));
  const ringRadius = surface !== 'spatial' ? '0'
    : kind === 'button' ? `${radius}px` : `${radius}px ${radius}px 0 0`;

  if (surface === 'spatial') {
    const glass = Math.min(40, Math.max(0, style?.glass ?? 14)); // % прозрачности стекла
    box.classList.add('bfx-spatial');
    if (kind === 'panel') {
      box.style.borderRadius = `${radius}px ${radius}px 0 0`;
      box.style.background = `color-mix(in srgb, var(--dbox-bg) ${100 - glass}%, transparent)`;
      box.style.backdropFilter = 'blur(18px) saturate(1.15)';
      box.style.borderTop = '1px solid color-mix(in srgb, var(--bfx-accent) 26%, transparent)';
      box.style.borderLeft = '1px solid color-mix(in srgb, var(--bfx-accent) 16%, rgba(255,255,255,0.06))';
      box.style.borderRight = '1px solid color-mix(in srgb, var(--bfx-accent) 16%, rgba(255,255,255,0.06))';
      box.style.borderBottom = 'none';
      box.style.boxShadow = '0 -12px 44px rgba(0,0,0,0.35)';
    } else {
      // кнопка: скругление со всех сторон, hairline по периметру;
      // фон НЕ трогаем — вызывающий сам ставит glassBg(база/hover)
      box.style.borderRadius = `${radius}px`;
      box.style.border = '1px solid color-mix(in srgb, var(--bfx-accent) 18%, rgba(255,255,255,0.05))';
      box.style.backdropFilter = 'blur(10px)';
    }
  }

  if (border !== 'none') {
    const ring = document.createElement('div');
    ring.className = `bfx-ring bfx-${border}` + (style?.hoverOnly ? ' bfx-hoveronly' : '');
    ring.style.borderRadius = ringRadius;
    if (style?.hoverOnly) box.classList.add('bfx-hover-host');
    if (border === 'electric') ensureElectricFilter();
    box.appendChild(ring);
  }
}

// ---------- SVG-фильтр для «Разряда» ----------
function ensureElectricFilter() {
  if (document.getElementById('bfx-electric-svg')) return;
  const holder = document.createElement('div');
  holder.innerHTML = `
<svg id="bfx-electric-svg" width="0" height="0" style="position:absolute;pointer-events:none;" aria-hidden="true">
  <filter id="bfx-electric-f" x="-30%" y="-30%" width="160%" height="160%">
    <feTurbulence type="turbulence" baseFrequency="0.015 0.09" numOctaves="2" seed="2" result="n">
      <animate attributeName="seed" values="1;2;3;4;5;6;7;8;9;10" dur="0.9s" repeatCount="indefinite" calcMode="discrete"/>
    </feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>`;
  document.body.appendChild(holder.firstElementChild!);
}

// ---------- стили ----------
let injected = false;
export function ensureBoxFxStyles() {
  if (injected || document.getElementById('tls-boxfx-styles')) { injected = true; return; }
  injected = true;
  const st = document.createElement('style');
  st.id = 'tls-boxfx-styles';
  st.textContent = `
/* угол конического градиента, анимируемый плавно (бегущие рамки) */
@property --bfx-a {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

/* кольцо-рамка: слой поверх границы блока; маска оставляет только обод */
.bfx-ring {
  position: absolute;
  inset: -1px;
  padding: 2px;
  pointer-events: none;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
}

/* --- Перелив: тёплая полоса света медленно течёт по контуру --- */
.bfx-shimmer::before {
  content: '';
  position: absolute;
  inset: 0;
  background: conic-gradient(from var(--bfx-a) at 50% 50%,
    transparent 0 60%,
    color-mix(in srgb, var(--bfx-accent) 45%, transparent) 74%,
    var(--bfx-accent) 82%,
    color-mix(in srgb, var(--bfx-accent) 45%, transparent) 90%,
    transparent 98% 100%);
  animation: bfx-spin 7s linear infinite;
}

/* --- Комета: яркая голова с хвостом обегает контур (по мотивам StarBorder) --- */
.bfx-star::before, .bfx-star::after {
  content: '';
  position: absolute;
  inset: 0;
  background: conic-gradient(from var(--bfx-a) at 50% 50%,
    transparent 0 86%,
    color-mix(in srgb, var(--bfx-accent) 55%, transparent) 94%,
    color-mix(in srgb, var(--bfx-accent) 45%, white) 96.6%,
    transparent 97.4% 100%);
  animation: bfx-spin 4.6s linear infinite;
}
.bfx-star::after { filter: blur(4px); }

/* --- Разряд: живой ток по рамке (по мотивам ElectricBorder, SVG-турбулентность) --- */
.bfx-electric::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--bfx-accent);
  opacity: 0.85;
  filter: url(#bfx-electric-f) drop-shadow(0 0 4px color-mix(in srgb, var(--bfx-accent) 70%, transparent));
}

/* --- Скан: редкая вспышка пробегает по верхней кромке --- */
.bfx-scan::before {
  content: '';
  position: absolute;
  top: 0; left: 0;
  height: 2px;
  width: 30%;
  background: linear-gradient(90deg, transparent, var(--bfx-accent), transparent);
  animation: bfx-scan-a 6s linear infinite;
}

/* --- Дыхание: рамка мягко пульсирует яркостью --- */
.bfx-pulse::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--bfx-accent);
  opacity: 0.22;
  animation: bfx-pulse-a 4.2s ease-in-out infinite;
}

/* рамка «только при наведении» (варианты ответа, кнопки) */
.bfx-hoveronly { opacity: 0; transition: opacity 0.3s ease; }
.bfx-hover-host:hover > .bfx-hoveronly { opacity: 1; }

@keyframes bfx-spin { to { --bfx-a: 360deg; } }
@keyframes bfx-scan-a {
  0% { transform: translateX(-110%); }
  32% { transform: translateX(444%); }
  100% { transform: translateX(444%); }
}
@keyframes bfx-pulse-a { 50% { opacity: 0.6; } }

@media (prefers-reduced-motion: reduce) {
  .bfx-ring::before, .bfx-ring::after { animation: none !important; filter: none; }
  .bfx-electric::before { opacity: 0.35; }
  .bfx-scan::before { display: none; }
}
`;
  document.head.appendChild(st);
}
