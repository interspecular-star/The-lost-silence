// ============================================================
// Стили и текстуры для условных визуальных эффектов фона.
// Внедряются в <head> один раз (общий документ для предпросмотра и экспорта).
// ============================================================

const NOISE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>
<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/>
<feColorMatrix type='saturate' values='0'/></filter>
<rect width='100%' height='100%' filter='url(#n)' opacity='0.9'/></svg>`;
const NOISE_URI = `url("data:image/svg+xml,${encodeURIComponent(NOISE_SVG)}")`;

const BG_FX_CSS = `
.tls-bgw-kb.tls-fx-on { animation: tls-bg-kenburns 16s ease-in-out infinite; }
.tls-bgw-drift.tls-fx-on { animation: tls-bg-drift 22s ease-in-out infinite; }
.tls-bgw-shake.tls-fx-on { animation: tls-bg-shake 0.5s linear infinite; }
.tls-bgw-glitch.tls-fx-on { animation: tls-bg-glitch 2.6s steps(1) infinite; }

@keyframes tls-bg-kenburns { 0%,100% { transform: scale(1); } 50% { transform: scale(calc(1 + var(--fx-i,0.5) * 0.10)); } }
@keyframes tls-bg-drift {
  0%,100% { transform: translate(0,0); }
  25% { transform: translate(calc(var(--fx-i,0.5) * 1.4%), calc(var(--fx-i,0.5) * -1%)); }
  50% { transform: translate(0, calc(var(--fx-i,0.5) * 1%)); }
  75% { transform: translate(calc(var(--fx-i,0.5) * -1.4%), calc(var(--fx-i,0.5) * 0.6%)); }
}
@keyframes tls-bg-shake {
  0%,100% { transform: translate(0,0); }
  10% { transform: translate(calc(var(--fx-i,0.5) * -1%), calc(var(--fx-i,0.5) * 0.6%)); }
  20% { transform: translate(calc(var(--fx-i,0.5) * 0.9%), calc(var(--fx-i,0.5) * -0.5%)); }
  30% { transform: translate(calc(var(--fx-i,0.5) * -0.8%), calc(var(--fx-i,0.5) * 0.4%)); }
  40% { transform: translate(calc(var(--fx-i,0.5) * 0.6%), calc(var(--fx-i,0.5) * -0.6%)); }
  50% { transform: translate(calc(var(--fx-i,0.5) * -0.5%), calc(var(--fx-i,0.5) * 0.3%)); }
  60% { transform: translate(calc(var(--fx-i,0.5) * 0.4%), calc(var(--fx-i,0.5) * -0.3%)); }
  70% { transform: translate(calc(var(--fx-i,0.5) * -0.3%), 0); }
  80% { transform: translate(calc(var(--fx-i,0.5) * 0.2%), calc(var(--fx-i,0.5) * -0.2%)); }
  90% { transform: translate(calc(var(--fx-i,0.5) * -0.1%), 0); }
}
@keyframes tls-bg-glitch {
  0%, 91%, 100% { transform: translate(0,0); filter: none; }
  92% { transform: translate(calc(var(--fx-i,0.5) * -2%), 0); filter: hue-rotate(60deg) saturate(2); }
  93% { transform: translate(calc(var(--fx-i,0.5) * 1.6%), calc(var(--fx-i,0.5) * 0.4%)); filter: hue-rotate(-40deg); }
  94% { transform: translate(calc(var(--fx-i,0.5) * -1%), 0); filter: invert(0.2); }
  95% { transform: translate(0,0); filter: none; }
}
@keyframes tls-bg-scan { 0% { background-position-y: 0; } 100% { background-position-y: 40px; } }
@keyframes tls-bg-noisepos {
  0%,100% { background-position: 0 0; } 10% { background-position: -8% 3%; } 20% { background-position: 5% -6%; }
  30% { background-position: -4% -3%; } 40% { background-position: 7% 5%; } 50% { background-position: -6% 2%; }
  60% { background-position: 3% -7%; } 70% { background-position: -2% 6%; } 80% { background-position: 6% -2%; }
  90% { background-position: -5% 4%; }
}
@keyframes tls-bg-pulse { 0%,100% { opacity: 0; } 50% { opacity: var(--fx-i,0.5); } }
@keyframes tls-bg-flicker {
  0%,100% { opacity: 0; } 5% { opacity: calc(var(--fx-i,0.5) * 0.8); } 8% { opacity: 0; }
  15% { opacity: calc(var(--fx-i,0.5) * 0.5); } 18% { opacity: 0.05; } 30% { opacity: 0; }
  55% { opacity: calc(var(--fx-i,0.5) * 0.7); } 58% { opacity: 0; }
  80% { opacity: calc(var(--fx-i,0.5) * 0.3); } 83% { opacity: 0; }
}
@keyframes tls-bg-redpulse { 0%,100% { opacity: calc(var(--fx-i,0.5) * 0.18); } 50% { opacity: calc(var(--fx-i,0.5) * 0.55); } }

.tls-bgfx-vignette { position:absolute; inset:0; background: radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.92) 100%); opacity: var(--fx-i,0.5); }
.tls-bgfx-tint { position:absolute; inset:0; background: var(--fx-color,#3a6ea5); opacity: calc(var(--fx-i,0.5) * 0.6); mix-blend-mode: color; }
.tls-bgfx-scanlines {
  position:absolute; inset:0; opacity: calc(var(--fx-i,0.5) * 0.6);
  background-image: repeating-linear-gradient(to bottom, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 1px, transparent 2px, transparent 4px);
  animation: tls-bg-scan 6s linear infinite; mix-blend-mode: multiply;
}
.tls-bgfx-noise {
  position:absolute; inset:0; opacity: calc(var(--fx-i,0.5) * 0.5);
  background-image: var(--tls-noise-uri); background-size: 180px 180px;
  animation: tls-bg-noisepos 0.6s steps(6) infinite; mix-blend-mode: overlay;
}
.tls-bgfx-grain {
  position:absolute; inset:0; opacity: calc(var(--fx-i,0.5) * 0.22);
  background-image: var(--tls-noise-uri); background-size: 260px 260px;
  animation: tls-bg-noisepos 1.4s steps(8) infinite; mix-blend-mode: overlay;
}
.tls-bgfx-pulse { position:absolute; inset:0; background:#fff; mix-blend-mode: overlay; animation: tls-bg-pulse 2.6s ease-in-out infinite; }
.tls-bgfx-flicker { position:absolute; inset:0; background:#000; animation: tls-bg-flicker 3.2s linear infinite; }
.tls-bgfx-redPulse {
  position:absolute; inset:0; background: radial-gradient(ellipse at center, rgba(210,30,30,0.85), transparent 70%);
  animation: tls-bg-redpulse 1.6s ease-in-out infinite;
}
.tls-bgfx-chroma { position:absolute; inset:0; mix-blend-mode: screen; }
.tls-bgfx-chroma-layer { position:absolute; inset:0; background-size: cover; }
.tls-bgfx-chroma-r { filter: sepia(1) saturate(6) hue-rotate(-50deg); transform: translateX(-0.6%); }
.tls-bgfx-chroma-c { filter: sepia(1) saturate(6) hue-rotate(150deg); transform: translateX(0.6%); }
`;

let injected = false;

/** Внедряет CSS-эффекты фона в документ (идемпотентно — безопасно звать из каждого Engine) */
export function ensureBgFxStyles() {
  if (injected || document.getElementById('tls-bgfx-style')) { injected = true; return; }
  document.documentElement.style.setProperty('--tls-noise-uri', NOISE_URI);
  const style = document.createElement('style');
  style.id = 'tls-bgfx-style';
  style.textContent = BG_FX_CSS;
  document.head.appendChild(style);
  injected = true;
}
