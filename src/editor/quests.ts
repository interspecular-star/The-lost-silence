// ============================================================
// Режим «Журнал»: задания, улучшения, расшифровка OldNet
// ============================================================

import { Store } from '../core/store';
import {
  QuestDef, QuestStep, AchievementDef, Condition, Effect, ItemGrant, uid,
} from '../core/types';
import {
  h, textInput, numberInput, selectInput, textArea, checkbox,
  promptModal, confirmModal, toast,
} from './ui';

export function mountQuests(store: Store): HTMLElement {
  const root = h('div', { id: 'vars-wrap' });
  const mutate = (fn: () => void) => { store.snapshot(); fn(); store.emit('change'); };

  const render = () => {
    root.innerHTML = '';
    renderQuestList();
    renderUpgradeList();
    renderDecodeList();
    renderAchievementList();
  };

  // ---------- общие мини-редакторы ----------
  function condsMini(list: Condition[], commit: (l: Condition[]) => void): HTMLElement {
    const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:4px;' });
    const vars = store.project.variables;
    list.forEach((c, i) => {
      const r = h('div', { style: 'display:flex;gap:4px;align-items:center;' });
      r.appendChild(selectInput(c.varId, vars.map((v) => [v.id, v.title] as [string, string]), (v) => {
        const copy = list.map((x) => ({ ...x }));
        copy[i].varId = v;
        commit(copy);
      }));
      r.appendChild(selectInput(c.op, [['eq', '='], ['ne', '≠'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤']], (v) => {
        const copy = list.map((x) => ({ ...x }));
        copy[i].op = v as Condition['op'];
        commit(copy);
      }));
      const def = store.getVariable(c.varId);
      if (def?.type === 'boolean') {
        r.appendChild(selectInput(String(c.value === true), [['true', 'да'], ['false', 'нет']], (v) => {
          const copy = list.map((x) => ({ ...x }));
          copy[i].value = v === 'true';
          commit(copy);
        }));
      } else {
        const val = numberInput(Number(c.value) || 0, (v) => {
          const copy = list.map((x) => ({ ...x }));
          copy[i].value = v;
          commit(copy);
        });
        val.style.width = '84px';
        val.style.flex = '0 0 84px';
        r.appendChild(val);
      }
      const del = h('button', { class: 'btn small danger-ghost', text: '✕' });
      del.onclick = () => commit(list.filter((_, j) => j !== i));
      r.appendChild(del);
      wrap.appendChild(r);
    });
    const add = h('button', { class: 'btn small', text: '+ условие', style: 'align-self:flex-start;' });
    add.onclick = () => {
      const first = vars[0];
      if (!first) { toast('Нет переменных', true); return; }
      commit([...list.map((x) => ({ ...x })), { varId: first.id, op: 'gte', value: first.type === 'boolean' ? true : 1 }]);
    };
    wrap.appendChild(add);
    return wrap;
  }

  function effectsMini(list: Effect[], commit: (l: Effect[]) => void): HTMLElement {
    const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:4px;' });
    const vars = store.project.variables.filter((v) => v.category !== 'computed');
    list.forEach((e, i) => {
      const r = h('div', { style: 'display:flex;gap:4px;align-items:center;' });
      r.appendChild(selectInput(e.varId, vars.map((v) => [v.id, v.title] as [string, string]), (v) => {
        const copy = list.map((x) => ({ ...x }));
        copy[i].varId = v;
        commit(copy);
      }));
      r.appendChild(selectInput(e.op, [['add', '+'], ['sub', '−'], ['set', '='], ['toggle', '⇄']], (v) => {
        const copy = list.map((x) => ({ ...x }));
        copy[i].op = v as Effect['op'];
        commit(copy);
      }));
      if (e.op !== 'toggle') {
        const def = store.getVariable(e.varId);
        if (def?.type === 'boolean') {
          r.appendChild(selectInput(String(e.value === true), [['true', 'да'], ['false', 'нет']], (v) => {
            const copy = list.map((x) => ({ ...x }));
            copy[i].value = v === 'true';
            commit(copy);
          }));
        } else {
          const val = numberInput(Number(e.value) || 0, (v) => {
            const copy = list.map((x) => ({ ...x }));
            copy[i].value = v;
            commit(copy);
          });
          val.style.width = '84px';
        val.style.flex = '0 0 84px';
          r.appendChild(val);
        }
      }
      const del = h('button', { class: 'btn small danger-ghost', text: '✕' });
      del.onclick = () => commit(list.filter((_, j) => j !== i));
      r.appendChild(del);
      wrap.appendChild(r);
    });
    const add = h('button', { class: 'btn small', text: '+ эффект', style: 'align-self:flex-start;' });
    add.onclick = () => {
      const first = vars.find((v) => v.type === 'number');
      if (!first) { toast('Нет переменных', true); return; }
      commit([...list.map((x) => ({ ...x })), { varId: first.id, op: 'add', value: 10 }]);
    };
    wrap.appendChild(add);
    return wrap;
  }

  function grantsMini(list: ItemGrant[], commit: (l: ItemGrant[]) => void): HTMLElement {
    const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:4px;' });
    const items = store.project.items ?? [];
    list.forEach((g, i) => {
      const r = h('div', { style: 'display:flex;gap:4px;align-items:center;' });
      r.appendChild(selectInput(g.itemId, items.map((it) => [it.id, it.name] as [string, string]), (v) => {
        const copy = list.map((x) => ({ ...x }));
        copy[i].itemId = v;
        commit(copy);
      }));
      const q = numberInput(g.qty, (v) => {
        const copy = list.map((x) => ({ ...x }));
        copy[i].qty = Math.max(1, Math.round(v));
        commit(copy);
      });
      q.style.width = '84px';
      q.style.flex = '0 0 84px';
      r.appendChild(q);
      const del = h('button', { class: 'btn small danger-ghost', text: '✕' });
      del.onclick = () => commit(list.filter((_, j) => j !== i));
      r.appendChild(del);
      wrap.appendChild(r);
    });
    const add = h('button', { class: 'btn small', text: '+ предмет', style: 'align-self:flex-start;' });
    add.onclick = () => {
      if (items.length === 0) { toast('Сначала создайте предмет', true); return; }
      commit([...list.map((x) => ({ ...x })), { itemId: items[0].id, qty: 1 }]);
    };
    wrap.appendChild(add);
    return wrap;
  }

  function stepsMini(q: QuestDef): HTMLElement {
    const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:6px;' });
    const steps = q.steps ?? [];
    steps.forEach((s: QuestStep, i: number) => {
      const box = h('div', {
        style: 'border:1px solid var(--border);border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:4px;',
      });
      const r = h('div', { style: 'display:flex;gap:4px;align-items:center;' });
      r.appendChild(h('span', { style: 'color:var(--text-faint);font-size:11px;flex:0 0 auto;', text: `${i + 1}.` }));
      const txt = textInput(s.text, (v) => mutate(() => { s.text = v; }));
      txt.placeholder = 'Что сделать (видно игроку): «Поговорить с Рен»';
      r.appendChild(txt);
      if (i > 0) {
        const up = h('button', { class: 'btn small', text: '↑', title: 'Выше' });
        up.onclick = () => mutate(() => { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; });
        r.appendChild(up);
      }
      const del = h('button', { class: 'btn small danger-ghost', text: '✕' });
      del.onclick = () => mutate(() => {
        steps.splice(i, 1);
        if (steps.length === 0) q.steps = undefined;
      });
      r.appendChild(del);
      box.appendChild(r);
      box.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);', text: 'Этап выполнен, когда:' }));
      box.appendChild(condsMini(s.conditions, (l) => mutate(() => { s.conditions = l; })));
      wrap.appendChild(box);
    });
    const add = h('button', { class: 'btn small', text: '+ этап', style: 'align-self:flex-start;' });
    add.onclick = () => mutate(() => {
      (q.steps ??= []).push({ id: uid('qs'), text: 'Новый этап', conditions: [] });
    });
    wrap.appendChild(add);
    return wrap;
  }

  function cardShell(borderColor: string): HTMLElement {
    return h('div', {
      style: `background:var(--bg-panel);border:1px solid ${borderColor};
        border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;`,
    });
  }

  function headerRow(title: string, addLabel: string, onAdd: () => void): void {
    const head = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin:22px 0 8px;' });
    head.appendChild(h('h2', { style: 'margin:0;font-size:16px;font-weight:600;', text: title }));
    const add = h('button', { class: 'btn accent', text: addLabel });
    add.onclick = onAdd;
    head.appendChild(add);
    root.appendChild(head);
  }

  // ---------- задания ----------
  function renderQuestList() {
    headerRow('Задания', '+ Задание', async () => {
      const name = await promptModal('Название задания', '', 'Например: Контракт дня — сбор компонентов');
      if (!name) return;
      mutate(() => {
        store.project.quests = store.project.quests ?? [];
        store.project.quests.push({
          id: uid('q'), title: name, kind: 'daily', conditions: [], enabled: true,
        });
      });
    });
    root.appendChild(h('div', {
      class: 'hint', style: 'margin-bottom:10px;',
      text: 'Суточные и недельные задания можно выполнять снова каждый день/неделю — это «ежедневный ритм» игры. Сюжетные — один раз. Задание выполнено, когда верны все условия; игрок забирает награду в Журнале 📋.',
    }));

    const quests = store.project.quests ?? [];
    if (quests.length === 0) { root.appendChild(h('div', { class: 'hint', text: 'Заданий пока нет.' })); return; }
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:12px;' });
    for (const q of quests) {
      const c = cardShell('rgba(125,184,240,0.3)');
      const r1 = h('div', { style: 'display:flex;gap:6px;' });
      const en = h('input', { type: 'checkbox', class: 'ed', title: 'Включено' }) as HTMLInputElement;
      en.checked = q.enabled;
      en.onchange = () => mutate(() => { q.enabled = en.checked; });
      r1.appendChild(en);
      const nameIn = textInput(q.title, (v) => mutate(() => { q.title = v; }));
      nameIn.style.fontWeight = '600';
      r1.appendChild(nameIn);
      r1.appendChild(selectInput(q.kind, [['daily', 'суточное'], ['weekly', 'недельное'], ['story', 'сюжетное']],
        (v) => mutate(() => { q.kind = v as QuestDef['kind']; })));
      const del = h('button', { class: 'btn small danger-ghost', text: '✕' });
      del.onclick = async () => {
        if (!(await confirmModal('Удалить задание', `«${q.title}»?`))) return;
        mutate(() => { store.project.quests = quests.filter((x) => x.id !== q.id); });
      };
      r1.appendChild(del);
      c.appendChild(r1);
      const desc = textArea(q.description ?? '', (v) => mutate(() => { q.description = v || undefined; }), 2);
      desc.placeholder = 'Описание для игрока…';
      c.appendChild(desc);
      c.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);', text: 'Этапы цепочки (по порядку; выполненный этап фиксируется навсегда — для сюжетных):' }));
      c.appendChild(stepsMini(q));
      c.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);', text: q.steps?.length ? 'Доп. условия (поверх этапов, обычно не нужны):' : 'Условия выполнения:' }));
      c.appendChild(condsMini(q.conditions, (l) => mutate(() => { q.conditions = l; })));
      c.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);', text: 'Награда — эффекты:' }));
      c.appendChild(effectsMini(q.rewardEffects ?? [], (l) => mutate(() => { q.rewardEffects = l.length ? l : undefined; })));
      c.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);', text: 'Награда — предметы:' }));
      c.appendChild(grantsMini(q.rewardItems ?? [], (l) => mutate(() => { q.rewardItems = l.length ? l : undefined; })));
      grid.appendChild(c);
    }
    root.appendChild(grid);
  }

  // ---------- улучшения ----------
  function renderUpgradeList() {
    headerRow('Улучшения (idle-прокачка)', '+ Улучшение', async () => {
      const name = await promptModal('Название улучшения', '', 'Например: Дрон-сборщик');
      if (!name) return;
      mutate(() => {
        store.project.upgrades = store.project.upgrades ?? [];
        store.project.upgrades.push({
          id: uid('up'), title: name, maxLevel: 5, costVarName: 'credits',
          costBase: 50, costGrowth: 1.6, ratePerLevel: 1, enabled: true,
          targetIdleRuleId: store.project.idleRules?.[0]?.id,
        });
      });
    });
    root.appendChild(h('div', {
      class: 'hint', style: 'margin-bottom:10px;',
      text: 'Улучшение усиливает idle-правило: каждый уровень добавляет «прирост/мин». Цена растёт: база × рост^уровень. Покупается игроком в Журнале 📋.',
    }));

    const ups = store.project.upgrades ?? [];
    if (ups.length === 0) { root.appendChild(h('div', { class: 'hint', text: 'Улучшений пока нет.' })); return; }
    const rules = store.project.idleRules ?? [];
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:12px;' });
    for (const up of ups) {
      const c = cardShell('rgba(79,209,197,0.3)');
      const r1 = h('div', { style: 'display:flex;gap:6px;' });
      const en = h('input', { type: 'checkbox', class: 'ed', title: 'Включено' }) as HTMLInputElement;
      en.checked = up.enabled;
      en.onchange = () => mutate(() => { up.enabled = en.checked; });
      r1.appendChild(en);
      const nameIn = textInput(up.title, (v) => mutate(() => { up.title = v; }));
      nameIn.style.fontWeight = '600';
      r1.appendChild(nameIn);
      const del = h('button', { class: 'btn small danger-ghost', text: '✕' });
      del.onclick = async () => {
        if (!(await confirmModal('Удалить улучшение', `«${up.title}»?`))) return;
        mutate(() => { store.project.upgrades = ups.filter((x) => x.id !== up.id); });
      };
      r1.appendChild(del);
      c.appendChild(r1);

      c.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);', text: 'Усиливает idle-правило:' }));
      c.appendChild(selectInput(up.targetIdleRuleId ?? '', [['', '— выберите —'], ...rules.map((r) => [r.id, r.title] as [string, string])],
        (v) => mutate(() => { up.targetIdleRuleId = v || undefined; })));

      const nums = h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;' });
      const mkNum = (label: string, val: number, fn: (v: number) => void) => {
        const w = h('div', { style: 'display:flex;align-items:center;gap:4px;' });
        w.appendChild(h('span', { style: 'color:var(--text-faint);font-size:11px;', text: label }));
        const inp = numberInput(val, fn);
        inp.style.width = '84px';
        w.appendChild(inp);
        return w;
      };
      nums.appendChild(mkNum('+/мин за ур.:', up.ratePerLevel, (v) => mutate(() => { up.ratePerLevel = v; })));
      nums.appendChild(mkNum('макс. ур.:', up.maxLevel, (v) => mutate(() => { up.maxLevel = Math.max(1, Math.round(v)); })));
      nums.appendChild(mkNum('цена базовая:', up.costBase, (v) => mutate(() => { up.costBase = Math.max(0, v); })));
      nums.appendChild(mkNum('рост цены ×:', up.costGrowth, (v) => mutate(() => { up.costGrowth = Math.max(1, v); })));
      c.appendChild(nums);

      const desc = textArea(up.description ?? '', (v) => mutate(() => { up.description = v || undefined; }), 2);
      desc.placeholder = 'Описание для игрока…';
      c.appendChild(desc);
      grid.appendChild(c);
    }
    root.appendChild(grid);
  }

  // ---------- расшифровка ----------
  function renderDecodeList() {
    headerRow('Фрагменты OldNet (расшифровка)', '+ Фрагмент', async () => {
      const name = await promptModal('Название фрагмента', '', 'Например: Обрывок новостной ленты, 2034');
      if (!name) return;
      const item = store.project.items?.[0];
      if (!item) { toast('Сначала создайте предмет-фрагмент (режим «Предметы»)', true); return; }
      mutate(() => {
        store.project.decodes = store.project.decodes ?? [];
        store.project.decodes.push({
          id: uid('dec'), title: name, itemId: item.id, durationMin: 30, enabled: true,
        });
      });
    });
    root.appendChild(h('div', {
      class: 'hint', style: 'margin-bottom:10px;',
      text: 'Игрок находит предмет-фрагмент → запускает расшифровку в Журнале → ждёт реальное время (идёт и оффлайн) → получает «кусок правды» (текст), эффекты и предметы. Главная причина вернуться в игру завтра.',
    }));

    const decs = store.project.decodes ?? [];
    if (decs.length === 0) { root.appendChild(h('div', { class: 'hint', text: 'Фрагментов пока нет.' })); return; }
    const items = store.project.items ?? [];
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:12px;' });
    for (const dec of decs) {
      const c = cardShell('rgba(229,192,123,0.3)');
      const r1 = h('div', { style: 'display:flex;gap:6px;' });
      const en = h('input', { type: 'checkbox', class: 'ed', title: 'Включено' }) as HTMLInputElement;
      en.checked = dec.enabled;
      en.onchange = () => mutate(() => { dec.enabled = en.checked; });
      r1.appendChild(en);
      const nameIn = textInput(dec.title, (v) => mutate(() => { dec.title = v; }));
      nameIn.style.fontWeight = '600';
      r1.appendChild(nameIn);
      const del = h('button', { class: 'btn small danger-ghost', text: '✕' });
      del.onclick = async () => {
        if (!(await confirmModal('Удалить фрагмент', `«${dec.title}»?`))) return;
        mutate(() => { store.project.decodes = decs.filter((x) => x.id !== dec.id); });
      };
      r1.appendChild(del);
      c.appendChild(r1);

      const r2 = h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;' });
      r2.appendChild(h('span', { style: 'color:var(--text-faint);font-size:11px;', text: 'предмет:' }));
      r2.appendChild(selectInput(dec.itemId, items.map((it) => [it.id, it.name] as [string, string]),
        (v) => mutate(() => { dec.itemId = v; })));
      r2.appendChild(h('span', { style: 'color:var(--text-faint);font-size:11px;', text: 'минут:' }));
      const dur = numberInput(dec.durationMin, (v) => mutate(() => { dec.durationMin = Math.max(0.1, v); }));
      dur.style.width = '84px';
      r2.appendChild(dur);
      c.appendChild(r2);

      c.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);', text: '«Кусок правды» — текст по завершении:' }));
      c.appendChild(textArea(dec.rewardText ?? '', (v) => mutate(() => { dec.rewardText = v || undefined; }), 3));
      c.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);', text: 'Награда — эффекты:' }));
      c.appendChild(effectsMini(dec.rewardEffects ?? [], (l) => mutate(() => { dec.rewardEffects = l.length ? l : undefined; })));
      c.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);', text: 'Награда — предметы:' }));
      c.appendChild(grantsMini(dec.rewardItems ?? [], (l) => mutate(() => { dec.rewardItems = l.length ? l : undefined; })));
      grid.appendChild(c);
    }
    root.appendChild(grid);
  }

  // ---------- достижения ----------
  function renderAchievementList() {
    headerRow('Достижения', '+ Достижение', async () => {
      const name = await promptModal('Название достижения', '', 'Например: Первый контакт');
      if (!name) return;
      mutate(() => {
        store.project.achievements = store.project.achievements ?? [];
        store.project.achievements.push({
          id: uid('ach'), title: name, conditions: [], enabled: true,
        });
      });
    });
    root.appendChild(h('div', {
      class: 'hint', style: 'margin-bottom:10px;',
      text: 'Разблокируется навсегда, как только верны все условия (даже если условия потом перестанут выполняться — назад не откатывается). Награда, если задана, выдаётся автоматически, без «забрать» в Журнале. Видно в Журнале 📋 → вкладка «Достижения».',
    }));

    const list = store.project.achievements ?? [];
    if (list.length === 0) { root.appendChild(h('div', { class: 'hint', text: 'Достижений пока нет.' })); return; }
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:12px;' });
    for (const a of list) {
      const c = cardShell('rgba(244,211,94,0.3)');
      const r1 = h('div', { style: 'display:flex;gap:6px;' });
      const en = h('input', { type: 'checkbox', class: 'ed', title: 'Включено' }) as HTMLInputElement;
      en.checked = a.enabled;
      en.onchange = () => mutate(() => { a.enabled = en.checked; });
      r1.appendChild(en);
      const icon = textInput(a.icon ?? '', (v) => mutate(() => { a.icon = v || undefined; }));
      icon.placeholder = '🏆';
      icon.style.cssText = 'flex:0 0 44px;text-align:center;';
      r1.appendChild(icon);
      const nameIn = textInput(a.title, (v) => mutate(() => { a.title = v; }));
      nameIn.style.fontWeight = '600';
      r1.appendChild(nameIn);
      const del = h('button', { class: 'btn small danger-ghost', text: '✕' });
      del.onclick = async () => {
        if (!(await confirmModal('Удалить достижение', `«${a.title}»?`))) return;
        mutate(() => { store.project.achievements = list.filter((x: AchievementDef) => x.id !== a.id); });
      };
      r1.appendChild(del);
      c.appendChild(r1);
      const desc = textArea(a.description ?? '', (v) => mutate(() => { a.description = v || undefined; }), 2);
      desc.placeholder = 'Описание для игрока…';
      c.appendChild(desc);
      c.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);', text: 'Условия разблокировки:' }));
      c.appendChild(condsMini(a.conditions, (l) => mutate(() => { a.conditions = l; })));
      c.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);', text: 'Награда — эффекты (необязательно):' }));
      c.appendChild(effectsMini(a.rewardEffects ?? [], (l) => mutate(() => { a.rewardEffects = l.length ? l : undefined; })));
      c.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);', text: 'Награда — предметы (необязательно):' }));
      c.appendChild(grantsMini(a.rewardItems ?? [], (l) => mutate(() => { a.rewardItems = l.length ? l : undefined; })));
      grid.appendChild(c);
    }
    root.appendChild(grid);
  }

  store.on('change', render);
  store.on('project', render);
  render();
  return root;
}
