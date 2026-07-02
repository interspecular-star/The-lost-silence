// ============================================================
// The Lost Silence — модель данных проекта
// Логический холст: 1920x1080 (16:9)
// ============================================================

export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

// ---------- Переменные ----------
export type VarType = 'number' | 'string' | 'boolean';
export type VarValue = number | string | boolean;

export interface VariableDef {
  id: string;
  name: string;            // машинное имя (латиницей)
  title: string;           // отображаемое имя
  type: VarType;
  initial: VarValue;
  // general/reputation — редактируются в таблице переменных;
  // npc — авто-переменные персонажей (отношение, знакомство), живут в редакторе персонажей;
  // hero — авто-переменные героя (lvl, exp, hp, foc), настраиваются в режиме «Предметы»;
  // computed — вычисляемые движком (репутация фракций, характеристики), менять эффектами нельзя
  category: 'general' | 'reputation' | 'npc' | 'hero' | 'computed';
  description?: string;
  tracked?: boolean;       // показывать в панели отслеживания при предпросмотре
}

// ---------- Условия и эффекты ----------
export type CondOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
export interface Condition {
  varId: string;
  op: CondOp;
  value: VarValue;
}

export type EffectOp = 'set' | 'add' | 'sub' | 'toggle';
export interface Effect {
  varId: string;
  op: EffectOp;
  value: VarValue;
}

// ---------- Действия элементов ----------
export type ActionType = 'none' | 'gotoScene' | 'startDialogue' | 'setVars';
export interface ElementAction {
  type: ActionType;
  sceneId?: string;
  dialogueId?: string;
  effects?: Effect[];
  giveItems?: ItemGrant[];   // выдать предметы при клике
}

// ---------- Элементы сцены ----------
export type ElementType = 'text' | 'rect' | 'image' | 'button' | 'hotspot';

export interface ElementStyle {
  fill?: string;
  textColor?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  radius?: number;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
  shadow?: boolean;
}

export interface SceneElement {
  id: string;
  name: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  zIndex?: number;
  visible?: boolean;
  locked?: boolean;
  text?: string;           // для text / button
  src?: string;            // для image (url или data-uri)
  style: ElementStyle;
  action?: ElementAction;
  visibleIf?: Condition[]; // условия видимости в игре
}

// ---------- Сцены ----------
export type SceneKind = 'page' | 'location' | 'level';

export interface Guide {
  axis: 'x' | 'y';         // x = вертикальная линия (позиция по X)
  pos: number;
}

export interface Scene {
  id: string;
  name: string;
  kind: SceneKind;
  background: string;      // css-цвет или градиент
  bgImage?: string;
  elements: SceneElement[];
  guides: Guide[];
  onEnterDialogueId?: string; // диалог, запускаемый при входе в сцену
}

// ---------- Диалоги (нодовый граф) ----------
export type NodeType = 'line' | 'choice' | 'set' | 'branch' | 'jump' | 'end';

export interface DialogueChoice {
  id: string;
  text: string;
  conditions: Condition[];
  effects: Effect[];
  next: string | null;
}

export interface DialogueNode {
  id: string;
  type: NodeType;
  x: number;               // позиция в графе
  y: number;
  // line
  speaker?: string;          // свободный текст (рассказчик, безымянные)
  speakerNpcId?: string | null; // ссылка на NPC (приоритетнее speaker; отмечает знакомство)
  text?: string;
  next?: string | null;    // line / set / jump(после смены сцены диалог продолжается или нет)
  // choice
  choices?: DialogueChoice[];
  // set
  effects?: Effect[];
  giveItems?: ItemGrant[];   // выдать предметы (нода «Действие»)
  // branch
  conditions?: Condition[];
  nextTrue?: string | null;
  nextFalse?: string | null;
  // jump
  gotoSceneId?: string;
}

export interface Dialogue {
  id: string;
  name: string;
  startNodeId: string | null;
  nodes: DialogueNode[];
}

// ---------- Фракции и NPC ----------
export interface Faction {
  id: string;
  name: string;
  color: string;             // фирменный цвет (портреты, HUD)
  // weighted — голос лидера весомее (иерархия, Cavernium);
  // equal — все голоса равны (община, Woodhaven)
  repMode: 'weighted' | 'equal';
  description?: string;
  repVarId: string;          // авто-переменная category:'computed' — репутация 0..100
}

export interface NPC {
  id: string;
  name: string;
  factionId: string | null;  // null — вне фракций
  weight: number;            // вес влияния 1..10 (учитывается при repMode:'weighted')
  portrait?: string;         // data-URI; если нет — генерируется силуэт с инициалами
  description?: string;
  relationVarId: string;     // авто-переменная category:'npc' — отношение 0..100
  metVarId: string;          // авто-переменная category:'npc' — знаком ли игрок (boolean)
}

// ---------- Предметы и герой ----------
export type ItemSlot = 'head' | 'body' | 'legs' | 'feet' | 'hands' | 'weapon' | 'gadget' | 'accessory';
export type ItemType = 'weapon' | 'armor' | 'gadget' | 'consumable' | 'resource';
export type Rarity = 'junk' | 'worn' | 'decent' | 'high' | 'legendary' | 'archon';
// ключи боевых характеристик (bonus-статы предметов и рост героя)
export type StatKey = 'hp_max' | 'foc_max' | 'atk' | 'agi' | 'crit_pow' | 'crit_chance' | 'def' | 'endur';

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  slot?: ItemSlot;           // для экипируемых (weapon/armor/gadget)
  rarity: Rarity;
  icon?: string;             // data-URI; нет — авто-плейсхолдер по типу и редкости
  description?: string;
  price: number;
  stack?: number;            // макс. в одной ячейке (ресурсы/расходники), по умолчанию 1
  questItem?: boolean;       // нельзя продать/выбросить
  stats?: Partial<Record<StatKey, number>>; // бонусы при экипировке
  cellsBonus?: number;       // + ячейки инвентаря (сумки)
  useEffects?: Effect[];     // расходник: эффекты при использовании (предмет тратится)
}

export interface ItemGrant { itemId: string; qty: number; }

export interface HeroConfig {
  baseStats: Record<StatKey, number>;   // характеристики на 1 уровне
  growth: Partial<Record<StatKey, number>>; // прирост за уровень
  baseCells: number;                    // базовые ячейки инвентаря
  cellsPerEndur: number;                // + ячеек за единицу выносливости
  regenHp: number;                      // hp в секунду вне боя
  regenFoc: number;                     // foc в секунду вне боя
  startItems: ItemGrant[];              // стартовый инвентарь
}

export const ITEM_SLOT_LABELS: Record<ItemSlot, string> = {
  head: 'Голова', body: 'Тело', legs: 'Ноги', feet: 'Обувь',
  hands: 'Перчатки', weapon: 'Оружие', gadget: 'Гаджет', accessory: 'Аксессуар',
};
export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  weapon: 'Оружие', armor: 'Одежда/броня', gadget: 'Гаджет',
  consumable: 'Расходник', resource: 'Ресурс',
};
export const RARITY_META: Record<Rarity, { label: string; color: string; order: number }> = {
  junk: { label: 'Хлам', color: '#8a949e', order: 0 },
  worn: { label: 'Потёртый', color: '#b8c2ac', order: 1 },
  decent: { label: 'Добротный', color: '#7db8f0', order: 2 },
  high: { label: 'Высокий', color: '#b39cf0', order: 3 },
  legendary: { label: 'Легендарный', color: '#e5c07b', order: 4 },
  archon: { label: 'Архонт-класс', color: '#4fd1c5', order: 5 },
};
export const STAT_LABELS: Record<StatKey, string> = {
  hp_max: 'Макс. HP', foc_max: 'Макс. фокус', atk: 'Сила атаки', agi: 'Ловкость',
  crit_pow: 'Сила крита %', crit_chance: 'Шанс крита %', def: 'Защита', endur: 'Выносливость',
};

// ---------- Idle-правила (пассивный прогресс) ----------
export interface IdleRule {
  id: string;
  title: string;           // отображаемое название («Добыча кредитов»)
  varId: string;           // числовая переменная, которая растёт
  ratePerMin: number;      // прирост в минуту (может быть отрицательным)
  max?: number;            // потолок (не расти выше)
  offline?: boolean;       // копить, пока игра закрыта
  conditions?: Condition[]; // работает только при выполнении условий
  enabled: boolean;
}

// ---------- Тема оформления игры ----------
export interface Theme {
  font: string;
  accent: string;
  dialogueBox: string;     // фон диалогового окна
  dialogueText: string;
  speakerColor: string;
  choiceBg: string;
  choiceText: string;
  choiceHover: string;
}

// ---------- Проект ----------
export interface Project {
  formatVersion: 1;
  meta: {
    name: string;
    author?: string;
  };
  startSceneId: string | null;
  variables: VariableDef[];
  scenes: Scene[];
  dialogues: Dialogue[];
  idleRules?: IdleRule[];
  factions?: Faction[];
  npcs?: NPC[];
  items?: ItemDef[];
  hero?: HeroConfig;
  // имя переменной (name), хранящей уровень Осколка (0 — нет устройства … 4 — следы OldNet)
  oskolokVarName?: string;
  theme: Theme;
}

// ---------- Утилиты ----------
let uidCounter = 0;
export function uid(prefix = 'id'): string {
  uidCounter = (uidCounter + 1) % 1679616;
  return `${prefix}_${Date.now().toString(36)}${uidCounter.toString(36)}`;
}

export function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function defaultTheme(): Theme {
  return {
    font: "'Segoe UI', system-ui, sans-serif",
    accent: '#4fd1c5',
    dialogueBox: 'rgba(8, 14, 20, 0.92)',
    dialogueText: '#e6edf3',
    speakerColor: '#4fd1c5',
    choiceBg: 'rgba(79, 209, 197, 0.08)',
    choiceText: '#cfe8e5',
    choiceHover: 'rgba(79, 209, 197, 0.22)',
  };
}

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  line: 'Реплика',
  choice: 'Выбор',
  set: 'Действие',
  branch: 'Условие',
  jump: 'Переход',
  end: 'Конец',
};

export const ELEMENT_TYPE_LABELS: Record<ElementType, string> = {
  text: 'Текст',
  rect: 'Панель',
  image: 'Изображение',
  button: 'Кнопка',
  hotspot: 'Зона клика',
};

export const SCENE_KIND_LABELS: Record<SceneKind, string> = {
  page: 'Страницы',
  location: 'Локации',
  level: 'Уровни',
};

export const COND_OP_LABELS: Record<CondOp, string> = {
  eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤',
};

export const EFFECT_OP_LABELS: Record<EffectOp, string> = {
  set: 'установить', add: '+', sub: '−', toggle: 'переключить',
};
