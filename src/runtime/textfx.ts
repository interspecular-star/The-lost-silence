// Rich text: лёгкая разметка в текстах сцен и диалогов.
// Синтаксис: [тег]текст[/тег] или [тег]текст[/] (универсальное закрытие).
// Теги с параметром: [c=#ff9944], [glow=#4fd1c5], [grad=#4fd1c5,#f4d35e].
// Неизвестные [скобки] остаются обычным текстом — старый контент не ломается.
// Эффекты перенесены по мотивам reactbits.dev (GlitchText/DecryptedText/ShinyText/
// GradientText/BlurText) на чистый CSS/JS — работают в предпросмотре и экспорте.

export interface RichOptions {
  /** false — статичный режим для холста редактора: стили видны, анимации выключены */
  animate?: boolean;
}

interface TagSpec {
  label: string;
  hint: string;
  /** режим разбиения прямого текста внутри тега */
  split?: 'char' | 'word';
  /** сколько параметров-цветов принимает тег (для тулбара) */
  colorParams?: number;
}

export const TEXTFX_TAGS: Record<string, TagSpec> = {
  b: { label: 'Жирный', hint: '[b]важное[/]' },
  i: { label: 'Курсив', hint: '[i]мысль[/]' },
  c: { label: 'Цвет', hint: '[c=#f4d35e]слово[/]', colorParams: 1 },
  glow: { label: 'Свечение', hint: '[glow]мягкий свет[/] или [glow=#e06c75]', colorParams: 1 },
  wave: { label: 'Волна', hint: '[wave]буквы плывут[/]', split: 'char' },
  shake: { label: 'Дрожь', hint: '[shake]страх, холод[/]', split: 'char' },
  glitch: { label: 'Глитч', hint: '[glitch]сбой, Архон[/] — внутри только текст' },
  shiny: { label: 'Блик', hint: '[shiny]металлический отблеск[/]' },
  grad: { label: 'Градиент', hint: '[grad]перелив[/] или [grad=#4fd1c5,#f4d35e]', colorParams: 2 },
  scramble: { label: 'Расшифровка', hint: '[scramble]знаки встают на место[/] — OldNet' },
  blur: { label: 'Проявление', hint: '[blur]слова выплывают из тумана[/]', split: 'word' },
};

const TAG_RE = /\[(\/?)([a-z]+)(?:=([^\]]*))?\]/gi;
const SCRAMBLE_POOL = '!<>-_/\\|=+*^?#@%&$01АВЕИКМНОРСТХ';

function isColor(v: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(v.trim()) || /^[a-z]+$/i.test(v.trim()) || /^rgba?\(/i.test(v.trim());
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
  return text.replace(/\[(\/?)([a-z]*)(?:=([^\]]*))?\]/gi, (whole, close: string, name: string) => {
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

  interface Frame { el: HTMLElement; name: string | null; split: 'char' | 'word' | null; counter: { i: number } }
  const rootFrame: Frame = { el: target, name: null, split: null, counter: { i: 0 } };
  const stack: Frame[] = [rootFrame];
  const scrambles: HTMLElement[] = [];
  const glitches: HTMLElement[] = [];
  const top = () => stack[stack.length - 1];

  const appendText = (t: string) => {
    if (!t) return;
    const f = top();
    if (!f.split) { f.el.appendChild(document.createTextNode(t)); return; }
    if (f.split === 'char') {
      for (const ch of Array.from(t)) {
        if (/\s/.test(ch)) { f.el.appendChild(document.createTextNode(ch)); continue; }
        const sp = document.createElement('span');
        sp.className = f.name === 'shake' ? 'tfx-sch' : 'tfx-wch';
        sp.textContent = ch;
        sp.style.animationDelay = f.name === 'shake'
          ? `${(f.counter.i % 5) * 0.04}s`
          : `${f.counter.i * 0.07}s`;
        f.counter.i++;
        f.el.appendChild(sp);
      }
    } else {
      for (const part of t.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { f.el.appendChild(document.createTextNode(part)); continue; }
        const sp = document.createElement('span');
        sp.className = 'tfx-bw';
        sp.textContent = part;
        sp.style.animationDelay = `${f.counter.i * 0.09}s`;
        f.counter.i++;
        f.el.appendChild(sp);
      }
    }
  };

  const openTag = (name: string, param?: string) => {
    const sp = document.createElement('span');
    sp.className = `tfx-${name}`;
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
    if (name === 'scramble') scrambles.push(sp);
    if (name === 'glitch') glitches.push(sp);
    top().el.appendChild(sp);
    const spec = TEXTFX_TAGS[name];
    stack.push({ el: sp, name, split: spec.split ?? null, counter: { i: top().counter.i } });
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
      openTag(name, m[3]);
    }
  }
  appendText(text.slice(last));

  // глитч дублирует свой текст в псевдоэлементы
  for (const g of glitches) g.setAttribute('data-text', g.textContent ?? '');

  // расшифровка — по мотивам DecryptedText: перебор знаков, посимвольное раскрытие
  if (animate && !prefersReducedMotion()) {
    for (const sp of scrambles) runScramble(sp);
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function runScramble(sp: HTMLElement) {
  const original = sp.textContent ?? '';
  if (!original.trim()) return;
  const chars = Array.from(original);
  const total = Math.min(1800, 350 + chars.length * 40);
  const start = performance.now();
  const tick = () => {
    if (!sp.isConnected) return;
    const t = (performance.now() - start) / total;
    const revealed = Math.floor(Math.min(1, t) * chars.length);
    sp.textContent = chars.map((ch, i) => {
      if (/\s/.test(ch)) return ch;
      if (i < revealed) return ch;
      return SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
    }).join('');
    if (revealed < chars.length) setTimeout(tick, 34);
    else sp.textContent = original;
  };
  tick();
}

// ---------- стили ----------
let injected = false;
export function ensureTextFxStyles() {
  if (injected || document.getElementById('tls-textfx-styles')) { injected = true; return; }
  injected = true;
  const st = document.createElement('style');
  st.id = 'tls-textfx-styles';
  st.textContent = `
.tfx-c, .tfx-b, .tfx-i { display: inline; }

.tfx-glow {
  --tfx-glow: currentColor;
  text-shadow: 0 0 0.35em var(--tfx-glow), 0 0 0.9em var(--tfx-glow);
  animation: tfx-glow 2.6s ease-in-out infinite;
}
@keyframes tfx-glow {
  0%, 100% { text-shadow: 0 0 0.35em var(--tfx-glow), 0 0 0.9em var(--tfx-glow); }
  50% { text-shadow: 0 0 0.18em var(--tfx-glow), 0 0 0.45em var(--tfx-glow); }
}

.tfx-wch { display: inline-block; animation: tfx-wave 1.8s ease-in-out infinite; }
@keyframes tfx-wave {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-0.16em); }
}

.tfx-sch { display: inline-block; animation: tfx-shake 0.32s linear infinite; }
@keyframes tfx-shake {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(-0.028em, 0.02em); }
  50% { transform: translate(0.03em, -0.018em); }
  75% { transform: translate(-0.02em, -0.028em); }
}

/* по мотивам reactbits GlitchText — прозрачный фон, срезы-дубли с RGB-сдвигом */
.tfx-glitch { position: relative; display: inline-block; }
.tfx-glitch::before, .tfx-glitch::after {
  content: attr(data-text);
  position: absolute; top: 0; left: 0; width: 100%;
  overflow: hidden; pointer-events: none;
}
.tfx-glitch::before {
  transform: translateX(-0.06em);
  text-shadow: 0.03em 0 rgba(0, 255, 234, 0.55);
  animation: tfx-glitch 2.4s infinite linear alternate-reverse;
}
.tfx-glitch::after {
  transform: translateX(0.06em);
  text-shadow: -0.03em 0 rgba(255, 0, 76, 0.55);
  animation: tfx-glitch 3.1s infinite linear alternate-reverse;
}
@keyframes tfx-glitch {
  0%   { clip-path: inset(20% 0 50% 0); }
  10%  { clip-path: inset(60% 0 10% 0); }
  20%  { clip-path: inset(5% 0 70% 0); }
  30%  { clip-path: inset(45% 0 40% 0); }
  40%  { clip-path: inset(80% 0 5% 0); }
  50%  { clip-path: inset(30% 0 55% 0); }
  60%  { clip-path: inset(10% 0 75% 0); }
  70%  { clip-path: inset(55% 0 25% 0); }
  80%  { clip-path: inset(70% 0 15% 0); }
  90%  { clip-path: inset(25% 0 60% 0); }
  100% { clip-path: inset(40% 0 45% 0); }
}

/* по мотивам reactbits ShinyText — полупрозрачный текст, бегущий блик клипается в глифы */
.tfx-shiny {
  display: inline-block;
  color: color-mix(in srgb, currentColor 55%, transparent);
  background: linear-gradient(120deg, rgba(255,255,255,0) 42%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0) 58%);
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  animation: tfx-shine 3.2s linear infinite;
}
@keyframes tfx-shine {
  0% { background-position: 160% 0; }
  100% { background-position: -60% 0; }
}

/* по мотивам reactbits GradientText */
.tfx-grad {
  --tfx-g1: #4fd1c5;
  --tfx-g2: #f4d35e;
  display: inline-block;
  background: linear-gradient(90deg, var(--tfx-g1), var(--tfx-g2), var(--tfx-g1));
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: tfx-gradmove 6s linear infinite;
}
@keyframes tfx-gradmove {
  0% { background-position: 0% 0; }
  100% { background-position: 220% 0; }
}

/* по мотивам reactbits BlurText — слова проявляются из размытия */
.tfx-bw {
  display: inline-block;
  opacity: 0;
  filter: blur(6px);
  transform: translateY(0.12em);
  animation: tfx-blurin 0.7s ease forwards;
}
@keyframes tfx-blurin {
  to { opacity: 1; filter: blur(0); transform: none; }
}

/* статичный режим (холст редактора) и reduce-motion: стили без движения */
.tfx-off *, .tfx-off { animation: none !important; }
.tfx-off .tfx-bw { opacity: 1; filter: none; transform: none; }
.tfx-off .tfx-glitch::before, .tfx-off .tfx-glitch::after { content: none; }
.tfx-off .tfx-shiny { color: inherit; background: none; -webkit-background-clip: initial; background-clip: initial; }
@media (prefers-reduced-motion: reduce) {
  .tfx-wch, .tfx-sch, .tfx-glow, .tfx-shiny, .tfx-grad,
  .tfx-glitch::before, .tfx-glitch::after { animation: none !important; }
  .tfx-bw { opacity: 1; filter: none; transform: none; animation: none !important; }
  .tfx-glitch::before, .tfx-glitch::after { content: none; }
  .tfx-shiny { color: inherit; background: none; -webkit-background-clip: initial; background-clip: initial; }
}
`;
  document.head.appendChild(st);
}
