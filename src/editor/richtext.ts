// Панель стилей текста над textarea: выделил фразу → нажал кнопку →
// фраза обёрнута тегом разметки ([b], [c=#...], [glitch]... — см. runtime/textfx.ts).
// У эффектов есть режимы: цикл / один раз / при наведении (для кнопок и вариантов).
// Виден результат в предпросмотре (F5) и в игре; на холсте редактора — статично.

import { h } from './ui';
import { TEXTFX_TAGS, defaultMode, FxMode } from '../runtime/textfx';
import { openPalettePopover } from './colorui';

/** Эффекты для меню «✨», по группам */
const FX_GROUPS: { title: string; items: { tag: string; icon: string }[] }[] = [
  {
    title: 'Цикличные (живут, пока текст на экране)',
    items: [
      { tag: 'glow', icon: '✨' },
      { tag: 'wave', icon: '🌊' },
      { tag: 'shake', icon: '〰' },
      { tag: 'glitch', icon: '⚡' },
      { tag: 'shiny', icon: '✦' },
      { tag: 'grad', icon: '🌈' },
      { tag: 'flicker', icon: '💡' },
    ],
  },
  {
    title: 'Появление (играют один раз, с финалом)',
    items: [
      { tag: 'blur', icon: '◌' },
      { tag: 'rise', icon: '↟' },
      { tag: 'type', icon: '⌨' },
      { tag: 'scramble', icon: '▚' },
      { tag: 'flash', icon: '☀' },
    ],
  },
];

const MODE_CHIPS: { key: 'auto' | FxMode; label: string; hint: string }[] = [
  { key: 'auto', label: 'Авто', hint: 'Режим по умолчанию: цикличные крутятся, появления играют один раз' },
  { key: 'loop', label: '⟳ Цикл', hint: 'Повторяется, пока текст на экране' },
  { key: 'once', label: '1× Раз', hint: 'Проигрывается один раз при показе (цикличные — пара оборотов)' },
  { key: 'hover', label: '🖱 Навод', hint: 'Запускается при наведении — для кнопок и вариантов ответа' },
];

let openMenu: HTMLElement | null = null;
function closeMenu() {
  openMenu?.remove();
  openMenu = null;
  document.removeEventListener('mousedown', onDocDown, true);
}
function onDocDown(e: MouseEvent) {
  if (openMenu && !openMenu.contains(e.target as Node)) closeMenu();
}

/**
 * textarea с панелью стилей. Коммит — по blur (как у обычного textArea),
 * чтобы инспектор не перерисовывался на каждый клик по кнопке.
 */
export function richTextArea(value: string, onCommit: (v: string) => void, rows = 4): HTMLElement {
  const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:4px;' });

  const ta = h('textarea', { class: 'ed', rows: String(rows) }) as HTMLTextAreaElement;
  ta.value = value;
  let committed = value;
  const commit = () => {
    if (ta.value !== committed) { committed = ta.value; onCommit(ta.value); }
  };
  ta.onblur = commit;

  /** Оборачивает выделение тегом; без выделения — вставляет пустую пару */
  const wrapSel = (tag: string, suffix = '', param?: string) => {
    const open = param ? `[${tag}${suffix}=${param}]` : `[${tag}${suffix}]`;
    const close = '[/]';
    const s = ta.selectionStart ?? 0;
    const e = ta.selectionEnd ?? 0;
    const sel = ta.value.slice(s, e);
    ta.value = ta.value.slice(0, s) + open + sel + close + ta.value.slice(e);
    ta.focus();
    if (sel) {
      ta.selectionStart = s;
      ta.selectionEnd = e + open.length + close.length;
    } else {
      ta.selectionStart = ta.selectionEnd = s + open.length;
    }
  };

  const bar = h('div', { style: 'display:flex;gap:3px;align-items:center;flex-wrap:wrap;' });
  const mkBtn = (label: string, title: string, onClick: (b: HTMLElement) => void, extraStyle = '') => {
    const b = h('button', {
      class: 'btn small',
      title,
      text: label,
      style: 'padding:2px 8px;' + extraStyle,
    });
    // mousedown не отдаём — иначе textarea потеряет фокус и выделение
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = (e) => { e.preventDefault(); onClick(b); };
    return b;
  };

  let fxMode: 'auto' | FxMode = 'auto';

  const openFxMenu = (anchor: HTMLElement) => {
    closeMenu();
    const menu = h('div', {
      style: 'position:fixed;z-index:10000;background:var(--panel,#161b22);border:1px solid var(--border,#2a3038);'
        + 'border-radius:8px;padding:6px;box-shadow:0 12px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;min-width:230px;gap:2px;',
    });

    // выбор режима
    const chips = h('div', { style: 'display:flex;gap:3px;margin-bottom:4px;' });
    const chipEls: HTMLElement[] = [];
    for (const c of MODE_CHIPS) {
      const chip = h('button', {
        class: 'btn small' + (fxMode === c.key ? ' accent' : ''),
        title: c.hint,
        text: c.label,
        style: 'flex:1;padding:2px 4px;font-size:11px;',
      });
      chip.onmousedown = (e) => e.preventDefault();
      chip.onclick = (e) => {
        e.preventDefault();
        fxMode = c.key;
        for (const el of chipEls) el.classList.remove('accent');
        chip.classList.add('accent');
      };
      chipEls.push(chip);
      chips.appendChild(chip);
    }
    menu.appendChild(chips);

    for (const group of FX_GROUPS) {
      menu.appendChild(h('div', {
        style: 'font-size:10px;color:var(--text-faint,#5c6773);padding:4px 6px 2px;letter-spacing:0.04em;',
        text: group.title.toUpperCase(),
      }));
      for (const fx of group.items) {
        const spec = TEXTFX_TAGS[fx.tag];
        const item = h('button', {
          class: 'btn small',
          style: 'justify-content:flex-start;text-align:left;border:none;background:none;padding:4px 8px;',
          title: spec.hint,
          text: `${fx.icon} ${spec.label}`,
        });
        item.onmousedown = (e) => e.preventDefault();
        item.onclick = () => {
          closeMenu();
          const suffix = fxMode === 'auto' || fxMode === defaultMode(fx.tag) ? '' : `.${fxMode}`;
          if (fx.tag === 'grad') wrapSel('grad', suffix, '#4fd1c5,#f4d35e');
          else wrapSel(fx.tag, suffix);
        };
        menu.appendChild(item);
      }
    }

    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(r.left, innerWidth - menu.offsetWidth - 8)}px`;
    menu.style.top = `${r.bottom + 4 + menu.offsetHeight > innerHeight ? Math.max(8, r.top - menu.offsetHeight - 4) : r.bottom + 4}px`;
    openMenu = menu;
    document.addEventListener('mousedown', onDocDown, true);
  };

  bar.append(
    mkBtn('Ж', 'Жирный — [b]…[/]', () => wrapSel('b'), 'font-weight:700;'),
    mkBtn('К', 'Курсив — [i]…[/]', () => wrapSel('i'), 'font-style:italic;'),
    mkBtn('🎨', 'Цвет слова — [c=#…]…[/]', (b) => openPalettePopover(b, (hex) => wrapSel('c', '', hex))),
    mkBtn('✨', 'Эффекты текста (с выбором режима)', openFxMenu),
  );

  const helpBtn = mkBtn('?', 'Подсказка по разметке', () => {
    help.style.display = help.style.display === 'none' ? '' : 'none';
  }, 'margin-left:auto;');
  bar.appendChild(helpBtn);

  const help = h('div', {
    class: 'hint',
    style: 'display:none;',
    text: 'Выделите фразу и нажмите кнопку. Закрытие — [/]. Режимы эффекта: [wave] цикл (по умолчанию для цикличных), '
      + '[wave.once] один раз, [wave.hover] при наведении (для кнопок/вариантов); появления ([blur], [type]…) '
      + 'по умолчанию играют один раз. Эффекты: '
      + Object.values(TEXTFX_TAGS).map((t) => `${t.label} ${t.hint}`).join(' · ')
      + '. На холсте — статично, смотреть в предпросмотре (F5).',
  });

  wrap.append(bar, ta, help);
  return wrap;
}
