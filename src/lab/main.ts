// ============================================================
// Лаборатория стилей (/style-lab.html) — песочница для «материалов»
// блоков: не трогает проект владельца (ни автосейв, ни сцены).
// Живой диалог на движке + панель переключателей.
// ============================================================

import { seedProject } from '../core/seed';
import { Engine, fitStage } from '../runtime/engine';
import { Project, BoxSurface, BoxBorderFx, uid } from '../core/types';
import { BOX_BORDER_LABELS, BOX_SURFACE_LABELS } from '../runtime/boxfx';

// ---------- текущее состояние лаборатории ----------
const state = {
  surface: 'spatial' as BoxSurface,
  border: 'shimmer' as BoxBorderFx,
  glass: 14,
  radius: 16,
  // варианты ответа
  cSurface: 'spatial' as BoxSurface,
  cBorder: 'none' as BoxBorderFx,
  cHoverOnly: true,
  cGlass: 14,
  cRadius: 10,
  // кнопки сцены
  view: 'dialogue' as 'dialogue' | 'buttons',
  bSurface: 'spatial' as BoxSurface,
  bBorder: 'star' as BoxBorderFx,
  bHoverOnly: false,
  bGlass: 14,
  factionIdx: 0,
};

// ---------- проект-песочница ----------
function buildProject(): Project {
  const p = seedProject();
  const factions = p.factions ?? [];
  const faction = factions[state.factionIdx % Math.max(1, factions.length)];
  const npc = p.npcs?.find((n) => n.factionId === faction?.id);

  const sceneId = uid('scn');
  const dlgId = uid('dlg');
  const n1 = uid('n'); const n2 = uid('n');
  const btnStyle = { surface: state.bSurface, border: state.bBorder, hoverOnly: state.bHoverOnly, glass: state.bGlass };
  p.scenes.push({
    id: sceneId,
    name: 'ЛАБ',
    kind: 'location',
    background: 'radial-gradient(ellipse at 50% 30%, #16222e, #05080d)',
    elements: state.view === 'buttons' ? [
      {
        id: uid('el'), name: 'Кнопка 1', type: 'button', x: 560, y: 380, w: 800, h: 110,
        style: { fill: 'rgba(79,209,197,0.10)', textColor: '#4fd1c5', fontSize: 30, radius: 12, textAlign: 'center' },
        boxStyle: btnStyle, text: 'ВОЙТИ В МАСТЕРСКУЮ',
      },
      {
        id: uid('el'), name: 'Кнопка 2', type: 'button', x: 560, y: 530, w: 800, h: 110,
        style: { fill: 'rgba(230,237,243,0.06)', textColor: '#e6edf3', fontSize: 30, radius: 12, textAlign: 'center' },
        boxStyle: btnStyle, text: 'ОСМОТРЕТЬ ПЕРИМЕТР',
      },
      {
        id: uid('el'), name: 'Кнопка 3', type: 'button', x: 560, y: 680, w: 800, h: 110,
        style: { fill: 'rgba(244,211,94,0.08)', textColor: '#f4d35e', fontSize: 30, radius: 12, textAlign: 'center' },
        boxStyle: btnStyle, text: '[shiny.hover]ТЕРМИНАЛ OLDNET[/]',
      },
    ] : [],
    guides: [],
    onEnterDialogueId: state.view === 'dialogue' ? dlgId : undefined,
    hudMode: 'off',
  });
  p.dialogues.push({
    id: dlgId,
    name: 'ЛАБ-диалог',
    startNodeId: n1,
    nodes: [
      {
        id: n1, type: 'line', x: 0, y: 0,
        speakerNpcId: npc?.id ?? null,
        speaker: npc ? undefined : 'Голос',
        text: 'Смотри: [glow]стекло[/], тонкая рамка, ничего лишнего.\n\nЭто [b]материал[/] блока — поверхность и рамка живут отдельно от текста.',
        next: n2,
      },
      {
        id: n2, type: 'choice', x: 0, y: 0,
        choices: [
          { id: uid('c'), text: 'Показать реплику ещё раз', next: n1, conditions: [], effects: [] },
          { id: uid('c'), text: 'Вариант с [c=#f4d35e]цветом[/] отклика', next: n1, conditions: [], effects: [] },
          { id: uid('c'), text: 'Просто третий вариант — смотрим ритм списка', next: n1, conditions: [], effects: [] },
        ],
      },
    ],
  });
  p.startSceneId = sceneId;
  p.theme.dialogueBoxStyle = {
    surface: state.surface,
    border: state.border,
    glass: state.glass,
    radius: state.radius,
  };
  p.theme.choiceStyle = {
    surface: state.cSurface,
    border: state.cBorder,
    hoverOnly: state.cHoverOnly,
    glass: state.cGlass,
    radius: state.cRadius,
  };
  return p;
}

// ---------- рендер ----------
const app = document.getElementById('lab')!;
let engine: Engine | null = null;

const stageArea = document.createElement('div');
stageArea.id = 'lab-stage-area';
const stage = document.createElement('div');
stage.id = 'lab-stage';
stageArea.appendChild(stage);

const panel = document.createElement('div');
panel.id = 'lab-panel';

app.append(stageArea, panel);

function rebuild() {
  engine?.destroy();
  stage.innerHTML = '';
  const p = buildProject();
  engine = new Engine(p, stage, {});
  engine.start();
}

// ---------- панель ----------
function control(label: string, el: HTMLElement): HTMLElement {
  const w = document.createElement('label');
  w.className = 'lab-ctl';
  const s = document.createElement('span');
  s.textContent = label;
  w.append(s, el);
  return w;
}

function select<T extends string>(value: T, options: [T, string][], onChange: (v: T) => void): HTMLSelectElement {
  const sel = document.createElement('select');
  for (const [v, label] of options) {
    const o = document.createElement('option');
    o.value = v; o.textContent = label; o.selected = v === value;
    sel.appendChild(o);
  }
  sel.onchange = () => onChange(sel.value as T);
  return sel;
}

function range(value: number, min: number, max: number, onChange: (v: number) => void): HTMLElement {
  const w = document.createElement('div');
  w.className = 'lab-range';
  const r = document.createElement('input');
  r.type = 'range'; r.min = String(min); r.max = String(max); r.value = String(value);
  const v = document.createElement('span');
  v.textContent = String(value);
  r.oninput = () => { v.textContent = r.value; };
  r.onchange = () => onChange(Number(r.value));
  w.append(r, v);
  return w;
}

function renderPanel() {
  panel.innerHTML = '';
  const title = document.createElement('div');
  title.id = 'lab-title';
  title.textContent = 'ЛАБОРАТОРИЯ СТИЛЕЙ';
  const sub = document.createElement('div');
  sub.id = 'lab-sub';
  sub.textContent = 'Песочница: проект и автосейв редактора не затрагиваются.';
  panel.append(title, sub);

  panel.appendChild(control('Что показываем', select(state.view,
    [['dialogue', 'Диалог (блок + варианты)'], ['buttons', 'Кнопки сцены']] as ['dialogue' | 'buttons', string][],
    (v) => { state.view = v; renderPanel(); rebuild(); })));

  if (state.view === 'buttons') {
    panel.appendChild(control('Поверхность кнопок', select(state.bSurface,
      Object.entries(BOX_SURFACE_LABELS) as [BoxSurface, string][],
      (v) => { state.bSurface = v; renderPanel(); rebuild(); })));
    panel.appendChild(control('Рамка кнопок', select(state.bBorder,
      Object.entries(BOX_BORDER_LABELS) as [BoxBorderFx, string][],
      (v) => { state.bBorder = v; renderPanel(); rebuild(); })));
    if (state.bBorder !== 'none') {
      const cbWrap = document.createElement('label');
      cbWrap.className = 'lab-ctl lab-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.bHoverOnly;
      cb.onchange = () => { state.bHoverOnly = cb.checked; rebuild(); };
      const cbText = document.createElement('span');
      cbText.textContent = 'рамка только при наведении';
      cbWrap.append(cb, cbText);
      panel.appendChild(cbWrap);
    }
    if (state.bSurface === 'spatial') {
      panel.appendChild(control('Стекло кнопок, %', range(state.bGlass, 0, 40, (v) => { state.bGlass = v; rebuild(); })));
    }
    const hint = document.createElement('div');
    hint.id = 'lab-hint';
    hint.textContent = 'Третья кнопка — с текстовым эффектом [shiny.hover]: блик по тексту при наведении, поверх материала.';
    panel.appendChild(hint);
    return;
  }

  panel.appendChild(control('Поверхность', select(state.surface,
    Object.entries(BOX_SURFACE_LABELS) as [BoxSurface, string][],
    (v) => { state.surface = v; renderPanel(); rebuild(); })));

  panel.appendChild(control('Рамка', select(state.border,
    Object.entries(BOX_BORDER_LABELS) as [BoxBorderFx, string][],
    (v) => { state.border = v; rebuild(); })));

  if (state.surface === 'spatial') {
    panel.appendChild(control('Стекло, % прозрачности', range(state.glass, 0, 40, (v) => { state.glass = v; rebuild(); })));
    panel.appendChild(control('Скругление, px', range(state.radius, 0, 28, (v) => { state.radius = v; rebuild(); })));
  }

  // --- варианты ответа ---
  const sep = document.createElement('div');
  sep.id = 'lab-sep';
  sep.textContent = 'ВАРИАНТЫ ОТВЕТА';
  panel.appendChild(sep);

  panel.appendChild(control('Поверхность вариантов', select(state.cSurface,
    Object.entries(BOX_SURFACE_LABELS) as [BoxSurface, string][],
    (v) => { state.cSurface = v; renderPanel(); rebuild(); })));

  panel.appendChild(control('Рамка вариантов', select(state.cBorder,
    Object.entries(BOX_BORDER_LABELS) as [BoxBorderFx, string][],
    (v) => { state.cBorder = v; renderPanel(); rebuild(); })));

  if (state.cBorder !== 'none') {
    const cbWrap = document.createElement('label');
    cbWrap.className = 'lab-ctl lab-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.cHoverOnly;
    cb.onchange = () => { state.cHoverOnly = cb.checked; rebuild(); };
    const cbText = document.createElement('span');
    cbText.textContent = 'рамка только при наведении';
    cbWrap.append(cb, cbText);
    panel.appendChild(cbWrap);
  }

  if (state.cSurface === 'spatial') {
    panel.appendChild(control('Стекло вариантов, %', range(state.cGlass, 0, 40, (v) => { state.cGlass = v; rebuild(); })));
    panel.appendChild(control('Скругление вариантов, px', range(state.cRadius, 0, 20, (v) => { state.cRadius = v; rebuild(); })));
  }

  const p = seedProject();
  const factions = p.factions ?? [];
  panel.appendChild(control('Фракция собеседника (скин + цвет)', select(String(state.factionIdx),
    factions.map((f, i) => [String(i), f.name] as [string, string]),
    (v) => { state.factionIdx = Number(v); rebuild(); })));

  const hint = document.createElement('div');
  hint.id = 'lab-hint';
  hint.textContent = 'Кликайте по вариантам в диалоге — блок перерисовывается, видно анимацию входа. '
    + 'Понравившийся набор переносится в редактор: Мир → «Оформление игры».';
  panel.appendChild(hint);
}

renderPanel();
rebuild();
fitStage(stage, stageArea);
addEventListener('resize', () => fitStage(stage, stageArea));
