// ============================================================
// Предпросмотр игры внутри редактора + панель отслеживания переменных
// + плейтест: старт с любой сцены и чекпоинты
// ============================================================

import { Store } from '../core/store';
import { deepClone, VarValue, SCENE_KIND_LABELS, SceneKind } from '../core/types';
import { Engine, fitStage } from '../runtime/engine';
import { h, toast, promptModal, confirmModal } from './ui';

export function openPreview(store: Store) {
  const overlayRoot = document.getElementById('overlay-root')!;
  overlayRoot.innerHTML = '';

  const overlay = h('div', { class: 'preview-overlay' });

  const bar = h('div', { class: 'preview-topbar' });
  bar.appendChild(h('span', { style: 'color:var(--accent);font-weight:600;font-size:12px;letter-spacing:1px;', text: '▶ ПРЕДПРОСМОТР' }));
  bar.appendChild(h('span', { class: 'hint', text: store.project.meta.name }));

  // --- плейтест: стартовая сцена ---
  const sceneSel = h('select', { class: 'ed', style: 'max-width:180px;', title: 'С какой сцены начать' }) as HTMLSelectElement;
  const fillSceneSel = () => {
    sceneSel.innerHTML = '';
    sceneSel.appendChild(h('option', { value: '', text: '⏵ Старт: как в игре' }));
    for (const kind of ['page', 'location', 'level'] as SceneKind[]) {
      const scenes = store.project.scenes.filter((s) => s.kind === kind);
      if (scenes.length === 0) continue;
      const grp = h('optgroup', { label: SCENE_KIND_LABELS[kind] }) as HTMLOptGroupElement;
      for (const s of scenes) grp.appendChild(h('option', { value: s.id, text: s.name }));
      sceneSel.appendChild(grp);
    }
  };
  fillSceneSel();

  // --- плейтест: чекпоинты ---
  const cpSel = h('select', { class: 'ed', style: 'max-width:180px;', title: 'Чекпоинт: сохранённое состояние игры' }) as HTMLSelectElement;
  const fillCpSel = (selectedId = '') => {
    cpSel.innerHTML = '';
    cpSel.appendChild(h('option', { value: '', text: '⚑ Чекпоинт: нет' }));
    for (const cp of store.project.playtests ?? []) {
      const opt = h('option', { value: cp.id, text: cp.name }) as HTMLOptionElement;
      if (cp.id === selectedId) opt.selected = true;
      cpSel.appendChild(opt);
    }
  };
  fillCpSel();

  const saveCpBtn = h('button', { class: 'tb-btn', text: '⚑ Сохранить чекпоинт', title: 'Запомнить текущее состояние игры (сцена, переменные, инвентарь)' });
  const delCpBtn = h('button', { class: 'tb-btn', text: '🗑', title: 'Удалить выбранный чекпоинт' });

  bar.append(sceneSel, cpSel, saveCpBtn, delCpBtn);

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
    const cp = (store.project.playtests ?? []).find((c) => c.id === cpSel.value) ?? null;
    engine = new Engine(deepClone(store.project), stage, {
      onVarsChanged: renderVars,
      persist: false, // предпросмотр всегда с чистого листа
      checkpoint: cp ? deepClone(cp) : null,
      startSceneId: sceneSel.value || null,
    });
    fitStage(stage, stageArea);
    engine.start();
    // доступ из консоли — для отладки и автотестов
    (window as unknown as { __engine: Engine | null }).__engine = engine;
  };

  sceneSel.onchange = boot;
  cpSel.onchange = boot;

  saveCpBtn.onclick = async () => {
    if (!engine) return;
    const name = await promptModal('Сохранить чекпоинт', '', 'например: дрон побеждён, Рен знакома');
    if (!name) return;
    const cp = engine.capturePlaytest(name);
    store.snapshot();
    (store.project.playtests ??= []).push(cp);
    store.emit('change');
    fillCpSel(cp.id);
    toast(`Чекпоинт «${name}» сохранён`);
  };

  delCpBtn.onclick = async () => {
    const id = cpSel.value;
    const list = store.project.playtests ?? [];
    const cp = list.find((c) => c.id === id);
    if (!cp) { toast('Выберите чекпоинт в списке', true); return; }
    if (!(await confirmModal('Удалить чекпоинт', `Удалить чекпоинт «${cp.name}»?`))) return;
    store.snapshot();
    store.project.playtests = list.filter((c) => c.id !== id);
    store.emit('change');
    fillCpSel();
    toast('Чекпоинт удалён');
  };

  const closeFn = () => {
    engine?.destroy();
    overlayRoot.innerHTML = '';
    window.removeEventListener('keydown', onKey);
  };
  // Esc закрывает предпросмотр, только если сверху нет модального окна (промпт чекпоинта)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) closeFn();
  };
  window.addEventListener('keydown', onKey);
  close.onclick = closeFn;
  restart.onclick = boot;

  boot();
}
