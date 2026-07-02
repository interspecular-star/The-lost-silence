// ============================================================
// Предпросмотр игры внутри редактора + панель отслеживания переменных
// ============================================================

import { Store } from '../core/store';
import { deepClone, VarValue } from '../core/types';
import { Engine, fitStage } from '../runtime/engine';
import { h } from './ui';

export function openPreview(store: Store) {
  const overlayRoot = document.getElementById('overlay-root')!;
  overlayRoot.innerHTML = '';

  const overlay = h('div', { class: 'preview-overlay' });

  const bar = h('div', { class: 'preview-topbar' });
  bar.appendChild(h('span', { style: 'color:var(--accent);font-weight:600;font-size:12px;letter-spacing:1px;', text: '▶ ПРЕДПРОСМОТР' }));
  bar.appendChild(h('span', { class: 'hint', text: store.project.meta.name }));
  bar.appendChild(h('div', { class: 'tb-spacer' }));
  const restart = h('button', { class: 'tb-btn', text: '⟳ Заново' });
  const close = h('button', { class: 'tb-btn', text: '✕ Закрыть (Esc)' });
  bar.append(restart, close);
  overlay.appendChild(bar);

  const body = h('div', { class: 'preview-body' });
  const stageArea = h('div', { class: 'preview-stage-area' });
  const stage = h('div', { style: 'position:relative;background:#000;box-shadow:0 0 60px rgba(0,0,0,.8);' });
  stageArea.appendChild(stage);

  const varsPanel = h('div', { class: 'preview-vars' });
  body.append(stageArea, varsPanel);
  overlay.appendChild(body);
  overlayRoot.appendChild(overlay);

  let prev: Record<string, VarValue> = {};
  const renderVars = (state: Record<string, VarValue>) => {
    varsPanel.innerHTML = '';
    varsPanel.appendChild(h('h4', { text: 'Отслеживание' }));
    const tracked = store.project.variables.filter((v) => v.tracked);
    if (tracked.length === 0) {
      varsPanel.appendChild(h('div', { class: 'hint', text: 'Нет отслеживаемых переменных. Отметьте «Следить» в режиме «Переменные».' }));
    }
    for (const v of tracked) {
      const val = state[v.id];
      const rowEl = h('div', { class: `pv-row${prev[v.id] !== undefined && prev[v.id] !== val ? ' changed' : ''}` });
      rowEl.appendChild(h('span', { class: 'pv-name', text: v.title, title: v.description ?? v.name }));
      rowEl.appendChild(h('span', { class: 'pv-val', text: v.type === 'boolean' ? (val ? 'да' : 'нет') : String(val) }));
      varsPanel.appendChild(rowEl);
    }
    prev = { ...state };
  };

  let engine: Engine | null = null;
  const boot = () => {
    prev = {};
    engine?.destroy();
    engine = new Engine(deepClone(store.project), stage, {
      onVarsChanged: renderVars,
      persist: false, // предпросмотр всегда с чистого листа
    });
    fitStage(stage, stageArea);
    engine.start();
  };

  const closeFn = () => {
    engine?.destroy();
    overlayRoot.innerHTML = '';
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFn(); };
  window.addEventListener('keydown', onKey);
  close.onclick = closeFn;
  restart.onclick = boot;

  boot();
}
