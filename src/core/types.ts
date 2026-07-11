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

// random — случайное целое 1..N (N в value): точки обыска, вариативный лут (C7)
export type EffectOp = 'set' | 'add' | 'sub' | 'toggle' | 'random';
export interface Effect {
  varId: string;
  op: EffectOp;
  value: VarValue;
}

// ---------- Действия элементов ----------
export type ActionType = 'none' | 'gotoScene' | 'startDialogue' | 'setVars' | 'startCombat' | 'openInventory';
export interface ElementAction {
  type: ActionType;
  sceneId?: string;
  dialogueId?: string;
  effects?: Effect[];
  giveItems?: ItemGrant[];   // выдать предметы при клике
  mobId?: string;            // startCombat: противник
  winDialogueId?: string;    // диалог после победы (опционально)
  loseDialogueId?: string;   // диалог после поражения (опционально)
}

// ---------- Элементы сцены ----------
export type ElementType = 'text' | 'rect' | 'image' | 'button' | 'hotspot';

/** Читаемость текста на пёстром/светлом фоне (см. runtime/elementfx.ts) */
export type TextGuard = 'shadow' | 'outline' | 'scrim';

export interface ElementStyle {
  fill?: string;
  textColor?: string;
  guard?: TextGuard;       // тень / контур / подложка — выделение текста на фоне
  guardPower?: number;     // сила 1–3 (по умолчанию 2)
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
  boxStyle?: BoxStyle;     // материал кнопки (spatial/рамка); скругление берётся из style.radius
  fx?: ElementFx;          // появление/исчезновение (титры глав, флэшбэки)
  action?: ElementAction;
  visibleIf?: Condition[]; // условия видимости в игре
}

// ---------- Анимация появления/исчезновения элемента (титры, флэшбэки) ----------
export type ElementFxKind = 'fade' | 'blur' | 'rise' | 'zoom';
export interface ElementFx {
  in?: ElementFxKind;    // появление при показе сцены
  inDelay?: number;      // сек — задержка появления
  inDur?: number;        // сек — длительность (по умолчанию 0.9)
  outAt?: number;        // сек от показа сцены — начать исчезновение
  out?: ElementFxKind;   // тип исчезновения (по умолчанию fade)
  outDur?: number;       // сек (по умолчанию 0.9)
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
  bg?: SceneBackgroundAdjust;
  bgEffects?: BgEffectRule[];
  elements: SceneElement[];
  guides: Guide[];
  onEnterDialogueId?: string; // диалог, запускаемый при входе в сцену
  hudMode?: 'auto' | 'on' | 'off'; // 'auto' — HUD скрыт на страницах, показан на локациях/уровнях
  dialogueBoxStyle?: BoxStyle; // переопределение материала диалога на этой сцене (> фракции > темы)
  choiceStyle?: BoxStyle;      // переопределение материала вариантов на этой сцене (> темы)
  autoNext?: { sceneId: string; delaySec: number }; // автопереход (флэшбэки, титры глав)
  fadeSec?: number;            // длительность кросс-фейда при уходе С этой сцены (по умолчанию 0.22)
  campMap?: CampMapConfig;     // сцена-карта: план лагеря с ромбами-локациями (блок I)
}

// ---------- Карта лагеря (блок I — spatial-навигация аванпоста) ----------
/** Живая пометка узла: показывается, когда все условия истинны («◊ Матис ждёт», «· новое») */
export interface CampMapMark {
  id: string;
  text: string;             // маркер в начале задаёт цвет: ◊ — акцент, прочее — приглушённо
  conditions: Condition[];  // пусто — видна всегда
}

/** Узел карты: ромб-локация на плане лагеря */
export interface CampMapNode {
  id: string;
  title: string;             // подпись капсом («АНГАР»)
  sceneId?: string;          // куда ведёт «Войти»; пусто — узел-декорация
  x: number;                 // центр ромба, % ширины карты (0–100)
  y: number;                 // центр ромба, % высоты карты (0–100)
  size?: number;             // ширина ромба, % ширины (по умолчанию 14; высота ≈ ×1.6)
  dim?: number;              // приглушение 0–100 («дальний план»), 0 — обычный
  tagline?: string;          // примета в сайдбаре («сварка и лебёдки»)
  marks?: CampMapMark[];     // живые пометки (на карте — первая активная, в сайдбаре — все)
  npcIds?: string[];         // «кто здесь» в сайдбаре
  lockedIf?: Condition[];    // все истинны → узел заперт (вместо «Войти» — lockedText)
  lockedText?: string;       // строка сайдбара, когда заперто
  visibleIf?: Condition[];   // условия видимости узла
}

/** Пунктирная дорожка между двумя узлами */
export interface CampMapLink { a: string; b: string; }

export interface CampMapConfig {
  nodes: CampMapNode[];
  links: CampMapLink[];
  homeNodeId?: string;       // «текущее положение» до первого входа куда-либо
}

// ---------- Настройка фонового изображения ----------
/** Базовая настройка картинки фона (всегда применяется, не зависит от условий) */
export interface SceneBackgroundAdjust {
  opacity?: number;     // 0-100, по умолчанию 100
  brightness?: number;  // 0-200, по умолчанию 100
  contrast?: number;    // 0-200, по умолчанию 100
  blur?: number;        // 0-20 (px), по умолчанию 0
  posX?: number;        // 0-100 (%), по умолчанию 50
  posY?: number;        // 0-100 (%), по умолчанию 50
  scale?: number;       // 100-200 (%), по умолчанию 100 — запас на параллакс/дрейф
  parallax?: number;    // -100..100, по умолчанию 0 — сила слежения за курсором (знак = направление)
}

/** Условный визуальный эффект поверх фона (настроение/напряжение/сбои и т.п.) */
export type BgEffectType =
  | 'vignette' | 'tint' | 'kenBurns' | 'shake' | 'pulse' | 'flicker' | 'glitch'
  | 'scanlines' | 'staticNoise' | 'grain' | 'desaturate' | 'chromaShift'
  | 'heavyBlur' | 'drift' | 'redPulse';

export const BG_EFFECT_META: Record<BgEffectType, { label: string; hasColor?: boolean; hint: string }> = {
  vignette: { label: 'Виньетка', hint: 'Затемнение по краям — фокус на центре/тексте.' },
  tint: { label: 'Цветной оттенок', hasColor: true, hint: 'Полупрозрачный цвет поверх фона — быстрая смена настроения.' },
  kenBurns: { label: 'Дыхание (медленный зум)', hint: 'Плавный зум туда-обратно — оживляет статичную картинку.' },
  shake: { label: 'Тряска', hint: 'Быстрая дрожь экрана — удар, тревога, бой.' },
  pulse: { label: 'Пульсация яркости', hint: 'Мягкое биение свет/тень — волнение, сердцебиение.' },
  flicker: { label: 'Мерцание', hint: 'Неровные скачки яркости — нестабильность, авария освещения.' },
  glitch: { label: 'Цифровой сбой', hint: 'Рывки и сдвиги картинки — вмешательство Mesh/OldNet.' },
  scanlines: { label: 'Строки сканирования', hint: 'Бегущие горизонтальные линии — терминал, экран, OldNet.' },
  staticNoise: { label: 'Помехи', hint: 'Плотный шум — потеря сигнала, провал восприятия.' },
  grain: { label: 'Зернистость', hint: 'Лёгкое киношное зерно — тревожная, «плёночная» атмосфера.' },
  desaturate: { label: 'Обесцвечивание', hint: 'Уход цвета в серость — апатия, шок, потеря чувств.' },
  chromaShift: { label: 'Хроматический сдвиг', hint: 'Цветной «разъезд» картинки — головокружение, дезориентация.' },
  heavyBlur: { label: 'Сильное размытие', hint: 'Глубокая расфокусировка — потеря сознания, засыпание.' },
  drift: { label: 'Дрейф', hint: 'Медленное покачивание фона — невесомость, сон, вода.' },
  redPulse: { label: 'Красная пульсация', hint: 'Пульсирующий красный — урон, опасность, критическое состояние.' },
};

export interface BgEffectRule {
  id: string;
  type: BgEffectType;
  intensity: number;        // 0-100
  color?: string;           // для tint
  conditions: Condition[];  // все условия истинны (И); пусто — эффект активен всегда
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
  materialId?: string;      // материал ЭТОЙ реплики (высший приоритет)
  whisperId?: string;       // нода «Действие»: прошептать (канал Архона)
}

export interface Dialogue {
  id: string;
  name: string;
  startNodeId: string | null;
  nodes: DialogueNode[];
  materialId?: string;          // материал всего диалога («допрос», «сон»…)
  materialRules?: MaterialRule[]; // динамика: условия → материал (выше materialId)
}

// ---------- Фракции и NPC ----------
/** Визуальное оформление диалогового блока для NPC этой фракции (см. src/runtime/dialoguefx.ts) */
export type FactionSkinId = 'flux' | 'sylvarium' | 'woodhaven' | 'cavernium' | 'aeralis' | 'hydrosynth' | 'nexus';
export const FACTION_SKIN_LABELS: Record<FactionSkinId, string> = {
  flux: 'Flux Nomads — сварные скобки, пунктир',
  sylvarium: 'Sylvarium — мягкие углы, живая линия',
  woodhaven: 'Woodhaven — без блюра, зерно, засечки',
  cavernium: 'Cavernium — плотный фон, двойная линия',
  aeralis: 'Aeralis — прозрачность, дистанция',
  hydrosynth: 'Hydrosynth — мягкие углы, блик по линии',
  nexus: 'Nexus — ровные уголки, сканирующее мерцание',
};

export interface Faction {
  id: string;
  name: string;
  color: string;             // фирменный цвет (портреты, HUD)
  // weighted — голос лидера весомее (иерархия, Cavernium);
  // equal — все голоса равны (община, Woodhaven)
  repMode: 'weighted' | 'equal';
  description?: string;
  repVarId: string;          // авто-переменная category:'computed' — репутация 0..100
  skinId?: FactionSkinId;    // оформление диалогового блока; нет — как сейчас (нейтральная тема)
  boxStyle?: BoxStyle;       // материал диалогового блока фракции (перекрывает тему, уступает сцене)
}

/** Связь с другим NPC для экрана профиля персонажа */
export interface NPCRelationship {
  id: string;
  npcId: string;   // на кого ссылается связь
  label: string;   // напр. «доверяет», «старый друг», «избегает»
}

export interface NPC {
  id: string;
  name: string;
  factionId: string | null;  // null — вне фракций
  weight: number;            // вес влияния 1..10 (учитывается при repMode:'weighted')
  portrait?: string;         // круглый аватар в диалогах; data-URI, иначе — силуэт с инициалами
  fullPortrait?: string;     // полноростовой арт для экрана профиля персонажа
  quote?: string;            // короткая цитата/девиз — сразу задаёт голос персонажа
  description?: string;      // краткое досье (для редактора)
  age?: string;              // возраст — строка (встречаются приблизительные вида «~31»)
  role?: string;             // роль/должность
  personality?: string;      // характер
  strengths?: string;        // сильные стороны — экран профиля
  weaknesses?: string;       // слабые стороны — экран профиля
  fears?: string;            // страхи
  wants?: string;            // желания/мотивация — как искать подход
  archonView?: string;       // отношение к Archon
  oldnetView?: string;       // отношение к OldNet
  relationships?: NPCRelationship[]; // связи с другими NPC
  relationVarId: string;     // авто-переменная category:'npc' — отношение 0..100
  metVarId: string;          // авто-переменная category:'npc' — знаком ли игрок (boolean)
  materialId?: string;       // материал диалога этого NPC (выше фракции, ниже диалога)
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

// ---------- Мобы и бой ----------
export interface MobDrop { itemId: string; qty: number; chance: number; } // chance 0..100

// Тип атаки моба: разные замахи учат «читать» противника.
// Если у моба нет атак — используется одна стандартная (urон atk, замах telegraphMs).
export interface MobAttack {
  id: string;
  name: string;            // «Разряд», «Таран»
  atkMult: number;         // множитель урона от atk моба (0.7 — быстрая, 1.6 — тяжёлая)
  telegraphMs: number;     // длительность замаха этой атаки
  weight: number;          // вес при случайном выборе (0 — атака отключена)
}

export interface MobDef {
  id: string;
  name: string;
  icon?: string;             // data-URI; нет — авто-плейсхолдер
  description?: string;
  hp: number;
  atk: number;               // урон за атаку (до вычета защиты)
  telegraphMs: number;       // длительность замаха (окно реакции игрока)
  def: number;               // защита моба
  critChance?: number;       // % шанс крита моба
  attacks?: MobAttack[];     // типы атак (пусто — одна стандартная)
  expReward: number;
  creditsReward?: number;
  drops: MobDrop[];
}

// ---------- Задания ----------
export type QuestKind = 'daily' | 'weekly' | 'story';

// Этап цепочки: выполняется, когда верны все условия. Прогресс необратим
// (выполненный этап не «развыполняется») и хранится в сейве игрока.
export interface QuestStep {
  id: string;
  text: string;              // «Поговорить с Рен в ангаре»
  conditions: Condition[];
}

export interface QuestDef {
  id: string;
  title: string;
  description?: string;
  kind: QuestKind;           // daily/weekly можно забирать раз в сутки/неделю, story — один раз
  conditions: Condition[];   // условия выполнения (все должны быть верны)
  steps?: QuestStep[];       // цепочка этапов (по порядку); если заданы — задание выполнено,
                             // когда пройдены все этапы (+ conditions, если есть)
  rewardEffects?: Effect[];
  rewardItems?: ItemGrant[];
  enabled: boolean;
}

// ---------- Достижения ----------
// Разово разблокируется, когда все условия истинны, и остаётся разблокированным навсегда
// (даже если условия потом перестанут выполняться) — тот же принцип необратимости, что
// и у QuestStep, но без цепочки этапов и без daily/weekly сброса.
export interface AchievementDef {
  id: string;
  title: string;
  description?: string;
  icon?: string;             // эмодзи/короткий символ
  conditions: Condition[];
  rewardEffects?: Effect[];
  rewardItems?: ItemGrant[];
  enabled: boolean;
}

// ---------- Улучшения (idle-прокачка: дроны, контракты) ----------
export interface UpgradeDef {
  id: string;
  title: string;
  description?: string;
  maxLevel: number;
  costVarName: string;       // имя переменной-валюты ('credits')
  costBase: number;          // цена уровня N = costBase × costGrowth^N (N с нуля)
  costGrowth: number;
  targetIdleRuleId?: string; // какое idle-правило усиливает
  ratePerLevel: number;      // + к приросту/мин за каждый уровень
  enabled: boolean;
}

// ---------- Расшифровка фрагментов OldNet ----------
export interface DecodeDef {
  id: string;
  title: string;
  itemId: string;            // предмет-фрагмент (тратится при запуске)
  durationMin: number;       // реальное время расшифровки
  rewardText?: string;       // кусок правды — показывается по завершении
  rewardEffects?: Effect[];
  rewardItems?: ItemGrant[];
  enabled: boolean;
}

// ---------- Чекпоинты плейтеста ----------
// Снимок состояния игры для предпросмотра: «начать как будто я уже дошёл досюда».
// Сохраняется владельцем прямо из предпросмотра; в экспортированную игру не попадает влиянием.
export interface PlaytestCheckpoint {
  id: string;
  name: string;
  sceneId: string | null;
  vars: Record<string, VarValue>;          // по id переменных (кроме computed)
  inv?: ItemGrant[];                        // инвентарь (itemId + qty)
  equip?: Partial<Record<ItemSlot, string>>;
  claims?: Record<string, string>;          // забранные награды заданий
  ups?: Record<string, number>;             // уровни улучшений
  qsteps?: Record<string, number>;          // прогресс цепочек заданий (id → пройдено этапов)
  achievements?: Record<string, boolean>;   // разблокированные достижения
}

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

// ---------- «Материалы» блоков (spatial-поверхность + анимированные рамки) ----------
export type BoxSurface = 'default' | 'spatial';
export type BoxBorderFx =
  | 'none' | 'shimmer' | 'star' | 'electric' | 'scan' | 'pulse'
  | 'heartbeat' | 'morse' | 'noise' | 'ember' | 'halo' | 'spectrum';
export type BoxTempo = 'slow' | 'normal' | 'fast';
export type BoxIntensity = 'quiet' | 'normal' | 'loud';

export interface BoxStyle {
  surface?: BoxSurface;   // default = как было; spatial = стекло/скругление/рамка
  border?: BoxBorderFx;   // анимация рамки (см. runtime/boxfx.ts)
  glass?: number;         // прозрачность стекла, % (0-40), только spatial; по умолчанию 14
  radius?: number;        // скругление углов, px; по умолчанию 16 (панель) / 10 (кнопка)
  hoverOnly?: boolean;    // рамка-анимация видна только при наведении (для кнопок/вариантов)
  tempo?: BoxTempo;       // темп анимации рамки (медленный/обычный/быстрый)
  intensity?: BoxIntensity; // сила рамки (тише/обычная/ярче)
  accent?: string;        // свой цвет рамки; пусто = авто (фракция/акцент темы)
}

// ---------- Канал Архона: «шёпоты» (H3, docs/dev/design-whisper.md) ----------
export type WhisperTrigger = 'enterScene' | 'dialogueEnd' | 'idle' | 'manual';

export interface WhisperChip {
  id: string;
  text: string;
  effects: Effect[];
  replyWhisperId?: string;  // ответный шёпот после выбора
}

export interface WhisperDef {
  id: string;
  name: string;             // подпись для редактора
  text: string;             // с разметкой textfx
  trigger: WhisperTrigger;
  sceneId?: string;         // enterScene: конкретная сцена (пусто — любая)
  dialogueId?: string;      // dialogueEnd: конкретный диалог (пусто — любой)
  conditions?: Condition[];
  delaySec?: number;        // задержка перед появлением
  holdSec?: number;         // сколько висит (по умолчанию 6 + длина текста)
  repeatable?: boolean;     // может звучать повторно (для idle-приветов)
  cooldownMin?: number;     // для repeatable/idle: не чаще, чем раз в N минут
  chips?: WhisperChip[];    // 0–3 коротких ответа
  priority?: 'normal' | 'important'; // important — вперёд очереди
}

/** Именованный материал из библиотеки проекта («Архон», «Допрос», «Костёр»…) */
export interface MaterialDef {
  id: string;
  name: string;
  box: BoxStyle;        // материал диалогового блока
  choice?: BoxStyle;    // необязательный материал вариантов ответа
}

/** Динамическое правило диалога: условия истинны → применяется материал */
export interface MaterialRule {
  conditions: Condition[];
  materialId: string;
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
  dialogueBoxStyle?: BoxStyle; // материал диалогового блока (нет = классика)
  choiceStyle?: BoxStyle;      // материал вариантов ответа (нет = классика)
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
  mobs?: MobDef[];
  quests?: QuestDef[];
  upgrades?: UpgradeDef[];
  decodes?: DecodeDef[];
  achievements?: AchievementDef[];
  materials?: MaterialDef[];   // библиотека материалов (H2)
  whispers?: WhisperDef[];     // канал Архона (H3)
  playtests?: PlaytestCheckpoint[];
  // имя переменной (name), хранящей уровень Осколка (0 — нет устройства … 4 — следы OldNet)
  oskolokVarName?: string;
  // имя переменной валюты для правого края HUD (по умолчанию 'credits')
  currencyVarName?: string;
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
    dialogueBox: 'rgba(5, 9, 13, 0.94)',
    dialogueText: '#e6edf3',
    speakerColor: '#4fd1c5',
    choiceBg: 'transparent',
    choiceText: '#cfe8e5',
    choiceHover: 'rgba(79, 209, 197, 0.07)',
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
  set: 'установить', add: '+', sub: '−', toggle: 'переключить', random: 'случайно 1..N',
};
