// ============================================================
// Хранилище проекта: состояние редактора, undo/redo, события
// ============================================================

import { Project, Scene, Dialogue, SceneElement, DialogueNode, VariableDef, deepClone } from './types';
import { saveServerSave } from './serverSave';
import { idbGetProject, idbSetProject, notifyProjectSavedElsewhere, onProjectSavedElsewhere } from './idbStore';

const LEGACY_LOCALSTORAGE_KEY = 'tls_project'; // до перехода на IndexedDB — только для миграции старых сохранений

export type EditorMode = 'scene' | 'dialogue' | 'npc' | 'items' | 'mobs' | 'quests' | 'variables';

export type StoreEvent =
  | 'project'      // проект заменён целиком (загрузка)
  | 'change'       // любое изменение данных проекта
  | 'selection'    // изменилось выделение
  | 'mode'         // сменился режим редактора
  | 'view';        // zoom/pan/переключатели вида

type Listener = () => void;

const HISTORY_LIMIT = 60;

export class Store {
  project: Project;

  mode: EditorMode = 'scene';
  currentSceneId: string | null = null;
  currentDialogueId: string | null = null;
  selectedElementIds: string[] = [];
  selectedNodeId: string | null = null;
  /** Узел карты лагеря, выбранный на холсте (правится в инспекторе) */
  selectedMapNodeId: string | null = null;
  /** Какой «вид при условиях» показывает холст карты (id из cfg.nodeLookIf; null — базовый).
   *  Только для редактора, в проект не сохраняется. */
  mapLookPreviewId: string | null = null;
  /** Анимации карты (переливы/поток/пульс) прямо на холсте. Только для редактора. */
  mapAnimatePreview = true;
  /** Форс конкретной пометки на холсте (кнопка «👁» в редакторе узла). Только для редактора. */
  mapMarkPreview: { nodeId: string; markId: string } | null = null;
  /** Режим правки раскладки HUD на холсте (drag макетов). Только для редактора. */
  hudEditMode = false;

  // настройки вида
  snapEnabled = true;
  gridEnabled = false;
  guidesVisible = true;

  /** Вызывается, если запись автосейва в браузере (IndexedDB) не удалась. Резервная копия
   * на диске при этом всё равно продолжает работать — её IndexedDB-проблемы не касаются. */
  onBrowserSaveFailed: (() => void) | null = null;
  /** Вызывается, если резервная копия на диске НЕ записалась (диск переполнен, нет прав и т.п.) */
  onDiskSaveFailed: (() => void) | null = null;
  /** Вызывается, если проект был сохранён из ДРУГОЙ вкладки этого редактора */
  onExternalChange: (() => void) | null = null;

  private past: string[] = [];
  private future: string[] = [];
  private listeners: Map<StoreEvent, Set<Listener>> = new Map();
  private saveTimer: number | undefined;

  constructor(project: Project) {
    this.project = project;
    this.currentSceneId = project.startSceneId ?? project.scenes[0]?.id ?? null;
    this.currentDialogueId = project.dialogues[0]?.id ?? null;
    // страховка: закрытие/перезагрузка вкладки не должна ждать 600мс debounce автосейва.
    // pagehide — доп. подстраховка на случай, когда beforeunload не срабатывает (bfcache и т.п.)
    window.addEventListener('beforeunload', () => this.flushAutosave());
    window.addEventListener('pagehide', () => this.flushAutosave());
    // другая открытая вкладка редактора сохранила проект — предупреждаем, а не тихо
    // позволяем этой вкладке позже перезаписать более свежие правки поверх них
    onProjectSavedElsewhere(() => this.onExternalChange?.());
  }

  // ---------- события ----------
  on(ev: StoreEvent, fn: Listener): () => void {
    if (!this.listeners.has(ev)) this.listeners.set(ev, new Set());
    this.listeners.get(ev)!.add(fn);
    return () => this.listeners.get(ev)!.delete(fn);
  }

  emit(ev: StoreEvent) {
    this.listeners.get(ev)?.forEach((fn) => fn());
    if (ev === 'project') this.emit('change');
    if (ev === 'change') this.scheduleAutosave();
  }

  // ---------- undo/redo ----------
  /** Вызывать ПЕРЕД мутацией данных проекта */
  snapshot() {
    this.past.push(JSON.stringify(this.project));
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
  }

  undo() {
    const prev = this.past.pop();
    if (prev === undefined) return;
    this.future.push(JSON.stringify(this.project));
    this.project = JSON.parse(prev);
    this.afterHistoryJump();
  }

  redo() {
    const next = this.future.pop();
    if (next === undefined) return;
    this.past.push(JSON.stringify(this.project));
    this.project = JSON.parse(next);
    this.afterHistoryJump();
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  private afterHistoryJump() {
    // выделение могло указывать на удалённые сущности
    if (this.currentSceneId && !this.getScene(this.currentSceneId)) {
      this.currentSceneId = this.project.scenes[0]?.id ?? null;
    }
    if (this.currentDialogueId && !this.getDialogue(this.currentDialogueId)) {
      this.currentDialogueId = this.project.dialogues[0]?.id ?? null;
    }
    const scene = this.currentScene;
    this.selectedElementIds = this.selectedElementIds.filter(
      (id) => scene?.elements.some((e) => e.id === id),
    );
    const dlg = this.currentDialogue;
    if (this.selectedNodeId && !dlg?.nodes.some((n) => n.id === this.selectedNodeId)) {
      this.selectedNodeId = null;
    }
    if (this.selectedMapNodeId && !scene?.campMap?.nodes.some((n) => n.id === this.selectedMapNodeId)) {
      this.selectedMapNodeId = null;
    }
    this.emit('change');
    this.emit('selection');
  }

  // ---------- доступ к данным ----------
  get currentScene(): Scene | null {
    return this.currentSceneId ? this.getScene(this.currentSceneId) : null;
  }
  get currentDialogue(): Dialogue | null {
    return this.currentDialogueId ? this.getDialogue(this.currentDialogueId) : null;
  }
  getScene(id: string): Scene | null {
    return this.project.scenes.find((s) => s.id === id) ?? null;
  }
  getDialogue(id: string): Dialogue | null {
    return this.project.dialogues.find((d) => d.id === id) ?? null;
  }
  getVariable(id: string): VariableDef | null {
    return this.project.variables.find((v) => v.id === id) ?? null;
  }
  get selectedElements(): SceneElement[] {
    const scene = this.currentScene;
    if (!scene) return [];
    return scene.elements.filter((e) => this.selectedElementIds.includes(e.id));
  }
  get selectedNode(): DialogueNode | null {
    const dlg = this.currentDialogue;
    if (!dlg || !this.selectedNodeId) return null;
    return dlg.nodes.find((n) => n.id === this.selectedNodeId) ?? null;
  }

  // ---------- выделение / навигация ----------
  setMode(mode: EditorMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.emit('mode');
    this.emit('selection');
  }

  selectScene(id: string) {
    this.currentSceneId = id;
    this.selectedElementIds = [];
    this.selectedMapNodeId = null;
    this.emit('selection');
    this.emit('view');
  }

  selectDialogue(id: string) {
    this.currentDialogueId = id;
    this.selectedNodeId = null;
    this.emit('selection');
    this.emit('view');
  }

  selectElements(ids: string[]) {
    this.selectedElementIds = ids;
    if (ids.length) this.selectedMapNodeId = null; // элемент и узел карты не выделяются одновременно
    this.emit('selection');
  }

  selectNode(id: string | null) {
    this.selectedNodeId = id;
    this.emit('selection');
  }

  /** Узел карты лагеря, выбранный на холсте (редактор; не путать с игровым mapSelection) */
  selectMapNode(id: string | null) {
    if (this.selectedMapNodeId === id) return;
    this.selectedMapNodeId = id;
    if (id) this.selectedElementIds = [];
    this.emit('selection');
  }

  // ---------- загрузка/замена проекта ----------
  loadProject(p: Project) {
    this.past = [];
    this.future = [];
    this.project = p;
    this.currentSceneId = p.startSceneId ?? p.scenes[0]?.id ?? null;
    this.currentDialogueId = p.dialogues[0]?.id ?? null;
    this.selectedElementIds = [];
    this.selectedNodeId = null;
    this.selectedMapNodeId = null;
    this.emit('project');
    this.emit('selection');
    this.emit('view');
  }

  // ---------- автосохранение (IndexedDB — без маленького лимита localStorage) ----------
  private scheduleAutosave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flushAutosave(), 600);
  }

  /** Немедленная запись, минуя debounce — страховка перед закрытием/перезагрузкой страницы */
  private flushAutosave() {
    clearTimeout(this.saveTimer);
    const json = JSON.stringify(this.project);
    idbSetProject(json).then(
      () => notifyProjectSavedElsewhere(),
      () => this.onBrowserSaveFailed?.(), // редко: IndexedDB недоступна/запрещена/переполнена
    );
    // резервная копия на диске — не зависит от origin/порта браузера и от кода в src/
    saveServerSave(this.project).then((ok) => {
      if (!ok) this.onDiskSaveFailed?.();
    });
  }

  /**
   * project — восстановленный проект или null (нечего восстанавливать / не удалось).
   * corrupted — true, только если сохранение БЫЛО, но не прошло парсинг/проверку формата
   * (в отличие от «ничего не сохранено» — это единственный случай, о котором стоит громко
   * предупредить пользователя, а не тихо подставлять seed-проект).
   */
  static async loadAutosave(): Promise<{ project: Project | null; corrupted: boolean }> {
    let raw = await idbGetProject();

    // миграция: раньше автосейв жил в localStorage — если в IndexedDB пусто, но там
    // что-то есть, переносим один раз и на этом больше не пишем в localStorage
    if (!raw) {
      let legacy: string | null = null;
      try { legacy = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY); } catch { /* недоступен */ }
      if (legacy) {
        raw = legacy;
        try {
          const p = JSON.parse(legacy);
          if (p && p.formatVersion === 1 && Array.isArray(p.scenes)) {
            await idbSetProject(legacy).catch(() => {});
          }
        } catch { /* обработается ниже как обычная ошибка парсинга */ }
        try { localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY); } catch { /* не критично */ }
      }
    }

    if (!raw) return { project: null, corrupted: false };
    try {
      const p = JSON.parse(raw);
      if (p && p.formatVersion === 1 && Array.isArray(p.scenes)) return { project: p as Project, corrupted: false };
      return { project: null, corrupted: true };
    } catch {
      return { project: null, corrupted: true };
    }
  }
}

export function duplicateElement(el: SceneElement): SceneElement {
  const copy = deepClone(el);
  copy.id = crypto.randomUUID ? crypto.randomUUID() : `el_${Math.random().toString(36).slice(2)}`;
  copy.name = el.name + ' (копия)';
  copy.x += 24;
  copy.y += 24;
  return copy;
}
