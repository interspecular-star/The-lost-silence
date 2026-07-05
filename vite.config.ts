import { defineConfig, Plugin } from 'vite';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

// strictPort: если 5173 занят — упасть с явной ошибкой, а не тихо уехать на другой порт.
// localStorage (автосейв редактора) привязан к origin, порт включён — переезд на другой
// порт означает переезд на другое хранилище: правки не теряются, но становятся невидимы.

// Резервная копия проекта — обычный файл на диске (вне git, вне localStorage браузера).
// Полностью независима от кода: правки Claude в src/ никак её не задевают, а порт/сброс
// хранилища браузера ей не страшны. src/core/serverSave.ts пишет сюда при каждом автосейве
// и читает отсюда при старте, если в localStorage пусто/повреждено.
//
// TLS_LOCAL_SAVE_DIR — override для тестовых прогонов (playwright и т.п.), чтобы тестовый
// vite-сервер НИКОГДА не писал/не удалял настоящий local-save/ владельца, даже если тест
// запущен на другом порту, но из той же папки репозитория (это ровно то, что один раз уже
// привело к потере правок — тестовый прогон удалил настоящий файл резервной копии).
const LOCAL_SAVE_DIR = path.resolve(__dirname, process.env.TLS_LOCAL_SAVE_DIR || 'local-save');
const LOCAL_SAVE_FILE = path.join(LOCAL_SAVE_DIR, 'project.json');
const LOCAL_SAVE_HISTORY_DIR = path.join(LOCAL_SAVE_DIR, 'history');
const HISTORY_LIMIT = 20;

// Все записи идут через одну очередь промисов — иначе два почти одновременных POST
// (например, из двух открытых вкладок редактора) могут гонять чтение/запись одного и
// того же файла и повредить его или испортить ротацию истории.
let writeQueue: Promise<void> = Promise.resolve();
function enqueue(fn: () => Promise<void>): Promise<void> {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

/** Перед перезаписью — копия предыдущей версии в history/. Не даёт одному плохому POST'у стереть всё бесследно. */
async function rotateHistory() {
  let prev: Buffer;
  try {
    prev = await fsp.readFile(LOCAL_SAVE_FILE);
  } catch {
    return; // файла ещё нет — нечего архивировать
  }
  if (!prev.length) return;
  await fsp.mkdir(LOCAL_SAVE_HISTORY_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fsp.writeFile(path.join(LOCAL_SAVE_HISTORY_DIR, `${stamp}.json`), prev);
  const files = (await fsp.readdir(LOCAL_SAVE_HISTORY_DIR)).filter((f) => f.endsWith('.json')).sort();
  const excess = files.slice(0, Math.max(0, files.length - HISTORY_LIMIT));
  await Promise.all(excess.map((f) => fsp.unlink(path.join(LOCAL_SAVE_HISTORY_DIR, f)).catch(() => {})));
}

function localSavePlugin(): Plugin {
  return {
    name: 'tls-local-save',
    configureServer(server) {
      server.middlewares.use('/api/local-save', (req, res) => {
        if (req.method === 'GET') {
          fs.readFile(LOCAL_SAVE_FILE, 'utf-8', (err, data) => {
            if (err) { res.statusCode = 404; res.end(); return; }
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
          });
          return;
        }
        if (req.method === 'POST') {
          // копим как Buffer, а не строкой (`body += chunk`) — конкатенация строк режет
          // многобайтовые UTF-8-символы (кириллицу) на границе TCP-чанков и портит JSON
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8');
            enqueue(async () => {
              await rotateHistory();
              await fsp.mkdir(LOCAL_SAVE_DIR, { recursive: true });
              await fsp.writeFile(LOCAL_SAVE_FILE, body);
            }).then(
              () => { res.statusCode = 204; res.end(); },
              () => { res.statusCode = 500; res.end(); },
            );
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

export default defineConfig({
  server: { port: 5173, strictPort: true },
  plugins: [localSavePlugin()],
});
