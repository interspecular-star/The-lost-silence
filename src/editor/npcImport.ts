// ============================================================
// Панель «Массовый импорт NPC»: вставка JSON-массива персонажей.
// Логика создания — src/core/npc.ts (importNPCs), общая с seed.ts.
// ============================================================

import { Store } from '../core/store';
import { NPCImportEntry, importNPCs } from '../core/npc';
import { h, selectInput, toast } from './ui';

export function openNPCImportPanel(store: Store) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const modal = h('div', { class: 'modal draft' });
  modal.appendChild(h('h3', { text: 'Массовый импорт персонажей' }));
  modal.appendChild(h('div', {
    class: 'hint',
    text: 'Вставьте JSON-массив объектов вида { name, age, role, personality, strengths, weaknesses, fears, '
      + 'wants, archonView, oldnetView, description, weight, faction, relationships: [{ npcName, label }] }. '
      + 'Все поля кроме name — не обязательны. «faction» — имя фракции (если не указано, применится выбранная ниже). '
      + '«relationships.npcName» ищется по имени среди всех персонажей проекта, включая создаваемых этим же импортом.',
  }));

  const facRow = h('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:8px;' });
  facRow.appendChild(h('span', { class: 'hint', text: 'Фракция по умолчанию:' }));
  let defaultFactionId: string | null = store.project.factions?.[0]?.id ?? null;
  const facOptions: [string, string][] = [
    ['', '— вне фракций —'],
    ...(store.project.factions ?? []).map((f) => [f.id, f.name] as [string, string]),
  ];
  facRow.appendChild(selectInput(defaultFactionId ?? '', facOptions, (v) => { defaultFactionId = v || null; }));
  modal.appendChild(facRow);

  const textarea = h('textarea', {
    class: 'ed draft-textarea',
    placeholder: '[\n  { "name": "Джаст Верден", "role": "Лидер", "age": "52", "faction": "Flux Nomads" }\n]',
  }) as HTMLTextAreaElement;
  modal.appendChild(textarea);

  const result = h('div', { class: 'hint', style: 'white-space:pre-line;max-height:120px;overflow-y:auto;' });
  modal.appendChild(result);

  const actions = h('div', { class: 'modal-actions' });
  const cancel = h('button', { class: 'btn', text: 'Закрыть' });
  cancel.onclick = () => backdrop.remove();
  const apply = h('button', { class: 'btn accent', text: 'Импортировать' });
  apply.onclick = () => {
    let entries: NPCImportEntry[];
    try {
      const parsed = JSON.parse(textarea.value);
      if (!Array.isArray(parsed)) throw new Error('ожидался массив');
      entries = parsed as NPCImportEntry[];
    } catch (e) {
      toast(`Не удалось разобрать JSON: ${(e as Error).message}`, true);
      return;
    }
    store.snapshot();
    const res = importNPCs(store.project, entries, defaultFactionId);
    store.emit('change');
    result.textContent = `Создано: ${res.created}` + (res.warnings.length ? `\n${res.warnings.join('\n')}` : '');
    toast(`Импортировано персонажей: ${res.created}`);
  };
  actions.append(cancel, apply);
  modal.appendChild(actions);

  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  textarea.focus();
}
