// ============================================================
// Шапка редактора: режимы, файл, undo/redo, вид, предпросмотр, экспорт
// ============================================================

import { Store, EditorMode } from '../core/store';
import { saveProjectFile, openProjectFile, exportGame } from '../core/storage';
import { seedProject } from '../core/seed';
import { h, toast, confirmModal } from './ui';
import { openPreview } from './preview';
import { openValidator } from './validate';

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
      ['npc', '👤 Персонажи'],
      ['items', '🎒 Предметы'],
      ['mobs', '⚔ Мобы'],
      ['quests', '📋 Журнал'],
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

    // проверка, предпросмотр и экспорт
    const checkBtn = h('button', { class: 'tb-btn', text: '✓ Проверка', title: 'Найти битые ссылки, висячие ноды и опечатки' });
    checkBtn.onclick = () => openValidator(store);
    root.appendChild(checkBtn);
    const playBtn = h('button', { class: 'tb-btn primary', text: '▶ Играть', title: 'Предпросмотр игры (F5)' });
    playBtn.onclick = () => openPreview(store);
    const exportBtn = h('button', { class: 'tb-btn', text: '⤓ Экспорт игры', title: 'Собрать один HTML-файл игры' });
    exportBtn.onclick = () => openExportDialog(store);
    root.append(playBtn, exportBtn);
  };

  store.on('change', render);
  store.on('mode', render);
  store.on('project', render);
  render();
}

/** Диалог экспорта: явный выбор, с чего начнётся собранная игра */
function openExportDialog(store: Store) {
  const p = store.project;
  const startScene = p.scenes.find((s) => s.id === p.startSceneId);

  const backdrop = h('div', {
    style: 'position:fixed;inset:0;z-index:10000;background:rgba(2,4,6,0.6);display:flex;align-items:center;justify-content:center;',
  });
  const panel = h('div', {
    style: 'background:var(--panel,#161b22);border:1px solid var(--border,#2a3038);border-radius:10px;'
      + 'padding:18px;width:440px;display:flex;flex-direction:column;gap:10px;',
  });
  panel.appendChild(h('div', { style: 'font-weight:600;font-size:15px;', text: 'Экспорт игры' }));

  // один селект: стартовая проекта / любая сцена / чекпоинт
  const options: [string, string][] = [
    ['project', `Стартовая сцена проекта: «${startScene?.name ?? '—'}»`],
    ...p.scenes.filter((s) => s.id !== p.startSceneId)
      .map((s) => [`scene:${s.id}`, `Со сцены: ${s.name}`] as [string, string]),
    ...(p.playtests ?? []).map((cp) => [`cp:${cp.id}`, `С чекпоинта: ${cp.name}`] as [string, string]),
  ];
  const sel = h('select', { class: 'ed' }) as HTMLSelectElement;
  for (const [v, label] of options) {
    const o = h('option', { value: v, text: label });
    sel.appendChild(o);
  }
  panel.appendChild(h('div', { style: 'font-size:12px;color:var(--text-dim,#9aa7b4);', text: 'Игра начнётся с:' }));
  panel.appendChild(sel);
  panel.appendChild(h('div', {
    class: 'hint',
    text: 'Первый вариант — обычная сборка: игрок стартует со стартовой сцены, сейв продолжает игру с места остановки. '
      + 'Выбор конкретной сцены/чекпоинта перекрывает и стартовую, и сейв — каждый запуск начинается там (для демо и тестов).',
  }));

  // перенос сейвов: по умолчанию каждая сборка начинается с чистого листа —
  // старые сохранения в браузере не уводят игру на давно удалённые сцены
  const keepWrap = h('label', { style: 'display:flex;gap:8px;align-items:center;font-size:12px;color:var(--text-dim,#9aa7b4);cursor:pointer;' });
  const keep = h('input', { type: 'checkbox' }) as HTMLInputElement;
  const keepText = h('span', { text: 'переносить сохранения из прошлых сборок (для обновлений опубликованной игры)' });
  keepWrap.append(keep, keepText);
  panel.appendChild(keepWrap);

  const btnRow = h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:4px;' });
  const cancel = h('button', { class: 'btn', text: 'Отмена' });
  cancel.onclick = () => backdrop.remove();
  const go = h('button', { class: 'btn accent', text: '⤓ Экспортировать' });
  go.onclick = async () => {
    try {
      const v = sel.value;
      const boot: import('../core/storage').ExportBoot = v === 'project' ? {}
        : v.startsWith('scene:') ? { startSceneId: v.slice(6) }
        : { checkpoint: (p.playtests ?? []).find((cp) => cp.id === v.slice(3)) };
      if (!keep.checked) boot.buildId = String(Date.now()); // сейвы чужих сборок игнорируются
      await exportGame(p, boot);
      backdrop.remove();
      toast('Игра экспортирована: один HTML-файл, работает на PC и мобильных');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка экспорта', true);
    }
  };
  btnRow.append(cancel, go);
  panel.appendChild(btnRow);
  backdrop.appendChild(panel);
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
  document.body.appendChild(backdrop);
}
