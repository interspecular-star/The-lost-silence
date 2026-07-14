// ============================================================
// Левый sidebar: страницы/локации/уровни, диалоги, слои сцены
// ============================================================

import { Store } from '../core/store';
import {
  Scene, SceneKind, SceneFolder, Dialogue, uid, deepClone,
  SCENE_KIND_LABELS, ELEMENT_TYPE_LABELS,
} from '../core/types';
import { h, promptModal, confirmModal, toast } from './ui';
import { openDraftPanel } from './draft';

const KIND_ICONS: Record<SceneKind, string> = { page: '▤', location: '◈', level: '⬢' };
const COLLAPSE_KEY = 'tls_sidebar_collapsed_kinds';
const COLLAPSE_FOLDERS_KEY = 'tls_sidebar_collapsed_folders';

export function mountSidebar(root: HTMLElement, store: Store) {
  const collapsedKinds = new Set<SceneKind>(
    JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]') as SceneKind[],
  );
  const saveCollapsed = () => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsedKinds]));
  };
  const collapsedFolders = new Set<string>(
    JSON.parse(localStorage.getItem(COLLAPSE_FOLDERS_KEY) ?? '[]') as string[],
  );
  const saveCollapsedFolders = () => {
    localStorage.setItem(COLLAPSE_FOLDERS_KEY, JSON.stringify([...collapsedFolders]));
  };

  let renderedMode: string | null = null;
  const render = () => {
    // перерисовка не должна сбрасывать прокрутку — иначе выбор внизу длинного
    // списка «прыгает» наверх и приходится скроллить заново
    const sameMode = renderedMode === store.mode;
    const scrolls = sameMode ? [...root.querySelectorAll('.sb-section')].map((el) => el.scrollTop) : [];
    renderedMode = store.mode;
    root.innerHTML = '';
    if (store.mode === 'scene') renderScenes();
    else if (store.mode === 'dialogue') renderDialogues();
    else if (store.mode === 'npc') renderNPCInfo();
    else if (store.mode === 'items') renderItemsInfo();
    else if (store.mode === 'mobs') renderMobsInfo();
    else if (store.mode === 'quests') renderQuestsInfo();
    else renderVariablesInfo();
    [...root.querySelectorAll('.sb-section')].forEach((el, i) => {
      if (scrolls[i]) el.scrollTop = scrolls[i];
    });
  };

  function renderQuestsInfo() {
    const s = h('div', { class: 'sb-section' });
    s.appendChild(h('div', { class: 'sb-header' }, [h('span', { text: 'Журнал' })]));
    s.appendChild(h('div', {
      class: 'hint', style: 'padding:6px 12px;',
      text: 'Ежедневный ритм игры:\n\n• Задания — суточные/недельные/сюжетные, награды за условия\n• Улучшения — прокачка idle-дохода (дроны, контракты)\n• OldNet — фрагменты расшифровываются реальным временем и выдают куски правды о 2034\n\nИгрок открывает всё это кнопкой 📋 в игре.\n\nСовет: движок сам считает переменную kills_total (победы в боях), если создать её в «Переменных» — удобно для заданий.',
    }));
    root.appendChild(s);
  }

  function renderMobsInfo() {
    const s = h('div', { class: 'sb-section' });
    s.appendChild(h('div', { class: 'sb-header' }, [h('span', { text: 'Бои' })]));
    s.appendChild(h('div', {
      class: 'hint', style: 'padding:6px 12px;',
      text: 'Пошаговый QTE-бой:\n• Ход игрока: Атака (A) / Спецудар (S, 25 фокуса, ×1.8) / Защита (D, полурона и +10 фокуса) / Предмет (расходники) / Скан Осколком (10 фокуса — открывает цифры и атаки моба)\n• Замах моба → Уклон (ПРОБЕЛ, широкое окно) или Парирование (E, узкое, отражает 50% и даёт +10 фокуса)\n\nЗапуск: элемент сцены → действие «Начать бой». После победы/поражения можно запустить диалог.',
    }));
    root.appendChild(s);
  }

  function renderItemsInfo() {
    const s = h('div', { class: 'sb-section' });
    s.appendChild(h('div', { class: 'sb-header' }, [h('span', { text: 'Предметы' })]));
    s.appendChild(h('div', {
      class: 'hint', style: 'padding:6px 12px;',
      text: 'Манекен: 8 слотов. Ячейки: база + выносливость + сумки.\n\nВыдать предмет игроку: действие элемента сцены или нода «Действие» в диалоге → «Выдать предметы».\n\nРедкости: хлам → потёртый → добротный → высокий → легендарный → Архонт-класс.',
    }));
    root.appendChild(s);
  }

  function renderNPCInfo() {
    const s = h('div', { class: 'sb-section' });
    s.appendChild(h('div', { class: 'sb-header' }, [h('span', { text: 'Персонажи' })]));
    s.appendChild(h('div', {
      class: 'hint', style: 'padding:6px 12px;',
      text: 'Фракционная репутация = отношения встреченных NPC с учётом весов.\n\nПривяжите реплику к NPC в редакторе диалогов (поле «Персонаж») — знакомство отметится само.\n\nПока у игрока нет Осколка (переменная oskolok = 0), он не видит ни отношений, ни репутации.',
    }));
    root.appendChild(s);
  }

  // ---------- сцены ----------
  const folders = (): SceneFolder[] => store.project.sceneFolders ?? [];
  const folderOf = (s: Scene): SceneFolder | undefined =>
    s.folderId ? folders().find((f) => f.id === s.folderId) : undefined;

  function renderScenes() {
    const list = h('div', { class: 'sb-section', style: 'flex:0 0 auto;max-height:55%;' });
    const kinds: SceneKind[] = ['page', 'location', 'level'];

    // ---- папки (главы) ----
    for (const folder of folders()) {
      const scenesIn = store.project.scenes.filter((s) => s.folderId === folder.id);
      const collapsed = collapsedFolders.has(folder.id);
      const header = h('div', { class: 'sb-header' });
      const titleWrap = h('div', { class: 'sb-header-title' });
      titleWrap.appendChild(h('span', { class: 'sb-collapse-arrow', text: collapsed ? '▸' : '▾' }));
      titleWrap.appendChild(h('span', { text: `📁 ${folder.name} (${scenesIn.length})` }));
      titleWrap.onclick = () => {
        if (collapsed) collapsedFolders.delete(folder.id); else collapsedFolders.add(folder.id);
        saveCollapsedFolders();
        render();
      };
      header.appendChild(titleWrap);
      const menuBtn = h('button', { class: 'sb-menu-btn', text: '⋯', title: 'Действия с папкой' });
      menuBtn.onclick = (e) => { e.stopPropagation(); showFolderMenu(folder, menuBtn); };
      header.appendChild(menuBtn);
      const add = h('button', { class: 'sb-add', text: '+', title: 'Новая сцена в папке (тип «Локация» — меняется в инспекторе)' });
      add.onclick = async (e) => {
        e.stopPropagation();
        const name = await promptModal(`Сцена в «${folder.name}»`, '', 'Например: Руины у периметра');
        if (!name) return;
        store.snapshot();
        const scene: Scene = {
          id: uid('scene'), name, kind: 'location', folderId: folder.id,
          background: '#0b1016', elements: [], guides: [],
        };
        store.project.scenes.push(scene);
        store.emit('change');
        store.selectScene(scene.id);
      };
      header.appendChild(add);
      list.appendChild(header);
      if (!collapsed) {
        for (const scene of scenesIn) list.appendChild(sceneItem(scene, true));
        if (scenesIn.length === 0) {
          list.appendChild(h('div', { class: 'hint', style: 'padding:2px 12px 6px 26px;', text: 'Пусто. Добавьте сцену кнопкой «+» или перенесите существующую через её меню ⋯' }));
        }
      }
    }

    // ---- кнопка новой папки ----
    const addFolderRow = h('div', {
      class: 'sb-item', style: 'color:var(--text-dim);font-size:12px;',
    });
    addFolderRow.appendChild(h('span', { class: 'sb-icon', text: '+' }));
    addFolderRow.appendChild(h('span', { class: 'sb-name', text: '📁 Новая папка (глава)' }));
    addFolderRow.onclick = async () => {
      const name = await promptModal('Название папки', '', 'Например: Глава 1 — Осколок');
      if (!name) return;
      store.snapshot();
      store.project.sceneFolders = [...folders(), { id: uid('fld'), name }];
      store.emit('change');
    };
    list.appendChild(addFolderRow);

    // ---- сцены без папки: группы по типам ----
    const loose = store.project.scenes.filter((s) => !folderOf(s));
    for (const kind of kinds) {
      const scenesOfKind = loose.filter((s) => s.kind === kind);
      const collapsed = collapsedKinds.has(kind);

      const header = h('div', { class: 'sb-header' });
      const titleWrap = h('div', { class: 'sb-header-title' });
      titleWrap.appendChild(h('span', { class: 'sb-collapse-arrow', text: collapsed ? '▸' : '▾' }));
      titleWrap.appendChild(h('span', { text: `${SCENE_KIND_LABELS[kind]} (${scenesOfKind.length})` }));
      titleWrap.onclick = () => {
        if (collapsed) collapsedKinds.delete(kind); else collapsedKinds.add(kind);
        saveCollapsed();
        render();
      };
      header.appendChild(titleWrap);
      const add = h('button', { class: 'sb-add', text: '+', title: `Добавить: ${SCENE_KIND_LABELS[kind]}` });
      add.onclick = async (e) => {
        e.stopPropagation();
        const name = await promptModal(`Название (${SCENE_KIND_LABELS[kind]})`, '', 'Например: Ангар Flux Nomads');
        if (!name) return;
        store.snapshot();
        const scene: Scene = {
          id: uid('scene'), name, kind,
          background: '#0b1016', elements: [], guides: [],
        };
        store.project.scenes.push(scene);
        if (!store.project.startSceneId) store.project.startSceneId = scene.id;
        store.emit('change');
        store.selectScene(scene.id);
      };
      header.appendChild(add);
      list.appendChild(header);

      if (!collapsed) {
        for (const scene of scenesOfKind) {
          list.appendChild(sceneItem(scene));
        }
      }
    }
    root.appendChild(list);

    // слои текущей сцены
    const scene = store.currentScene;
    if (scene) {
      const layers = h('div', { class: 'sb-elements sb-section' });
      layers.appendChild(h('div', { class: 'sb-header' }, [h('span', { text: `Слои — ${scene.name}` })]));
      const sorted = [...scene.elements].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
      for (const el of sorted) {
        const item = h('div', {
          class: `sb-item${store.selectedElementIds.includes(el.id) ? ' active' : ''}`,
        });
        item.appendChild(h('span', { class: 'sb-icon', text: iconForElement(el.type) }));
        item.appendChild(h('span', { class: 'sb-name', text: el.name }));
        item.appendChild(h('span', { class: 'sb-kind-badge', text: ELEMENT_TYPE_LABELS[el.type] }));
        item.onclick = (e) => {
          if (e.shiftKey) {
            const ids = new Set(store.selectedElementIds);
            ids.has(el.id) ? ids.delete(el.id) : ids.add(el.id);
            store.selectElements([...ids]);
          } else {
            store.selectElements([el.id]);
          }
        };
        layers.appendChild(item);
      }
      if (scene.elements.length === 0) {
        layers.appendChild(h('div', { class: 'hint', style: 'padding:6px 12px;', text: 'Пока пусто. Добавьте элементы кнопками над холстом.' }));
      }
      root.appendChild(layers);
    }
  }

  function sceneItem(scene: Scene, inFolder = false): HTMLElement {
    const item = h('div', {
      class: `sb-item${store.currentSceneId === scene.id ? ' active' : ''}`,
      'data-scene-id': scene.id,
      ...(inFolder ? { style: 'padding-left:18px;' } : {}),
    });
    const handle = h('span', { class: 'sb-drag-handle', text: '⠿', title: 'Перетащить для изменения порядка' });
    handle.onpointerdown = (e) => startSceneDrag(scene, e);
    item.appendChild(handle);
    item.appendChild(h('span', { class: 'sb-icon', text: KIND_ICONS[scene.kind] }));
    const isStart = store.project.startSceneId === scene.id;
    item.appendChild(h('span', { class: 'sb-name', text: scene.name + (isStart ? ' ▶' : '') }));
    // длинные названия обрезаются — полное во всплывающей подсказке
    item.title = `${scene.name}${isStart ? ' (стартовая)' : ''}\n${SCENE_KIND_LABELS[scene.kind]}`;
    const menu = h('button', { class: 'sb-menu-btn', text: '⋯', title: 'Действия' });
    menu.onclick = async (e) => {
      e.stopPropagation();
      showSceneMenu(scene, menu);
    };
    item.appendChild(menu);
    item.onclick = () => store.selectScene(scene.id);
    return item;
  }

  function startSceneDrag(scene: Scene, e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let ghost: HTMLElement | null = null;

    const clearDropMarks = () => {
      root.querySelectorAll('.sb-item.drop-before, .sb-item.drop-after')
        .forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    };
    const findTarget = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.sb-item[data-scene-id]') as HTMLElement | null;
      if (!el || el.dataset.sceneId === scene.id) return null;
      const targetScene = store.project.scenes.find((s) => s.id === el.dataset.sceneId);
      if (!targetScene) return null;
      // порядок меняется внутри одной группы: тот же тип (вне папок) или та же папка
      const sameFolder = scene.folderId && targetScene.folderId === scene.folderId;
      const sameKindLoose = !folderOf(scene) && !folderOf(targetScene) && targetScene.kind === scene.kind;
      if (!sameFolder && !sameKindLoose) return null;
      return { el, targetScene };
    };

    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      if (!dragging) {
        dragging = true;
        ghost = h('div', { class: 'sb-drag-ghost', text: scene.name });
        document.body.appendChild(ghost);
      }
      ghost!.style.left = `${ev.clientX + 14}px`;
      ghost!.style.top = `${ev.clientY}px`;
      clearDropMarks();
      const found = findTarget(ev);
      if (found) {
        const rect = found.el.getBoundingClientRect();
        const after = ev.clientY > rect.top + rect.height / 2;
        found.el.classList.add(after ? 'drop-after' : 'drop-before');
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      clearDropMarks();
      ghost?.remove();
      if (!dragging) return;
      const found = findTarget(ev);
      if (!found) return;
      const rect = found.el.getBoundingClientRect();
      const after = ev.clientY > rect.top + rect.height / 2;
      store.snapshot();
      const arr = store.project.scenes;
      arr.splice(arr.indexOf(scene), 1);
      let to = arr.indexOf(found.targetScene);
      if (after) to += 1;
      arr.splice(to, 0, scene);
      store.emit('change');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function showSceneMenu(scene: Scene, anchor: HTMLElement) {
    const { mkItem } = ctxMenu(anchor);

    mkItem('✎ Переименовать', async () => {
      const name = await promptModal('Новое название', scene.name);
      if (!name) return;
      store.snapshot();
      scene.name = name;
      store.emit('change');
    });
    mkItem('▶ Сделать стартовой', () => {
      store.snapshot();
      store.project.startSceneId = scene.id;
      store.emit('change');
      toast(`«${scene.name}» — стартовая сцена`);
    });
    mkItem('⧉ Дублировать', () => {
      store.snapshot();
      const copy = deepClone(scene);
      copy.id = uid('scene');
      copy.name = scene.name + ' (копия)';
      copy.elements.forEach((el) => { el.id = uid('el'); });
      store.project.scenes.push(copy);
      store.emit('change');
      store.selectScene(copy.id);
    });
    mkItem('📁 В папку…', () => showMoveToFolderMenu(scene, anchor));
    mkItem('🗑 Удалить', async () => {
      if (store.project.scenes.length <= 1) { toast('Нельзя удалить последнюю сцену', true); return; }
      if (!(await confirmModal('Удалить сцену', `Сцена «${scene.name}» будет удалена. Продолжить?`))) return;
      store.snapshot();
      store.project.scenes = store.project.scenes.filter((s) => s.id !== scene.id);
      if (store.project.startSceneId === scene.id) {
        store.project.startSceneId = store.project.scenes[0]?.id ?? null;
      }
      if (store.currentSceneId === scene.id) {
        store.currentSceneId = store.project.scenes[0]?.id ?? null;
      }
      store.emit('change');
      store.emit('selection');
    }, true);
  }

  // ---------- меню папок ----------
  function ctxMenu(anchor: HTMLElement): { menu: HTMLElement; mkItem: (label: string, fn: () => void, danger?: boolean) => void } {
    document.querySelectorAll('.ctx-menu').forEach((m) => m.remove());
    const rect = anchor.getBoundingClientRect();
    const menu = h('div', {
      class: 'ctx-menu',
      style: `position:fixed;left:${rect.left}px;top:${rect.bottom + 4}px;z-index:250;
        background:var(--bg-panel2);border:1px solid var(--border-light);border-radius:7px;
        padding:4px;min-width:190px;box-shadow:0 10px 40px rgba(0,0,0,.5);`,
    });
    const mkItem = (label: string, fn: () => void, danger = false) => {
      const it = h('div', {
        style: `padding:6px 12px;cursor:pointer;border-radius:5px;font-size:12.5px;${danger ? 'color:var(--danger);' : ''}`,
        text: label,
      });
      it.onmouseenter = () => { it.style.background = 'var(--bg-panel)'; };
      it.onmouseleave = () => { it.style.background = ''; };
      it.onclick = () => { menu.remove(); fn(); };
      menu.appendChild(it);
    };
    document.body.appendChild(menu);
    // пункты добавляются сразу после вызова — клэмпим кадром позже, когда меню
    // уже имеет размер: у длинных списков меню уходило за нижнюю границу окна
    requestAnimationFrame(() => {
      const mr = menu.getBoundingClientRect();
      if (mr.bottom > window.innerHeight - 8) {
        menu.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - 8) - mr.height - 4)}px`;
      }
      if (mr.right > window.innerWidth - 8) {
        menu.style.left = `${Math.max(8, window.innerWidth - mr.width - 8)}px`;
      }
    });
    const close = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) { menu.remove(); document.removeEventListener('mousedown', close); }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
    return { menu, mkItem };
  }

  function showMoveToFolderMenu(scene: Scene, anchor: HTMLElement) {
    const { mkItem } = ctxMenu(anchor);
    if (folderOf(scene)) {
      mkItem('— без папки —', () => {
        store.snapshot();
        scene.folderId = undefined;
        store.emit('change');
      });
    }
    for (const f of folders()) {
      if (f.id === scene.folderId) continue;
      mkItem(`📁 ${f.name}`, () => {
        store.snapshot();
        scene.folderId = f.id;
        store.emit('change');
      });
    }
    mkItem('+ новая папка…', async () => {
      const name = await promptModal('Название папки', '', 'Например: Глава 1 — Осколок');
      if (!name) return;
      store.snapshot();
      const f: SceneFolder = { id: uid('fld'), name };
      store.project.sceneFolders = [...folders(), f];
      scene.folderId = f.id;
      store.emit('change');
    });
  }

  function showFolderMenu(folder: SceneFolder, anchor: HTMLElement) {
    const { mkItem } = ctxMenu(anchor);
    const scenesIn = () => store.project.scenes.filter((s) => s.folderId === folder.id);

    mkItem('✎ Переименовать', async () => {
      const name = await promptModal('Новое название папки', folder.name);
      if (!name) return;
      store.snapshot();
      folder.name = name;
      store.emit('change');
    });
    mkItem('⧉ Дублировать (со сценами)', () => {
      store.snapshot();
      const copyFolder: SceneFolder = { id: uid('fld'), name: folder.name + ' (копия)' };
      store.project.sceneFolders = [...folders(), copyFolder];
      const src = scenesIn();
      const idMap = new Map<string, string>();
      const copies = src.map((s) => {
        const c = deepClone(s);
        const nid = uid('scene');
        idMap.set(s.id, nid);
        c.id = nid;
        c.name = s.name + ' (копия)'; // иначе в селектах сцен дубликаты неотличимы
        c.folderId = copyFolder.id;
        c.elements.forEach((el) => { el.id = uid('el'); });
        return c;
      });
      // внутренние ссылки сцена→сцена перенаправляем на копии; внешние остаются
      const remap = (id: string | undefined): string | undefined => (id ? idMap.get(id) ?? id : id);
      for (const c of copies) {
        for (const el of c.elements) {
          if (el.action?.sceneId) el.action.sceneId = remap(el.action.sceneId)!;
        }
        if (c.autoNext) c.autoNext.sceneId = remap(c.autoNext.sceneId)!;
        if (c.zone?.hpExits) c.zone.hpExits.forEach((x) => { x.sceneId = remap(x.sceneId)!; });
        if (c.campMap) c.campMap.nodes.forEach((n) => { n.sceneId = remap(n.sceneId); });
      }
      store.project.scenes.push(...copies);
      store.emit('change');
      toast(`Папка продублирована (${copies.length} сцен). Диалоги общие: jump-переходы в них по-прежнему ведут в оригинальные сцены.`);
    });
    mkItem('▣ Расформировать (сцены наружу)', async () => {
      if (!(await confirmModal('Расформировать папку', `Сцены останутся в проекте, папка «${folder.name}» исчезнет. Продолжить?`))) return;
      store.snapshot();
      for (const s of scenesIn()) s.folderId = undefined;
      store.project.sceneFolders = folders().filter((f) => f.id !== folder.id);
      store.emit('change');
    });
    mkItem('🗑 Удалить вместе со сценами', async () => {
      const doomed = scenesIn();
      if (doomed.length >= store.project.scenes.length) { toast('Нельзя удалить все сцены проекта', true); return; }
      if (!(await confirmModal('Удалить папку и сцены', `Будут удалены ${doomed.length} сцен(ы) папки «${folder.name}». Ссылки на них станут битыми (покажет «✓ Проверка»). Продолжить?`))) return;
      store.snapshot();
      const ids = new Set(doomed.map((s) => s.id));
      store.project.scenes = store.project.scenes.filter((s) => !ids.has(s.id));
      store.project.sceneFolders = folders().filter((f) => f.id !== folder.id);
      if (store.project.startSceneId && ids.has(store.project.startSceneId)) {
        store.project.startSceneId = store.project.scenes[0]?.id ?? null;
      }
      if (store.currentSceneId && ids.has(store.currentSceneId)) {
        store.currentSceneId = store.project.scenes[0]?.id ?? null;
      }
      store.emit('change');
      store.emit('selection');
    }, true);
  }

  // ---------- диалоги ----------
  const dlgFolders = (): SceneFolder[] => store.project.dialogueFolders ?? [];
  const dlgFolderOf = (d: Dialogue): SceneFolder | undefined =>
    d.folderId ? dlgFolders().find((f) => f.id === d.folderId) : undefined;

  function newDialogue(folderId?: string) {
    return async () => {
      const name = await promptModal('Название диалога', '', 'Например: Разговор с Матисом в ангаре');
      if (!name) return;
      store.snapshot();
      const startId = uid('nd');
      const dlg: Dialogue = {
        id: uid('dlg'), name, ...(folderId ? { folderId } : {}), startNodeId: startId,
        nodes: [{ id: startId, type: 'line', x: 120, y: 120, speaker: '', text: '', next: null }],
      };
      store.project.dialogues.push(dlg);
      store.emit('change');
      store.selectDialogue(dlg.id);
    };
  }

  function renderDialogues() {
    const list = h('div', { class: 'sb-section', style: 'flex:1;overflow-y:auto;' });

    // папки диалогов
    for (const folder of dlgFolders()) {
      const inFolder = store.project.dialogues.filter((d) => d.folderId === folder.id);
      const collapsed = collapsedFolders.has(folder.id);
      const header = h('div', { class: 'sb-header' });
      const titleWrap = h('div', { class: 'sb-header-title' });
      titleWrap.appendChild(h('span', { class: 'sb-collapse-arrow', text: collapsed ? '▸' : '▾' }));
      titleWrap.appendChild(h('span', { text: `📁 ${folder.name} (${inFolder.length})` }));
      titleWrap.onclick = () => {
        if (collapsed) collapsedFolders.delete(folder.id); else collapsedFolders.add(folder.id);
        saveCollapsedFolders();
        render();
      };
      header.appendChild(titleWrap);
      const menuBtn = h('button', { class: 'sb-menu-btn', text: '⋯', title: 'Действия с папкой' });
      menuBtn.onclick = (e) => { e.stopPropagation(); showDialogueFolderMenu(folder, menuBtn); };
      header.appendChild(menuBtn);
      const add = h('button', { class: 'sb-add', text: '+', title: 'Новый диалог в папке' });
      add.onclick = (e) => { e.stopPropagation(); newDialogue(folder.id)(); };
      header.appendChild(add);
      list.appendChild(header);
      if (!collapsed) {
        for (const dlg of inFolder) list.appendChild(dialogueItem(dlg, true));
        if (inFolder.length === 0) {
          list.appendChild(h('div', { class: 'hint', style: 'padding:2px 12px 6px 26px;', text: 'Пусто. Добавьте диалог кнопкой «+» или перенесите через меню ⋯' }));
        }
      }
    }

    // новая папка
    const addFolderRow = h('div', { class: 'sb-item', style: 'color:var(--text-dim);font-size:12px;' });
    addFolderRow.appendChild(h('span', { class: 'sb-icon', text: '+' }));
    addFolderRow.appendChild(h('span', { class: 'sb-name', text: '📁 Новая папка (глава)' }));
    addFolderRow.onclick = async () => {
      const name = await promptModal('Название папки', '', 'Например: Глава 1 — диалоги');
      if (!name) return;
      store.snapshot();
      store.project.dialogueFolders = [...dlgFolders(), { id: uid('fld'), name }];
      store.emit('change');
    };
    list.appendChild(addFolderRow);

    // диалоги без папки
    const loose = store.project.dialogues.filter((d) => !dlgFolderOf(d));
    const header = h('div', { class: 'sb-header' });
    header.appendChild(h('span', { text: `Диалоги (${loose.length})` }));
    const add = h('button', { class: 'sb-add', text: '+', title: 'Добавить диалог' });
    add.onclick = () => newDialogue()();
    header.appendChild(add);
    list.appendChild(header);
    for (const dlg of loose) list.appendChild(dialogueItem(dlg));
    if (store.project.dialogues.length === 0) {
      list.appendChild(h('div', { class: 'hint', style: 'padding:6px 12px;', text: 'Нажмите «+», чтобы создать первый диалог.' }));
    }
    root.appendChild(list);
  }

  function dialogueItem(dlg: Dialogue, inFolder = false): HTMLElement {
    const item = h('div', {
      class: `sb-item${store.currentDialogueId === dlg.id ? ' active' : ''}`,
      'data-dialogue-id': dlg.id,
      ...(inFolder ? { style: 'padding-left:18px;' } : {}),
    });
    const handle = h('span', { class: 'sb-drag-handle', text: '⠿', title: 'Перетащить для изменения порядка' });
    handle.onpointerdown = (e) => startDialogueDrag(dlg, e);
    item.appendChild(handle);
    item.appendChild(h('span', { class: 'sb-icon', text: '💬' }));
    item.appendChild(h('span', { class: 'sb-name', text: dlg.name }));
    item.appendChild(h('span', { class: 'sb-kind-badge', text: `${dlg.nodes.length} нод` }));
    // длинные названия обрезаются — полное во всплывающей подсказке (+ первая реплика для ориентира)
    const firstLine = dlg.nodes.find((n) => n.type === 'line' && n.text)?.text ?? '';
    item.title = dlg.name + (firstLine ? `\n«${firstLine.slice(0, 90)}${firstLine.length > 90 ? '…' : ''}»` : '');
    const menu = h('button', { class: 'sb-menu-btn', text: '⋯' });
    menu.onclick = (e) => { e.stopPropagation(); showDialogueMenu(dlg, menu); };
    item.appendChild(menu);
    item.onclick = () => store.selectDialogue(dlg.id);
    return item;
  }

  function startDialogueDrag(dlg: Dialogue, e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let ghost: HTMLElement | null = null;

    const clearDropMarks = () => {
      root.querySelectorAll('.sb-item.drop-before, .sb-item.drop-after')
        .forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    };
    const findTarget = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.sb-item[data-dialogue-id]') as HTMLElement | null;
      if (!el || el.dataset.dialogueId === dlg.id) return null;
      const target = store.project.dialogues.find((d) => d.id === el.dataset.dialogueId);
      if (!target) return null;
      const sameFolder = dlg.folderId && target.folderId === dlg.folderId;
      const bothLoose = !dlgFolderOf(dlg) && !dlgFolderOf(target);
      if (!sameFolder && !bothLoose) return null;
      return { el, target };
    };

    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      if (!dragging) {
        dragging = true;
        ghost = h('div', { class: 'sb-drag-ghost', text: dlg.name });
        document.body.appendChild(ghost);
      }
      ghost!.style.left = `${ev.clientX + 14}px`;
      ghost!.style.top = `${ev.clientY}px`;
      clearDropMarks();
      const found = findTarget(ev);
      if (found) {
        const rect = found.el.getBoundingClientRect();
        const after = ev.clientY > rect.top + rect.height / 2;
        found.el.classList.add(after ? 'drop-after' : 'drop-before');
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      clearDropMarks();
      ghost?.remove();
      if (!dragging) return;
      const found = findTarget(ev);
      if (!found) return;
      const rect = found.el.getBoundingClientRect();
      const after = ev.clientY > rect.top + rect.height / 2;
      store.snapshot();
      const arr = store.project.dialogues;
      arr.splice(arr.indexOf(dlg), 1);
      let to = arr.indexOf(found.target);
      if (after) to += 1;
      arr.splice(to, 0, dlg);
      store.emit('change');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function showMoveDialogueToFolderMenu(dlg: Dialogue, anchor: HTMLElement) {
    const { mkItem } = ctxMenu(anchor);
    if (dlgFolderOf(dlg)) {
      mkItem('— без папки —', () => {
        store.snapshot();
        dlg.folderId = undefined;
        store.emit('change');
      });
    }
    for (const f of dlgFolders()) {
      if (f.id === dlg.folderId) continue;
      mkItem(`📁 ${f.name}`, () => {
        store.snapshot();
        dlg.folderId = f.id;
        store.emit('change');
      });
    }
    mkItem('+ новая папка…', async () => {
      const name = await promptModal('Название папки', '', 'Например: Глава 1 — диалоги');
      if (!name) return;
      store.snapshot();
      const f: SceneFolder = { id: uid('fld'), name };
      store.project.dialogueFolders = [...dlgFolders(), f];
      dlg.folderId = f.id;
      store.emit('change');
    });
  }

  function showDialogueFolderMenu(folder: SceneFolder, anchor: HTMLElement) {
    const { mkItem } = ctxMenu(anchor);
    const inFolder = () => store.project.dialogues.filter((d) => d.folderId === folder.id);

    mkItem('✎ Переименовать', async () => {
      const name = await promptModal('Новое название папки', folder.name);
      if (!name) return;
      store.snapshot();
      folder.name = name;
      store.emit('change');
    });
    mkItem('⧉ Дублировать (с диалогами)', () => {
      store.snapshot();
      const copyFolder: SceneFolder = { id: uid('fld'), name: folder.name + ' (копия)' };
      store.project.dialogueFolders = [...dlgFolders(), copyFolder];
      for (const d of inFolder()) {
        const copy = duplicateDialogueData(d);
        copy.folderId = copyFolder.id;
        store.project.dialogues.push(copy);
      }
      store.emit('change');
      toast('Папка диалогов продублирована. Переходы-«jump» в копиях ведут в исходные сцены.');
    });
    mkItem('▣ Расформировать (диалоги наружу)', async () => {
      if (!(await confirmModal('Расформировать папку', `Диалоги останутся, папка «${folder.name}» исчезнет. Продолжить?`))) return;
      store.snapshot();
      for (const d of inFolder()) d.folderId = undefined;
      store.project.dialogueFolders = dlgFolders().filter((f) => f.id !== folder.id);
      store.emit('change');
    });
    mkItem('🗑 Удалить вместе с диалогами', async () => {
      const doomed = inFolder();
      if (!(await confirmModal('Удалить папку и диалоги', `Будут удалены ${doomed.length} диалог(ов) папки «${folder.name}». Ссылки на них станут битыми (покажет «✓ Проверка»). Продолжить?`))) return;
      store.snapshot();
      const ids = new Set(doomed.map((d) => d.id));
      store.project.dialogues = store.project.dialogues.filter((d) => !ids.has(d.id));
      store.project.dialogueFolders = dlgFolders().filter((f) => f.id !== folder.id);
      if (store.currentDialogueId && ids.has(store.currentDialogueId)) {
        store.currentDialogueId = store.project.dialogues[0]?.id ?? null;
      }
      store.emit('change');
      store.emit('selection');
    }, true);
  }

  /** Копия диалога с ремапом id нод (общая для дублирования диалога и папки) */
  function duplicateDialogueData(dlg: Dialogue): Dialogue {
    const copy = deepClone(dlg);
    copy.id = uid('dlg');
    copy.name = dlg.name + ' (копия)';
    const map = new Map<string, string>();
    copy.nodes.forEach((n) => { const nid = uid('nd'); map.set(n.id, nid); n.id = nid; });
    const remap = (v: string | null | undefined) => (v ? map.get(v) ?? null : v ?? null);
    copy.startNodeId = remap(copy.startNodeId);
    copy.nodes.forEach((n) => {
      n.next = remap(n.next);
      n.nextTrue = remap(n.nextTrue);
      n.nextFalse = remap(n.nextFalse);
      n.choices?.forEach((c) => { c.next = remap(c.next); });
    });
    return copy;
  }

  function showDialogueMenu(dlg: Dialogue, anchor: HTMLElement) {
    const { mkItem } = ctxMenu(anchor);
    mkItem('✎ Переименовать', async () => {
      const name = await promptModal('Новое название', dlg.name);
      if (!name) return;
      store.snapshot();
      dlg.name = name;
      store.emit('change');
    });
    mkItem('📝 Черновик', () => { openDraftPanel(store, dlg.id); });
    mkItem('⧉ Дублировать', () => {
      store.snapshot();
      const copy = duplicateDialogueData(dlg);
      store.project.dialogues.push(copy);
      store.emit('change');
      store.selectDialogue(copy.id);
    });
    mkItem('📁 В папку…', () => showMoveDialogueToFolderMenu(dlg, anchor));
    mkItem('🗑 Удалить', async () => {
      if (!(await confirmModal('Удалить диалог', `Диалог «${dlg.name}» будет удалён. Продолжить?`))) return;
      store.snapshot();
      store.project.dialogues = store.project.dialogues.filter((d) => d.id !== dlg.id);
      if (store.currentDialogueId === dlg.id) {
        store.currentDialogueId = store.project.dialogues[0]?.id ?? null;
      }
      store.emit('change');
      store.emit('selection');
    }, true);
  }

  // ---------- режим переменных ----------
  function renderVariablesInfo() {
    const s = h('div', { class: 'sb-section' });
    s.appendChild(h('div', { class: 'sb-header' }, [h('span', { text: 'Переменные' })]));
    s.appendChild(h('div', {
      class: 'hint', style: 'padding:6px 12px;',
      text: 'Переменные хранят состояние игры: репутацию фракций, флаги сюжета, ресурсы idle-систем. Отмеченные «Следить» видны в панели предпросмотра.',
    }));
    root.appendChild(s);
  }

  store.on('change', render);
  store.on('selection', render);
  store.on('mode', render);
  store.on('project', render);
  render();
}

function iconForElement(type: string): string {
  switch (type) {
    case 'text': return 'T';
    case 'rect': return '▭';
    case 'image': return '🖼';
    case 'button': return '⬚';
    case 'hotspot': return '◎';
    default: return '?';
  }
}
