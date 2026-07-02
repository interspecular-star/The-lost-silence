// ============================================================
// Горячие клавиши редактора
// ============================================================

import { Store, duplicateElement } from '../core/store';
import { saveProjectFile } from '../core/storage';
import { StageView, isTyping } from './stage';
import { GraphView } from './graph';
import { openPreview } from './preview';
import { toast } from './ui';

export function registerHotkeys(store: Store, stage: StageView, graph: GraphView) {
  window.addEventListener('keydown', (e) => {
    // Ctrl+S / Ctrl+Z / Ctrl+Y работают всегда
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveProjectFile(store.project);
      toast('Файл проекта скачан');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isTyping()) {
      e.preventDefault();
      e.shiftKey ? store.redo() : store.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !isTyping()) {
      e.preventDefault();
      store.redo();
      return;
    }
    if (e.key === 'F5') {
      e.preventDefault();
      openPreview(store);
      return;
    }
    if (isTyping()) return;

    // ---- режим сцены ----
    if (store.mode === 'scene') {
      const scene = store.currentScene;
      const els = store.selectedElements.filter((x) => !x.locked);
      if (!scene) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (els.length === 0) return;
        store.snapshot();
        scene.elements = scene.elements.filter((x) => !store.selectedElementIds.includes(x.id));
        store.selectedElementIds = [];
        store.emit('change');
        store.emit('selection');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (els.length === 0) return;
        store.snapshot();
        const copies = els.map(duplicateElement);
        scene.elements.push(...copies);
        store.selectedElementIds = copies.map((c) => c.id);
        store.emit('change');
        store.emit('selection');
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const nudge = (dx: number, dy: number) => {
        if (els.length === 0) return;
        e.preventDefault();
        store.snapshot();
        els.forEach((el) => { el.x += dx; el.y += dy; });
        store.emit('change');
      };
      if (e.key === 'ArrowLeft') nudge(-step, 0);
      if (e.key === 'ArrowRight') nudge(step, 0);
      if (e.key === 'ArrowUp') nudge(0, -step);
      if (e.key === 'ArrowDown') nudge(0, step);
    }

    // ---- режим диалогов ----
    if (store.mode === 'dialogue') {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        graph.deleteSelectedNode();
      }
    }
  });
}
