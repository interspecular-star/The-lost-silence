// ============================================================
// Режим «Мобы»: карточки противников для QTE-боёв
// ============================================================

import { Store } from '../core/store';
import { MobDef, uid, deepClone } from '../core/types';
import { mobIcon } from '../core/hero';
import {
  h, textInput, numberInput, selectInput, textArea,
  promptModal, confirmModal, toast, pickImageFile,
} from './ui';

export function mountMobs(store: Store): HTMLElement {
  const root = h('div', { id: 'vars-wrap' });
  const mutate = (fn: () => void) => { store.snapshot(); fn(); store.emit('change'); };

  const render = () => {
    root.innerHTML = '';
    const head = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;' });
    head.appendChild(h('h2', { style: 'margin:0;font-size:16px;font-weight:600;', text: 'Мобы (противники)' }));
    const add = h('button', { class: 'btn accent', text: '+ Моб' });
    add.onclick = async () => {
      const name = await promptModal('Название моба', '', 'Например: Сорванный дрон');
      if (!name) return;
      mutate(() => {
        store.project.mobs = store.project.mobs ?? [];
        store.project.mobs.push({
          id: uid('mob'), name, hp: 50, atk: 8, def: 2, telegraphMs: 1400,
          expReward: 30, drops: [],
        });
      });
    };
    head.appendChild(add);
    root.appendChild(head);
    root.appendChild(h('div', {
      class: 'hint', style: 'margin-bottom:12px;',
      text: 'Бой запускается действием элемента «Начать бой». Замах (мс) — сколько длится полоса перед ударом: меньше — сложнее. Ловкость героя расширяет окно реакции (350 + ловкость × 15 мс), парирование — 45% от окна уклона.',
    }));

    const mobs = store.project.mobs ?? [];
    if (mobs.length === 0) {
      root.appendChild(h('div', { class: 'hint', text: 'Мобов пока нет. По лору 2670-го это дроны, автоматика мёртвых узлов, фауна биосфер и аномалии — не люди.' }));
      return;
    }
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(470px,1fr));gap:12px;' });
    for (const mob of mobs) grid.appendChild(mobCard(mob));
    root.appendChild(grid);
  };

  function mobCard(mob: MobDef): HTMLElement {
    const card = h('div', {
      style: `background:var(--bg-panel);border:1px solid rgba(224,108,117,0.3);
        border-radius:10px;padding:12px;display:flex;gap:12px;`,
    });

    const iconWrap = h('div', { style: 'flex:0 0 auto;display:flex;flex-direction:column;gap:6px;align-items:center;' });
    const img = h('img', {
      src: mobIcon(mob),
      style: 'width:72px;height:72px;border-radius:10px;display:block;object-fit:cover;',
    }) as HTMLImageElement;
    iconWrap.appendChild(img);
    const up = h('button', { class: 'btn small', text: '📁', title: 'Загрузить изображение' });
    up.onclick = async () => {
      const uri = await pickImageFile();
      if (uri) mutate(() => { mob.icon = uri; });
    };
    const reset = h('button', { class: 'btn small', text: '↺', title: 'Авто-иконка' });
    reset.onclick = () => mutate(() => { mob.icon = undefined; });
    const iRow = h('div', { style: 'display:flex;gap:4px;' });
    iRow.append(up, ...(mob.icon ? [reset] : []));
    iconWrap.appendChild(iRow);
    card.appendChild(iconWrap);

    const f = h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;' });

    const row1 = h('div', { style: 'display:flex;gap:6px;' });
    const nameIn = textInput(mob.name, (v) => mutate(() => { mob.name = v; }));
    nameIn.style.fontWeight = '600';
    row1.appendChild(nameIn);
    const dup = h('button', { class: 'btn small', text: '⧉', title: 'Дублировать' });
    dup.onclick = () => mutate(() => {
      const copy = deepClone(mob);
      copy.id = uid('mob');
      copy.name = mob.name + ' (копия)';
      store.project.mobs!.push(copy);
    });
    row1.appendChild(dup);
    const del = h('button', { class: 'btn small danger-ghost', text: '✕' });
    del.onclick = async () => {
      if (!(await confirmModal('Удалить моба', `«${mob.name}» будет удалён.`))) return;
      mutate(() => { store.project.mobs = (store.project.mobs ?? []).filter((m) => m.id !== mob.id); });
    };
    row1.appendChild(del);
    f.appendChild(row1);

    const mkNum = (label: string, val: number, fn: (v: number) => void, w = '64px') => {
      const wr = h('div', { style: 'display:flex;align-items:center;gap:4px;' });
      wr.appendChild(h('span', { style: 'color:var(--text-faint);font-size:11px;', text: label }));
      const inp = numberInput(val, fn);
      inp.style.width = w;
      wr.appendChild(inp);
      return wr;
    };
    const row2 = h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;' });
    row2.appendChild(mkNum('HP:', mob.hp, (v) => mutate(() => { mob.hp = Math.max(1, Math.round(v)); })));
    row2.appendChild(mkNum('урон:', mob.atk, (v) => mutate(() => { mob.atk = Math.max(0, v); })));
    row2.appendChild(mkNum('защита:', mob.def, (v) => mutate(() => { mob.def = Math.max(0, v); })));
    row2.appendChild(mkNum('замах, мс:', mob.telegraphMs, (v) => mutate(() => { mob.telegraphMs = Math.max(400, Math.round(v)); }), '78px'));
    row2.appendChild(mkNum('крит %:', mob.critChance ?? 0, (v) => mutate(() => { mob.critChance = v || undefined; })));
    f.appendChild(row2);

    const row3 = h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;' });
    row3.appendChild(mkNum('опыт:', mob.expReward, (v) => mutate(() => { mob.expReward = Math.max(0, Math.round(v)); })));
    row3.appendChild(mkNum('кредиты:', mob.creditsReward ?? 0, (v) => mutate(() => { mob.creditsReward = v > 0 ? Math.round(v) : undefined; })));
    f.appendChild(row3);

    // дроп
    f.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);margin-top:2px;', text: 'Дроп (шанс в %):' }));
    const items = store.project.items ?? [];
    const drops = h('div', { style: 'display:flex;flex-direction:column;gap:4px;' });
    mob.drops.forEach((d, i) => {
      const r = h('div', { style: 'display:flex;gap:4px;align-items:center;' });
      r.appendChild(selectInput(d.itemId, items.map((it) => [it.id, it.name] as [string, string]),
        (v) => mutate(() => { d.itemId = v; })));
      const qty = numberInput(d.qty, (v) => mutate(() => { d.qty = Math.max(1, Math.round(v)); }));
      qty.style.width = '54px'; qty.title = 'Количество';
      r.appendChild(qty);
      const ch = numberInput(d.chance, (v) => mutate(() => { d.chance = Math.max(0, Math.min(100, v)); }));
      ch.style.width = '58px'; ch.title = 'Шанс %';
      r.appendChild(ch);
      const del2 = h('button', { class: 'btn small danger-ghost', text: '✕' });
      del2.onclick = () => mutate(() => { mob.drops.splice(i, 1); });
      r.appendChild(del2);
      drops.appendChild(r);
    });
    const addDrop = h('button', { class: 'btn small', text: '+ дроп', style: 'align-self:flex-start;' });
    addDrop.onclick = () => {
      if (items.length === 0) { toast('Сначала создайте предмет (режим «Предметы»)', true); return; }
      mutate(() => { mob.drops.push({ itemId: items[0].id, qty: 1, chance: 50 }); });
    };
    drops.appendChild(addDrop);
    f.appendChild(drops);

    const desc = textArea(mob.description ?? '', (v) => mutate(() => { mob.description = v || undefined; }), 2);
    desc.placeholder = 'Заметки: где встречается, паттерн поведения…';
    f.appendChild(desc);

    card.appendChild(f);
    return card;
  }

  store.on('change', render);
  store.on('project', render);
  render();
  return root;
}
