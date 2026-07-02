// ============================================================
// Точка входа экспортированной игры.
// Ожидает window.__TLS_PROJECT__ (встраивается при экспорте).
// ============================================================

import { Engine, fitStage } from './engine';
import { Project } from '../core/types';

declare global {
  interface Window { __TLS_PROJECT__?: Project; }
}

function boot() {
  const project = window.__TLS_PROJECT__;
  if (!project) {
    document.body.textContent = 'Ошибка: данные игры не найдены.';
    return;
  }
  document.title = project.meta.name;
  document.body.style.cssText = 'margin:0;background:#000;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden;';

  const stage = document.createElement('div');
  stage.style.cssText = 'position:relative;background:#000;';
  document.body.appendChild(stage);
  fitStage(stage, document.body);

  const engine = new Engine(project, stage, { persist: true });
  engine.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
