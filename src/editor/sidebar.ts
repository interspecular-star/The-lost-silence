// ============================================================
// Левый sidebar: страницы/локации/уровни, диалоги, слои сцены
// ============================================================

import { Store } from '../core/store';
import {
  Scene, SceneKind, Dialogue, uid, deepClone,
  SCENE_KIND_LABELS, ELEMENT_TYPE_LABELS,
} from '../core/types';
import { h, promptModal, confirmModal, toast } from './ui';

const KIND_ICONS: Record<SceneKind, string> = { page: '▤', location: '◈', level: '⬢' };

export function mountSidebar(root: HTMLElement, store: Store) {
  const render = () => {
    root.innerHTML = '';
    if (store.mode === 'scene') renderScenes();
    else if (store.mode === 'dialogue') renderDialogues();
    else if (store.mode === 'npc') renderNPCInfo();
    else if (store.mode === 'items') renderItemsInfo();
    else renderVariablesInfo();
  };

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
  function renderScenes() {
    const list = h('div', { class: 'sb-section', style: 'flex:0 0 auto;max-height:55%;' });
    const kinds: SceneKind[] = ['page', 'location', 'level'];

    for (const kind of kinds) {
      const header = h('div', { class: 'sb-header' });
      header.appendChild(h('span', { text: SCENE_KIND_LABELS[kind] }));
      const add = h('button', { class: 'sb-add', text: '+', title: `Добавить: ${SCENE_KIND_LABELS[kind]}` });
      add.onclick = async () => {
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

      for (const scene of store.project.scenes.filter((s) => s.kind === kind)) {
        list.appendChild(sceneItem(scene));
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

  function sceneItem(scene: Scene): HTMLElement {
    const item = h('div', { class: `sb-item${store.currentSceneId === scene.id ? ' active' : ''}` });
    item.appendChild(h('span', { class: 'sb-icon', text: KIND_ICONS[scene.kind] }));
    const isStart = store.project.startSceneId === scene.id;
    item.appendChild(h('span', { class: 'sb-name', text: scene.name + (isStart ? ' ▶' : '') }));
    const menu = h('button', { class: 'sb-menu-btn', text: '⋯', title: 'Действия' });
    menu.onclick = async (e) => {
      e.stopPropagation();
      showSceneMenu(scene, menu);
    };
    item.appendChild(menu);
    item.onclick = () => store.selectScene(scene.id);
    return item;
  }

  function showSceneMenu(scene: Scene, anchor: HTMLElement) {
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

    document.body.appendChild(menu);
    const close = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) { menu.remove(); document.removeEventListener('mousedown', close); }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
  }

  // ---------- диалоги ----------
  function renderDialogues() {
    const list = h('div', { class: 'sb-section', style: 'flex:1;overflow-y:auto;' });
    const header = h('div', { class: 'sb-header' });
    header.appendChild(h('span', { text: 'Диалоги' }));
    const add = h('button', { class: 'sb-add', text: '+', title: 'Добавить диалог' });
    add.onclick = async () => {
      const name = await promptModal('Название диалога', '', 'Например: Разговор с Матисом в ангаре');
      if (!name) return;
      store.snapshot();
      const startId = uid('nd');
      const dlg: Dialogue = {
        id: uid('dlg'), name, startNodeId: startId,
        nodes: [{ id: startId, type: 'line', x: 120, y: 120, speaker: '', text: '', next: null }],
      };
      store.project.dialogues.push(dlg);
      store.emit('change');
      store.selectDialogue(dlg.id);
    };
    header.appendChild(add);
    list.appendChild(header);

    for (const dlg of store.project.dialogues) {
      const item = h('div', { class: `sb-item${store.currentDialogueId === dlg.id ? ' active' : ''}` });
      item.appendChild(h('span', { class: 'sb-icon', text: '💬' }));
      item.appendChild(h('span', { class: 'sb-name', text: dlg.name }));
      item.appendChild(h('span', { class: 'sb-kind-badge', text: `${dlg.nodes.length} нод` }));
      const menu = h('button', { class: 'sb-menu-btn', text: '⋯' });
      menu.onclick = (e) => { e.stopPropagation(); showDialogueMenu(dlg, menu); };
      item.appendChild(menu);
      item.onclick = () => store.selectDialogue(dlg.id);
      list.appendChild(item);
    }
    if (store.project.dialogues.length === 0) {
      list.appendChild(h('div', { class: 'hint', style: 'padding:6px 12px;', text: 'Нажмите «+», чтобы создать первый диалог.' }));
    }
    root.appendChild(list);
  }

  function showDialogueMenu(dlg: Dialogue, anchor: HTMLElement) {
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
    mkItem('✎ Переименовать', async () => {
      const name = await promptModal('Новое название', dlg.name);
      if (!name) return;
      store.snapshot();
      dlg.name = name;
      store.emit('change');
    });
    mkItem('⧉ Дублировать', () => {
      store.snapshot();
      const copy = deepClone(dlg);
      copy.id = uid('dlg');
      copy.name = dlg.name + ' (копия)';
      // переименовываем id нод с сохранением связей
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
      store.project.dialogues.push(copy);
      store.emit('change');
      store.selectDialogue(copy.id);
    });
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

    document.body.appendChild(menu);
    const close = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) { menu.remove(); document.removeEventListener('mousedown', close); }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
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
