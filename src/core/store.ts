// ============================================================
// Хранилище проекта: состояние редактора, undo/redo, события
// ============================================================

import { Project, Scene, Dialogue, SceneElement, DialogueNode, VariableDef, deepClone } from './types';

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

  // настройки вида
  snapEnabled = true;
  gridEnabled = false;
  guidesVisible = true;

  private past: string[] = [];
  private future: string[] = [];
  private listeners: Map<StoreEvent, Set<Listener>> = new Map();
  private saveTimer: number | undefined;

  constructor(project: Project) {
    this.project = project;
    this.currentSceneId = project.startSceneId ?? project.scenes[0]?.id ?? null;
    this.currentDialogueId = project.dialogues[0]?.id ?? null;
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
    this.emit('selection');
  }

  selectNode(id: string | null) {
    this.selectedNodeId = id;
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
    this.emit('project');
    this.emit('selection');
    this.emit('view');
  }

  // ---------- автосохранение в localStorage ----------
  private scheduleAutosave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem('tls_project', JSON.stringify(this.project));
      } catch { /* переполнение хранилища — игнорируем */ }
    }, 600);
  }

  static loadAutosave(): Project | null {
    try {
      const raw = localStorage.getItem('tls_project');
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (p && p.formatVersion === 1 && Array.isArray(p.scenes)) return p as Project;
    } catch { /* повреждено */ }
    return null;
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
