// Rich text: лёгкая разметка в текстах сцен и диалогов.
//
// Синтаксис: [тег]текст[/тег] или [тег]текст[/] (универсальное закрытие).
// Режимы:    [тег.loop] цикл · [тег.once] один раз · [тег.hover] при наведении.
//            Без суффикса — режим по умолчанию: цикличные эффекты крутятся,
//            эффекты появления играют один раз при показе текста.
// Параметры: [c=#ff9944], [glow=#4fd1c5], [grad=#4fd1c5,#f4d35e],
//            с режимом — [glow.hover=#4fd1c5].
// Неизвестные [скобки] остаются обычным текстом — старый контент не ломается.
//
// Идеи эффектов — reactbits.dev (Glitch/Decrypted/Shiny/Gradient/BlurText),
// реализация — свой CSS/JS: бесшовные циклы (без резкого перезапуска),
// у одноразовых есть чёткий финал, hover мягко возвращается в покой.

export interface RichOptions {
  /** false — статичный режим для холста редактора: стили видны, анимации выключены */
  animate?: boolean;
  /** элемент, наведение на который запускает hover-эффекты (кнопка/вариант ответа);
   *  если не задан — hover-эффект слушает наведение на само слово */
  hoverRoot?: HTMLElement;
}

export type FxKind = 'style' | 'loop' | 'once';
export type FxMode = 'loop' | 'once' | 'hover';

interface TagSpec {
  label: string;
  hint: string;
  kind: FxKind;
  /** разбиение прямого текста на частицы для ступенчатой анимации */
  split?: 'char' | 'word';
  /** сколько параметров-цветов принимает тег (для тулбара) */
  colorParams?: number;
}

export const TEXTFX_TAGS: Record<string, TagSpec> = {
  // стиль (без анимации)
  b: { label: 'Жирный', hint: '[b]важное[/]', kind: 'style' },
  i: { label: 'Курсив', hint: '[i]мысль[/]', kind: 'style' },
  c: { label: 'Цвет', hint: '[c=#f4d35e]слово[/]', kind: 'style', colorParams: 1 },
  // цикличные (бесшовные)
  glow: { label: 'Свечение', hint: '[glow]дышащий свет[/], цвет — [glow=#e06c75]', kind: 'loop', colorParams: 1 },
  wave: { label: 'Волна', hint: '[wave]буквы плывут[/]', kind: 'loop', split: 'char' },
  shake: { label: 'Дрожь', hint: '[shake]страх, холод[/]', kind: 'loop', split: 'char' },
  glitch: { label: 'Глитч', hint: '[glitch]всплески сбоя — Архон[/], внутри только текст', kind: 'loop' },
  shiny: { label: 'Блик', hint: '[shiny]отблеск раз в несколько секунд[/]', kind: 'loop' },
  grad: { label: 'Перелив', hint: '[grad]градиент течёт[/] или [grad=#4fd1c5,#f4d35e]', kind: 'loop', colorParams: 2 },
  flicker: { label: 'Мерцание', hint: '[flicker]неисправная лампа, терминал[/]', kind: 'loop' },
  // появление (один раз, с финалом)
  blur: { label: 'Туман', hint: '[blur]слова проявляются из размытия[/]', kind: 'once', split: 'word' },
  rise: { label: 'Подъём', hint: '[rise]слова всплывают снизу[/]', kind: 'once', split: 'word' },
  type: { label: 'Печать', hint: '[type]буква за буквой[/]', kind: 'once', split: 'char' },
  scramble: { label: 'Расшифровка', hint: '[scramble]знаки встают на место — OldNet[/]', kind: 'once' },
  flash: { label: 'Вспышка', hint: '[flash]яркая вспышка гаснет[/]', kind: 'once' },
};

const MODES: FxMode[] = ['loop', 'once', 'hover'];
const TAG_RE = /\[(\/?)([a-z]+)(?:\.([a-z]+))?(?:=([^\]]*))?\]/gi;
const SCRAMBLE_POOL = '!<>-_/\\|=+*^?#@%&$01АВЕИКМНОРСТХ';

function isColor(v: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(v.trim()) || /^[a-z]+$/i.test(v.trim()) || /^rgba?\(/i.test(v.trim());
}

export function defaultMode(name: string): FxMode {
  return TEXTFX_TAGS[name]?.kind === 'once' ? 'once' : 'loop';
}

/** Быстрая проверка: есть ли в тексте наша разметка (хоть один известный тег) */
export function hasRichMarkup(text: string): boolean {
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(text))) {
    if (TEXTFX_TAGS[m[2].toLowerCase()]) return true;
  }
  return false;
}

/**
 * Разворачивает универсальное закрытие [/] в закрытие верхнего открытого тега:
 * «[glow]свет[/]» → «[glow]свет[/glow]». Лишние [/] остаются как есть (текст).
 */
function resolveUniversalCloses(text: string): string {
  if (!text.includes('[/]')) return text;
  const stack: string[] = [];
  return text.replace(/\[(\/?)([a-z]*)(?:\.([a-z]+))?(?:=([^\]]*))?\]/gi, (whole, close: string, name: string) => {
    const n = name.toLowerCase();
    if (!close && TEXTFX_TAGS[n]) { stack.push(n); return whole; }
    if (close && n && TEXTFX_TAGS[n]) { if (stack[stack.length - 1] === n) stack.pop(); return whole; }
    if (close && !n) { const top = stack.pop(); return top ? `[/${top}]` : whole; }
    return whole;
  });
}

/**
 * Проверка разметки для валидатора. Возвращает текст первой проблемы или null.
 * Проверяет каждый абзац отдельно — движок рисует абзацы независимо,
 * тег не может тянуться через пустую строку.
 */
export function checkRichMarkup(text: string): string | null {
  for (const para of text.split(/\n{2,}/)) {
    const resolved = resolveUniversalCloses(para);
    const stack: string[] = [];
    TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG_RE.exec(resolved))) {
      const name = m[2].toLowerCase();
      if (!TEXTFX_TAGS[name]) continue; // неизвестное — обычный текст
      if (m[1]) {
        if (stack.length === 0) return `закрывающий [/${name}] без открывающего`;
        const top = stack.pop()!;
        if (top !== name) return `тег [${top}] закрыт как [/${name}]`;
      } else {
        if (m[3] && !MODES.includes(m[3].toLowerCase() as FxMode)) {
          return `у тега [${name}] неизвестный режим «.${m[3]}» (есть .loop / .once / .hover)`;
        }
        stack.push(name);
      }
    }
    if (stack.length > 0) return `тег [${stack[stack.length - 1]}] не закрыт (нужен [/${stack[stack.length - 1]}] или [/])`;
  }
  return null;
}

/** Разбирает текст с разметкой и наполняет target готовыми span'ами */
export function renderRichInto(target: HTMLElement, text: string, opts: RichOptions = {}): void {
  const animate = opts.animate !== false;
  target.textContent = '';
  if (!text.includes('[')) { target.textContent = text; return; }
  text = resolveUniversalCloses(text);
  ensureTextFxStyles();
  if (!animate) target.classList.add('tfx-off');

  interface Frame {
    el: HTMLElement; name: string | null;
    split: 'char' | 'word' | null; splitName: string | null;
    counter: { i: number };
  }
  const rootFrame: Frame = { el: target, name: null, split: null, splitName: null, counter: { i: 0 } };
  const stack: Frame[] = [rootFrame];
  const fxSpans: { el: HTMLElement; name: string; kind: FxKind; mode: FxMode }[] = [];
  const glitches: HTMLElement[] = [];
  const top = () => stack[stack.length - 1];

  // задержка ступеньки для частиц (сек)
  const particleDelay = (name: string, i: number): number => {
    switch (name) {
      case 'wave': return (i * 0.08) % 2.4;
      case 'shake': return (i % 4) * 0.11;
      case 'type': return Math.min(i * 0.045, 3);
      case 'blur':
      case 'rise': return Math.min(i * 0.09, 2.5);
      default: return 0;
    }
  };

  const appendText = (t: string) => {
    if (!t) return;
    const f = top();
    if (!f.split || !f.splitName) { f.el.appendChild(document.createTextNode(t)); return; }
    const pieces = f.split === 'char'
      ? Array.from(t)
      : t.split(/(\s+)/).filter(Boolean);
    for (const piece of pieces) {
      if (/^\s+$/.test(piece)) { f.el.appendChild(document.createTextNode(piece)); continue; }
      const sp = document.createElement('span');
      sp.className = `tfx-p tfx-p-${f.splitName}`;
      sp.textContent = piece;
      sp.style.setProperty('--d', `${particleDelay(f.splitName, f.counter.i)}s`);
      f.counter.i++;
      f.el.appendChild(sp);
    }
  };

  const openTag = (name: string, modeRaw?: string, param?: string) => {
    const spec = TEXTFX_TAGS[name];
    const mode: FxMode = spec.kind === 'style' ? 'once'
      : (modeRaw && MODES.includes(modeRaw as FxMode) ? modeRaw as FxMode : defaultMode(name));
    const sp = document.createElement('span');
    sp.className = spec.kind === 'style' ? `tfx-${name}` : `tfx-${name} tfx-m-${mode}`;
    switch (name) {
      case 'b': sp.style.fontWeight = '700'; break;
      case 'i': sp.style.fontStyle = 'italic'; break;
      case 'c': if (param && isColor(param)) sp.style.color = param.trim(); break;
      case 'glow': if (param && isColor(param)) sp.style.setProperty('--tfx-glow', param.trim()); break;
      case 'grad': {
        const [a, b] = (param ?? '').split(',').map((x) => x.trim());
        if (a && isColor(a)) sp.style.setProperty('--tfx-g1', a);
        if (b && isColor(b)) sp.style.setProperty('--tfx-g2', b);
        break;
      }
    }
    if (name === 'glitch') glitches.push(sp);
    if (spec.kind !== 'style') fxSpans.push({ el: sp, name, kind: spec.kind, mode });
    const parent = top();
    parent.el.appendChild(sp);
    stack.push({
      el: sp,
      name,
      // вложенный [b] внутри [wave] не должен ломать разбиение на буквы
      split: spec.split ?? parent.split,
      splitName: spec.split ? name : parent.splitName,
      counter: spec.split ? { i: 0 } : parent.counter,
    });
  };

  TAG_RE.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(text))) {
    const name = m[2].toLowerCase();
    if (!TEXTFX_TAGS[name]) continue; // неизвестный тег — остаётся обычным текстом
    appendText(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1]) {
      if (stack.length > 1) stack.pop();
    } else {
      openTag(name, m[3]?.toLowerCase(), m[4]);
    }
  }
  appendText(text.slice(last));

  // глитч дублирует свой текст в псевдоэлементы
  for (const g of glitches) g.setAttribute('data-text', g.textContent ?? '');

  if (!animate || prefersReducedMotion()) return;

  for (const fx of fxSpans) {
    if (fx.mode === 'hover') {
      wireHover(fx, opts.hoverRoot);
    } else if (fx.name === 'scramble') {
      runScramble(fx.el); // расшифровка — JS-анимация (по мотивам DecryptedText)
    }
  }
}

/** hover-режим: cursor на кнопке/варианте (hoverRoot) или на самом слове */
function wireHover(fx: { el: HTMLElement; name: string; kind: FxKind }, hoverRoot?: HTMLElement) {
  const trigger = hoverRoot ?? fx.el;
  if (fx.kind === 'loop') {
    trigger.addEventListener('mouseenter', () => fx.el.classList.add('tfx-on'));
    trigger.addEventListener('mouseleave', () => fx.el.classList.remove('tfx-on'));
  } else {
    trigger.addEventListener('mouseenter', () => {
      if (fx.name === 'scramble') { runScramble(fx.el); return; }
      fx.el.classList.remove('tfx-run');
      void fx.el.offsetWidth; // перезапуск CSS-анимации
      fx.el.classList.add('tfx-run');
    });
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Расшифровка: незанятые знаки перебираются (приглушённо), раскрытие слева направо */
function runScramble(sp: HTMLElement) {
  if (sp.dataset.tfxRun === '1') return; // уже идёт
  const original = sp.dataset.tfxText ?? (sp.textContent ?? '');
  sp.dataset.tfxText = original;
  if (!original.trim()) return;
  sp.dataset.tfxRun = '1';
  const chars = Array.from(original);
  // строим частицы: раскрытые — обычные, нераскрытые — приглушённые
  sp.textContent = '';
  const cells: (HTMLElement | null)[] = chars.map((ch) => {
    if (/\s/.test(ch)) { sp.appendChild(document.createTextNode(ch)); return null; }
    const c = document.createElement('span');
    c.className = 'tfx-scrx';
    c.textContent = SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
    sp.appendChild(c);
    return c;
  });
  const total = Math.min(1800, 350 + chars.length * 40);
  const start = performance.now();
  let ticks = 0;
  const tick = () => {
    // первый тик — отложенный: renderRichInto зовут ДО вставки элемента в документ,
    // и синхронная проверка isConnected убивала бы анимацию на старте
    if (!sp.isConnected && ticks > 1) { sp.dataset.tfxRun = ''; return; }
    ticks++;
    const t = (performance.now() - start) / total;
    const revealed = Math.floor(Math.min(1, t) * chars.length);
    cells.forEach((c, i) => {
      if (!c) return;
      if (i < revealed) {
        if (c.className) { c.className = ''; c.textContent = chars[i]; }
      } else {
        c.textContent = SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
      }
    });
    if (revealed < chars.length) setTimeout(tick, 34);
    else { sp.textContent = original; sp.dataset.tfxRun = ''; }
  };
  setTimeout(tick, 20);
}

// ---------- стили ----------
let injected = false;
export function ensureTextFxStyles() {
  if (injected || document.getElementById('tls-textfx-styles')) { injected = true; return; }
  injected = true;
  const st = document.createElement('style');
  st.id = 'tls-textfx-styles';
  st.textContent = `
/* базовое состояние каждого эффекта = "покой": без анимации текст выглядит нормально.
   Анимация включается классами режима: .tfx-m-loop / .tfx-m-once (счётчик итераций)
   / .tfx-m-hover.tfx-on (циклы) / .tfx-m-hover.tfx-run (появления). */

.tfx-p { display: inline-block; }

/* --- свечение: медленное дыхание, бесшовный синус --- */
.tfx-glow { --tfx-glow: currentColor; text-shadow: 0 0 0.28em var(--tfx-glow); transition: text-shadow 0.45s ease; }
.tfx-glow.tfx-m-loop, .tfx-glow.tfx-m-once, .tfx-glow.tfx-m-hover.tfx-on {
  animation: tfx-glow-a 3.8s ease-in-out infinite;
}
.tfx-glow.tfx-m-once { animation-iteration-count: 2; }
@keyframes tfx-glow-a {
  0%, 100% { text-shadow: 0 0 0.28em var(--tfx-glow); }
  50% { text-shadow: 0 0 0.5em var(--tfx-glow), 0 0 1.1em var(--tfx-glow); }
}

/* --- волна: мягкий синус по буквам --- */
.tfx-p-wave { transition: transform 0.35s ease; }
.tfx-wave.tfx-m-loop .tfx-p-wave, .tfx-wave.tfx-m-once .tfx-p-wave, .tfx-wave.tfx-m-hover.tfx-on .tfx-p-wave {
  animation: tfx-wave-a 2.4s ease-in-out infinite;
  animation-delay: var(--d, 0s);
}
.tfx-wave.tfx-m-once .tfx-p-wave { animation-iteration-count: 2; }
@keyframes tfx-wave-a {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-0.14em); }
}

/* --- дрожь: мелкая, непрерывная --- */
.tfx-p-shake { transition: transform 0.3s ease; }
.tfx-shake.tfx-m-loop .tfx-p-shake, .tfx-shake.tfx-m-once .tfx-p-shake, .tfx-shake.tfx-m-hover.tfx-on .tfx-p-shake {
  animation: tfx-shake-a 0.5s linear infinite;
  animation-delay: var(--d, 0s);
}
.tfx-shake.tfx-m-once .tfx-p-shake { animation-iteration-count: 5; }
@keyframes tfx-shake-a {
  0%, 100% { transform: translate(0, 0); }
  20% { transform: translate(-0.02em, 0.016em); }
  40% { transform: translate(0.022em, -0.012em); }
  60% { transform: translate(-0.014em, -0.02em); }
  80% { transform: translate(0.018em, 0.02em); }
}

/* --- глитч: короткие всплески с паузами, между ними текст чистый --- */
.tfx-glitch { position: relative; display: inline-block; }
.tfx-glitch::before, .tfx-glitch::after {
  content: attr(data-text);
  position: absolute; top: 0; left: 0; width: 100%;
  overflow: hidden; pointer-events: none;
  opacity: 0; clip-path: inset(50% 0 50% 0);
}
.tfx-glitch::before { text-shadow: 0.035em 0 rgba(0, 255, 234, 0.6); }
.tfx-glitch::after { text-shadow: -0.035em 0 rgba(255, 0, 76, 0.6); }
.tfx-glitch.tfx-m-loop::before, .tfx-glitch.tfx-m-once::before, .tfx-glitch.tfx-m-hover.tfx-on::before {
  animation: tfx-glitch-a 3.9s steps(1, end) infinite;
}
.tfx-glitch.tfx-m-loop::after, .tfx-glitch.tfx-m-once::after, .tfx-glitch.tfx-m-hover.tfx-on::after {
  animation: tfx-glitch-b 3.9s steps(1, end) infinite;
}
.tfx-glitch.tfx-m-once::before, .tfx-glitch.tfx-m-once::after { animation-iteration-count: 1; }
@keyframes tfx-glitch-a {
  0%, 14%, 60%, 100% { opacity: 0; clip-path: inset(50% 0 50% 0); transform: translateX(0); }
  8%  { opacity: 1; clip-path: inset(12% 0 62% 0); transform: translateX(-0.05em); }
  10% { opacity: 1; clip-path: inset(68% 0 8% 0); transform: translateX(0.04em); }
  12% { opacity: 1; clip-path: inset(38% 0 36% 0); transform: translateX(-0.03em); }
  54% { opacity: 1; clip-path: inset(58% 0 18% 0); transform: translateX(0.05em); }
  57% { opacity: 1; clip-path: inset(8% 0 74% 0); transform: translateX(-0.04em); }
}
@keyframes tfx-glitch-b {
  0%, 15%, 61%, 100% { opacity: 0; clip-path: inset(50% 0 50% 0); transform: translateX(0); }
  8%  { opacity: 1; clip-path: inset(66% 0 10% 0); transform: translateX(0.05em); }
  11% { opacity: 1; clip-path: inset(14% 0 58% 0); transform: translateX(-0.04em); }
  13% { opacity: 1; clip-path: inset(44% 0 30% 0); transform: translateX(0.03em); }
  55% { opacity: 1; clip-path: inset(10% 0 70% 0); transform: translateX(-0.05em); }
  58% { opacity: 1; clip-path: inset(62% 0 20% 0); transform: translateX(0.04em); }
}

/* --- блик: один проход раз в ~5с, между проходами покой (края вне текста) --- */
.tfx-shiny {
  display: inline-block;
  color: color-mix(in srgb, currentColor 74%, transparent);
  background: linear-gradient(115deg, rgba(255,255,255,0) 42%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0) 58%);
  background-size: 250% 100%;
  background-position: 180% 0;
  -webkit-background-clip: text;
  background-clip: text;
}
.tfx-shiny.tfx-m-loop, .tfx-shiny.tfx-m-once, .tfx-shiny.tfx-m-hover.tfx-on {
  animation: tfx-shine-a 5s linear infinite;
}
.tfx-shiny.tfx-m-once { animation-iteration-count: 1; }
@keyframes tfx-shine-a {
  0% { background-position: 180% 0; }
  35%, 100% { background-position: -70% 0; }
}

/* --- перелив: точный период = бесшовный цикл --- */
.tfx-grad {
  --tfx-g1: #4fd1c5;
  --tfx-g2: #f4d35e;
  display: inline-block;
  background: linear-gradient(90deg, var(--tfx-g1), var(--tfx-g2), var(--tfx-g1));
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.tfx-grad.tfx-m-loop, .tfx-grad.tfx-m-once, .tfx-grad.tfx-m-hover.tfx-on {
  animation: tfx-grad-a 7s linear infinite;
}
.tfx-grad.tfx-m-once { animation-iteration-count: 1; }
@keyframes tfx-grad-a {
  0% { background-position: 0% 0; }
  100% { background-position: -200% 0; }
}

/* --- мерцание: неровные провалы яркости, как неисправная лампа --- */
.tfx-flicker { transition: opacity 0.3s ease; }
.tfx-flicker.tfx-m-loop, .tfx-flicker.tfx-m-once, .tfx-flicker.tfx-m-hover.tfx-on {
  animation: tfx-flicker-a 4s steps(1, end) infinite;
}
.tfx-flicker.tfx-m-once { animation-iteration-count: 1; }
@keyframes tfx-flicker-a {
  0%, 8%, 24%, 57%, 81%, 100% { opacity: 1; }
  7% { opacity: 0.55; }
  23% { opacity: 0.72; }
  55% { opacity: 0.4; }
  80% { opacity: 0.78; }
}

/* --- появления: базовое состояние = финал (текст виден), анимация 'both'
       прячет на время задержки и доводит до финала --- */
.tfx-blur.tfx-m-once .tfx-p-blur, .tfx-blur.tfx-m-hover.tfx-run .tfx-p-blur {
  animation: tfx-blur-a 0.7s ease both;
  animation-delay: var(--d, 0s);
}
@keyframes tfx-blur-a {
  from { opacity: 0; filter: blur(6px); transform: translateY(0.12em); }
  to { opacity: 1; filter: blur(0); transform: none; }
}

.tfx-rise.tfx-m-once .tfx-p-rise, .tfx-rise.tfx-m-hover.tfx-run .tfx-p-rise {
  animation: tfx-rise-a 0.8s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  animation-delay: var(--d, 0s);
}
@keyframes tfx-rise-a {
  from { opacity: 0; transform: translateY(0.6em); }
  to { opacity: 1; transform: none; }
}

.tfx-type.tfx-m-once .tfx-p-type, .tfx-type.tfx-m-hover.tfx-run .tfx-p-type {
  animation: tfx-type-a 1ms linear both;
  animation-delay: var(--d, 0s);
}
@keyframes tfx-type-a {
  from { opacity: 0; }
  to { opacity: 1; }
}

.tfx-flash { display: inline-block; }
.tfx-flash.tfx-m-once, .tfx-flash.tfx-m-hover.tfx-run {
  animation: tfx-flash-a 1.1s ease-out both;
}
@keyframes tfx-flash-a {
  0% { filter: brightness(2.8); text-shadow: 0 0 0.5em currentColor; }
  100% { filter: brightness(1); text-shadow: 0 0 0 transparent; }
}

/* расшифровка: нераскрытые знаки приглушены */
.tfx-scrx { opacity: 0.55; }

/* статичный режим (холст редактора) и reduce-motion: покой, без движения */
.tfx-off, .tfx-off * { animation: none !important; transition: none !important; }
.tfx-off .tfx-glitch::before, .tfx-off .tfx-glitch::after { content: none; animation: none !important; }
.tfx-off .tfx-shiny { color: inherit; background: none; -webkit-background-clip: initial; background-clip: initial; }
@media (prefers-reduced-motion: reduce) {
  .tfx-glow, .tfx-shiny, .tfx-grad, .tfx-flicker, .tfx-flash, .tfx-p,
  .tfx-glitch::before, .tfx-glitch::after { animation: none !important; transition: none !important; }
  .tfx-glitch::before, .tfx-glitch::after { content: none; }
  .tfx-shiny { color: inherit; background: none; -webkit-background-clip: initial; background-clip: initial; }
}
`;
  document.head.appendChild(st);
}
