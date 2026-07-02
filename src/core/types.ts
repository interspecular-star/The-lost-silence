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
  category: 'general' | 'reputation';
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
  speaker?: string;
  text?: string;
  next?: string | null;    // line / set / jump(после смены сцены диалог продолжается или нет)
  // choice
  choices?: DialogueChoice[];
  // set
  effects?: Effect[];
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
