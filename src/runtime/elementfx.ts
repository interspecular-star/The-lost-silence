// ============================================================
// Появление/исчезновение элементов сцены: титры глав, флэшбэки,
// кинематографичные страницы. Работает в игре/предпросмотре;
// на холсте редактора элементы статичны.
// ============================================================

import { ElementFx, TextGuard } from '../core/types';

export const TEXT_GUARD_LABELS: Record<string, string> = {
  '': '— нет —',
  shadow: 'Тень — мягкая, как в субтитрах',
  outline: 'Контур — тонкая тёмная кайма букв',
  scrim: 'Подложка — затемняющая полоса за текстом',
};

/**
 * Читаемость текста на пёстром/светлом фоне. Статичный стиль (не эффект):
 * одинаково рисуется на холсте редактора и в игре. Размеры в em —
 * масштабируются вместе со шрифтом.
 */
export function applyTextGuard(d: HTMLElement, kind: TextGuard | undefined, power?: number) {
  if (!kind) return;
  const p = Math.max(1, Math.min(3, power ?? 2)) - 1;
  if (kind === 'shadow') {
    const a = [0.45, 0.68, 0.9][p];
    d.style.textShadow = `0 0.05em 0.14em rgba(0,0,0,${a}), 0 0 0.6em rgba(0,0,0,${(a * 0.6).toFixed(2)})`;
  } else if (kind === 'outline') {
    const a = [0.5, 0.75, 1][p];
    const r = 0.035;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
    d.style.textShadow = dirs
      .map(([x, y]) => `${(x * r).toFixed(3)}em ${(y * r).toFixed(3)}em 0 rgba(0,0,0,${a})`)
      .join(', ');
  } else { // scrim
    const a = [0.28, 0.44, 0.6][p];
    d.style.background = `rgba(3,6,10,${a})`;
    d.style.backdropFilter = 'blur(5px)';
    if (!d.style.borderRadius || d.style.borderRadius === '0px') d.style.borderRadius = '10px';
  }
}

/**
 * Навешивает анимации на элемент. Таймер исчезновения кладётся в timers —
 * движок чистит их при пересборке сцены/уничтожении.
 */
export function applyElementFx(d: HTMLElement, fx: ElementFx, timers: number[]) {
  ensureElementFxStyles();
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (fx.in && !reduced) {
    d.classList.add(`efx-in-${fx.in}`);
    d.style.setProperty('--efx-in-delay', `${fx.inDelay ?? 0}s`);
    d.style.setProperty('--efx-in-dur', `${fx.inDur ?? 0.9}s`);
  }
  if (fx.outAt !== undefined) {
    const t = window.setTimeout(() => {
      d.style.setProperty('--efx-out-dur', reduced ? '0s' : `${fx.outDur ?? 0.9}s`);
      d.classList.add(`efx-out-${fx.out ?? 'fade'}`);
    }, Math.max(0, fx.outAt) * 1000);
    timers.push(t);
  }
}

let injected = false;
export function ensureElementFxStyles() {
  if (injected || document.getElementById('tls-elementfx-styles')) { injected = true; return; }
  injected = true;
  const st = document.createElement('style');
  st.id = 'tls-elementfx-styles';
  st.textContent = `
/* появления: keyframes задают оба конца, 'both' прячет на время задержки */
.efx-in-fade { animation: efx-fade-in var(--efx-in-dur, .9s) ease both; animation-delay: var(--efx-in-delay, 0s); }
.efx-in-blur { animation: efx-blur-in var(--efx-in-dur, .9s) ease both; animation-delay: var(--efx-in-delay, 0s); }
.efx-in-rise { animation: efx-rise-in var(--efx-in-dur, .9s) cubic-bezier(.2,.7,.2,1) both; animation-delay: var(--efx-in-delay, 0s); }
.efx-in-zoom { animation: efx-zoom-in var(--efx-in-dur, .9s) cubic-bezier(.2,.7,.2,1) both; animation-delay: var(--efx-in-delay, 0s); }

@keyframes efx-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes efx-blur-in { from { opacity: 0; filter: blur(10px); } to { opacity: 1; filter: blur(0); } }
@keyframes efx-rise-in { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
@keyframes efx-zoom-in { from { opacity: 0; transform: scale(1.07); } to { opacity: 1; transform: none; } }

/* исчезновения: включаются классом по таймеру, элемент гаснет и перестаёт ловить клики */
.efx-out-fade { animation: efx-fade-out var(--efx-out-dur, .9s) ease forwards !important; pointer-events: none !important; }
.efx-out-blur { animation: efx-blur-out var(--efx-out-dur, .9s) ease forwards !important; pointer-events: none !important; }
.efx-out-rise { animation: efx-rise-out var(--efx-out-dur, .9s) ease forwards !important; pointer-events: none !important; }
.efx-out-zoom { animation: efx-zoom-out var(--efx-out-dur, .9s) ease forwards !important; pointer-events: none !important; }

@keyframes efx-fade-out { to { opacity: 0; } }
@keyframes efx-blur-out { to { opacity: 0; filter: blur(10px); } }
@keyframes efx-rise-out { to { opacity: 0; transform: translateY(-20px); } }
@keyframes efx-zoom-out { to { opacity: 0; transform: scale(1.05); } }
`;
  document.head.appendChild(st);
}
