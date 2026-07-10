// ============================================================
// Появление/исчезновение элементов сцены: титры глав, флэшбэки,
// кинематографичные страницы. Работает в игре/предпросмотре;
// на холсте редактора элементы статичны.
// ============================================================

import { ElementFx } from '../core/types';

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
