// ============================================================
// Модалки карты лагеря (блок M): «Редактор узла» и «⚙ Вид карты».
// Причина: настройки узла не помещались в сайдбар 288px («простыня»).
// Здесь — широкое окно с вкладками, подписями у каждого поля и ЖИВЫМ
// превью ромба (renderDiamond, с анимациями). Все правки идут через
// snapshot+emit — undo/автосейв/живое окно работают как обычно.
// ============================================================

import { Store } from '../core/store';
import {
  Scene, Condition, CampMapConfig, CampMapNode, CampNodeLook, CampLinkLook, CampLinkFlow,
  BoxStyle, BoxSurface, BoxBorderFx, BoxTempo, BoxIntensity, uid,
} from '../core/types';
import {
  renderDiamond, previewNodeLook, mergeLook, ensureCampMapStyles, markColor,
} from '../runtime/campmap';
import { BOX_BORDER_LABELS, BOX_SURFACE_LABELS, BOX_TEMPO_LABELS, BOX_INTENSITY_LABELS } from '../runtime/boxfx';
import { makeCondEffectEditors } from './condedit';
import { colorField } from './colorui';
import { h, row, textInput, numberInput, selectInput, checkbox, rangeInput, toast } from './ui';

type Mutate = (fn: () => void) => void;

// ---------- ручки вида (переехали из инспектора: теперь живут в модалках) ----------
function lookControls(store: Store, mutate: Mutate, get: () => CampNodeLook | undefined, ensure: () => CampNodeLook): HTMLElement[] {
  const cur = get() ?? {};
  const set = (patch: Partial<CampNodeLook>) => mutate(() => { Object.assign(ensure(), patch); });
  const setFx = (patch: Partial<BoxStyle>) => mutate(() => {
    const l = ensure();
    l.fx = { ...(l.fx ?? {}), ...patch };
  });
  const fxTuning: HTMLElement[] = (cur.fx?.border ?? 'none') === 'none' ? [] : [
    row('Темп', selectInput(cur.fx?.tempo ?? 'normal',
      Object.entries(BOX_TEMPO_LABELS) as [string, string][],
      (v) => setFx({ tempo: v === 'normal' ? undefined : v as BoxTempo }))),
    row('Сила', selectInput(cur.fx?.intensity ?? 'normal',
      Object.entries(BOX_INTENSITY_LABELS) as [string, string][],
      (v) => setFx({ intensity: v === 'normal' ? undefined : v as BoxIntensity }))),
    row('Цвет анимации', colorField(cur.fx?.accent ?? '', (v) => setFx({ accent: v || undefined }))),
  ];
  return [
    row('Заливка', colorField(cur.fill ?? '', (v) => set({ fill: v || undefined }))),
    row('Заливка, %', rangeInput(cur.fillOpacity ?? 5, 0, 100, 1, (v) => set({ fillOpacity: v }))),
    row('Рамка', colorField(cur.border ?? '', (v) => set({ border: v || undefined }))),
    row('Рамка, %', rangeInput(cur.borderOpacity ?? 22, 0, 100, 1, (v) => set({ borderOpacity: v }))),
    row('Толщина', rangeInput(cur.borderWidth ?? 1, 0, 6, 0.5, (v) => set({ borderWidth: v }))),
    row('Анимация', selectInput(cur.fx?.border ?? 'none',
      Object.entries(BOX_BORDER_LABELS) as [string, string][],
      (v) => setFx({ border: v as BoxBorderFx }))),
    ...fxTuning,
    row('Поверхность', selectInput(cur.fx?.surface ?? 'default',
      Object.entries(BOX_SURFACE_LABELS) as [string, string][],
      (v) => setFx({ surface: v as BoxSurface }))),
    ...(cur.fx?.surface === 'spatial'
      ? [row('Стекло, %', rangeInput(cur.fx?.glass ?? 14, 0, 40, 1, (v) => setFx({ glass: v })))] : []),
    row('Цвет маркера', colorField(cur.markerColor ?? '', (v) => set({ markerColor: v || undefined }))),
    row('Свеч. маркера', rangeInput(cur.markerGlow ?? 60, 0, 100, 1, (v) => set({ markerGlow: v }))),
    row('Подложка, %', rangeInput(cur.scrim ?? 50, 0, 100, 1, (v) => set({ scrim: v }))),
    checkbox(cur.showMarker !== false, (v) => set({ showMarker: v ? undefined : false }), 'маркер-точка'),
    checkbox(cur.showTitle !== false, (v) => set({ showTitle: v ? undefined : false }), 'подпись'),
    checkbox(cur.showMark !== false, (v) => set({ showMark: v ? undefined : false }), 'пометка'),
  ];
}

function linkControls(mutate: Mutate, get: () => CampLinkLook | undefined, ensure: () => CampLinkLook): HTMLElement[] {
  const cur = get() ?? {};
  const set = (patch: Partial<CampLinkLook>) => mutate(() => { Object.assign(ensure(), patch); });
  return [
    row('Цвет', colorField(cur.color ?? '', (v) => set({ color: v || undefined }))),
    row('Прозр., %', rangeInput(cur.opacity ?? 14, 0, 100, 1, (v) => set({ opacity: v }))),
    row('Толщина', rangeInput(cur.width ?? 1.5, 0.5, 6, 0.5, (v) => set({ width: v }))),
    row('Штрих', rangeInput(cur.dash ?? 4, 0, 20, 1, (v) => set({ dash: v }))),
    row('Поток', selectInput(cur.flow ?? 'none', [
      ['none', 'нет'], ['run', 'бегущий пунктир'], ['dot', 'бегущая точка'],
    ], (v) => set({ flow: v as CampLinkFlow }))),
    ...((cur.flow ?? 'none') !== 'none'
      ? [row('Темп', selectInput(cur.tempo ?? 'normal',
          Object.entries(BOX_TEMPO_LABELS) as [string, string][],
          (v) => set({ tempo: v === 'normal' ? undefined : v as BoxTempo })))] : []),
  ];
}

// ---------- каркас модалки с вкладками ----------
interface ModalFrame {
  content: HTMLElement;
  setTabs: (tabs: [string, string][], active: string, onPick: (id: string) => void) => void;
  close: () => void;
}

function modalFrame(title: string, width: number, onClosed: () => void): ModalFrame {
  document.querySelector('.mapmodal-backdrop')?.remove();
  const backdrop = h('div', {
    class: 'modal-backdrop mapmodal-backdrop',
    style: 'z-index:9000;',
  });
  const panel = h('div', {
    class: 'modal',
    style: `width:${width}px;max-width:94vw;max-height:88vh;display:flex;flex-direction:column;padding:0;overflow:hidden;`,
  });
  const head = h('div', { style: 'display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);flex:none;' });
  head.appendChild(h('h3', { text: title, style: 'margin:0;flex:1;font-size:14px;' }));
  const closeBtn = h('button', { class: 'tb-btn', text: '✕ Закрыть (Esc)' });
  head.appendChild(closeBtn);
  panel.appendChild(head);

  const tabsRow = h('div', { style: 'display:flex;gap:4px;padding:8px 16px 0;flex:none;flex-wrap:wrap;' });
  panel.appendChild(tabsRow);

  const content = h('div', { style: 'flex:1;min-height:0;overflow-y:auto;padding:12px 16px 16px;' });
  panel.appendChild(content);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  const close = () => {
    backdrop.remove();
    window.removeEventListener('keydown', onKey);
    onClosed();
  };
  const onKey = (e: KeyboardEvent) => {
    // не закрываем, если сверху палитра цветов или другой попап
    if (e.key === 'Escape' && document.querySelector('.mapmodal-backdrop') === backdrop) close();
  };
  window.addEventListener('keydown', onKey);
  closeBtn.onclick = close;
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };

  const setTabs = (tabs: [string, string][], active: string, onPick: (id: string) => void) => {
    tabsRow.innerHTML = '';
    for (const [id, label] of tabs) {
      const b = h('button', {
        class: 'tb-btn',
        text: label,
        style: id === active
          ? 'border-color:var(--accent);color:var(--accent);'
          : 'opacity:0.75;',
      });
      b.onclick = () => onPick(id);
      tabsRow.appendChild(b);
    }
  };
  return { content, setTabs, close };
}

/** Подсекция с мелким заголовком */
function sub(text: string): HTMLElement {
  return h('div', { style: 'font-size:10px;color:var(--text-faint);margin:10px 0 4px;letter-spacing:0.4px;', text });
}

// ============================================================
// Модалка «Редактор узла»
// ============================================================
export function openMapNodeModal(store: Store, scene: Scene, nodeId: string) {
  ensureCampMapStyles();
  const { conditionsEditor } = makeCondEffectEditors(store);
  const mutate: Mutate = (fn) => { store.snapshot(); fn(); store.emit('change'); };

  let tab = 'main';
  let previewViewId: string | null = store.mapLookPreviewId; // локальный выбор вида превью
  let unsub: (() => void) | null = null;

  const frame = modalFrame('Редактор узла карты', 780, () => { unsub?.(); });

  const body = h('div', { style: 'display:flex;gap:16px;align-items:flex-start;' });
  const previewCol = h('div', { style: 'flex:0 0 236px;position:sticky;top:0;' });
  const tabCol = h('div', { style: 'flex:1;min-width:0;' });
  body.append(previewCol, tabCol);
  frame.content.appendChild(body);

  const cfgOf = (): CampMapConfig | null => store.getScene(scene.id)?.campMap ?? null;
  const nodeOf = (): CampMapNode | null => cfgOf()?.nodes.find((n) => n.id === nodeId) ?? null;

  const render = () => {
    const cfg = cfgOf();
    const node = nodeOf();
    if (!cfg || !node) { frame.close(); return; }

    frame.setTabs([
      ['main', 'Основное'], ['look', 'Вид'], ['marks', 'Пометки'],
      ['people', 'Люди'], ['access', 'Доступ'],
    ], tab, (id) => { tab = id; render(); });

    // ---------- живой превью ромба ----------
    previewCol.innerHTML = '';
    const box = h('div', {
      style: `position:relative;height:230px;background:#0a1016 url() center/cover;border:1px solid var(--border);
        border-radius:8px;overflow:hidden;font-size:17px;`,
    });
    const bgScene = store.getScene(scene.id);
    if (bgScene?.bgImage) box.style.backgroundImage = `url(${bgScene.bgImage})`;
    else box.style.background = bgScene?.background || '#0a1016';
    const isHome = cfg.homeNodeId === node.id;
    let look: CampNodeLook;
    const nodeLi = (node.lookIf ?? []).find((x) => x.id === previewViewId);
    if (nodeLi) look = mergeLook(previewNodeLook(cfg, node, null, isHome), nodeLi.look);
    else look = previewNodeLook(cfg, node, previewViewId, isHome);
    const firstMark = (node.marks ?? [])[0];
    const dia = renderDiamond({
      look,
      marker: cfg.marker,
      state: isHome && !cfg.currentLook ? 'current' : 'normal',
      pulsing: (cfg.marker?.pulse ?? 'current') === 'all' || isHome,
      title: node.title,
      markText: firstMark?.text ?? '',
      markColor: firstMark ? markColor(firstMark, cfg.marker?.color ?? '#4fd1c5') : undefined,
      titlePx: Math.round(6 + (node.size ?? 14) * 0.95),
      animate: true,
    });
    dia.style.left = '14%';
    dia.style.top = '8%';
    dia.style.width = '72%';
    dia.style.height = '84%';
    box.appendChild(dia);
    previewCol.appendChild(box);
    const viewOpts: [string, string][] = [
      ['', 'базовый вид'],
      ...(cfg.nodeLookIf ?? []).map((li, i) => [li.id, `карта: ${li.name || `вид №${i + 1}`}`] as [string, string]),
      ...(node.lookIf ?? []).map((li, i) => [li.id, `узел: вид №${i + 1}`] as [string, string]),
    ];
    if (viewOpts.length > 1) {
      const sel = selectInput(previewViewId ?? '', viewOpts, (v) => { previewViewId = v || null; render(); });
      sel.style.marginTop = '6px';
      sel.style.width = '100%';
      previewCol.appendChild(sel);
    }
    previewCol.appendChild(h('div', { class: 'hint', text: 'Живой превью: анимации и материалы как в игре. Показана первая пометка.' }));

    // ---------- вкладки ----------
    const scroll = tabCol.scrollTop;
    tabCol.innerHTML = '';

    if (tab === 'main') {
      tabCol.appendChild(row('Название', textInput(node.title, (v) => mutate(() => { node.title = v; }))));
      const sceneOptions: [string, string][] = [['', '— нет (декорация) —'],
        ...store.project.scenes.filter((s) => s.id !== scene.id).map((s) => [s.id, s.name] as [string, string])];
      tabCol.appendChild(row('Ведёт в сцену', selectInput(node.sceneId ?? '', sceneOptions,
        (v) => mutate(() => { node.sceneId = v || undefined; }))));
      tabCol.appendChild(row('Примета', textInput(node.tagline ?? '', (v) => mutate(() => { node.tagline = v || undefined; }))));
      tabCol.appendChild(h('div', { class: 'hint', text: 'Примета — строка под названием в игровом сайдбаре узла («сварка и лебёдки»).' }));
      tabCol.appendChild(row('Сайдбар', selectInput(node.side ?? 'right', [['right', 'выезжает справа'], ['left', 'выезжает слева']],
        (v) => mutate(() => { node.side = v === 'left' ? 'left' : undefined; }))));
      tabCol.appendChild(sub('Положение и размер (двигается и мышью на холсте):'));
      tabCol.appendChild(row('X, %', numberInput(node.x, (v) => mutate(() => { node.x = Math.max(0, Math.min(100, v)); }))));
      tabCol.appendChild(row('Y, %', numberInput(node.y, (v) => mutate(() => { node.y = Math.max(0, Math.min(100, v)); }))));
      tabCol.appendChild(row('Размер', numberInput(node.size ?? 14, (v) => mutate(() => { node.size = Math.max(3, Math.min(40, v)); }))));
      tabCol.appendChild(row('Даль', numberInput(node.dim ?? 0, (v) => mutate(() => { node.dim = Math.max(0, Math.min(100, v)) || undefined; }))));
      tabCol.appendChild(h('div', { class: 'hint', text: '«Даль» приглушает узел (дальний план), 0–100.' }));
      const isHomeNow = cfg.homeNodeId === node.id;
      tabCol.appendChild(checkbox(isHomeNow, (v) => mutate(() => {
        cfg.homeNodeId = v ? node.id : (isHomeNow ? undefined : cfg.homeNodeId);
      }), 'здесь стоит ГГ до первого перехода (текущее положение)'));
    }

    if (tab === 'look') {
      tabCol.appendChild(sub('Вид этого узла (переопределяет общий вид карты; пустое поле — как у карты):'));
      for (const el of lookControls(store, mutate, () => node.look, () => (node.look ?? (node.look = {})))) tabCol.appendChild(el);
      if (node.look && Object.keys(node.look).length) {
        const reset = h('button', { class: 'btn small', text: 'сбросить вид узла' });
        reset.onclick = () => mutate(() => { node.look = undefined; });
        tabCol.appendChild(reset);
      }
      tabCol.appendChild(sub('Вид узла при условиях (первый активный накладывается поверх):'));
      (node.lookIf ?? []).forEach((li, i) => {
        const card = h('div', { class: 'cond-card' });
        const r = h('div', { class: 'row' });
        r.appendChild(h('span', { style: 'flex:1;font-size:11px;color:var(--text-dim);', text: `вид №${i + 1}: условия → вид` }));
        const del = h('button', { class: 'del', text: '✕' });
        del.onclick = () => mutate(() => { node.lookIf = (node.lookIf ?? []).filter((x) => x.id !== li.id); });
        r.appendChild(del);
        card.appendChild(r);
        card.appendChild(conditionsEditor(li.conditions, (list) => mutate(() => { li.conditions = list; })));
        for (const el of lookControls(store, mutate, () => li.look, () => li.look)) card.appendChild(el);
        tabCol.appendChild(card);
      });
      const addLi = h('button', { class: 'btn small', text: '+ вид при условиях' });
      addLi.onclick = () => mutate(() => {
        node.lookIf = [...(node.lookIf ?? []), { id: uid('ml'), conditions: [], look: {} }];
      });
      tabCol.appendChild(addLi);
    }

    if (tab === 'marks') {
      tabCol.appendChild(h('div', { class: 'hint', text: 'На карте видна ПЕРВАЯ пометка, чьи условия верны (порядок важен); в игровом сайдбаре узла — все активные. Маркер в начале текста задаёт цвет по умолчанию: «◊ …» — акцент, прочее — приглушённо; свой цвет сильнее. Холст показывает пометки «глазами нового игрока» — по стартовым значениям переменных; кнопка 👁 форсирует показ конкретной пометки, пока вы её настраиваете.' }));
      (node.marks ?? []).forEach((m) => {
        const card = h('div', { class: 'cond-card' });
        const r = h('div', { class: 'row' });
        r.appendChild(textInput(m.text, (v) => mutate(() => { m.text = v; })));
        const forced = store.mapMarkPreview?.nodeId === node.id && store.mapMarkPreview?.markId === m.id;
        const eye = h('button', { class: 'btn small', text: forced ? '👁 на холсте' : '👁', title: 'Показать эту пометку на холсте (пока настраиваете)' });
        if (forced) eye.style.borderColor = 'var(--accent)';
        eye.onclick = () => {
          store.mapMarkPreview = forced ? null : { nodeId: node.id, markId: m.id };
          store.emit('selection');
        };
        r.appendChild(eye);
        const del = h('button', { class: 'del', text: '✕' });
        del.onclick = () => mutate(() => { node.marks = (node.marks ?? []).filter((x) => x.id !== m.id); });
        r.appendChild(del);
        card.appendChild(r);
        card.appendChild(row('Цвет', colorField(m.color ?? '', (v) => mutate(() => { m.color = v || undefined; }))));
        card.appendChild(sub('Показывается, когда все условия верны (пусто — всегда):'));
        card.appendChild(conditionsEditor(m.conditions, (list) => mutate(() => { m.conditions = list; })));
        tabCol.appendChild(card);
      });
      const addMark = h('button', { class: 'btn small', text: '+ пометка' });
      addMark.onclick = () => mutate(() => {
        node.marks = [...(node.marks ?? []), { id: uid('mm'), text: '◊ есть разговор', conditions: [] }];
      });
      tabCol.appendChild(addMark);
    }

    if (tab === 'people') {
      tabCol.appendChild(h('div', { class: 'hint', text: 'Список «кто здесь» в игровом сайдбаре узла (портрет + роль).' }));
      const npcs = store.project.npcs ?? [];
      for (const id of node.npcIds ?? []) {
        const npc = npcs.find((n) => n.id === id);
        const nr = h('div', { class: 'row' });
        nr.appendChild(h('span', { style: 'flex:1;font-size:12px;', text: npc ? npc.name : '(удалённый NPC)' }));
        const ndel = h('button', { class: 'del', text: '✕' });
        ndel.onclick = () => mutate(() => { node.npcIds = (node.npcIds ?? []).filter((x) => x !== id); });
        nr.appendChild(ndel);
        tabCol.appendChild(nr);
      }
      const freeNpcs = npcs.filter((n) => !(node.npcIds ?? []).includes(n.id));
      if (freeNpcs.length) {
        tabCol.appendChild(selectInput('', [['', '+ добавить персонажа…'],
          ...freeNpcs.map((n) => [n.id, n.name] as [string, string])],
          (v) => { if (v) mutate(() => { node.npcIds = [...(node.npcIds ?? []), v]; }); }));
      }
    }

    if (tab === 'access') {
      tabCol.appendChild(sub('Заперто, когда все условия верны (пусто — открыто):'));
      tabCol.appendChild(conditionsEditor(node.lockedIf ?? [], (list) => mutate(() => {
        node.lockedIf = list.length ? list : undefined;
      })));
      if (node.lockedIf?.length) {
        tabCol.appendChild(row('Текст запрета', textInput(node.lockedText ?? '', (v) => mutate(() => {
          node.lockedText = v || undefined;
        }))));
        tabCol.appendChild(h('div', { class: 'hint', text: 'Показывается в сайдбаре узла вместо кнопки ВОЙТИ.' }));
      }
      tabCol.appendChild(sub('Узел виден при условии (пусто — всегда):'));
      tabCol.appendChild(conditionsEditor(node.visibleIf ?? [], (list) => mutate(() => {
        node.visibleIf = list.length ? list : undefined;
      })));
      tabCol.appendChild(h('div', { class: 'hint', text: 'Скрытый на старте узел на холсте не исчезает — рисуется призраком со значком 👁.' }));
    }

    tabCol.scrollTop = scroll;
  };

  unsub = store.on('change', render);
  render();
}

// ============================================================
// Модалка «⚙ Вид карты» (общие настройки: маркеры/узлы/текущее/связи/слои)
// ============================================================
export function openMapLookModal(store: Store, scene: Scene) {
  ensureCampMapStyles();
  const { conditionsEditor } = makeCondEffectEditors(store);
  const mutate: Mutate = (fn) => { store.snapshot(); fn(); store.emit('change'); };

  let tab = 'markers';
  let unsub: (() => void) | null = null;
  const frame = modalFrame('Вид карты лагеря', 640, () => { unsub?.(); });

  const cfgOf = (): CampMapConfig | null => store.getScene(scene.id)?.campMap ?? null;

  const render = () => {
    const cfg = cfgOf();
    if (!cfg) { frame.close(); return; }
    frame.setTabs([
      ['markers', 'Маркеры'], ['nodes', 'Узлы'], ['current', 'Текущее положение'],
      ['links', 'Связи'], ['layers', 'Слои (Осколок)'],
    ], tab, (id) => { tab = id; render(); });

    const scroll = frame.content.scrollTop;
    const box = frame.content;
    box.innerHTML = '';

    if (tab === 'markers') {
      box.appendChild(h('div', { class: 'hint', text: 'Маркеры — ромбики-точки входа на локациях. Общие настройки для всей карты; цвет/свечение можно переопределить в «виде узлов» и слоях.' }));
      const mk = () => (cfg.marker ?? (cfg.marker = {}));
      box.appendChild(row('Размер', numberInput(cfg.marker?.size ?? 11, (v) => mutate(() => { mk().size = Math.max(4, Math.min(40, v)); }))));
      box.appendChild(row('Свечение', rangeInput(cfg.marker?.glow ?? 60, 0, 100, 1, (v) => mutate(() => { mk().glow = v; }))));
      box.appendChild(row('Цвет', colorField(cfg.marker?.color ?? '#4fd1c5', (v) => mutate(() => { mk().color = v || undefined; }))));
      box.appendChild(row('Пульсация', selectInput(cfg.marker?.pulse ?? 'current', [
        ['current', 'текущая локация'], ['all', 'все маркеры'], ['none', 'выключена'],
      ], (v) => mutate(() => { mk().pulse = v === 'current' ? undefined : (v as 'all' | 'none'); }))));
    }

    if (tab === 'nodes') {
      box.appendChild(h('div', { class: 'hint', text: 'Вид всех узлов по умолчанию. Отдельный узел может переопределить любое поле (Редактор узла → Вид).' }));
      for (const el of lookControls(store, mutate, () => cfg.nodeLook, () => (cfg.nodeLook ?? (cfg.nodeLook = {})))) box.appendChild(el);
    }

    if (tab === 'current') {
      box.appendChild(h('div', { class: 'hint', text: 'Вид узла, где сейчас стоит ГГ («текущее положение»). Накладывается поверх всего. Пусто — встроенная подсветка: акцентная рамка + мягкое свечение. Задайте любое поле — и вид станет полностью вашим.' }));
      for (const el of lookControls(store, mutate, () => cfg.currentLook, () => (cfg.currentLook ?? (cfg.currentLook = {})))) box.appendChild(el);
      if (cfg.currentLook && Object.keys(cfg.currentLook).length) {
        const reset = h('button', { class: 'btn small', text: 'вернуть встроенную подсветку' });
        reset.onclick = () => mutate(() => { cfg.currentLook = undefined; });
        box.appendChild(reset);
      }
    }

    if (tab === 'links') {
      box.appendChild(h('div', { class: 'hint', text: 'Вид связей-пунктиров по умолчанию. Свой стиль и условия видимости у каждой связи — в Редакторе узла (раздел «Связи узла» появится при выборе узла в сайдбаре) или кликом по линии на холсте (удаление). Создание — порт ● у выделенного узла.' }));
      for (const el of linkControls(mutate, () => cfg.linkLook, () => (cfg.linkLook ?? (cfg.linkLook = {})))) box.appendChild(el);
      // все связи карты списком: стиль + условия каждой
      const nodesById = new Map(cfg.nodes.map((n) => [n.id, n]));
      if ((cfg.links ?? []).length) box.appendChild(sub(`Связи карты (${cfg.links!.length}):`));
      (cfg.links ?? []).forEach((link) => {
        const card = h('div', { class: 'cond-card' });
        const r = h('div', { class: 'row' });
        r.appendChild(h('span', {
          style: 'flex:1;font-size:12px;',
          text: `${nodesById.get(link.a)?.title ?? '(удалён)'} ↔ ${nodesById.get(link.b)?.title ?? '(удалён)'}`,
        }));
        const del = h('button', { class: 'del', text: '✕' });
        del.onclick = () => mutate(() => { cfg.links = (cfg.links ?? []).filter((l) => l !== link); });
        r.appendChild(del);
        card.appendChild(r);
        for (const el of linkControls(mutate, () => link.look, () => (link.look ?? (link.look = {})))) card.appendChild(el);
        card.appendChild(sub('Связь видна при условиях (пусто — всегда):'));
        card.appendChild(conditionsEditor(link.visibleIf ?? [], (list) => mutate(() => {
          link.visibleIf = list.length ? list : undefined;
        })));
        box.appendChild(card);
      });
    }

    if (tab === 'layers') {
      box.appendChild(h('div', { class: 'hint', text: 'Вид ВСЕЙ карты при условиях — первый активный накладывается на «вид узлов»; узловые настройки сильнее. Так работает слой Осколка: без Осколка — «бумага», с Осколком и включённым Mesh — «пробуждение».' }));
      if ((cfg.nodeLookIf ?? []).length) {
        if (store.mapLookPreviewId && !(cfg.nodeLookIf ?? []).some((x) => x.id === store.mapLookPreviewId)) {
          store.mapLookPreviewId = null;
        }
        box.appendChild(row('Холст показывает', selectInput(store.mapLookPreviewId ?? '', [
          ['', 'базовый вид'],
          ...(cfg.nodeLookIf ?? []).map((li, i) => [li.id, li.name || `вид №${i + 1}`] as [string, string]),
        ], (v) => { store.mapLookPreviewId = v || null; store.emit('selection'); render(); })));
      }
      (cfg.nodeLookIf ?? []).forEach((li, i) => {
        const card = h('div', { class: 'cond-card' });
        const r = h('div', { class: 'row' });
        r.appendChild(textInput(li.name ?? `вид №${i + 1}`, (v) => mutate(() => { li.name = v || undefined; })));
        const del = h('button', { class: 'del', text: '✕' });
        del.onclick = () => mutate(() => { cfg.nodeLookIf = (cfg.nodeLookIf ?? []).filter((x) => x.id !== li.id); });
        r.appendChild(del);
        card.appendChild(r);
        card.appendChild(sub('Активен, когда все условия верны:'));
        card.appendChild(conditionsEditor(li.conditions, (list) => mutate(() => { li.conditions = list; })));
        for (const el of lookControls(store, mutate, () => li.look, () => li.look)) card.appendChild(el);
        box.appendChild(card);
      });
      const addLi = h('button', { class: 'btn small', text: '+ вид при условиях' });
      addLi.onclick = () => mutate(() => {
        cfg.nodeLookIf = [...(cfg.nodeLookIf ?? []), { id: uid('ml'), conditions: [], look: {} }];
      });
      box.appendChild(addLi);

      const preset = h('button', { class: 'btn small', text: '⚡ Слой Осколка' });
      preset.title = 'Заполнить: «бумага» без Осколка → карта просыпается с Осколком и включённым Mesh';
      preset.onclick = () => { applyOskolokPreset(store, cfg); render(); };
      box.appendChild(preset);
      box.appendChild(h('div', { class: 'hint', text: 'Пресет заполняет базовый вид («бумага»), слой «Пробуждение (Осколок)» и условия видимости связей. Всё это обычные поля — правьте после.' }));
    }

    box.scrollTop = scroll;
  };

  unsub = store.on('change', render);
  render();
}

/** Пресет «Слой Осколка»: бумага → пробуждение (oskolok≥1 и mesh_on) */
function applyOskolokPreset(store: Store, cfg: CampMapConfig) {
  const oskName = store.project.oskolokVarName || 'oskolok';
  const vOsk = store.project.variables.find((v) => v.name === oskName);
  const vMesh = store.project.variables.find((v) => v.name === 'mesh_on');
  if (!vOsk || !vMesh) {
    toast(`Нужны переменные «${oskName}» и «mesh_on»`);
    return;
  }
  const awake: Condition[] = [
    { varId: vOsk.id, op: 'gte', value: 1 },
    { varId: vMesh.id, op: 'eq', value: true },
  ];
  store.snapshot();
  cfg.nodeLook = {
    ...(cfg.nodeLook ?? {}),
    fillOpacity: 3, borderOpacity: 14, markerColor: '#8fa7b5', markerGlow: 0, scrim: 40,
  };
  const wakeLook: CampNodeLook = {
    fillOpacity: 6, borderOpacity: 30, markerColor: '#4fd1c5', markerGlow: 75, scrim: 55,
    fx: { surface: 'spatial', glass: 10, border: 'shimmer', tempo: 'slow', intensity: 'quiet' },
  };
  const wake = (cfg.nodeLookIf ?? []).find((li) => li.id === 'ml_oskolok_wake');
  if (wake) { wake.name = wake.name ?? 'Пробуждение (Осколок)'; wake.conditions = awake; wake.look = wakeLook; }
  else {
    cfg.nodeLookIf = [...(cfg.nodeLookIf ?? []),
      { id: 'ml_oskolok_wake', name: 'Пробуждение (Осколок)', conditions: awake, look: wakeLook }];
  }
  cfg.linkLook = { ...(cfg.linkLook ?? {}), flow: 'run', opacity: 28, tempo: 'slow' };
  for (const l of cfg.links ?? []) l.visibleIf = awake.map((c) => ({ ...c }));
  store.mapLookPreviewId = 'ml_oskolok_wake'; // холст сразу показывает «пробуждение»
  store.emit('change');
  toast('Слой Осколка применён — холст показывает «пробуждение»');
}
