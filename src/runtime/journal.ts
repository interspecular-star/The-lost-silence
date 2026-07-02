// ============================================================
// Журнал игрока (📋): задания, улучшения, расшифровка OldNet.
// Ежедневный ритм: суточные/недельные награды, реальное время.
// ============================================================

import { QuestDef, UpgradeDef, CANVAS_W } from '../core/types';
import { heroVarId, itemIcon } from '../core/hero';
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
  let tab: 'quests' | 'upgrades' | 'oldnet' = 'quests';

  const backdrop = document.createElement('div');
  backdrop.style.cssText = `position:absolute;inset:0;background:rgba(2,4,6,0.72);
    pointer-events:auto;backdrop-filter:blur(3px);font-size:calc(26 * 100cqw / ${CANVAS_W});color:#cfd9e2;`;
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  layer.appendChild(backdrop);

  const panel = document.createElement('div');
  panel.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    width:70%;height:78%;background:#0c1218;border:1px solid rgba(255,255,255,0.12);
    border-radius:0.6em;padding:1em 1.2em;display:flex;flex-direction:column;gap:0.7em;font-size:0.78em;`;
  backdrop.appendChild(panel);

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:0.6em;';
  const tabs: ['quests' | 'upgrades' | 'oldnet', string][] = [
    ['quests', '📋 Задания'], ['upgrades', '⚙ Улучшения'], ['oldnet', '⌬ OldNet'],
  ];
  const tabEls = new Map<string, HTMLElement>();
  for (const [key, label] of tabs) {
    const t = document.createElement('div');
    t.textContent = label;
    t.style.cssText = `padding:0.35em 0.9em;border-radius:0.4em;cursor:pointer;font-size:0.9em;
      border:1px solid transparent;`;
    t.onclick = () => { tab = key; render(); };
    tabEls.set(key, t);
    head.appendChild(t);
  }
  head.appendChild(Object.assign(document.createElement('div'), { style: 'flex:1' }));
  const closeBtn = document.createElement('div');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'cursor:pointer;opacity:0.6;padding:0 0.3em;';
  closeBtn.onclick = close;
  head.appendChild(closeBtn);
  panel.appendChild(head);

  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:0.6em;';
  panel.appendChild(body);

  const card = () => {
    const c = document.createElement('div');
    c.style.cssText = `background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.09);
      border-radius:0.5em;padding:0.7em 0.9em;display:flex;align-items:center;gap:0.9em;`;
    return c;
  };
  const btn = (label: string, accent = false) => {
    const b = document.createElement('div');
    b.textContent = label;
    b.style.cssText = `padding:0.4em 0.9em;border-radius:0.4em;cursor:pointer;white-space:nowrap;
      font-size:0.85em;border:1px solid ${accent ? '#2a6f68' : 'rgba(255,255,255,0.16)'};
      color:${accent ? '#4fd1c5' : '#cfd9e2'};background:${accent ? 'rgba(79,209,197,0.08)' : 'rgba(255,255,255,0.04)'};`;
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
    const kindLabel = { daily: 'суточное', weekly: 'недельное', story: 'сюжетное' };
    const kindColor = { daily: '#7db8f0', weekly: '#b39cf0', story: '#e5c07b' };
    for (const q of quests) {
      const c = card();
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      const title = document.createElement('div');
      title.textContent = q.title;
      title.style.fontWeight = '600';
      const meta = document.createElement('div');
      meta.textContent = kindLabel[q.kind];
      meta.style.cssText = `font-size:0.72em;color:${kindColor[q.kind]};letter-spacing:1px;`;
      info.append(meta, title);
      if (q.description) {
        const d = document.createElement('div');
        d.textContent = q.description;
        d.style.cssText = 'font-size:0.8em;opacity:0.6;margin-top:0.2em;';
        info.appendChild(d);
      }
      c.appendChild(info);

      const key = resetKey(q.kind);
      const claimedKey = engine.questClaims[q.id];
      const done = engine.checkConditions(q.conditions);
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

  /** Оверлей с «куском правды» */
  function showTruth(title: string, text: string) {
    const o = document.createElement('div');
    o.style.cssText = `position:absolute;inset:0;background:rgba(1,3,5,0.93);z-index:70;
      display:flex;align-items:center;justify-content:center;pointer-events:auto;`;
    const box = document.createElement('div');
    box.style.cssText = `max-width:60%;background:#0a1016;border:1px solid #2a6f68;
      border-radius:0.6em;padding:1.4em 1.8em;font-size:0.9em;`;
    const h1 = document.createElement('div');
    h1.textContent = `⌬ ${title}`;
    h1.style.cssText = 'color:#4fd1c5;letter-spacing:2px;margin-bottom:0.8em;font-size:0.8em;';
    const t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'line-height:1.6;white-space:pre-wrap;font-style:italic;color:#aebfca;';
    const ok = btn('Закрыть', true);
    ok.style.marginTop = '1.2em';
    ok.onclick = () => o.remove();
    box.append(h1, t, ok);
    o.appendChild(box);
    layer.appendChild(o);
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
      el.style.borderColor = active ? '#2a6f68' : 'transparent';
      el.style.color = active ? '#4fd1c5' : '#cfd9e2';
      el.style.background = active ? 'rgba(79,209,197,0.07)' : '';
    }
    body.innerHTML = '';
    if (tab === 'quests') renderQuests();
    else if (tab === 'upgrades') renderUpgrades();
    else renderOldnet();
  }

  render();
  // если открыта расшифровка — обновляем прогресс раз в секунду
  const timer = setInterval(() => {
    if (!backdrop.isConnected) { clearInterval(timer); return; }
    if (tab === 'oldnet') render();
  }, 1000);
}
