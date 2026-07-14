// ============================================================
// Точка входа редактора: собирает панели, управляет режимами
// ============================================================

import { Store } from '../core/store';
import { seedProject } from '../core/seed';
import { loadServerSave } from '../core/serverSave';
import { h } from './ui';
import { mountTopbar } from './topbar';
import { mountSidebar } from './sidebar';
import { mountInspector } from './inspector';
import { StageView } from './stage';
import { GraphView } from './graph';
import { mountVariables } from './variables';
import { mountNPCs } from './npcs';
import { mountItems } from './items';
import { mountMobs } from './mobs';
import { mountQuests } from './quests';
import { registerHotkeys } from './hotkeys';

function showBanner(text: string, tone: 'warn' | 'info') {
  const colors = tone === 'warn'
    ? { bg: '#3a1f1f', fg: '#f3d9d9', border: '#a34' }
    : { bg: '#1f2e3a', fg: '#d9e6f3', border: '#356a94' };
  const banner = h('div', {
    style: `position:fixed;top:0;left:0;right:0;z-index:9999;
      background:${colors.bg};color:${colors.fg};border-bottom:1px solid ${colors.border};
      padding:10px 16px;font-size:13px;line-height:1.5;
      display:flex;align-items:center;gap:14px;font-family:system-ui,sans-serif;`,
  });
  banner.appendChild(h('span', { text, style: 'flex:1;' }));
  const close = h('button', {
    text: '✕', style: `background:none;border:none;color:${colors.fg};cursor:pointer;font-size:16px;padding:0 4px;`,
  });
  close.onclick = () => banner.remove();
  banner.appendChild(close);
  document.body.appendChild(banner);
}

async function bootstrap() {
  // отдельное окно живого предпросмотра (?live=1): игра, следующая за правками редактора
  if (new URLSearchParams(location.search).has('live')) {
    const { bootLive } = await import('./live');
    await bootLive();
    return;
  }

  const autosave = await Store.loadAutosave();
  let project = autosave.project;
  let recoveredFromDisk = false;
  let diskCorrupted = false;

  // в localStorage браузера пусто или файл повреждён — пробуем резервную копию на диске
  // (местный файл local-save/project.json, не зависит от порта браузера и от кода в src/)
  if (!project) {
    const disk = await loadServerSave();
    if (disk.status === 'ok') { project = disk.project; recoveredFromDisk = true; }
    else if (disk.status === 'corrupted') { diskCorrupted = true; }
  }

  const store = new Store(project ?? seedProject());

  // баннеры-предупреждения — не чаще одного раза за сессию каждый (иначе спам на каждый автосейв)
  let browserSaveFailWarningShown = false;
  store.onBrowserSaveFailed = () => {
    if (browserSaveFailWarningShown) return;
    browserSaveFailWarningShown = true;
    showBanner(
      '⚠ Не удалось сохранить проект в этом браузере (IndexedDB недоступна или запрещена настройками браузера) — последние правки НЕ сохраняются локально. '
      + 'Резервная копия на диске (local-save/project.json) продолжает работать независимо от этого — но на всякий случай скачайте файл проекта (💾 Сохранить / Ctrl+S).',
      'warn',
    );
  };
  let diskFailWarningShown = false;
  store.onDiskSaveFailed = () => {
    if (diskFailWarningShown) return;
    diskFailWarningShown = true;
    showBanner(
      '⚠ Не удалось записать резервную копию проекта на диск (local-save/project.json) — возможно, диск переполнен или закрыт для записи. '
      + 'Автосейв в браузере при этом продолжает работать, но лучше проверить диск и на всякий случай скачать файл проекта (💾 Сохранить / Ctrl+S).',
      'warn',
    );
  };
  let externalChangeWarningShown = false;
  store.onExternalChange = () => {
    if (externalChangeWarningShown) return;
    externalChangeWarningShown = true;
    showBanner(
      '⚠ Проект был сохранён из другой открытой вкладки этого редактора. Если продолжите работать здесь, следующее сохранение перезапишет те правки. '
      + 'Рекомендуется держать открытой только одну вкладку редактора — закройте лишние и перезагрузите эту.',
      'warn',
    );
  };

  if (autosave.corrupted && recoveredFromDisk) {
    showBanner(
      '↺ Хранилище браузера повреждено/недоступно на этом адресе — проект восстановлен из резервной копии на диске (local-save/project.json). Изменений с последнего автосейва на диск не потеряно.',
      'info',
    );
  } else if (autosave.corrupted && diskCorrupted) {
    showBanner(
      `⚠ Повреждены ОБА источника: сохранение в браузере (${location.origin}) и резервная копия на диске (local-save/project.json) — открыт пустой проект по умолчанию. `
      + 'Проверьте local-save/history/ — там могут быть предыдущие рабочие версии.',
      'warn',
    );
  } else if (autosave.corrupted) {
    showBanner(
      `⚠ Не удалось прочитать сохранённый проект в этом браузере (${location.origin}), и резервной копии на диске не нашлось — открыт пустой проект по умолчанию. Проверьте другой адрес/порт (например, localhost:5174), прежде чем продолжать работу.`,
      'warn',
    );
  } else if (diskCorrupted) {
    // localStorage было просто пустым (не «повреждено»), но на диске лежит НЕЧИТАЕМЫЙ файл —
    // раньше это молчали, показывая seed так, будто резервной копии никогда и не было
    showBanner(
      '⚠ Хранилище браузера пусто, а резервная копия на диске (local-save/project.json) повреждена — открыт пустой проект по умолчанию. '
      + 'Проверьте local-save/history/ — там могут быть предыдущие рабочие версии.',
      'warn',
    );
  }
  // project===null && !corrupted && !diskCorrupted (recoveredFromDisk истина или обоих
  // источников просто нет) — тихо, без баннера: это ожидаемый путь, а не авария.

  const topbar = document.getElementById('topbar')!;
  const left = document.getElementById('sidebar-left')!;
  const right = document.getElementById('sidebar-right')!;
  const center = document.getElementById('center')!;

  mountTopbar(topbar, store);
  mountSidebar(left, store);
  mountInspector(right, store);

  // центральная область: три вида, переключаемых по режиму
  const stageView = new StageView(store);
  const graphView = new GraphView(store);
  const varsView = mountVariables(store);
  const npcView = mountNPCs(store);
  const itemsView = mountItems(store);
  const mobsView = mountMobs(store);
  const questsView = mountQuests(store);

  function renderCenter() {
    center.innerHTML = '';
    if (store.mode === 'scene') {
      center.appendChild(stageView.root);
      stageView.onShow();
    } else if (store.mode === 'dialogue') {
      center.appendChild(graphView.root);
      graphView.onShow();
    } else if (store.mode === 'npc') {
      center.appendChild(npcView);
    } else if (store.mode === 'items') {
      center.appendChild(itemsView);
    } else if (store.mode === 'mobs') {
      center.appendChild(mobsView);
    } else if (store.mode === 'quests') {
      center.appendChild(questsView);
    } else {
      center.appendChild(varsView);
    }
  }

  store.on('mode', renderCenter);
  renderCenter();

  registerHotkeys(store, stageView, graphView);

  // доступ из консоли браузера — для отладки и автотестов
  (window as unknown as { __store: Store }).__store = store;
}

bootstrap();
