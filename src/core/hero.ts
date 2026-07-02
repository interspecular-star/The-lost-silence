// ============================================================
// Герой и предметы: авто-переменные, расчёт характеристик,
// кривая опыта, иконки-плейсхолдеры.
// Используется и редактором, и движком.
// ============================================================

import {
  Project, HeroConfig, ItemDef, MobDef, StatKey, VariableDef, VarValue,
  RARITY_META, uid,
} from './types';

export const STAT_KEYS: StatKey[] = ['hp_max', 'foc_max', 'atk', 'agi', 'crit_pow', 'crit_chance', 'def', 'endur'];

// имена авто-переменных героя (category:'hero' — живые значения)
export const HERO_VARS = ['lvl', 'exp', 'hp', 'foc'] as const;
// имена вычисляемых характеристик (category:'computed')
// совпадают со StatKey + exp_need

export function defaultHeroConfig(): HeroConfig {
  return {
    baseStats: { hp_max: 100, foc_max: 50, atk: 10, agi: 5, crit_pow: 150, crit_chance: 5, def: 5, endur: 5 },
    growth: { hp_max: 10, foc_max: 4, atk: 2, agi: 1, def: 1, endur: 1 },
    baseCells: 12,
    cellsPerEndur: 1,
    regenHp: 1,
    regenFoc: 0.5,
    startItems: [],
  };
}

/** Кривая опыта: сколько exp нужно для перехода с уровня lvl на следующий */
export function expNeed(lvl: number): number {
  return Math.round(100 * Math.pow(Math.max(1, lvl), 1.5));
}

/** Создаёт недостающие переменные героя (hero + computed). Возвращает карту имя→id */
export function ensureHeroSystem(project: Project): Record<string, string> {
  project.hero = project.hero ?? defaultHeroConfig();
  const map: Record<string, string> = {};
  const ensure = (name: string, title: string, category: VariableDef['category'], initial: number, tracked = false, description?: string) => {
    let v = project.variables.find((x) => x.name === name);
    if (!v) {
      v = { id: uid('var'), name, title, type: 'number', initial, category, tracked: tracked || undefined, description };
      project.variables.push(v);
    }
    map[name] = v.id;
  };
  ensure('lvl', 'Уровень', 'hero', 1, true);
  ensure('exp', 'Опыт', 'hero', 0, true, 'Копится эффектами; уровень растёт автоматически');
  ensure('hp', 'Здоровье', 'hero', 100, true);
  ensure('foc', 'Фокус', 'hero', 50, true, 'Ресурс спецударов');
  for (const k of STAT_KEYS) {
    ensure(k, statTitle(k), 'computed', 0, false, 'Вычисляется: база + рост за уровень + экипировка');
  }
  ensure('exp_need', 'Опыт до уровня', 'computed', expNeed(1));
  return map;
}

function statTitle(k: StatKey): string {
  const titles: Record<StatKey, string> = {
    hp_max: 'Макс. здоровье', foc_max: 'Макс. фокус', atk: 'Сила атаки', agi: 'Ловкость',
    crit_pow: 'Сила крита', crit_chance: 'Шанс крита', def: 'Защита', endur: 'Выносливость',
  };
  return titles[k];
}

export function heroVarId(project: Project, name: string): string | null {
  return project.variables.find((v) => v.name === name)?.id ?? null;
}

/**
 * Полные характеристики героя: база + рост×(lvl−1) + бонусы экипировки.
 * equippedItems — реально надетые предметы.
 */
export function computeHeroStats(
  project: Project,
  lvl: number,
  equippedItems: ItemDef[],
): Record<StatKey, number> {
  const hero = project.hero ?? defaultHeroConfig();
  const out = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) {
    let v = (hero.baseStats[k] ?? 0) + (hero.growth[k] ?? 0) * Math.max(0, lvl - 1);
    for (const it of equippedItems) v += it.stats?.[k] ?? 0;
    out[k] = Math.round(v * 10) / 10;
  }
  return out;
}

/** Ячейки инвентаря: база + выносливость + сумки */
export function computeCells(project: Project, endur: number, equippedItems: ItemDef[]): number {
  const hero = project.hero ?? defaultHeroConfig();
  let cells = hero.baseCells + Math.floor(endur * hero.cellsPerEndur);
  for (const it of equippedItems) cells += it.cellsBonus ?? 0;
  return Math.max(1, cells);
}

/** Материализует характеристики героя в state (для условий/текстов/HUD) */
export function materializeHeroStats(
  project: Project,
  state: Record<string, VarValue>,
  equippedItems: ItemDef[],
) {
  const lvlId = heroVarId(project, 'lvl');
  if (!lvlId) return; // система героя не включена в проект
  const lvl = Number(state[lvlId] ?? 1);
  const stats = computeHeroStats(project, lvl, equippedItems);
  for (const k of STAT_KEYS) {
    const id = heroVarId(project, k);
    if (id) state[id] = stats[k];
  }
  const needId = heroVarId(project, 'exp_need');
  if (needId) state[needId] = expNeed(lvl);
  // hp/foc зажимаются в максимум
  const hpId = heroVarId(project, 'hp');
  if (hpId) state[hpId] = Math.max(0, Math.min(Number(state[hpId] ?? 0), stats.hp_max));
  const focId = heroVarId(project, 'foc');
  if (focId) state[focId] = Math.max(0, Math.min(Number(state[focId] ?? 0), stats.foc_max));
}

/** Иконка-плейсхолдер моба */
export function mobIcon(mob: MobDef): string {
  if (mob.icon) return mob.icon;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
<defs><radialGradient id="g" cx="50%" cy="40%" r="75%">
<stop offset="0%" stop-color="#2a1a1e"/><stop offset="100%" stop-color="#120d10"/>
</radialGradient></defs>
<rect width="96" height="96" rx="12" fill="url(#g)"/>
<rect width="96" height="96" rx="12" fill="none" stroke="#e06c75" stroke-opacity="0.8" stroke-width="2.5"/>
<circle cx="35" cy="42" r="6" fill="#e06c75"/>
<circle cx="61" cy="42" r="6" fill="#e06c75"/>
<path d="M30 68 L40 61 L48 68 L56 61 L66 68" stroke="#e06c75" stroke-width="3.5" fill="none" stroke-linecap="round"/>
</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/** Иконка-плейсхолдер предмета: глиф типа в рамке цвета редкости */
export function itemIcon(item: ItemDef): string {
  if (item.icon) return item.icon;
  const glyphs: Record<string, string> = {
    weapon: '⚔', armor: '🛡', gadget: '⌬', consumable: '✚', resource: '◆',
  };
  const color = RARITY_META[item.rarity].color;
  const g = glyphs[item.type] ?? '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<rect width="64" height="64" rx="9" fill="#161c23"/>
<rect x="1.5" y="1.5" width="61" height="61" rx="8" fill="none" stroke="${color}" stroke-opacity="0.8" stroke-width="2"/>
<text x="32" y="41" font-size="26" text-anchor="middle" fill="${color}">${g}</text>
</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
