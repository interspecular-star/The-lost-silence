// ============================================================
// Логика NPC и фракций: авто-переменные, формула репутации,
// генерация портретов-плейсхолдеров.
// Используется и редактором, и движком.
// ============================================================

import { Project, Faction, NPC, VariableDef, VarValue, uid } from './types';

// ---------- создание с авто-переменными ----------

function slugify(name: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
    э: 'e', ю: 'yu', я: 'ya',
  };
  const s = name.toLowerCase().split('').map((ch) => map[ch] ?? ch).join('');
  return s.replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'x';
}

function uniqueVarName(project: Project, base: string): string {
  let name = base;
  let i = 2;
  while (project.variables.some((v) => v.name === name)) name = `${base}${i++}`;
  return name;
}

/** Создаёт NPC вместе с авто-переменными отношения и знакомства */
export function createNPC(project: Project, name: string, factionId: string | null): NPC {
  const slug = slugify(name);
  const relVar: VariableDef = {
    id: uid('var'), name: uniqueVarName(project, `rel_${slug}`),
    title: `Отношение: ${name}`, type: 'number', initial: 0, category: 'npc',
  };
  const metVar: VariableDef = {
    id: uid('var'), name: uniqueVarName(project, `met_${slug}`),
    title: `Знаком: ${name}`, type: 'boolean', initial: false, category: 'npc',
  };
  project.variables.push(relVar, metVar);
  const npc: NPC = {
    id: uid('npc'), name, factionId, weight: 1,
    relationVarId: relVar.id, metVarId: metVar.id,
  };
  project.npcs = project.npcs ?? [];
  project.npcs.push(npc);
  return npc;
}

/** Создаёт фракцию вместе с вычисляемой переменной репутации */
export function createFaction(project: Project, name: string, color: string): Faction {
  const repVar: VariableDef = {
    id: uid('var'), name: uniqueVarName(project, `frep_${slugify(name)}`),
    title: `Репутация: ${name}`, type: 'number', initial: 0, category: 'computed',
    description: 'Вычисляется из отношений встреченных NPC фракции',
  };
  project.variables.push(repVar);
  const faction: Faction = {
    id: uid('fac'), name, color, repMode: 'weighted', repVarId: repVar.id,
  };
  project.factions = project.factions ?? [];
  project.factions.push(faction);
  return faction;
}

/** Удаляет NPC и его авто-переменные */
export function deleteNPC(project: Project, npcId: string) {
  const npc = project.npcs?.find((n) => n.id === npcId);
  if (!npc) return;
  project.npcs = (project.npcs ?? []).filter((n) => n.id !== npcId);
  project.variables = project.variables.filter(
    (v) => v.id !== npc.relationVarId && v.id !== npc.metVarId,
  );
  // подчистить ссылки из реплик
  for (const d of project.dialogues) {
    for (const node of d.nodes) {
      if (node.speakerNpcId === npcId) {
        node.speakerNpcId = null;
        if (!node.speaker) node.speaker = npc.name;
      }
    }
  }
}

/** Переименование NPC — обновляет заголовки авто-переменных */
export function renameNPC(project: Project, npc: NPC, name: string) {
  npc.name = name;
  const rel = project.variables.find((v) => v.id === npc.relationVarId);
  if (rel) rel.title = `Отношение: ${name}`;
  const met = project.variables.find((v) => v.id === npc.metVarId);
  if (met) met.title = `Знаком: ${name}`;
}

// ---------- формула репутации ----------

export interface FactionRepInfo {
  rep: number;      // 0..100 (по встреченным NPC)
  met: number;      // связей установлено
  total: number;    // всего NPC во фракции
}

/**
 * Репутация фракции: Σ(rel_i × w_i) / Σ(w_i × 100) по ВСТРЕЧЕННЫМ NPC.
 * При repMode 'equal' веса игнорируются. Нет связей — репутация 0.
 */
export function computeFactionRep(
  project: Project,
  faction: Faction,
  getVar: (varId: string) => VarValue | undefined,
): FactionRepInfo {
  const members = (project.npcs ?? []).filter((n) => n.factionId === faction.id);
  let num = 0;
  let den = 0;
  let met = 0;
  for (const npc of members) {
    if (getVar(npc.metVarId) !== true) continue;
    met++;
    const w = faction.repMode === 'equal' ? 1 : Math.max(1, npc.weight);
    num += Number(getVar(npc.relationVarId) ?? 0) * w;
    den += w * 100;
  }
  return {
    rep: den > 0 ? Math.round((num / den) * 1000) / 10 : 0,
    met,
    total: members.length,
  };
}

/** Пересчитывает все вычисляемые переменные репутации в state (материализация) */
export function materializeFactionReps(project: Project, state: Record<string, VarValue>) {
  for (const f of project.factions ?? []) {
    state[f.repVarId] = computeFactionRep(project, f, (id) => state[id]).rep;
  }
}

// ---------- портреты-плейсхолдеры ----------

/** Круглый SVG-силуэт с инициалами в цвете фракции → data-URI */
export function placeholderPortrait(name: string, color: string): string {
  const initials = name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
<defs>
<radialGradient id="g" cx="50%" cy="38%" r="70%">
<stop offset="0%" stop-color="#232d37"/><stop offset="100%" stop-color="#0e141a"/>
</radialGradient>
<clipPath id="c"><circle cx="48" cy="48" r="46"/></clipPath>
</defs>
<circle cx="48" cy="48" r="46" fill="url(#g)"/>
<g clip-path="url(#c)">
<circle cx="48" cy="38" r="14" fill="#39434e"/>
<path d="M18 96 Q22 60 48 60 Q74 60 78 96 Z" fill="#39434e"/>
</g>
<circle cx="48" cy="48" r="45" fill="none" stroke="${color}" stroke-opacity="0.75" stroke-width="2"/>
<text x="48" y="90" font-family="Segoe UI, sans-serif" font-size="13" font-weight="600"
 fill="${color}" text-anchor="middle" letter-spacing="1">${initials}</text>
</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function npcPortrait(project: Project, npc: NPC): string {
  if (npc.portrait) return npc.portrait;
  const faction = project.factions?.find((f) => f.id === npc.factionId);
  return placeholderPortrait(npc.name, faction?.color ?? '#7a8b9a');
}

/** Полноростовой SVG-силуэт (заглушка для экрана профиля, пока нет собственного арта) → data-URI */
export function placeholderFullPortrait(name: string, color: string): string {
  const initials = name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="600" viewBox="0 0 360 600">
<defs>
<radialGradient id="g" cx="50%" cy="30%" r="75%">
<stop offset="0%" stop-color="#232d37"/><stop offset="100%" stop-color="#0b0f14"/>
</radialGradient>
</defs>
<rect width="360" height="600" fill="url(#g)"/>
<circle cx="180" cy="185" r="70" fill="#2a333d"/>
<path d="M70 600 Q80 340 180 340 Q280 340 290 600 Z" fill="#2a333d"/>
<rect x="0" y="0" width="360" height="600" fill="none" stroke="${color}" stroke-opacity="0.5" stroke-width="3"/>
<text x="180" y="560" font-family="Segoe UI, sans-serif" font-size="34" font-weight="600"
 fill="${color}" text-anchor="middle" letter-spacing="3">${initials}</text>
</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function npcFullPortrait(project: Project, npc: NPC): string {
  if (npc.fullPortrait) return npc.fullPortrait;
  const faction = project.factions?.find((f) => f.id === npc.factionId);
  return placeholderFullPortrait(npc.name, faction?.color ?? '#7a8b9a');
}
