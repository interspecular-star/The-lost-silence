import { defineConfig, Plugin } from 'vite';
import fs from 'node:fs';
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

/** Перед перезаписью — копия предыдущей версии в history/. Не даёт одному плохому POST'у стереть всё бесследно. */
function rotateHistory() {
  fs.readFile(LOCAL_SAVE_FILE, (err, prev) => {
    if (err || !prev.length) return; // нечего архивировать
    fs.mkdir(LOCAL_SAVE_HISTORY_DIR, { recursive: true }, () => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFile(path.join(LOCAL_SAVE_HISTORY_DIR, `${stamp}.json`), prev, () => {
        fs.readdir(LOCAL_SAVE_HISTORY_DIR, (e, files) => {
          if (e) return;
          const sorted = files.filter((f) => f.endsWith('.json')).sort();
          const excess = sorted.slice(0, Math.max(0, sorted.length - HISTORY_LIMIT));
          for (const f of excess) fs.unlink(path.join(LOCAL_SAVE_HISTORY_DIR, f), () => {});
        });
      });
    });
  });
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
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            rotateHistory();
            fs.mkdir(LOCAL_SAVE_DIR, { recursive: true }, () => {
              fs.writeFile(LOCAL_SAVE_FILE, body, (err) => {
                res.statusCode = err ? 500 : 204;
                res.end();
              });
            });
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
