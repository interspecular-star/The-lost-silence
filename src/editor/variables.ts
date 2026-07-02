// ============================================================
// Панель переменных: создание, типы, отслеживание
// ============================================================

import { Store } from '../core/store';
import { VariableDef, IdleRule, uid } from '../core/types';
import { h, textInput, numberInput, selectInput, toast } from './ui';

export function mountVariables(store: Store): HTMLElement {
  const root = h('div', { id: 'vars-wrap' });

  const render = () => {
    root.innerHTML = '';
    const head = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;' });
    head.appendChild(h('h2', { style: 'margin:0;font-size:16px;font-weight:600;', text: 'Переменные игры' }));
    const add = h('button', { class: 'btn accent', text: '+ Новая переменная' });
    add.onclick = () => {
      store.snapshot();
      const v: VariableDef = {
        id: uid('var'), name: `var_${store.project.variables.length + 1}`,
        title: 'Новая переменная', type: 'number', initial: 0, category: 'general',
      };
      store.project.variables.push(v);
      store.emit('change');
    };
    head.appendChild(add);
    root.appendChild(head);

    const mutate = (fn: () => void) => { store.snapshot(); fn(); store.emit('change'); };

    for (const category of ['reputation', 'general'] as const) {
      const vars = store.project.variables.filter((v) => v.category === category);
      root.appendChild(h('div', {
        class: 'insp-section-title', style: 'margin-top:18px;',
        text: category === 'reputation' ? 'Репутация фракций' : 'Обычные переменные',
      }));
      const table = h('table', { class: 'vars-table' });
      const thead = h('tr');
      for (const t of ['Название', 'Имя (код)', 'Тип', 'Категория', 'Нач. значение', 'Следить', 'Описание', '']) {
        thead.appendChild(h('th', { text: t }));
      }
      table.appendChild(thead);

      for (const v of vars) {
        const tr = h('tr');
        const td = (el: HTMLElement | string, w?: string) => {
          const cell = h('td');
          if (w) cell.style.width = w;
          cell.append(el);
          tr.appendChild(cell);
        };
        td(textInput(v.title, (val) => mutate(() => { v.title = val; })), '16%');
        const nameIn = textInput(v.name, (val) => mutate(() => { v.name = val.replace(/[^\w]/g, '_'); }));
        nameIn.classList.add('var-name');
        td(nameIn, '13%');
        td(selectInput(v.type, [['number', 'число'], ['string', 'текст'], ['boolean', 'да/нет']], (val) => mutate(() => {
          v.type = val as VariableDef['type'];
          v.initial = v.type === 'number' ? 0 : v.type === 'boolean' ? false : '';
        })), '9%');
        td(selectInput(v.category, [['general', 'обычная'], ['reputation', 'репутация']], (val) => mutate(() => {
          v.category = val as VariableDef['category'];
        })), '11%');
        td(v.type === 'boolean'
          ? selectInput(String(v.initial === true), [['false', 'нет'], ['true', 'да']], (val) => mutate(() => { v.initial = val === 'true'; }))
          : v.type === 'number'
            ? numberInput(Number(v.initial) || 0, (val) => mutate(() => { v.initial = val; }))
            : textInput(String(v.initial ?? ''), (val) => mutate(() => { v.initial = val; })), '11%');
        const cb = h('input', { type: 'checkbox', class: 'ed' }) as HTMLInputElement;
        cb.checked = !!v.tracked;
        cb.onchange = () => mutate(() => { v.tracked = cb.checked || undefined; });
        td(cb, '6%');
        td(textInput(v.description ?? '', (val) => mutate(() => { v.description = val || undefined; })));
        const del = h('button', { class: 'btn small danger-ghost', text: '✕', title: 'Удалить' });
        del.onclick = () => {
          const used = countUsages(store, v.id);
          if (used > 0) { toast(`Переменная используется в ${used} местах — сначала уберите использования`, true); return; }
          mutate(() => { store.project.variables = store.project.variables.filter((x) => x.id !== v.id); });
        };
        td(del, '4%');
        table.appendChild(tr);
      }
      root.appendChild(table);
      if (vars.length === 0) root.appendChild(h('div', { class: 'hint', text: 'Пусто.' }));
    }

    renderIdleRules(mutate);
  };

  // ---------- idle-правила ----------
  function renderIdleRules(mutate: (fn: () => void) => void) {
    const head = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin:28px 0 4px;' });
    head.appendChild(h('div', { class: 'insp-section-title', style: 'margin:0;', text: 'Idle-правила (пассивный прогресс)' }));
    const add = h('button', { class: 'btn small accent', text: '+ Правило' });
    add.onclick = () => {
      const numVar = store.project.variables.find((v) => v.type === 'number');
      if (!numVar) { toast('Нужна хотя бы одна числовая переменная', true); return; }
      mutate(() => {
        store.project.idleRules = store.project.idleRules ?? [];
        store.project.idleRules.push({
          id: uid('idle'), title: 'Новое правило', varId: numVar.id,
          ratePerMin: 1, enabled: true, offline: true,
        });
      });
    };
    head.appendChild(add);
    root.appendChild(head);
    root.appendChild(h('div', {
      class: 'hint', style: 'margin-bottom:10px;',
      text: 'Переменная растёт сама со временем — основа idle-механик (добыча кредитов, восстановление энергии). «Оффлайн» — прогресс копится, даже когда игра закрыта. Работает в экспортированной игре; предпросмотр всегда начинается с чистого листа.',
    }));

    const rules = store.project.idleRules ?? [];
    if (rules.length === 0) {
      root.appendChild(h('div', { class: 'hint', text: 'Правил пока нет.' }));
      return;
    }

    const numVars: [string, string][] = store.project.variables
      .filter((v) => v.type === 'number')
      .map((v) => [v.id, v.title]);

    const table = h('table', { class: 'vars-table' });
    const thead = h('tr');
    for (const t of ['Вкл', 'Название', 'Переменная', 'Прирост / мин', 'Потолок (макс)', 'Оффлайн', '']) {
      thead.appendChild(h('th', { text: t }));
    }
    table.appendChild(thead);

    for (const r of rules) {
      const tr = h('tr');
      const td = (el: HTMLElement, w?: string) => {
        const cell = h('td');
        if (w) cell.style.width = w;
        cell.append(el);
        tr.appendChild(cell);
      };
      const en = h('input', { type: 'checkbox', class: 'ed' }) as HTMLInputElement;
      en.checked = r.enabled;
      en.onchange = () => mutate(() => { r.enabled = en.checked; });
      td(en, '5%');
      td(textInput(r.title, (v) => mutate(() => { r.title = v; })), '22%');
      td(selectInput(r.varId, numVars, (v) => mutate(() => { r.varId = v; })), '18%');
      td(numberInput(r.ratePerMin, (v) => mutate(() => { r.ratePerMin = v; }), { step: '0.1' }), '13%');
      const maxIn = textInput(r.max !== undefined ? String(r.max) : '', (v) => mutate(() => {
        const n = parseFloat(v);
        r.max = Number.isNaN(n) ? undefined : n;
      }), { placeholder: 'без предела' });
      td(maxIn, '13%');
      const off = h('input', { type: 'checkbox', class: 'ed' }) as HTMLInputElement;
      off.checked = !!r.offline;
      off.onchange = () => mutate(() => { r.offline = off.checked; });
      td(off, '7%');
      const del = h('button', { class: 'btn small danger-ghost', text: '✕' });
      del.onclick = () => mutate(() => {
        store.project.idleRules = (store.project.idleRules ?? []).filter((x) => x.id !== r.id);
      });
      td(del, '4%');
      table.appendChild(tr);
    }
    root.appendChild(table);
  }

  store.on('change', render);
  store.on('project', render);
  render();
  return root;
}

function countUsages(store: Store, varId: string): number {
  let n = 0;
  const p = store.project;
  const scanConds = (c?: { varId: string }[]) => { c?.forEach((x) => { if (x.varId === varId) n++; }); };
  for (const s of p.scenes) {
    for (const el of s.elements) {
      scanConds(el.visibleIf);
      scanConds(el.action?.effects);
    }
  }
  for (const d of p.dialogues) {
    for (const nd of d.nodes) {
      scanConds(nd.conditions);
      scanConds(nd.effects);
      nd.choices?.forEach((c) => { scanConds(c.conditions); scanConds(c.effects); });
    }
  }
  return n;
}
