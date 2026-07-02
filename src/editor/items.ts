// ============================================================
// Режим «Предметы»: настройка героя + карточки предметов
// ============================================================

import { Store } from '../core/store';
import {
  ItemDef, ItemType, ItemSlot, Rarity, uid, deepClone,
  ITEM_TYPE_LABELS, ITEM_SLOT_LABELS, RARITY_META, STAT_LABELS, StatKey,
} from '../core/types';
import { ensureHeroSystem, defaultHeroConfig, itemIcon, STAT_KEYS } from '../core/hero';
import {
  h, textInput, numberInput, selectInput, textArea, checkbox,
  promptModal, confirmModal, toast, pickImageFile,
} from './ui';

export function mountItems(store: Store): HTMLElement {
  const root = h('div', { id: 'vars-wrap' });
  const mutate = (fn: () => void) => { store.snapshot(); fn(); store.emit('change'); };

  const render = () => {
    root.innerHTML = '';
    renderHero();
    renderItems();
  };

  // ---------- герой ----------
  function renderHero() {
    const head = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;' });
    head.appendChild(h('h2', { style: 'margin:0;font-size:16px;font-weight:600;', text: 'Герой и характеристики' }));
    root.appendChild(head);

    if (!store.project.hero) {
      const enable = h('button', { class: 'btn accent', text: '⚡ Включить систему героя в проекте' });
      enable.onclick = () => mutate(() => { ensureHeroSystem(store.project); });
      root.appendChild(enable);
      root.appendChild(h('div', { class: 'hint', style: 'margin-top:8px;', text: 'Создаст переменные lvl/exp/hp/foc и вычисляемые характеристики (atk, def…). Появятся HUD-полосы и инвентарь 🎒 в игре (кроме сцен-страниц).' }));
      return;
    }
    const hero = store.project.hero;

    root.appendChild(h('div', {
      class: 'hint', style: 'margin-bottom:10px;',
      text: 'Характеристика = база + рост × (уровень − 1) + бонусы экипировки. Опыт до уровня: 100 × уровень^1.5. Реген идёт вне боя. В условиях/текстах доступны {lvl} {exp} {hp} {foc} {atk} {def} {agi} {endur} {crit_pow} {crit_chance} {hp_max} {foc_max} {exp_need}.',
    }));

    const table = h('table', { class: 'vars-table' });
    const thead = h('tr');
    for (const t of ['Характеристика', 'База (ур.1)', 'Рост за уровень']) thead.appendChild(h('th', { text: t }));
    table.appendChild(thead);
    for (const k of STAT_KEYS) {
      const tr = h('tr');
      const td = (el: HTMLElement | string) => { const c = h('td'); c.append(el); tr.appendChild(c); };
      td(h('span', { text: STAT_LABELS[k] }));
      td(numberInput(hero.baseStats[k] ?? 0, (v) => mutate(() => { hero.baseStats[k] = v; })));
      td(numberInput(hero.growth[k] ?? 0, (v) => mutate(() => { hero.growth[k] = v || undefined; })));
      table.appendChild(tr);
    }
    root.appendChild(table);

    const grid = h('div', { style: 'display:flex;gap:18px;margin-top:10px;flex-wrap:wrap;align-items:center;' });
    const small = (label: string, input: HTMLElement) => {
      const w = h('div', { style: 'display:flex;align-items:center;gap:6px;' });
      w.appendChild(h('span', { style: 'color:var(--text-dim);font-size:12px;', text: label }));
      input.style.width = '70px';
      w.appendChild(input);
      return w;
    };
    grid.appendChild(small('Базовые ячейки:', numberInput(hero.baseCells, (v) => mutate(() => { hero.baseCells = Math.max(1, Math.round(v)); }))));
    grid.appendChild(small('+ячеек за выносливость:', numberInput(hero.cellsPerEndur, (v) => mutate(() => { hero.cellsPerEndur = v; }))));
    grid.appendChild(small('Реген HP/сек:', numberInput(hero.regenHp, (v) => mutate(() => { hero.regenHp = v; }))));
    grid.appendChild(small('Реген фокуса/сек:', numberInput(hero.regenFoc, (v) => mutate(() => { hero.regenFoc = v; }))));
    root.appendChild(grid);

    // стартовые предметы
    root.appendChild(h('div', { class: 'insp-section-title', style: 'margin-top:16px;', text: 'Стартовый инвентарь (новая игра)' }));
    const items = store.project.items ?? [];
    const list = h('div', { style: 'display:flex;flex-direction:column;gap:6px;max-width:520px;' });
    hero.startItems.forEach((g, i) => {
      const rowEl = h('div', { style: 'display:flex;gap:6px;align-items:center;' });
      rowEl.appendChild(selectInput(g.itemId, items.map((it) => [it.id, it.name] as [string, string]),
        (v) => mutate(() => { g.itemId = v; })));
      const qty = numberInput(g.qty, (v) => mutate(() => { g.qty = Math.max(1, Math.round(v)); }));
      qty.style.width = '64px';
      qty.style.flex = '0 0 64px';
      rowEl.appendChild(qty);
      const del = h('button', { class: 'btn small danger-ghost', text: '✕' });
      del.onclick = () => mutate(() => { hero.startItems.splice(i, 1); });
      rowEl.appendChild(del);
      list.appendChild(rowEl);
    });
    const add = h('button', { class: 'btn small', text: '+ предмет', style: 'align-self:flex-start;' });
    add.onclick = () => {
      if (items.length === 0) { toast('Сначала создайте предмет ниже', true); return; }
      mutate(() => { hero.startItems.push({ itemId: items[0].id, qty: 1 }); });
    };
    list.appendChild(add);
    root.appendChild(list);
  }

  // ---------- предметы ----------
  function renderItems() {
    const head = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin:28px 0 8px;' });
    head.appendChild(h('h2', { style: 'margin:0;font-size:16px;font-weight:600;', text: 'Предметы' }));
    const add = h('button', { class: 'btn accent', text: '+ Предмет' });
    add.onclick = async () => {
      const name = await promptModal('Название предмета', '', 'Например: Резак Матиса');
      if (!name) return;
      mutate(() => {
        store.project.items = store.project.items ?? [];
        store.project.items.push({
          id: uid('item'), name, type: 'resource', rarity: 'junk', price: 0,
        });
      });
    };
    head.appendChild(add);
    root.appendChild(head);

    const items = store.project.items ?? [];
    if (items.length === 0) {
      root.appendChild(h('div', { class: 'hint', text: 'Предметов пока нет. Выдавайте их через действие элемента или ноду «Действие» в диалоге.' }));
      return;
    }
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(470px,1fr));gap:12px;' });
    for (const item of items) grid.appendChild(itemCard(item));
    root.appendChild(grid);
  }

  function itemCard(item: ItemDef): HTMLElement {
    const card = h('div', {
      style: `background:var(--bg-panel);border:1px solid ${RARITY_META[item.rarity].color}44;
        border-radius:10px;padding:12px;display:flex;gap:12px;`,
    });

    // иконка
    const iconWrap = h('div', { style: 'flex:0 0 auto;display:flex;flex-direction:column;gap:6px;align-items:center;' });
    const img = h('img', {
      src: itemIcon(item),
      style: 'width:64px;height:64px;border-radius:9px;display:block;object-fit:cover;',
    }) as HTMLImageElement;
    iconWrap.appendChild(img);
    const up = h('button', { class: 'btn small', text: '📁', title: 'Загрузить иконку' });
    up.onclick = async () => {
      const uri = await pickImageFile();
      if (uri) mutate(() => { item.icon = uri; });
    };
    const reset = h('button', { class: 'btn small', text: '↺', title: 'Авто-иконка' });
    reset.onclick = () => mutate(() => { item.icon = undefined; });
    const iRow = h('div', { style: 'display:flex;gap:4px;' });
    iRow.append(up, ...(item.icon ? [reset] : []));
    iconWrap.appendChild(iRow);
    card.appendChild(iconWrap);

    // поля
    const f = h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;' });

    const row1 = h('div', { style: 'display:flex;gap:6px;' });
    const nameIn = textInput(item.name, (v) => mutate(() => { item.name = v; }));
    nameIn.style.fontWeight = '600';
    row1.appendChild(nameIn);
    const dup = h('button', { class: 'btn small', text: '⧉', title: 'Дублировать' });
    dup.onclick = () => mutate(() => {
      const copy = deepClone(item);
      copy.id = uid('item');
      copy.name = item.name + ' (копия)';
      store.project.items!.push(copy);
    });
    row1.appendChild(dup);
    const del = h('button', { class: 'btn small danger-ghost', text: '✕', title: 'Удалить' });
    del.onclick = async () => {
      if (!(await confirmModal('Удалить предмет', `«${item.name}» будет удалён. Выдачи этого предмета в сценах/диалогах перестанут работать.`))) return;
      mutate(() => {
        store.project.items = (store.project.items ?? []).filter((x) => x.id !== item.id);
        if (store.project.hero) {
          store.project.hero.startItems = store.project.hero.startItems.filter((g) => g.itemId !== item.id);
        }
      });
    };
    row1.appendChild(del);
    f.appendChild(row1);

    const row2 = h('div', { style: 'display:flex;gap:6px;' });
    row2.appendChild(selectInput(item.type, Object.entries(ITEM_TYPE_LABELS) as [string, string][], (v) => mutate(() => {
      item.type = v as ItemType;
      if (item.type === 'consumable' || item.type === 'resource') item.slot = undefined;
      else if (!item.slot) item.slot = item.type === 'weapon' ? 'weapon' : item.type === 'gadget' ? 'gadget' : 'body';
    })));
    row2.appendChild(selectInput(item.rarity, (Object.keys(RARITY_META) as Rarity[]).map((r) => [r, RARITY_META[r].label] as [string, string]),
      (v) => mutate(() => { item.rarity = v as Rarity; })));
    if (item.type === 'weapon' || item.type === 'armor' || item.type === 'gadget') {
      row2.appendChild(selectInput(item.slot ?? 'body', Object.entries(ITEM_SLOT_LABELS) as [string, string][],
        (v) => mutate(() => { item.slot = v as ItemSlot; })));
    }
    f.appendChild(row2);

    const row3 = h('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;' });
    const mkNum = (label: string, val: number, fn: (v: number) => void) => {
      const w = h('div', { style: 'display:flex;align-items:center;gap:4px;' });
      w.appendChild(h('span', { style: 'color:var(--text-faint);font-size:11px;', text: label }));
      const inp = numberInput(val, fn);
      inp.style.width = '64px';
      w.appendChild(inp);
      return w;
    };
    row3.appendChild(mkNum('цена:', item.price, (v) => mutate(() => { item.price = v; })));
    row3.appendChild(mkNum('стек:', item.stack ?? 1, (v) => mutate(() => { item.stack = v > 1 ? Math.round(v) : undefined; })));
    if (item.type === 'armor' || item.type === 'gadget') {
      row3.appendChild(mkNum('+ячейки:', item.cellsBonus ?? 0, (v) => mutate(() => { item.cellsBonus = v || undefined; })));
    }
    row3.appendChild(checkbox(!!item.questItem, (v) => mutate(() => { item.questItem = v || undefined; }), 'квестовый'));
    f.appendChild(row3);

    // бонусы характеристик (для экипируемых)
    if (item.slot) {
      const statsGrid = h('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px 8px;' });
      for (const k of STAT_KEYS) {
        const w = h('div', { style: 'display:flex;flex-direction:column;gap:2px;' });
        w.appendChild(h('span', { style: 'font-size:10px;color:var(--text-faint);', text: STAT_LABELS[k] }));
        const inp = numberInput(item.stats?.[k] ?? 0, (v) => mutate(() => {
          item.stats = item.stats ?? {};
          if (v) item.stats[k] = v; else delete item.stats[k];
        }));
        inp.style.padding = '3px 6px';
        w.appendChild(inp);
        statsGrid.appendChild(w);
      }
      f.appendChild(statsGrid);
    }

    // эффекты расходника
    if (item.type === 'consumable') {
      f.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);', text: 'Эффекты при использовании (например hp +30):' }));
      f.appendChild(effectsMini(item));
    }

    const desc = textArea(item.description ?? '', (v) => mutate(() => { item.description = v || undefined; }), 2);
    desc.placeholder = 'Описание (видно в подсказке предмета)…';
    f.appendChild(desc);

    card.appendChild(f);
    return card;
  }

  // компактный редактор эффектов расходника
  function effectsMini(item: ItemDef): HTMLElement {
    const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:4px;' });
    const vars = store.project.variables.filter((v) => v.category !== 'computed' && v.type === 'number');
    (item.useEffects ?? []).forEach((e, i) => {
      const r = h('div', { style: 'display:flex;gap:4px;align-items:center;' });
      r.appendChild(selectInput(e.varId, vars.map((v) => [v.id, v.title] as [string, string]), (v) => mutate(() => { e.varId = v; })));
      r.appendChild(selectInput(e.op, [['add', '+'], ['sub', '−'], ['set', '=']], (v) => mutate(() => { e.op = v as typeof e.op; })));
      const val = numberInput(Number(e.value) || 0, (v) => mutate(() => { e.value = v; }));
      val.style.width = '70px';
      r.appendChild(val);
      const del = h('button', { class: 'btn small danger-ghost', text: '✕' });
      del.onclick = () => mutate(() => { item.useEffects!.splice(i, 1); });
      r.appendChild(del);
      wrap.appendChild(r);
    });
    const add = h('button', { class: 'btn small', text: '+ эффект', style: 'align-self:flex-start;' });
    add.onclick = () => {
      const hp = store.project.variables.find((v) => v.name === 'hp') ?? vars[0];
      if (!hp) { toast('Нет числовых переменных', true); return; }
      mutate(() => {
        item.useEffects = item.useEffects ?? [];
        item.useEffects.push({ varId: hp.id, op: 'add', value: 10 });
      });
    };
    wrap.appendChild(add);
    return wrap;
  }

  store.on('change', render);
  store.on('project', render);
  render();
  return root;
}
