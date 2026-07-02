// ============================================================
// Точка входа редактора: собирает панели, управляет режимами
// ============================================================

import { Store } from '../core/store';
import { seedProject } from '../core/seed';
import { mountTopbar } from './topbar';
import { mountSidebar } from './sidebar';
import { mountInspector } from './inspector';
import { StageView } from './stage';
import { GraphView } from './graph';
import { mountVariables } from './variables';
import { mountNPCs } from './npcs';
import { registerHotkeys } from './hotkeys';

const store = new Store(Store.loadAutosave() ?? seedProject());

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
  } else {
    center.appendChild(varsView);
  }
}

store.on('mode', renderCenter);
renderCenter();

registerHotkeys(store, stageView, graphView);

// доступ из консоли браузера — для отладки и автотестов
(window as unknown as { __store: Store }).__store = store;
