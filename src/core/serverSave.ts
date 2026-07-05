// ============================================================
// Резервная копия проекта на диске (только в режиме редактора, npm run dev).
// Пишет/читает файл через dev-сервер (см. vite.config.ts), в обход localStorage браузера —
// не зависит от порта/origin и никак не связана с изменениями кода в src/.
// В экспортированной игре (standalone.ts) этот модуль не используется; если вдруг вызвать
// его без dev-сервера — fetch тихо провалится, ничего не сломав.
// ============================================================

import { Project } from './types';

const ENDPOINT = '/api/local-save';

export type ServerSaveResult =
  | { status: 'ok'; project: Project }
  | { status: 'missing' }    // файла нет — либо ещё не сохраняли, либо нет dev-сервера/сети
  | { status: 'corrupted' }; // файл ЕСТЬ, но не читается — отличаем от missing, чтобы не молчать

/** Пробует прочитать резервную копию с диска. */
export async function loadServerSave(): Promise<ServerSaveResult> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT);
  } catch {
    return { status: 'missing' };
  }
  if (res.status === 404) return { status: 'missing' };
  if (!res.ok) return { status: 'missing' };
  let p: unknown;
  try {
    p = await res.json();
  } catch {
    return { status: 'corrupted' };
  }
  if (p && typeof p === 'object' && (p as Project).formatVersion === 1 && Array.isArray((p as Project).scenes)) {
    return { status: 'ok', project: p as Project };
  }
  return { status: 'corrupted' };
}

/**
 * Пишет проект на диск. Возвращает true при успехе — вызывающий код (Store) уведомляет
 * владельца, если запись не удалась (диск переполнен, нет прав и т.п.), вместо того чтобы
 * тихо считать сохранение состоявшимся.
 * БЕЗ keepalive: у keepalive-запросов в браузере жёсткий лимит тела ~64КБ — реальный проект
 * (диалоги, NPC, картинки) почти всегда больше, и запрос молча проваливался бы каждый раз
 * (проверено: 139КБ уже "Failed to fetch" с keepalive:true). Обычный debounce (600мс) успевает
 * отработать до закрытия вкладки в подавляющем большинстве случаев; на закрытие вкладки есть
 * отдельный синхронный флаш в localStorage — вот там реальная защита от потери последних правок.
 */
export async function saveServerSave(project: Project): Promise<boolean> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    return res.ok;
  } catch {
    return false; // нет dev-сервера/сети — это нормально при экспорте игры, не считаем ошибкой пользователя
  }
}
