// ============================================================
// Точка входа редактора: собирает панели, управляет режимами
// ============================================================

import { Store } from '../core/store';
import { seedProject } from '../core/seed';
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

const autosave = Store.loadAutosave();
const store = new Store(autosave.project ?? seedProject());

// сохранение есть, но повреждено/несовместимо — предупреждаем громко, а не тихо подставляем seed
if (autosave.corrupted) {
  const banner = h('div', {
    style: `position:fixed;top:0;left:0;right:0;z-index:9999;
      background:#3a1f1f;color:#f3d9d9;border-bottom:1px solid #a34;
      padding:10px 16px;font-size:13px;line-height:1.5;
      display:flex;align-items:center;gap:14px;font-family:system-ui,sans-serif;`,
  });
  banner.appendChild(h('span', {
    text: `⚠ Не удалось прочитать сохранённый проект в этом браузере (${location.origin}) — открыт пустой проект по умолчанию. Проверьте, не остались ли ваши правки на другом адресе/порту (например, localhost:5174), прежде чем продолжать работу.`,
    style: 'flex:1;',
  }));
  const close = h('button', {
    text: '✕', style: 'background:none;border:none;color:#f3d9d9;cursor:pointer;font-size:16px;padding:0 4px;',
  });
  close.onclick = () => banner.remove();
  banner.appendChild(close);
  document.body.appendChild(banner);
}

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
