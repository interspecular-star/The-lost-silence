// ============================================================
// Режим «Черновик»: правка диалога одним большим текстом вместо
// клика по каждой ноде. Строит/обновляет ТОЛЬКО линейную цепочку
// line/choice от начала диалога — branch/jump/set и развилки
// не трогает (см. docs/dev/roadmap.md, блок F1).
// ============================================================

import { Store } from '../core/store';
import { Dialogue, DialogueNode, NPC, NODE_TYPE_LABELS, uid } from '../core/types';
import { h, confirmModal } from './ui';

interface ChainInfo {
  nodeIds: string[];          // ноды простой цепочки от startNodeId, в порядке обхода
  tailNextId: string | null;  // куда вело то, что не тронули (или null — чистый конец)
  incompatible?: string;      // причина, почему цепочка оборвалась раньше конца диалога
}

/** Проходит диалог от startNodeId, пока ноды простые (line/choice со сходящимися вариантами) */
export function analyzeDraftableChain(dlg: Dialogue): ChainInfo {
  const byId = new Map(dlg.nodes.map((n) => [n.id, n]));
  const nodeIds: string[] = [];
  const visited = new Set<string>();
  let curId = dlg.startNodeId;

  while (curId) {
    if (visited.has(curId)) {
      return { nodeIds, tailNextId: null, incompatible: 'В диалоге обнаружен цикл — черновик остановился, чтобы не зациклиться.' };
    }
    visited.add(curId);
    const n = byId.get(curId);
    if (!n) break; // битая ссылка — считаем чистым концом

    if (n.type === 'line') {
      nodeIds.push(n.id);
      curId = n.next ?? null;
      continue;
    }
    if (n.type === 'end') {
      nodeIds.push(n.id);
      curId = null;
      continue;
    }
    if (n.type === 'choice') {
      const choices = n.choices ?? [];
      const allSimple = choices.length > 0 && choices.every((c) => c.conditions.length === 0 && c.effects.length === 0);
      const nexts = new Set(choices.map((c) => c.next ?? null));
      if (!allSimple || nexts.size > 1) {
        return {
          nodeIds, tailNextId: n.id,
          incompatible: 'Дальше — варианты ответа с условиями/эффектами или расходящимися путями. Черновик их не показывает и не трогает.',
        };
      }
      nodeIds.push(n.id);
      curId = [...nexts][0];
      continue;
    }
    // branch / jump / set — не понимаем, останавливаемся ДО этой ноды
    return {
      nodeIds, tailNextId: n.id,
      incompatible: `Дальше в диалоге есть нода «${NODE_TYPE_LABELS[n.type]}» — черновик её не показывает и не трогает.`,
    };
  }
  return { nodeIds, tailNextId: null };
}

/** Ноды простой цепочки → текст черновика */
export function serializeDraftText(dlg: Dialogue, npcs: NPC[], chain: ChainInfo): string {
  const byId = new Map(dlg.nodes.map((n) => [n.id, n]));
  const npcById = new Map(npcs.map((n) => [n.id, n]));
  const blocks: string[] = [];
  for (const id of chain.nodeIds) {
    const n = byId.get(id);
    if (!n || n.type === 'end') continue;
    if (n.type === 'line') {
      const speakerName = n.speakerNpcId ? npcById.get(n.speakerNpcId)?.name : n.speaker;
      blocks.push(speakerName ? `${speakerName}: ${n.text ?? ''}` : (n.text ?? ''));
    } else if (n.type === 'choice') {
      blocks.push((n.choices ?? []).map((c) => `> ${c.text}`).join('\n'));
    }
  }
  return blocks.join('\n\n');
}

interface DraftBlock {
  kind: 'line' | 'choice';
  speaker?: string;
  text?: string;
  choices?: string[];
}

/** Текст черновика → блоки (построчный разбор, пустая строка — разделитель) */
export function parseDraftText(text: string): DraftBlock[] {
  const rawBlocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return rawBlocks.map((raw) => {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0 && lines.every((l) => l.startsWith('>'))) {
      return { kind: 'choice', choices: lines.map((l) => l.replace(/^>\s*/, '')) } satisfies DraftBlock;
    }
    const m = lines[0]?.match(/^([^:\n]{1,40}):\s*(.*)$/);
    if (m) {
      const rest = lines.slice(1).join('\n\n');
      return { kind: 'line', speaker: m[1].trim(), text: [m[2], rest].filter(Boolean).join('\n\n') } satisfies DraftBlock;
    }
    return { kind: 'line', text: lines.join('\n\n') } satisfies DraftBlock;
  });
}

/** Применяет текст черновика: заменяет ТОЛЬКО простую цепочку от начала, остальное не трогает */
export function applyDraftToDialogue(store: Store, dlg: Dialogue, text: string) {
  const chain = analyzeDraftableChain(dlg);
  const blocks = parseDraftText(text);
  const npcByName = new Map((store.project.npcs ?? []).map((n) => [n.name, n]));

  store.snapshot();
  const removeSet = new Set(chain.nodeIds);
  dlg.nodes = dlg.nodes.filter((n) => !removeSet.has(n.id));

  const newNodes: DialogueNode[] = blocks.map((b, i) => {
    if (b.kind === 'choice') {
      return {
        id: uid('nd'), type: 'choice', x: 120, y: 120 + i * 160,
        choices: (b.choices ?? []).map((t) => ({ id: uid('ch'), text: t, conditions: [], effects: [], next: null })),
      };
    }
    const npc = b.speaker ? npcByName.get(b.speaker) : undefined;
    return {
      id: uid('nd'), type: 'line', x: 120, y: 120 + i * 160,
      speaker: npc ? undefined : b.speaker,
      speakerNpcId: npc?.id,
      text: b.text ?? '',
      next: null,
    };
  });

  for (let i = 0; i < newNodes.length - 1; i++) {
    const n = newNodes[i];
    const nextId = newNodes[i + 1].id;
    if (n.type === 'line') n.next = nextId;
    else if (n.type === 'choice') n.choices!.forEach((c) => { c.next = nextId; });
  }
  const last = newNodes[newNodes.length - 1];
  if (last) {
    if (last.type === 'line') last.next = chain.tailNextId;
    else if (last.type === 'choice') last.choices!.forEach((c) => { c.next = chain.tailNextId; });
  }

  dlg.nodes.push(...newNodes);
  dlg.startNodeId = newNodes[0]?.id ?? chain.tailNextId ?? null;

  store.emit('change');
}

// ---------- панель ----------

export async function openDraftPanel(store: Store, dialogueId: string) {
  const dlg = store.getDialogue(dialogueId);
  if (!dlg) return;
  const chain = analyzeDraftableChain(dlg);
  const initialText = serializeDraftText(dlg, store.project.npcs ?? [], chain);

  const backdrop = h('div', { class: 'modal-backdrop' });
  const modal = h('div', { class: 'modal draft' });
  modal.appendChild(h('h3', { text: `Черновик — ${dlg.name}` }));
  modal.appendChild(h('div', {
    class: 'hint',
    text: 'Формат: «Имя: текст» — реплика (Имя должно совпадать с персонажем, иначе это просто подпись). '
      + 'Строки, начинающиеся с «>», — варианты ответа одной развилки. Пустая строка разделяет реплики/развилки. '
      + 'Строится и обновляется только простая линейная цепочка от начала диалога — ветвления, условия и действия по-прежнему делаются в графе.',
  }));

  if (chain.incompatible) {
    modal.appendChild(h('div', {
      class: 'hint', style: 'color:var(--warn);',
      text: `⚠ ${chain.incompatible}`,
    }));
  }

  const textarea = h('textarea', {
    class: 'ed draft-textarea',
    placeholder: 'Матис: Проспал?.. Друг, на дворе 2670-е.\n\n> Кто ты?\n> Где я?',
  }) as HTMLTextAreaElement;
  textarea.value = initialText;
  modal.appendChild(textarea);

  const actions = h('div', { class: 'modal-actions' });
  const cancel = h('button', { class: 'btn', text: 'Отмена' });
  cancel.onclick = () => backdrop.remove();
  const apply = h('button', { class: 'btn accent', text: chain.nodeIds.length ? 'Обновить ноды' : 'Создать ноды' });
  apply.onclick = async () => {
    if (chain.incompatible) {
      const ok = await confirmModal(
        'Обновить ноды',
        `${chain.incompatible}\n\nОстальная часть диалога не изменится. Заменить простую цепочку текстом из черновика?`,
      );
      if (!ok) return;
    }
    applyDraftToDialogue(store, dlg, textarea.value);
    backdrop.remove();
  };
  actions.append(cancel, apply);
  modal.appendChild(actions);

  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  textarea.focus();
}
