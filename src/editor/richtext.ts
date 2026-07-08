// Панель стилей текста над textarea: выделил фразу → нажал кнопку →
// фраза обёрнута тегом разметки ([b], [c=#...], [glitch]... — см. runtime/textfx.ts).
// Виден результат в предпросмотре (F5) и в игре; на холсте редактора — статично.

import { h } from './ui';
import { TEXTFX_TAGS } from '../runtime/textfx';
import { openPalettePopover } from './colorui';

/** Эффекты для выпадающего меню «✨» (порядок = порядок в меню) */
const FX_MENU: { tag: string; icon: string }[] = [
  { tag: 'glow', icon: '✨' },
  { tag: 'wave', icon: '🌊' },
  { tag: 'shake', icon: '〰' },
  { tag: 'glitch', icon: '⚡' },
  { tag: 'shiny', icon: '✦' },
  { tag: 'grad', icon: '🌈' },
  { tag: 'scramble', icon: '▚' },
  { tag: 'blur', icon: '◌' },
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
  const wrapSel = (tag: string, param?: string) => {
    const open = param ? `[${tag}=${param}]` : `[${tag}]`;
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

  bar.append(
    mkBtn('Ж', 'Жирный — [b]…[/]', () => wrapSel('b'), 'font-weight:700;'),
    mkBtn('К', 'Курсив — [i]…[/]', () => wrapSel('i'), 'font-style:italic;'),
    mkBtn('🎨', 'Цвет слова — [c=#…]…[/]', (b) => openPalettePopover(b, (hex) => wrapSel('c', hex))),
    mkBtn('✨', 'Эффекты текста', (b) => {
      closeMenu();
      const menu = h('div', {
        style: 'position:fixed;z-index:10000;background:var(--panel,#161b22);border:1px solid var(--border,#2a3038);'
          + 'border-radius:8px;padding:4px;box-shadow:0 12px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;min-width:190px;',
      });
      for (const fx of FX_MENU) {
        const spec = TEXTFX_TAGS[fx.tag];
        const item = h('button', {
          class: 'btn small',
          style: 'justify-content:flex-start;text-align:left;border:none;background:none;padding:5px 8px;',
          title: spec.hint,
          text: `${fx.icon} ${spec.label}`,
        });
        item.onmousedown = (e) => e.preventDefault();
        item.onclick = () => {
          closeMenu();
          if (fx.tag === 'grad') wrapSel('grad', '#4fd1c5,#f4d35e');
          else wrapSel(fx.tag);
        };
        menu.appendChild(item);
      }
      document.body.appendChild(menu);
      const r = b.getBoundingClientRect();
      menu.style.left = `${Math.min(r.left, innerWidth - menu.offsetWidth - 8)}px`;
      menu.style.top = `${r.bottom + 4 + menu.offsetHeight > innerHeight ? r.top - menu.offsetHeight - 4 : r.bottom + 4}px`;
      openMenu = menu;
      document.addEventListener('mousedown', onDocDown, true);
    }),
  );

  const helpBtn = mkBtn('?', 'Подсказка по разметке', () => {
    help.style.display = help.style.display === 'none' ? '' : 'none';
  }, 'margin-left:auto;');
  bar.appendChild(helpBtn);

  const help = h('div', {
    class: 'hint',
    style: 'display:none;',
    text: 'Выделите фразу и нажмите кнопку. Разметка: '
      + Object.values(TEXTFX_TAGS).map((t) => `${t.label} ${t.hint}`).join(' · ')
      + '. Закрывать можно универсальным [/]. Эффекты видны в предпросмотре (F5) и в игре; на холсте — только цвет/жирный/курсив.',
  });

  wrap.append(bar, ta, help);
  return wrap;
}
