// ============================================================
// Стили диалогового блока: общая анимация входа + фракционные скины.
// Внедряются в <head> один раз (общий документ для предпросмотра и экспорта).
// ============================================================

const DIALOGUE_FX_CSS = `
.dbox {
  background: var(--dbox-bg);
  backdrop-filter: blur(8px);
  border-top: 1px solid color-mix(in srgb, var(--dbox-border-accent, #4fd1c5) 22%, transparent);
  opacity: 0; transform: translateY(10px);
}
.dbox.enter { animation: dbox-in .26s ease-out forwards; }
@keyframes dbox-in { to { opacity: 1; transform: translateY(0); } }

/* база вынесена из инлайн-стиля, чтобы скины ниже могли её переопределять */
.dname { font-size: 0.68em; letter-spacing: 4px; text-transform: uppercase; font-weight: 600; }

.dportrait { opacity: 0; transform: scale(0.85); }
.dbox.enter .dportrait { animation: dportrait-in .3s ease-out .05s forwards; }
@keyframes dportrait-in { to { opacity: 1; transform: scale(1); } }

.dline { opacity: 0; transform: translateY(6px); }
.dbox.enter .dline { animation: dline-in .3s ease-out forwards; }
.dbox.enter .dline:nth-child(1) { animation-delay: .09s; }
.dbox.enter .dline:nth-child(2) { animation-delay: .15s; }
.dbox.enter .dline:nth-child(3) { animation-delay: .21s; }
.dbox.enter .dline:nth-child(4) { animation-delay: .27s; }
.dbox.enter .dline:nth-child(n+5) { animation-delay: .33s; }
@keyframes dline-in { to { opacity: 1; transform: translateY(0); } }

.dhint { opacity: 0; }
.dbox.enter .dhint { animation: dhint-in .3s ease-out .3s forwards, dhint-breathe 2.6s ease-in-out 1s infinite; }
@keyframes dhint-in { to { opacity: .4; } }
@keyframes dhint-breathe { 0%, 100% { opacity: .3; } 50% { opacity: .55; } }

.dchoice { opacity: 0; transform: translateX(-6px); }
.dbox.enter .dchoice { animation: dchoice-in .28s ease-out forwards; }
.dbox.enter .dchoice:nth-child(1) { animation-delay: .06s; }
.dbox.enter .dchoice:nth-child(2) { animation-delay: .11s; }
.dbox.enter .dchoice:nth-child(3) { animation-delay: .16s; }
.dbox.enter .dchoice:nth-child(4) { animation-delay: .21s; }
.dbox.enter .dchoice:nth-child(n+5) { animation-delay: .26s; }
@keyframes dchoice-in { to { opacity: 1; transform: translateX(0); } }

@media (prefers-reduced-motion: reduce) {
  .dbox, .dbox * { animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important; }
}

/* ---- Flux Nomads: рабочий город — сварные уголки, пунктир вместо ровной линии ---- */
.dskin-flux { border-top-style: dashed; border-top-width: 2px; }
.dskin-flux::before, .dskin-flux::after {
  content: ''; position: absolute; width: 14px; height: 14px;
  border: 1px solid var(--dbox-border-accent); opacity: .8;
}
.dskin-flux::before { top: -1px; left: 10px; border-right: none; border-bottom: none; }
.dskin-flux::after { top: -1px; right: 22px; border-left: none; border-bottom: none; transform: translateY(3px); }
.dskin-flux .dname { font-weight: 700; }

/* ---- Sylvarium: выращенная форма — мягкие углы, простор в имени ---- */
.dskin-sylvarium { border-radius: 9px; }
.dskin-sylvarium .dname { letter-spacing: 5px; }

/* ---- Woodhaven: анти-глянец — без блюра, зерно, засечки в имени ---- */
.dskin-woodhaven {
  backdrop-filter: none;
  background-image: radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 3px 3px;
}
.dskin-woodhaven .dname { font-family: Georgia, 'Times New Roman', serif; letter-spacing: 1px; font-size: 0.72em; text-transform: none; }

/* ---- Cavernium: давление и дисциплина — плотный фон, двойная линия ---- */
.dskin-cavernium { box-shadow: inset 0 3px 0 -2px var(--dbox-border-accent); }
.dskin-cavernium .dname { letter-spacing: 2px; }

/* ---- Aeralis: высота и дистанция — прозрачность, широкий трекинг ---- */
.dskin-aeralis { backdrop-filter: blur(16px); }
.dskin-aeralis .dname { letter-spacing: 7px; }

/* ---- Hydrosynth: свет сквозь толщу воды — мягкие углы + медленный блик по линии ---- */
.dskin-hydrosynth {
  border-radius: 9px;
  border-top-color: transparent;
  background-image:
    linear-gradient(var(--dbox-bg), var(--dbox-bg)),
    linear-gradient(90deg, transparent, var(--dbox-border-accent), transparent);
  background-repeat: no-repeat;
  background-size: 100% 100%, 220% 2px;
  background-position: 0 0, -60% 0;
  animation: dhydro-caustic 7s linear infinite;
}
.dskin-hydrosynth .drel-fill { box-shadow: 0 0 6px 0 var(--dbox-border-accent); }
@keyframes dhydro-caustic { to { background-position: 0 0, 160% 0; } }
@media (prefers-reduced-motion: reduce) {
  .dskin-hydrosynth { animation: none; background-position: 0 0, 50% 0; }
}
`;

let injected = false;

/** Внедряет CSS диалогового блока в документ (идемпотентно — безопасно звать из каждого Engine) */
export function ensureDialogueFxStyles() {
  if (injected || document.getElementById('tls-dialoguefx-style')) { injected = true; return; }
  const style = document.createElement('style');
  style.id = 'tls-dialoguefx-style';
  style.textContent = DIALOGUE_FX_CSS;
  document.head.appendChild(style);
  injected = true;
}
