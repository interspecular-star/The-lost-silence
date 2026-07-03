// ============================================================
// Валидатор проекта: ищет битые ссылки, висячие ноды,
// недостижимые сцены/диалоги, опечатки в {переменных}.
// Кнопка «✓ Проверка» в шапке; клик по проблеме — переход к месту.
// ============================================================

import {
  Project, Condition, Effect, ItemGrant,
  NODE_TYPE_LABELS, VariableDef,
} from '../core/types';
import { Store } from '../core/store';
import { h, toast } from './ui';

export interface Issue {
  severity: 'error' | 'warn';
  where: string;                    // человекочитаемое место
  message: string;
  go?: (store: Store) => void;      // переход к месту проблемы
}

// ---------- проверка ----------

export function validateProject(p: Project): Issue[] {
  const issues: Issue[] = [];
  const err = (where: string, message: string, go?: Issue['go']) =>
    issues.push({ severity: 'error', where, message, go });
  const warn = (where: string, message: string, go?: Issue['go']) =>
    issues.push({ severity: 'warn', where, message, go });

  const varById = new Map(p.variables.map((v) => [v.id, v]));
  const varByName = new Map(p.variables.map((v) => [v.name, v]));
  const sceneById = new Map(p.scenes.map((s) => [s.id, s]));
  const dlgById = new Map(p.dialogues.map((d) => [d.id, d]));
  const itemById = new Map((p.items ?? []).map((i) => [i.id, i]));
  const mobById = new Map((p.mobs ?? []).map((m) => [m.id, m]));
  const npcById = new Map((p.npcs ?? []).map((n) => [n.id, n]));
  const factionById = new Map((p.factions ?? []).map((f) => [f.id, f]));
  const ruleById = new Map((p.idleRules ?? []).map((r) => [r.id, r]));

  // --- вспомогательные проверки ссылок ---
  const checkConds = (conds: Condition[] | undefined, where: string, go?: Issue['go']) => {
    for (const c of conds ?? []) {
      if (!varById.has(c.varId)) err(where, 'условие ссылается на удалённую переменную', go);
    }
  };
  const checkEffects = (effs: Effect[] | undefined, where: string, go?: Issue['go']) => {
    for (const e of effs ?? []) {
      const v = varById.get(e.varId);
      if (!v) { err(where, 'эффект ссылается на удалённую переменную', go); continue; }
      if (v.category === 'computed') {
        err(where, `эффект меняет вычисляемую переменную «${v.title}» — движок её перезапишет`, go);
      }
    }
  };
  const checkItems = (grants: ItemGrant[] | undefined, where: string, go?: Issue['go']) => {
    for (const g of grants ?? []) {
      if (!itemById.has(g.itemId)) err(where, 'ссылка на удалённый предмет', go);
    }
  };
  // {имя_переменной} в тексте — предупреждаем об опечатках
  const checkInterp = (text: string | undefined, where: string, go?: Issue['go']) => {
    for (const m of (text ?? '').matchAll(/\{(\w+)\}/g)) {
      if (!varByName.has(m[1])) warn(where, `в тексте подстановка {${m[1]}}, но такой переменной нет`, go);
    }
  };

  // --- стартовая сцена ---
  if (!p.startSceneId) {
    err('Проект', 'не задана стартовая сцена');
  } else if (!sceneById.has(p.startSceneId)) {
    err('Проект', 'стартовая сцена удалена');
  }

  // --- дубли имён переменных ---
  const seenNames = new Map<string, VariableDef>();
  for (const v of p.variables) {
    const dup = seenNames.get(v.name);
    if (dup) {
      err('Переменные', `имя «${v.name}» используется дважды («${dup.title}» и «${v.title}») — подстановки будут путаться`,
        (s) => s.setMode('variables'));
    }
    seenNames.set(v.name, v);
  }

  // --- сцены и элементы ---
  const referencedScenes = new Set<string>();
  const referencedDialogues = new Set<string>();
  if (p.startSceneId) referencedScenes.add(p.startSceneId);

  for (const sc of p.scenes) {
    const goScene = (s: Store) => { s.setMode('scene'); s.selectScene(sc.id); };
    const whereScene = `Сцена «${sc.name}»`;

    if (sc.onEnterDialogueId) {
      if (!dlgById.has(sc.onEnterDialogueId)) err(whereScene, 'диалог при входе удалён', goScene);
      else referencedDialogues.add(sc.onEnterDialogueId);
    }

    for (const el of sc.elements) {
      const goEl = (s: Store) => { s.setMode('scene'); s.selectScene(sc.id); s.selectElements([el.id]); };
      const whereEl = `${whereScene} → «${el.name}»`;

      checkConds(el.visibleIf, `${whereEl} (условия видимости)`, goEl);
      checkInterp(el.text, whereEl, goEl);
      if (el.type === 'image' && !el.src) warn(whereEl, 'изображение без картинки', goEl);

      const a = el.action;
      if (!a || a.type === 'none') continue;
      if (a.type === 'gotoScene') {
        if (!a.sceneId || !sceneById.has(a.sceneId)) err(whereEl, 'переход на удалённую сцену', goEl);
        else referencedScenes.add(a.sceneId);
      }
      if (a.type === 'startDialogue') {
        if (!a.dialogueId || !dlgById.has(a.dialogueId)) err(whereEl, 'запуск удалённого диалога', goEl);
        else referencedDialogues.add(a.dialogueId);
      }
      if (a.type === 'startCombat') {
        if (!a.mobId || !mobById.has(a.mobId)) err(whereEl, 'бой с удалённым мобом', goEl);
        for (const [key, label] of [['winDialogueId', 'после победы'], ['loseDialogueId', 'после поражения']] as const) {
          const id = a[key];
          if (id) {
            if (!dlgById.has(id)) err(whereEl, `диалог ${label} удалён`, goEl);
            else referencedDialogues.add(id);
          }
        }
      }
      checkEffects(a.effects, `${whereEl} (эффекты)`, goEl);
      checkItems(a.giveItems, `${whereEl} (выдача предметов)`, goEl);
    }
  }

  // --- диалоги и ноды ---
  for (const d of p.dialogues) {
    const whereDlg = `Диалог «${d.name}»`;
    const goDlg = (s: Store) => { s.setMode('dialogue'); s.selectDialogue(d.id); };
    const nodeById = new Map(d.nodes.map((n) => [n.id, n]));

    if (!d.startNodeId) {
      warn(whereDlg, 'нет стартовой ноды — диалог не запустится', goDlg);
    } else if (!nodeById.has(d.startNodeId)) {
      err(whereDlg, 'стартовая нода удалена', goDlg);
    }

    const reachable = new Set<string>();
    const queue = d.startNodeId && nodeById.has(d.startNodeId) ? [d.startNodeId] : [];
    while (queue.length) {
      const id = queue.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const n = nodeById.get(id)!;
      const nexts = [n.next, n.nextTrue, n.nextFalse, ...(n.choices ?? []).map((c) => c.next)];
      for (const nx of nexts) if (nx && nodeById.has(nx)) queue.push(nx);
    }

    for (const n of d.nodes) {
      const goNode = (s: Store) => { s.setMode('dialogue'); s.selectDialogue(d.id); s.selectNode(n.id); };
      const whereNode = `${whereDlg} → ${NODE_TYPE_LABELS[n.type]}`;

      const checkNext = (id: string | null | undefined, what: string) => {
        if (id && !nodeById.has(id)) err(whereNode, `${what} ведёт на удалённую ноду`, goNode);
      };
      checkNext(n.next, 'связь «дальше»');
      checkNext(n.nextTrue, 'ветка «да»');
      checkNext(n.nextFalse, 'ветка «нет»');

      if (n.type === 'line') {
        checkInterp(n.text, whereNode, goNode);
        if (n.speakerNpcId && !npcById.has(n.speakerNpcId)) err(whereNode, 'говорящий NPC удалён', goNode);
      }
      if (n.type === 'choice') {
        if (!n.choices?.length) warn(whereNode, 'нода выбора без вариантов', goNode);
        for (const c of n.choices ?? []) {
          checkNext(c.next, `вариант «${c.text.slice(0, 30)}»`);
          checkConds(c.conditions, `${whereNode} → «${c.text.slice(0, 30)}»`, goNode);
          checkEffects(c.effects, `${whereNode} → «${c.text.slice(0, 30)}»`, goNode);
          checkInterp(c.text, whereNode, goNode);
        }
      }
      if (n.type === 'set') {
        checkEffects(n.effects, whereNode, goNode);
        checkItems(n.giveItems, whereNode, goNode);
      }
      if (n.type === 'branch') checkConds(n.conditions, whereNode, goNode);
      if (n.type === 'jump') {
        if (!n.gotoSceneId || !sceneById.has(n.gotoSceneId)) err(whereNode, 'переход на удалённую сцену', goNode);
        else referencedScenes.add(n.gotoSceneId);
      }

      if (d.nodes.length > 1 && !reachable.has(n.id)) {
        warn(whereNode, 'нода недостижима от старта диалога', goNode);
      }
    }
  }

  // --- недостижимые сцены и диалоги ---
  for (const sc of p.scenes) {
    if (!referencedScenes.has(sc.id)) {
      warn(`Сцена «${sc.name}»`, 'на сцену никто не ссылается — в игре до неё не добраться',
        (s) => { s.setMode('scene'); s.selectScene(sc.id); });
    }
  }
  for (const d of p.dialogues) {
    if (!referencedDialogues.has(d.id)) {
      warn(`Диалог «${d.name}»`, 'диалог нигде не запускается',
        (s) => { s.setMode('dialogue'); s.selectDialogue(d.id); });
    }
  }

  // --- idle-правила ---
  for (const r of p.idleRules ?? []) {
    const go = (s: Store) => s.setMode('variables');
    const v = r.varId ? varById.get(r.varId) : undefined;
    if (!v) err(`Idle «${r.title}»`, 'правило растит удалённую переменную', go);
    else if (v.type !== 'number') err(`Idle «${r.title}»`, `переменная «${v.title}» не числовая`, go);
    checkConds(r.conditions, `Idle «${r.title}»`, go);
  }

  // --- герой и предметы ---
  if (p.hero) {
    checkItems(p.hero.startItems, 'Герой (стартовые предметы)', (s) => s.setMode('items'));
  }
  for (const it of p.items ?? []) {
    checkEffects(it.useEffects, `Предмет «${it.name}» (эффекты использования)`, (s) => s.setMode('items'));
    if ((it.type === 'weapon' || it.type === 'armor' || it.type === 'gadget') && !it.slot) {
      warn(`Предмет «${it.name}»`, 'экипируемый предмет без слота', (s) => s.setMode('items'));
    }
  }

  // --- мобы ---
  for (const m of p.mobs ?? []) {
    const go = (s: Store) => s.setMode('mobs');
    for (const drop of m.drops) {
      if (!itemById.has(drop.itemId)) err(`Моб «${m.name}»`, 'дроп ссылается на удалённый предмет', go);
    }
    if (m.hp <= 0) warn(`Моб «${m.name}»`, 'HP ≤ 0 — бой закончится мгновенно', go);
    if (m.attacks?.length && m.attacks.every((a) => a.weight <= 0)) {
      err(`Моб «${m.name}»`, 'все атаки с весом 0 — моб будет бить стандартной атакой', go);
    }
    for (const a of m.attacks ?? []) {
      if (a.telegraphMs < 400) warn(`Моб «${m.name}» → «${a.name}»`, 'замах меньше 400 мс — почти неуворачиваемо', go);
    }
  }

  // --- журнал: задания, улучшения, расшифровки ---
  const goQuests = (s: Store) => s.setMode('quests');
  for (const q of p.quests ?? []) {
    checkConds(q.conditions, `Задание «${q.title}»`, goQuests);
    checkEffects(q.rewardEffects, `Задание «${q.title}» (награда)`, goQuests);
    checkItems(q.rewardItems, `Задание «${q.title}» (награда)`, goQuests);
    for (const s of q.steps ?? []) {
      checkConds(s.conditions, `Задание «${q.title}» → этап «${s.text.slice(0, 30)}»`, goQuests);
      if (s.conditions.length === 0) {
        warn(`Задание «${q.title}» → этап «${s.text.slice(0, 30)}»`, 'этап без условий — выполнится мгновенно', goQuests);
      }
    }
    if (q.steps?.length && q.kind !== 'story') {
      warn(`Задание «${q.title}»`, 'цепочка этапов у суточного/недельного: этапы не сбрасываются — лучше сделать сюжетным', goQuests);
    }
    if (q.enabled && q.conditions.length === 0 && !q.steps?.length) {
      warn(`Задание «${q.title}»`, 'нет условий — награду можно забрать сразу', goQuests);
    }
  }
  for (const u of p.upgrades ?? []) {
    if (!varByName.has(u.costVarName)) {
      err(`Улучшение «${u.title}»`, `валюта «${u.costVarName}» не найдена среди переменных`, goQuests);
    }
    if (u.targetIdleRuleId && !ruleById.has(u.targetIdleRuleId)) {
      err(`Улучшение «${u.title}»`, 'усиливает удалённое idle-правило', goQuests);
    }
  }
  for (const dc of p.decodes ?? []) {
    if (!itemById.has(dc.itemId)) err(`Расшифровка «${dc.title}»`, 'предмет-фрагмент удалён', goQuests);
    checkEffects(dc.rewardEffects, `Расшифровка «${dc.title}» (награда)`, goQuests);
    checkItems(dc.rewardItems, `Расшифровка «${dc.title}» (награда)`, goQuests);
  }

  // --- NPC и фракции ---
  for (const n of p.npcs ?? []) {
    if (n.factionId && !factionById.has(n.factionId)) {
      err(`NPC «${n.name}»`, 'фракция удалена', (s) => s.setMode('npc'));
    }
  }

  // --- настройки проекта ---
  if (p.oskolokVarName && !varByName.has(p.oskolokVarName)) {
    warn('Проект', `переменная Осколка «${p.oskolokVarName}» не найдена — весь UI Осколка будет открыт`);
  }
  if (p.currencyVarName && !varByName.has(p.currencyVarName)) {
    warn('Проект', `переменная валюты «${p.currencyVarName}» не найдена — HUD не покажет кредиты`);
  }

  // --- чекпоинты плейтеста ---
  for (const cp of p.playtests ?? []) {
    if (cp.sceneId && !sceneById.has(cp.sceneId)) {
      warn(`Чекпоинт «${cp.name}»`, 'сцена чекпоинта удалена — старт будет с начала');
    }
  }

  return issues;
}

// ---------- панель результатов ----------

export function openValidator(store: Store) {
  const issues = validateProject(store.project);
  if (issues.length === 0) {
    toast('✓ Проверка пройдена: проблем не найдено');
    return;
  }
  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));

  const backdrop = h('div', { class: 'modal-backdrop' });
  const modal = h('div', { class: 'modal validator' });
  const plural = (n: number, one: string, few: string, many: string) => {
    const m10 = n % 10; const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`;
    return `${n} ${many}`;
  };
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warns = issues.length - errors;
  modal.appendChild(h('h3', {
    text: `Проверка проекта: ${plural(errors, 'ошибка', 'ошибки', 'ошибок')}, ${plural(warns, 'предупреждение', 'предупреждения', 'предупреждений')}`,
  }));
  modal.appendChild(h('div', { class: 'hint', text: 'Клик по строке — переход к месту проблемы. Ошибки ломают игру, предупреждения — на усмотрение.' }));

  const list = h('div', { class: 'vld-list' });
  for (const issue of issues) {
    const row = h('div', { class: `vld-row ${issue.severity}` });
    row.appendChild(h('span', { class: 'vld-icon', text: issue.severity === 'error' ? '✕' : '⚠' }));
    const txt = h('div', { class: 'vld-text' });
    txt.appendChild(h('div', { class: 'vld-where', text: issue.where }));
    txt.appendChild(h('div', { class: 'vld-msg', text: issue.message }));
    row.appendChild(txt);
    if (issue.go) {
      row.onclick = () => { backdrop.remove(); issue.go!(store); };
    } else {
      row.classList.add('static');
    }
    list.appendChild(row);
  }
  modal.appendChild(list);

  const actions = h('div', { class: 'modal-actions' });
  const closeBtn = h('button', { class: 'btn accent', text: 'Закрыть' });
  closeBtn.onclick = () => backdrop.remove();
  actions.appendChild(closeBtn);
  modal.appendChild(actions);

  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
}
