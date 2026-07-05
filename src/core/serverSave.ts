// ============================================================
// Резервная копия проекта на диске (только в режиме редактора, npm run dev).
// Пишет/читает файл через dev-сервер (см. vite.config.ts), в обход localStorage браузера —
// не зависит от порта/origin и никак не связана с изменениями кода в src/.
// В экспортированной игре (standalone.ts) этот модуль не используется; если вдруг вызвать
// его без dev-сервера — fetch тихо провалится, ничего не сломав.
// ============================================================

import { Project } from './types';

const ENDPOINT = '/api/local-save';

/** Пробует прочитать резервную копию с диска. null — если её нет или недоступна. */
export async function loadServerSave(): Promise<Project | null> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return null;
    const p = await res.json();
    if (p && p.formatVersion === 1 && Array.isArray(p.scenes)) return p as Project;
    return null;
  } catch {
    return null;
  }
}

/** Пишет проект на диск (best-effort, тихо игнорирует ошибку сети/отсутствие dev-сервера) */
export function saveServerSave(project: Project) {
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
    keepalive: true, // запрос должен пережить закрытие/перезагрузку вкладки (вызывается из beforeunload)
  }).catch(() => { /* нет dev-сервера — молча игнорируем */ });
}
