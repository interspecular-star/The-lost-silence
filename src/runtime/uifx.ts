// ============================================================
// Визуальные трюки поверх основного UI: переливание редких предметов,
// блик при наведении на вариант ответа, праздничный баннер ачивки.
// Внедряются в <head> один раз (общий документ для предпросмотра и экспорта).
// ============================================================

const UI_FX_CSS = `
/* ---- переливание легендарных/архонт-предметов (инвентарь/экипировка) ---- */
.tls-item-shine { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.tls-item-shine::after {
  content: ''; position: absolute; top: -50%; left: -60%; width: 40%; height: 200%;
  background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%);
  transform: rotate(20deg);
  animation: tls-item-sweep 3.2s linear infinite;
}
@keyframes tls-item-sweep { 0% { left: -60%; } 35% { left: 120%; } 100% { left: 120%; } }

/* ---- блик при наведении на вариант ответа (одноразовый, не зацикленный) ---- */
.dchoice-sheen {
  position: absolute; top: 0; left: -40%; width: 30%; height: 100%;
  background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%);
  transform: skewX(-15deg); pointer-events: none;
}
.dchoice-sheen.play { animation: tls-choice-sweep 0.55s ease-out; }
@keyframes tls-choice-sweep { from { left: -40%; } to { left: 130%; } }

/* ---- праздничный баннер разблокировки ачивки ---- */
.tls-ach-popup {
  position: absolute; top: 6%; left: 50%;
  background: rgba(8,13,10,0.94); border: 1px solid rgba(244,211,94,0.5);
  border-top: 2px solid #f4d35e; padding: 0.7em 1.6em 0.7em 1.3em;
  display: flex; align-items: center; gap: 0.7em;
  pointer-events: none; z-index: 60; overflow: hidden;
  transform: translate(-50%, -12px) scale(0.9); opacity: 0;
  animation: tls-ach-in 0.5s cubic-bezier(.34,1.56,.64,1) forwards,
             tls-ach-out 0.4s ease-in 3.1s forwards;
}
.tls-ach-popup .tls-ach-icon { font-size: 1.6em; line-height: 1; }
.tls-ach-popup .tls-ach-kicker { font-size: 0.6em; letter-spacing: 3px; color: #8a7a4a; }
.tls-ach-popup .tls-ach-title { color: #f4d35e; letter-spacing: 1px; font-size: 0.95em; }
.tls-ach-popup::after {
  content: ''; position: absolute; top: 0; left: -60%; width: 35%; height: 100%;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,0.4), transparent);
  transform: skewX(-15deg);
  animation: tls-ach-sweep 1s ease-out 0.5s 1;
}
@keyframes tls-ach-in { to { transform: translate(-50%, 0) scale(1); opacity: 1; } }
@keyframes tls-ach-out { to { transform: translate(-50%, -12px) scale(0.95); opacity: 0; } }
@keyframes tls-ach-sweep { from { left: -60%; } to { left: 130%; } }

@media (prefers-reduced-motion: reduce) {
  .tls-item-shine::after, .dchoice-sheen.play, .tls-ach-popup, .tls-ach-popup::after {
    animation: none !important;
  }
  .tls-ach-popup { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
`;

let injected = false;

/** Внедряет CSS для трюков-переливаний (идемпотентно — безопасно звать из каждого Engine) */
export function ensureUiFxStyles() {
  if (injected || document.getElementById('tls-uifx-style')) { injected = true; return; }
  const style = document.createElement('style');
  style.id = 'tls-uifx-style';
  style.textContent = UI_FX_CSS;
  document.head.appendChild(style);
  injected = true;
}
