// ============================================================
// Живой предпросмотр — отдельное окно (?live=1), которое само
// подхватывает каждую правку редактора. Автосейв редактора (600мс
// после правки) пишет проект в IndexedDB и пингует BroadcastChannel;
// здесь по пингу проект перечитывается, движок пересоздаётся, а
// СОСТОЯНИЕ игры (сцена, переменные, инвентарь, положение на карте)
// переносится через capturePlaytest — можно стоять на карте с
// Осколком и крутить стили, не проходя путь заново.
// Ничего не пишет: ни в IndexedDB, ни на диск.
// ============================================================

import { idbGetProject, onProjectSavedElsewhere } from '../core/idbStore';
import { Engine, fitStage } from '../runtime/engine';
import { Project, PlaytestCheckpoint, VarValue, SCENE_KIND_LABELS, SceneKind, deepClone } from '../core/types';
import { h } from './ui';

export async function bootLive() {
  document.title = 'TLS — живой предпросмотр';
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  app.style.cssText = 'display:flex;flex-direction:column;height:100vh;';

  const raw = await idbGetProject();
  if (!raw) {
    app.appendChild(h('div', {
      style: 'margin:auto;color:#8fa2af;font-size:14px;max-width:34em;text-align:center;line-height:1.6;',
      text: 'Проект не найден в этом браузере. Откройте редактор (обычная вкладка), дождитесь автосейва — и обновите это окно.',
    }));
    return;
  }
  let project: Project = JSON.parse(raw);

  // ---------- верхняя панель ----------
  const bar = h('div', { class: 'preview-topbar' });
  bar.appendChild(h('span', { style: 'color:var(--accent);font-weight:600;font-size:12px;letter-spacing:1px;', text: '👁 ЖИВОЙ ПРЕДПРОСМОТР' }));

  const status = h('span', {
    class: 'hint',
    text: '● следует за редактором',
    style: 'min-width:170px;',
    title: 'Правьте в редакторе — окно само подхватит изменения (~1 сек), не сбрасывая игру',
  });
  bar.appendChild(status);

  const sceneSel = h('select', { class: 'ed', style: 'max-width:180px;', title: 'Перезапустить с этой сцены (чистое состояние)' }) as HTMLSelectElement;
  const fillSceneSel = () => {
    const cur = sceneSel.value;
    sceneSel.innerHTML = '';
    sceneSel.appendChild(h('option', { value: '', text: '⏵ Старт: как в игре' }));
    for (const kind of ['page', 'location', 'level'] as SceneKind[]) {
      const scenes = project.scenes.filter((s) => s.kind === kind);
      if (scenes.length === 0) continue;
      const grp = h('optgroup', { label: SCENE_KIND_LABELS[kind] }) as HTMLOptGroupElement;
      for (const s of scenes) grp.appendChild(h('option', { value: s.id, text: s.name }));
      sceneSel.appendChild(grp);
    }
    if ([...sceneSel.options].some((o) => o.value === cur)) sceneSel.value = cur;
  };

  const cpSel = h('select', { class: 'ed', style: 'max-width:180px;', title: 'Перезапустить с чекпоинта' }) as HTMLSelectElement;
  const fillCpSel = () => {
    const cur = cpSel.value;
    cpSel.innerHTML = '';
    cpSel.appendChild(h('option', { value: '', text: '⚑ Чекпоинт: нет' }));
    for (const cp of project.playtests ?? []) cpSel.appendChild(h('option', { value: cp.id, text: cp.name }));
    if ([...cpSel.options].some((o) => o.value === cur)) cpSel.value = cur;
  };
  fillSceneSel();
  fillCpSel();

  const followBtn = h('button', { class: 'tb-btn', text: '⏸ Замереть', title: 'Перестать подхватывать правки (сравнить до/после)' });
  const restart = h('button', { class: 'tb-btn', text: '⟳ Заново', title: 'Перезапустить с чистого состояния' });
  bar.append(sceneSel, cpSel, restart, followBtn);
  bar.appendChild(h('div', { class: 'tb-spacer' }));
  bar.appendChild(h('span', { class: 'hint', text: project.meta.name }));
  app.appendChild(bar);

  // ---------- сцена + панель переменных ----------
  const body = h('div', { class: 'preview-body' });
  const stageArea = h('div', { class: 'preview-stage-area' });
  const stage = h('div', { style: 'position:relative;background:#000;box-shadow:0 0 60px rgba(0,0,0,.8);' });
  stageArea.appendChild(stage);
  const varsPanel = h('div', { class: 'preview-vars' });
  body.append(stageArea, varsPanel);
  app.appendChild(body);

  let prev: Record<string, VarValue> = {};
  const renderVars = (state: Record<string, VarValue>) => {
    varsPanel.innerHTML = '';
    varsPanel.appendChild(h('h4', { text: 'Отслеживание' }));
    const tracked = project.variables.filter((v) => v.tracked);
    if (tracked.length === 0) {
      varsPanel.appendChild(h('div', { class: 'hint', text: 'Нет отслеживаемых переменных («Следить» в режиме «Переменные»).' }));
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

  // ---------- движок ----------
  let engine: Engine | null = null;
  let follow = true;

  // fitStage вешает свой ResizeObserver — зовём ОДИН раз, не на каждый перезапуск
  fitStage(stage, stageArea);

  const boot = (keepState: PlaytestCheckpoint | null) => {
    prev = {};
    engine?.destroy();
    const chosen = (project.playtests ?? []).find((c) => c.id === cpSel.value);
    const cp = keepState ?? (chosen ? deepClone(chosen) : null);
    engine = new Engine(deepClone(project), stage, {
      onVarsChanged: renderVars,
      persist: false,
      checkpoint: cp,
      startSceneId: keepState ? null : (sceneSel.value || null),
    });
    engine.start();
    (window as unknown as { __engine: Engine | null }).__engine = engine; // отладка/автотесты
  };

  const setStatus = (text: string, flash = false) => {
    status.textContent = text;
    if (flash) {
      status.style.color = 'var(--accent)';
      setTimeout(() => { status.style.color = ''; }, 600);
    }
  };

  // перечитать проект и продолжить С ТОГО ЖЕ места (переносим состояние)
  let reloadTimer: number | undefined;
  const reload = async () => {
    const json = await idbGetProject();
    if (!json) return;
    try { project = JSON.parse(json); } catch { return; }
    fillSceneSel();
    fillCpSel();
    boot(engine ? engine.capturePlaytest('live') : null);
    setStatus(`⟳ обновлено ${new Date().toLocaleTimeString()}`, true);
  };
  // автосейв редактора пингует BroadcastChannel; дебаунс на случай серии пингов
  onProjectSavedElsewhere(() => {
    if (!follow) return;
    clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(reload, 200);
  });

  followBtn.onclick = () => {
    follow = !follow;
    followBtn.textContent = follow ? '⏸ Замереть' : '▶ Следовать';
    if (follow) reload();
    else setStatus('⏸ заморожен — правки не подхватываются');
  };
  restart.onclick = () => boot(null);
  sceneSel.onchange = () => boot(null);
  cpSel.onchange = () => boot(null);

  boot(null);
}
