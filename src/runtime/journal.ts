// ============================================================
// Журнал игрока (📋): задания, улучшения, расшифровка OldNet.
// Ежедневный ритм: суточные/недельные награды, реальное время.
// ============================================================

import { QuestDef, UpgradeDef, CANVAS_W } from '../core/types';
import { heroVarId, itemIcon } from '../core/hero';
import { npcPortrait } from '../core/npc';
import type { Engine } from './engine';

/** Ключ сброса: суточные — дата, недельные — год-неделя (понедельник), сюжетные — 'once' */
export function resetKey(kind: QuestDef['kind'], now = new Date()): string {
  if (kind === 'story') return 'once';
  if (kind === 'daily') {
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  }
  // ISO-неделя (понедельник — первый день)
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `w${d.getFullYear()}-${week}`;
}

/** Цена уровня улучшения (level с нуля) */
export function upgradeCost(up: UpgradeDef, level: number): number {
  return Math.round(up.costBase * Math.pow(up.costGrowth, level));
}

export function renderJournal(engine: Engine, layer: HTMLElement, close: () => void) {
  const p = engine.project;
  const hasCharacters = (p.npcs?.length ?? 0) > 0;
  const hasAchievements = (p.achievements?.length ?? 0) > 0;
  let tab: 'quests' | 'upgrades' | 'oldnet' | 'characters' | 'achievements' = 'quests';

  const backdrop = document.createElement('div');
  backdrop.style.cssText = `position:absolute;inset:0;background:rgba(2,4,6,0.72);
    pointer-events:auto;backdrop-filter:blur(3px);font-size:calc(26 * 100cqw / ${CANVAS_W});color:#cfd9e2;`;
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  layer.appendChild(backdrop);

  const accent = p.theme.accent;
  const panel = document.createElement('div');
  panel.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    width:74%;height:82%;background:rgba(6,10,14,0.97);border:1px solid rgba(255,255,255,0.08);
    border-top:1px solid ${accent}33;padding:1.3em 1.8em;display:flex;flex-direction:column;
    gap:0.9em;font-size:0.78em;`;
  backdrop.appendChild(panel);

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:baseline;gap:1em;';
  const bigTitle = document.createElement('div');
  bigTitle.textContent = 'ЖУРНАЛ';
  bigTitle.style.cssText = 'font-size:1.5em;font-weight:200;letter-spacing:8px;color:#e6edf3;flex:1;';
  titleRow.appendChild(bigTitle);
  const closeBtn = document.createElement('div');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'cursor:pointer;opacity:0.5;padding:0 0.3em;';
  closeBtn.onclick = close;
  titleRow.appendChild(closeBtn);
  panel.appendChild(titleRow);

  const head = document.createElement('div');
  head.style.cssText = `display:flex;align-items:flex-end;gap:1.8em;
    border-bottom:1px solid rgba(255,255,255,0.07);`;
  const tabs: ['quests' | 'upgrades' | 'oldnet' | 'characters' | 'achievements', string][] = [
    ['quests', 'КВЕСТЫ'], ['upgrades', 'УЛУЧШЕНИЯ'], ['oldnet', 'АРХИВ OLDNET'],
    ...(hasCharacters ? [['characters', 'ПЕРСОНАЖИ'] as ['characters', string]] : []),
    ...(hasAchievements ? [['achievements', '🏆 ДОСТИЖЕНИЯ'] as ['achievements', string]] : []),
  ];
  const tabEls = new Map<string, HTMLElement>();
  for (const [key, label] of tabs) {
    const t = document.createElement('div');
    t.textContent = label;
    t.style.cssText = `padding:0.4em 0.1em;cursor:pointer;font-size:0.85em;letter-spacing:3px;
      border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .15s;`;
    t.onclick = () => { tab = key; render(); };
    tabEls.set(key, t);
    head.appendChild(t);
  }
  panel.appendChild(head);

  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:0.6em;';
  panel.appendChild(body);

  const card = (frameColor?: string) => {
    const c = document.createElement('div');
    c.style.cssText = `background:rgba(255,255,255,0.015);
      border:1px solid ${frameColor ? frameColor + '55' : 'rgba(255,255,255,0.08)'};
      padding:0.85em 1.1em;display:flex;align-items:center;gap:1.1em;`;
    return c;
  };
  const btn = (label: string, isAccent = false) => {
    const b = document.createElement('div');
    b.textContent = label.toUpperCase();
    b.style.cssText = `padding:0.5em 1em;cursor:pointer;white-space:nowrap;
      font-size:0.72em;letter-spacing:2px;border:1px solid ${isAccent ? '#2a6f68' : 'rgba(255,255,255,0.14)'};
      color:${isAccent ? '#4fd1c5' : '#8fa2af'};background:transparent;transition:background .15s;`;
    if (isAccent) {
      b.onmouseenter = () => { b.style.background = 'rgba(79,209,197,0.08)'; };
      b.onmouseleave = () => { b.style.background = 'transparent'; };
    }
    return b;
  };
  const dim = (el: HTMLElement) => { el.style.opacity = '0.4'; el.style.pointerEvents = 'none'; };

  // ---------- вкладка: задания ----------
  function renderQuests() {
    const quests = (p.quests ?? []).filter((q) => q.enabled);
    if (quests.length === 0) {
      body.appendChild(hint('Заданий пока нет.'));
      return;
    }
    const kindLabel = { daily: 'ЕЖЕДНЕВНЫЙ', weekly: 'НЕДЕЛЬНЫЙ', story: 'СЮЖЕТ' };
    const kindColor = { daily: '#7db8f0', weekly: '#b39cf0', story: '#e5c07b' };
    for (const q of quests) {
      // сюжетные — с цветной рамкой (как в макете)
      const c = card(q.kind === 'story' ? kindColor.story : undefined);
      const kindTag = document.createElement('div');
      kindTag.textContent = kindLabel[q.kind];
      kindTag.style.cssText = `flex:0 0 6.5em;font-size:0.62em;letter-spacing:2px;
        color:${kindColor[q.kind]};`;
      c.appendChild(kindTag);
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      const title = document.createElement('div');
      title.textContent = q.title;
      title.style.cssText = 'font-weight:400;color:#e6edf3;';
      info.append(title);
      if (q.description) {
        const d = document.createElement('div');
        d.textContent = q.description;
        d.style.cssText = 'font-size:0.78em;color:#8fa2af;margin-top:0.25em;font-weight:300;';
        info.appendChild(d);
      }
      // цепочка этапов: пройденные ✓, текущий ▸, будущие затемнены
      const steps = q.steps ?? [];
      const stepsDone = steps.length ? Math.min(engine.questSteps[q.id] ?? 0, steps.length) : 0;
      if (steps.length) {
        const list = document.createElement('div');
        list.style.cssText = 'margin-top:0.5em;display:flex;flex-direction:column;gap:0.2em;';
        steps.forEach((s, i) => {
          const row = document.createElement('div');
          row.style.cssText = 'font-size:0.74em;font-weight:300;display:flex;gap:0.6em;align-items:baseline;';
          const mark = document.createElement('span');
          if (i < stepsDone) {
            mark.textContent = '✓';
            mark.style.color = '#98c379';
            row.style.color = '#5f7a8a';
            row.style.textDecoration = 'line-through';
            row.style.textDecorationColor = 'rgba(255,255,255,0.25)';
          } else if (i === stepsDone) {
            mark.textContent = '▸';
            mark.style.color = kindColor[q.kind];
            row.style.color = '#cfd9e2';
          } else {
            mark.textContent = '·';
            row.style.color = '#3d4a56';
          }
          const t = document.createElement('span');
          t.textContent = s.text;
          row.append(mark, t);
          list.appendChild(row);
        });
        info.appendChild(list);
      }
      const reward = rewardLabel(q.rewardEffects, q.rewardItems);
      if (reward) {
        const r = document.createElement('div');
        r.textContent = `НАГРАДА · ${reward}`;
        r.style.cssText = 'font-size:0.66em;letter-spacing:1.5px;color:#e5c07b;margin-top:0.5em;opacity:0.9;';
        info.appendChild(r);
      }
      c.appendChild(info);

      const key = resetKey(q.kind);
      const claimedKey = engine.questClaims[q.id];
      const done = (steps.length === 0 || stepsDone >= steps.length) && engine.checkConditions(q.conditions);
      if (claimedKey === key) {
        const b = btn(q.kind === 'story' ? 'Выполнено' : q.kind === 'daily' ? 'Завтра снова' : 'На след. неделе');
        dim(b);
        c.appendChild(b);
      } else if (done) {
        const b = btn('Забрать награду', true);
        b.onclick = () => {
          engine.questClaims[q.id] = key;
          if (q.rewardEffects) engine.applyEffects(q.rewardEffects);
          if (q.rewardItems?.length) engine.giveItems(q.rewardItems);
          engine.notify(`Задание выполнено: ${q.title}`, '#e5c07b');
          engine.saveNow();
          render();
        };
        c.appendChild(b);
      } else {
        const b = btn('Не выполнено');
        dim(b);
        c.appendChild(b);
      }
      body.appendChild(c);
    }
  }

  // ---------- вкладка: улучшения ----------
  function renderUpgrades() {
    const ups = (p.upgrades ?? []).filter((u) => u.enabled);
    if (ups.length === 0) {
      body.appendChild(hint('Улучшений пока нет.'));
      return;
    }
    for (const up of ups) {
      const c = card();
      const lvl = engine.upgradeLevels[up.id] ?? 0;
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      const title = document.createElement('div');
      title.textContent = `${up.title} — ур. ${lvl}/${up.maxLevel}`;
      title.style.fontWeight = '600';
      info.appendChild(title);
      const rule = p.idleRules?.find((r) => r.id === up.targetIdleRuleId);
      const d = document.createElement('div');
      d.textContent = (up.description ? up.description + ' ' : '')
        + (rule ? `Сейчас: +${(lvl * up.ratePerLevel).toFixed(1)}/мин к «${rule.title}».` : '');
      d.style.cssText = 'font-size:0.8em;opacity:0.6;margin-top:0.2em;';
      info.appendChild(d);
      c.appendChild(info);

      const curId = heroVarId(p, up.costVarName);
      const balance = curId ? Number(engine.state[curId] ?? 0) : 0;
      if (lvl >= up.maxLevel) {
        const b = btn('Макс. уровень');
        dim(b);
        c.appendChild(b);
      } else {
        const cost = upgradeCost(up, lvl);
        const b = btn(`Улучшить · ${cost} ⌬`, true);
        if (balance < cost || !curId) dim(b);
        b.onclick = () => {
          if (!curId || Number(engine.state[curId] ?? 0) < cost) return;
          engine.applyEffects([{ varId: curId, op: 'sub', value: cost }]);
          engine.upgradeLevels[up.id] = lvl + 1;
          engine.notify(`${up.title} → ур. ${lvl + 1}`, '#4fd1c5');
          engine.saveNow();
          render();
        };
        c.appendChild(b);
      }
      body.appendChild(c);
    }
  }

  // ---------- вкладка: OldNet ----------
  function renderOldnet() {
    const defs = (p.decodes ?? []).filter((d) => d.enabled);
    const active = engine.activeDecode;

    if (active) {
      const def = defs.find((d) => d.id === active.defId);
      const c = card();
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;';
      const title = document.createElement('div');
      title.textContent = `Расшифровка: ${def?.title ?? '?'}`;
      title.style.fontWeight = '600';
      info.appendChild(title);
      const total = (def?.durationMin ?? 1) * 60000;
      const elapsed = Date.now() - active.startedAt;
      const left = Math.max(0, total - elapsed);
      const bar = document.createElement('div');
      bar.style.cssText = `margin-top:0.5em;height:0.45em;border-radius:1em;
        background:rgba(255,255,255,0.08);overflow:hidden;`;
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;width:${Math.min(100, (elapsed / total) * 100)}%;
        background:#4fd1c5;border-radius:1em;`;
      bar.appendChild(fill);
      info.appendChild(bar);
      const t = document.createElement('div');
      t.textContent = left > 0 ? `Осталось ~${Math.ceil(left / 60000)} мин` : 'Готово к извлечению';
      t.style.cssText = 'font-size:0.75em;opacity:0.6;margin-top:0.3em;';
      info.appendChild(t);
      c.appendChild(info);

      if (left <= 0 && def) {
        const b = btn('⌬ Извлечь правду', true);
        b.onclick = () => {
          engine.activeDecode = null;
          if (def.rewardEffects) engine.applyEffects(def.rewardEffects);
          if (def.rewardItems?.length) engine.giveItems(def.rewardItems);
          engine.saveNow();
          if (def.rewardText) showTruth(def.title, def.rewardText);
          render();
        };
        c.appendChild(b);
      }
      body.appendChild(c);
    } else {
      // доступные фрагменты в инвентаре
      let any = false;
      for (const def of defs) {
        const idx = engine.inventory.findIndex((cell) => cell.itemId === def.itemId);
        if (idx < 0) continue;
        any = true;
        const item = p.items?.find((i) => i.id === def.itemId);
        const c = card();
        if (item) {
          const img = document.createElement('img');
          img.src = itemIcon(item);
          img.style.cssText = 'width:2.6em;height:2.6em;border-radius:0.3em;';
          c.appendChild(img);
        }
        const info = document.createElement('div');
        info.style.cssText = 'flex:1;';
        const title = document.createElement('div');
        title.textContent = def.title;
        title.style.fontWeight = '600';
        info.appendChild(title);
        const d = document.createElement('div');
        d.textContent = `Расшифровка: ~${def.durationMin} мин реального времени (идёт и когда игра закрыта)`;
        d.style.cssText = 'font-size:0.75em;opacity:0.6;';
        info.appendChild(d);
        const rw = rewardLabel(def.rewardEffects, def.rewardItems);
        const r = document.createElement('div');
        r.textContent = `Награда: ${rw ? rw + ' · ' : ''}засекреченные данные`;
        r.style.cssText = 'font-size:0.75em;color:#e5c07b;margin-top:0.2em;';
        info.appendChild(r);
        c.appendChild(info);
        const b = btn('Начать расшифровку', true);
        b.onclick = () => {
          const i = engine.inventory.findIndex((cell) => cell.itemId === def.itemId);
          if (i < 0) return;
          engine.inventory[i].qty -= 1;
          if (engine.inventory[i].qty <= 0) engine.inventory.splice(i, 1);
          engine.activeDecode = { defId: def.id, startedAt: Date.now() };
          engine.notify('Расшифровка начата…', '#4fd1c5');
          engine.saveNow();
          render();
        };
        c.appendChild(b);
        body.appendChild(c);
      }
      if (!any) {
        body.appendChild(hint('Нет фрагментов OldNet для расшифровки. Их можно найти в экспедициях и боях.'));
      }
    }
  }

  // ---------- вкладка: персонажи ----------
  function renderCharacters() {
    const npcs = p.npcs ?? [];
    if (npcs.length === 0) {
      body.appendChild(hint('Персонажей в проекте пока нет.'));
      return;
    }
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(15em,1fr));gap:0.7em;';
    for (const npc of npcs) {
      const met = engine.state[npc.metVarId] === true;
      const faction = npc.factionId ? p.factions?.find((f) => f.id === npc.factionId) : undefined;
      const c = card(met ? faction?.color : undefined);
      c.style.flexDirection = 'column';
      c.style.alignItems = 'flex-start';
      c.style.gap = '0.5em';
      if (met) {
        c.style.cursor = 'pointer';
        c.onclick = () => engine.openCharacterProfile(npc.id);
        c.onmouseenter = () => { c.style.background = 'rgba(255,255,255,0.035)'; };
        c.onmouseleave = () => { c.style.background = 'rgba(255,255,255,0.015)'; };
      } else {
        c.style.opacity = '0.5';
      }
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:0.8em;width:100%;';
      const img = document.createElement('img');
      img.src = met ? npcPortrait(p, npc) : npcPortrait(p, { ...npc, portrait: undefined, factionId: null, name: '?' });
      img.style.cssText = `width:2.8em;height:2.8em;border-radius:50%;flex:0 0 auto;
        border:1px solid ${met ? (faction?.color ?? '#5f7a8a') : '#3d4a56'}55;`;
      row.appendChild(img);
      const info = document.createElement('div');
      info.style.cssText = 'min-width:0;';
      const name = document.createElement('div');
      name.textContent = met ? npc.name : '??? — не встречен(а)';
      name.style.cssText = 'font-weight:400;color:#e6edf3;';
      info.appendChild(name);
      if (met && faction) {
        const fn = document.createElement('div');
        fn.textContent = faction.name;
        fn.style.cssText = `font-size:0.68em;letter-spacing:2px;text-transform:uppercase;color:${faction.color};margin-top:0.15em;`;
        info.appendChild(fn);
      }
      row.appendChild(info);
      c.appendChild(row);
      grid.appendChild(c);
    }
    body.appendChild(grid);
  }

  // ---------- вкладка: достижения ----------
  function renderAchievements() {
    const list = (p.achievements ?? []).filter((a) => a.enabled);
    if (list.length === 0) {
      body.appendChild(hint('Достижений пока нет.'));
      return;
    }
    for (const a of list) {
      const unlocked = !!engine.achievements[a.id];
      const c = card(unlocked ? '#f4d35e' : undefined);
      if (!unlocked) c.style.opacity = '0.5';
      const icon = document.createElement('div');
      icon.textContent = a.icon || '🏆';
      icon.style.cssText = 'font-size:1.6em;flex:0 0 auto;line-height:1;';
      c.appendChild(icon);
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      const title = document.createElement('div');
      title.textContent = a.title;
      title.style.cssText = `font-weight:400;color:${unlocked ? '#f4d35e' : '#e6edf3'};`;
      info.appendChild(title);
      if (a.description) {
        const d = document.createElement('div');
        d.textContent = a.description;
        d.style.cssText = 'font-size:0.78em;color:#8fa2af;margin-top:0.25em;font-weight:300;';
        info.appendChild(d);
      }
      c.appendChild(info);
      if (unlocked) {
        const tag = document.createElement('div');
        tag.textContent = '✓ ПОЛУЧЕНО';
        tag.style.cssText = 'font-size:0.66em;letter-spacing:2px;color:#f4d35e;flex:0 0 auto;';
        c.appendChild(tag);
      }
      body.appendChild(c);
    }
  }

  /** Оверлей «кусок правды» — терминал OldNet (скан-линии, амбер-сбой) */
  function showTruth(title: string, text: string) {
    const o = document.createElement('div');
    o.style.cssText = `position:absolute;inset:0;background:rgba(1,3,5,0.96);z-index:70;
      display:flex;align-items:center;justify-content:center;pointer-events:auto;`;
    const box = document.createElement('div');
    // скан-линии терминала
    box.style.cssText = `width:66%;max-height:84%;overflow-y:auto;background:
      repeating-linear-gradient(0deg, rgba(79,209,197,0.02) 0px, rgba(79,209,197,0.02) 1px,
      transparent 1px, transparent 4px), #070c11;
      border:1px solid rgba(79,209,197,0.25);font-size:0.85em;display:flex;flex-direction:column;`;

    // шапка терминала
    let hash = 0;
    for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
    const header = document.createElement('div');
    header.style.cssText = `display:flex;justify-content:space-between;align-items:center;
      padding:0.7em 1.4em;border-bottom:1px solid rgba(79,209,197,0.18);`;
    const hl = document.createElement('div');
    hl.innerHTML = `<span style="color:#e06c75">●</span> OLDNET · ДОСТУП ВОССТАНОВЛЕН`;
    hl.style.cssText = 'font-size:0.7em;letter-spacing:3px;color:#4fd1c5;';
    const hr = document.createElement('div');
    hr.textContent = `ЦЕЛОСТНОСТЬ ${30 + (hash % 41)}%`;
    hr.style.cssText = 'font-size:0.7em;letter-spacing:3px;color:#5f7a8a;';
    header.append(hl, hr);
    box.appendChild(header);

    const content = document.createElement('div');
    content.style.cssText = 'padding:1.4em 1.8em;flex:1;';
    const h1 = document.createElement('div');
    h1.textContent = title.toUpperCase();
    h1.style.cssText = 'color:#5f7a8a;letter-spacing:4px;margin-bottom:1em;font-size:0.72em;';
    content.appendChild(h1);

    // абзацы: [в скобках] — «тёплый сбой» (амбер-блок), остальное — крупная цитата
    for (const para of text.split(/\n\n+/)) {
      if (/^\[.*\]$/s.test(para.trim())) {
        const warn = document.createElement('div');
        warn.textContent = para.trim().replace(/^\[|\]$/g, '');
        warn.style.cssText = `margin:1.1em 0;padding:0.8em 1.1em;font-style:italic;
          color:#e5c07b;background:rgba(229,192,123,0.05);
          border-left:2px solid #e5c07b;line-height:1.6;font-weight:300;`;
        content.appendChild(warn);
      } else {
        const q = document.createElement('div');
        q.textContent = para;
        q.style.cssText = 'color:#dfe8ee;line-height:1.7;font-weight:300;font-size:1.05em;margin:0.5em 0;';
        content.appendChild(q);
      }
    }
    box.appendChild(content);

    const foot = document.createElement('div');
    foot.style.cssText = `display:flex;justify-content:space-between;align-items:center;
      padding:0.9em 1.4em;border-top:1px solid rgba(79,209,197,0.14);`;
    const fl = document.createElement('div');
    fl.textContent = 'ДОБАВЛЕНО В АРХИВ';
    fl.style.cssText = 'font-size:0.66em;letter-spacing:3px;color:#5f7a8a;';
    const ok = btn('Закрыть', true);
    ok.onclick = () => o.remove();
    foot.append(fl, ok);
    box.appendChild(foot);

    o.appendChild(box);
    layer.appendChild(o);
  }

  /** Человекочитаемая строка награды: «+25 Кредиты · Стим-инъектор ×2» */
  function rewardLabel(
    effects?: { varId: string; op: string; value: unknown }[],
    items?: { itemId: string; qty: number }[],
  ): string {
    const parts: string[] = [];
    for (const e of effects ?? []) {
      const v = p.variables.find((x) => x.id === e.varId);
      if (!v) continue;
      if (e.op === 'add') parts.push(`+${e.value} ${v.title}`);
      else if (e.op === 'sub') parts.push(`−${e.value} ${v.title}`);
      else if (e.op === 'set') parts.push(`${v.title}: ${typeof e.value === 'boolean' ? (e.value ? 'да' : 'нет') : e.value}`);
      else parts.push(v.title);
    }
    for (const g of items ?? []) {
      const it = p.items?.find((x) => x.id === g.itemId);
      if (it) parts.push(`${it.name}${g.qty > 1 ? ` ×${g.qty}` : ''}`);
    }
    return parts.join(' · ');
  }

  function hint(text: string): HTMLElement {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = 'opacity:0.45;padding:1em;text-align:center;';
    return d;
  }

  function render() {
    for (const [key, el] of tabEls) {
      const active = key === tab;
      el.style.borderBottomColor = active ? accent : 'transparent';
      el.style.color = active ? '#e6edf3' : '#5f7a8a';
    }
    body.innerHTML = '';
    if (tab === 'quests') renderQuests();
    else if (tab === 'upgrades') renderUpgrades();
    else if (tab === 'characters') renderCharacters();
    else if (tab === 'achievements') renderAchievements();
    else renderOldnet();
  }

  render();
  // если открыта расшифровка — обновляем прогресс раз в секунду
  const timer = setInterval(() => {
    if (!backdrop.isConnected) { clearInterval(timer); return; }
    if (tab === 'oldnet') render();
  }, 1000);
}
