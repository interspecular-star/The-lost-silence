// ============================================================
// Режим «Персонажи»: фракции и NPC (веса, портреты, отношения)
// ============================================================

import { Store } from '../core/store';
import { NPC, NPCRelationship, Faction, FactionSkinId, FACTION_SKIN_LABELS, uid } from '../core/types';
import {
  createNPC, createFaction, deleteNPC, renameNPC, npcPortrait, npcFullPortrait,
} from '../core/npc';
import {
  h, textInput, numberInput, selectInput, textArea,
  promptModal, confirmModal, toast, pickImageFile, pickImageFileCompressed,
} from './ui';
import { openNPCImportPanel } from './npcImport';

export function mountNPCs(store: Store): HTMLElement {
  const root = h('div', { id: 'vars-wrap' }); // тот же скролл-контейнер, что у переменных
  const expanded = new Set<string>(); // id NPC с открытым блоком «Подробнее» (переживает перерисовку)

  const mutate = (fn: () => void) => { store.snapshot(); fn(); store.emit('change'); };

  const render = () => {
    root.innerHTML = '';
    renderFactions();
    renderNPCList();
  };

  // ---------- фракции ----------
  function renderFactions() {
    const head = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;' });
    head.appendChild(h('h2', { style: 'margin:0;font-size:16px;font-weight:600;', text: 'Фракции' }));
    const add = h('button', { class: 'btn accent', text: '+ Фракция' });
    add.onclick = async () => {
      const name = await promptModal('Название фракции', '', 'Например: Flux Nomads');
      if (!name) return;
      mutate(() => { createFaction(store.project, name, '#4fd1c5'); });
    };
    head.appendChild(add);
    root.appendChild(head);

    const factions = store.project.factions ?? [];
    if (factions.length === 0) {
      root.appendChild(h('div', { class: 'hint', text: 'Фракций пока нет. Репутация фракции считается из отношений её встреченных NPC.' }));
    }

    const table = h('table', { class: 'vars-table' });
    if (factions.length > 0) {
      const thead = h('tr');
      for (const t of ['Название', 'Цвет', 'Скин диалога', 'Модель голосов', 'Переменная репутации', 'NPC', '']) {
        thead.appendChild(h('th', { text: t }));
      }
      table.appendChild(thead);
    }
    for (const f of factions) {
      const tr = h('tr');
      const td = (el: HTMLElement | string, w?: string) => {
        const cell = h('td');
        if (w) cell.style.width = w;
        cell.append(el);
        tr.appendChild(cell);
      };
      td(textInput(f.name, (v) => mutate(() => {
        f.name = v;
        const rv = store.getVariable(f.repVarId);
        if (rv) rv.title = `Репутация: ${v}`;
      })), '22%');
      const colorWrap = h('div', { style: 'display:flex;gap:6px;align-items:center;' });
      const color = h('input', { class: 'ed', type: 'color', style: 'width:40px;flex:0 0 40px;' }) as HTMLInputElement;
      color.value = /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '#4fd1c5';
      color.onchange = () => mutate(() => { f.color = color.value; });
      colorWrap.appendChild(color);
      td(colorWrap, '8%');
      td(selectInput(f.skinId ?? '', [
        ['', '— как обычно —'],
        ...Object.entries(FACTION_SKIN_LABELS).map(([k, label]) => [k, label] as [string, string]),
      ], (v) => mutate(() => { f.skinId = (v || undefined) as FactionSkinId | undefined; })), '20%');
      td(selectInput(f.repMode, [
        ['weighted', 'иерархия (веса важны)'],
        ['equal', 'община (все равны)'],
      ], (v) => mutate(() => { f.repMode = v as Faction['repMode']; })), '22%');
      const rv = store.getVariable(f.repVarId);
      td(h('span', { class: 'var-name', text: rv ? `{${rv.name}}` : '—', title: 'Вычисляемая. Используйте в условиях и текстах.' }), '18%');
      const count = (store.project.npcs ?? []).filter((n) => n.factionId === f.id).length;
      td(h('span', { text: String(count) }), '6%');
      const del = h('button', { class: 'btn small danger-ghost', text: '✕' });
      del.onclick = async () => {
        if (count > 0) { toast('Сначала переведите NPC фракции в другие фракции', true); return; }
        if (!(await confirmModal('Удалить фракцию', `«${f.name}» будет удалена вместе с переменной репутации.`))) return;
        mutate(() => {
          store.project.factions = (store.project.factions ?? []).filter((x) => x.id !== f.id);
          store.project.variables = store.project.variables.filter((v) => v.id !== f.repVarId);
        });
      };
      td(del, '4%');
      table.appendChild(tr);
    }
    root.appendChild(table);
  }

  // ---------- NPC ----------
  function renderNPCList() {
    const head = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin:26px 0 6px;' });
    head.appendChild(h('h2', { style: 'margin:0;font-size:16px;font-weight:600;', text: 'Персонажи (NPC)' }));
    const btnRow = h('div', { style: 'display:flex;gap:6px;' });
    const add = h('button', { class: 'btn accent', text: '+ Персонаж' });
    add.onclick = async () => {
      const name = await promptModal('Имя персонажа', '', 'Например: Матис');
      if (!name) return;
      mutate(() => { createNPC(store.project, name, store.project.factions?.[0]?.id ?? null); });
    };
    btnRow.appendChild(add);
    const bulk = h('button', { class: 'btn', text: '⇩ Импорт JSON' });
    bulk.onclick = () => openNPCImportPanel(store);
    btnRow.appendChild(bulk);
    head.appendChild(btnRow);
    root.appendChild(head);
    root.appendChild(h('div', {
      class: 'hint', style: 'margin-bottom:14px;',
      text: 'Отношение (0–100) меняется эффектами в диалогах — переменная «Отношение: Имя». «Знаком» ставится автоматически при первой реплике NPC. Вес определяет вклад в репутацию фракции с моделью «иерархия».',
    }));

    const npcs = store.project.npcs ?? [];
    if (npcs.length === 0) {
      root.appendChild(h('div', { class: 'hint', text: 'Персонажей пока нет.' }));
      return;
    }

    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(430px,1fr));gap:12px;' });
    for (const npc of npcs) grid.appendChild(npcCard(npc));
    root.appendChild(grid);
  }

  function npcCard(npc: NPC): HTMLElement {
    const card = h('div', {
      style: `background:var(--bg-panel);border:1px solid var(--border);border-radius:10px;
        padding:12px;display:flex;gap:12px;`,
    });

    // портрет
    const portraitWrap = h('div', { style: 'flex:0 0 auto;display:flex;flex-direction:column;gap:6px;align-items:center;' });
    const img = h('img', {
      src: npcPortrait(store.project, npc),
      style: 'width:72px;height:72px;border-radius:10px;display:block;object-fit:cover;',
    }) as HTMLImageElement;
    portraitWrap.appendChild(img);
    const upBtn = h('button', { class: 'btn small', text: '📁', title: 'Загрузить портрет' });
    upBtn.onclick = async () => {
      const uri = await pickImageFile();
      if (uri) mutate(() => { npc.portrait = uri; });
    };
    const clearBtn = h('button', { class: 'btn small', text: '↺', title: 'Вернуть силуэт' });
    clearBtn.onclick = () => mutate(() => { npc.portrait = undefined; });
    const pRow = h('div', { style: 'display:flex;gap:4px;' });
    pRow.append(upBtn, ...(npc.portrait ? [clearBtn] : []));
    portraitWrap.appendChild(pRow);
    card.appendChild(portraitWrap);

    // поля
    const fields = h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;' });
    const row1 = h('div', { style: 'display:flex;gap:6px;' });
    const nameIn = textInput(npc.name, (v) => mutate(() => { renameNPC(store.project, npc, v); }));
    nameIn.style.fontWeight = '600';
    row1.appendChild(nameIn);
    const del = h('button', { class: 'btn small danger-ghost', text: '✕', title: 'Удалить NPC' });
    del.onclick = async () => {
      if (!(await confirmModal('Удалить персонажа', `«${npc.name}» и его переменные отношения будут удалены. Реплики в диалогах останутся (имя станет текстом).`))) return;
      mutate(() => { deleteNPC(store.project, npc.id); });
    };
    row1.appendChild(del);
    fields.appendChild(row1);

    const rowAgeRole = h('div', { style: 'display:flex;gap:6px;align-items:center;' });
    const ageIn = textInput(npc.age ?? '', (v) => mutate(() => { npc.age = v || undefined; }), { placeholder: 'возраст' });
    ageIn.style.width = '64px';
    ageIn.style.flex = '0 0 64px';
    rowAgeRole.appendChild(ageIn);
    const roleIn = textInput(npc.role ?? '', (v) => mutate(() => { npc.role = v || undefined; }), { placeholder: 'роль/должность' });
    roleIn.style.flex = '1';
    rowAgeRole.appendChild(roleIn);
    fields.appendChild(rowAgeRole);

    const row2 = h('div', { style: 'display:flex;gap:6px;align-items:center;' });
    const facOptions: [string, string][] = [
      ['', '— вне фракций —'],
      ...(store.project.factions ?? []).map((f) => [f.id, f.name] as [string, string]),
    ];
    row2.appendChild(selectInput(npc.factionId ?? '', facOptions, (v) => mutate(() => {
      npc.factionId = v || null;
      if (!npc.portrait) img.src = npcPortrait(store.project, npc);
    })));
    row2.appendChild(h('span', { style: 'color:var(--text-faint);font-size:11px;flex:0 0 auto;', text: 'вес:' }));
    const weightIn = numberInput(npc.weight, (v) => mutate(() => { npc.weight = Math.max(1, Math.min(10, Math.round(v))); }), { min: '1', max: '10' });
    weightIn.style.width = '72px';
    weightIn.style.flex = '0 0 72px';
    row2.appendChild(weightIn);
    fields.appendChild(row2);

    const relVar = store.getVariable(npc.relationVarId);
    const row3 = h('div', { style: 'display:flex;gap:6px;align-items:center;' });
    row3.appendChild(h('span', { style: 'color:var(--text-faint);font-size:11px;flex:0 0 auto;', text: 'старт. отношение:' }));
    const initIn = numberInput(Number(relVar?.initial ?? 0), (v) => mutate(() => {
      if (relVar) relVar.initial = Math.max(0, Math.min(100, v));
    }), { min: '0', max: '100' });
    initIn.style.width = '84px';
    initIn.style.flex = '0 0 84px';
    row3.appendChild(initIn);
    if (relVar) {
      row3.appendChild(h('span', { class: 'var-name', style: 'font-size:11px;overflow:hidden;text-overflow:ellipsis;', text: `{${relVar.name}}`, title: 'Имя переменной — для условий, эффектов и подстановки в текст' }));
    }
    fields.appendChild(row3);

    const desc = textArea(npc.description ?? '', (v) => mutate(() => { npc.description = v || undefined; }), 2);
    desc.placeholder = 'Заметки автора: кто это, где встречается…';
    fields.appendChild(desc);

    const isOpen = expanded.has(npc.id);
    const toggle = h('div', {
      style: 'cursor:pointer;color:var(--text-faint);font-size:11.5px;letter-spacing:0.5px;user-select:none;',
      text: isOpen ? '▾ Свернуть профиль' : '▸ Подробнее (профиль персонажа)',
    });
    toggle.onclick = () => {
      if (isOpen) expanded.delete(npc.id); else expanded.add(npc.id);
      render();
    };
    fields.appendChild(toggle);
    if (isOpen) fields.appendChild(npcProfileFields(npc));

    card.appendChild(fields);
    return card;
  }

  /** Поля глубокого профиля: полноростовой портрет, цитата, характер, связи с другими NPC */
  function npcProfileFields(npc: NPC): HTMLElement {
    const wrap = h('div', {
      style: 'display:flex;flex-direction:column;gap:8px;margin-top:4px;padding-top:8px;border-top:1px solid var(--border);',
    });

    const groupLabel = (text: string) => h('div', {
      style: 'color:var(--text-faint);font-size:11px;letter-spacing:0.5px;text-transform:uppercase;margin-top:6px;',
      text,
    });

    wrap.appendChild(groupLabel('Досье'));
    const fpRow = h('div', { style: 'display:flex;gap:10px;align-items:flex-start;' });
    const fpImg = h('img', {
      src: npcFullPortrait(store.project, npc),
      style: 'width:70px;height:110px;border-radius:6px;object-fit:cover;flex:0 0 auto;background:#05070a;',
    }) as HTMLImageElement;
    fpRow.appendChild(fpImg);
    const fpBtns = h('div', { style: 'display:flex;flex-direction:column;gap:4px;' });
    const fpUp = h('button', { class: 'btn small', text: '📁 Полноростовой портрет' });
    fpUp.onclick = async () => {
      const uri = await pickImageFileCompressed();
      if (uri) mutate(() => { npc.fullPortrait = uri; });
    };
    fpBtns.appendChild(fpUp);
    if (npc.fullPortrait) {
      const fpClear = h('button', { class: 'btn small danger-ghost', text: '✕ Убрать' });
      fpClear.onclick = () => mutate(() => { npc.fullPortrait = undefined; });
      fpBtns.appendChild(fpClear);
    }
    fpBtns.appendChild(h('div', {
      class: 'hint', style: 'max-width:220px;',
      text: 'Показывается на экране профиля (клик по портрету в диалоге или вкладка «Персонажи» в журнале). Сжимается автоматически.',
    }));
    fpRow.appendChild(fpBtns);
    wrap.appendChild(fpRow);

    const quote = textInput(npc.quote ?? '', (v) => mutate(() => { npc.quote = v || undefined; }));
    quote.placeholder = 'Цитата/девиз — задаёт голос персонажа';
    wrap.appendChild(quote);

    wrap.appendChild(groupLabel('Характер'));
    const personality = textArea(npc.personality ?? '', (v) => mutate(() => { npc.personality = v || undefined; }), 2);
    personality.placeholder = 'Характер';
    wrap.appendChild(personality);

    const strengths = textArea(npc.strengths ?? '', (v) => mutate(() => { npc.strengths = v || undefined; }), 2);
    strengths.placeholder = 'Сильные стороны';
    wrap.appendChild(strengths);

    const weaknesses = textArea(npc.weaknesses ?? '', (v) => mutate(() => { npc.weaknesses = v || undefined; }), 2);
    weaknesses.placeholder = 'Слабые стороны';
    wrap.appendChild(weaknesses);

    const fears = textArea(npc.fears ?? '', (v) => mutate(() => { npc.fears = v || undefined; }), 2);
    fears.placeholder = 'Страхи';
    wrap.appendChild(fears);

    const wants = textArea(npc.wants ?? '', (v) => mutate(() => { npc.wants = v || undefined; }), 2);
    wants.placeholder = 'Желания и мотивация — как искать подход';
    wrap.appendChild(wants);

    wrap.appendChild(groupLabel('Мировоззрение'));
    const archonView = textArea(npc.archonView ?? '', (v) => mutate(() => { npc.archonView = v || undefined; }), 2);
    archonView.placeholder = 'Отношение к Archon';
    wrap.appendChild(archonView);

    const oldnetView = textArea(npc.oldnetView ?? '', (v) => mutate(() => { npc.oldnetView = v || undefined; }), 2);
    oldnetView.placeholder = 'Отношение к OldNet';
    wrap.appendChild(oldnetView);

    wrap.appendChild(groupLabel('Связи'));
    const relList = h('div', { style: 'display:flex;flex-direction:column;gap:5px;' });
    const others = (store.project.npcs ?? []).filter((n) => n.id !== npc.id);
    const rels = npc.relationships ?? [];
    rels.forEach((rel, i) => {
      const card = h('div', { class: 'cond-card' });
      const row = h('div', { class: 'row' });
      row.appendChild(selectInput(rel.npcId, others.map((n) => [n.id, n.name] as [string, string]), (v) => {
        const copy = [...rels];
        copy[i] = { ...rel, npcId: v };
        mutate(() => { npc.relationships = copy; });
      }));
      row.appendChild(textInput(rel.label, (v) => {
        const copy = [...rels];
        copy[i] = { ...rel, label: v };
        mutate(() => { npc.relationships = copy; });
      }, { placeholder: 'напр. «доверяет», «избегает»' }));
      const del = h('button', { class: 'del', text: '✕' });
      del.onclick = () => mutate(() => { npc.relationships = rels.filter((_, j) => j !== i); });
      row.appendChild(del);
      card.appendChild(row);
      relList.appendChild(card);
    });
    wrap.appendChild(relList);
    const addRel = h('button', { class: 'btn small', text: '+ связь' });
    addRel.onclick = () => {
      if (others.length === 0) { toast('Сначала создайте ещё одного персонажа', true); return; }
      const rel: NPCRelationship = { id: uid('rel'), npcId: others[0].id, label: '' };
      mutate(() => { npc.relationships = [...rels, rel]; });
    };
    wrap.appendChild(addRel);

    return wrap;
  }

  store.on('change', render);
  store.on('project', render);
  render();
  return root;
}
