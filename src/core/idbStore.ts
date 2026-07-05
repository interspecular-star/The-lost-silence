// ============================================================
// Хранилище проекта в IndexedDB — замена localStorage для автосейва.
// Причина: localStorage ограничен ~5-10МБ на origin (жёсткий лимит браузера), а проект
// со встроенными картинками легко превышает это уже при паре десятков МБ — тогда
// localStorage.setItem молча/с ошибкой отказывается писать, и правки не сохраняются
// между обновлениями страницы. IndexedDB такого маленького потолка не имеет (лимит
// привязан к свободному месту на диске, обычно сотни МБ — единицы ГБ).
// ============================================================

const DB_NAME = 'tls_editor';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const KEY = 'tls_project';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Читает сохранённый проект (сырая JSON-строка) или null, если ничего нет/IndexedDB недоступна */
export async function idbGetProject(): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Пишет проект (сырая JSON-строка) в IndexedDB. Бросает исключение при реальной ошибке (редко). */
export async function idbSetProject(json: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(json, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- уведомление других вкладок редактора ----------
// storage-событие браузера работает только для localStorage — раз мы с него уходим,
// для «в другой вкладке тоже открыт редактор и только что сохранил» нужен BroadcastChannel.
// Сообщения по каналу не долетают до самого отправителя — ровно то поведение, которое нужно.

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel('tls_project_sync');
  return channel;
}

export function notifyProjectSavedElsewhere() {
  getChannel()?.postMessage('saved');
}

export function onProjectSavedElsewhere(cb: () => void) {
  const ch = getChannel();
  if (ch) ch.onmessage = () => cb();
}
