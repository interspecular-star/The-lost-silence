// ============================================================
// Шапка редактора: режимы, файл, undo/redo, вид, предпросмотр, экспорт
// ============================================================

import { Store, EditorMode } from '../core/store';
import { saveProjectFile, openProjectFile, exportGame } from '../core/storage';
import { seedProject } from '../core/seed';
import { h, toast, confirmModal } from './ui';
import { openPreview } from './preview';

export function mountTopbar(root: HTMLElement, store: Store) {
  const render = () => {
    root.innerHTML = '';

    root.appendChild(h('div', { class: 'tb-logo', text: 'TLS' }));

    // название проекта
    const nameInput = h('input', { class: 'tb-project-name', title: 'Название проекта' }) as HTMLInputElement;
    nameInput.value = store.project.meta.name;
    nameInput.onchange = () => {
      store.snapshot();
      store.project.meta.name = nameInput.value || 'Без названия';
      store.emit('change');
    };
    root.appendChild(nameInput);

    root.appendChild(h('div', { class: 'tb-sep' }));

    // режимы
    const modes: [EditorMode, string][] = [
      ['scene', '🖼 Сцены'],
      ['dialogue', '💬 Диалоги'],
      ['variables', '🧮 Переменные'],
    ];
    const modeGroup = h('div', { class: 'tb-mode' });
    for (const [mode, label] of modes) {
      const b = h('button', { class: `tb-btn${store.mode === mode ? ' active' : ''}`, text: label });
      b.onclick = () => store.setMode(mode);
      modeGroup.appendChild(b);
    }
    root.appendChild(modeGroup);

    root.appendChild(h('div', { class: 'tb-sep' }));

    // undo / redo
    const undoBtn = h('button', { class: 'tb-btn', title: 'Отменить (Ctrl+Z)', text: '↩' }) as HTMLButtonElement;
    const redoBtn = h('button', { class: 'tb-btn', title: 'Повторить (Ctrl+Y)', text: '↪' }) as HTMLButtonElement;
    undoBtn.disabled = !store.canUndo;
    redoBtn.disabled = !store.canRedo;
    undoBtn.onclick = () => store.undo();
    redoBtn.onclick = () => store.redo();
    root.append(undoBtn, redoBtn);

    root.appendChild(h('div', { class: 'tb-sep' }));

    // переключатели вида
    const snapBtn = h('button', {
      class: `tb-btn${store.snapEnabled ? ' active' : ''}`,
      title: 'Прилипание к направляющим и элементам', text: '🧲 Прилипание',
    });
    snapBtn.onclick = () => { store.snapEnabled = !store.snapEnabled; store.emit('view'); render(); };
    const gridBtn = h('button', {
      class: `tb-btn${store.gridEnabled ? ' active' : ''}`,
      title: 'Показать сетку', text: '▦ Сетка',
    });
    gridBtn.onclick = () => { store.gridEnabled = !store.gridEnabled; store.emit('view'); render(); };
    const guidesBtn = h('button', {
      class: `tb-btn${store.guidesVisible ? ' active' : ''}`,
      title: 'Показать направляющие (перетащите с линейки)', text: '┃ Направляющие',
    });
    guidesBtn.onclick = () => { store.guidesVisible = !store.guidesVisible; store.emit('view'); render(); };
    root.append(snapBtn, gridBtn, guidesBtn);

    root.appendChild(h('div', { class: 'tb-spacer' }));

    // файл
    const newBtn = h('button', { class: 'tb-btn', text: '✚ Новый', title: 'Создать новый проект' });
    newBtn.onclick = async () => {
      if (await confirmModal('Новый проект', 'Текущий проект будет заменён стартовым шаблоном. Несохранённые изменения будут потеряны. Продолжить?')) {
        store.loadProject(seedProject());
        toast('Создан новый проект');
      }
    };
    const openBtn = h('button', { class: 'tb-btn', text: '📂 Открыть' });
    openBtn.onclick = async () => {
      try {
        const p = await openProjectFile();
        store.loadProject(p);
        toast(`Проект «${p.meta.name}» загружен`);
      } catch (e) {
        if (e instanceof Error && e.message !== 'Файл не выбран') toast(e.message, true);
      }
    };
    const saveBtn = h('button', { class: 'tb-btn', text: '💾 Сохранить', title: 'Скачать файл проекта (Ctrl+S)' });
    saveBtn.onclick = () => { saveProjectFile(store.project); toast('Файл проекта скачан'); };
    root.append(newBtn, openBtn, saveBtn);

    root.appendChild(h('div', { class: 'tb-sep' }));

    // предпросмотр и экспорт
    const playBtn = h('button', { class: 'tb-btn primary', text: '▶ Играть', title: 'Предпросмотр игры (F5)' });
    playBtn.onclick = () => openPreview(store);
    const exportBtn = h('button', { class: 'tb-btn', text: '⤓ Экспорт игры', title: 'Собрать один HTML-файл игры' });
    exportBtn.onclick = async () => {
      try {
        await exportGame(store.project);
        toast('Игра экспортирована: один HTML-файл, работает на PC и мобильных');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Ошибка экспорта', true);
      }
    };
    root.append(playBtn, exportBtn);
  };

  store.on('change', render);
  store.on('mode', render);
  store.on('project', render);
  render();
}
