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
const LOCAL_SAVE_FILE = path.resolve(__dirname, 'local-save', 'project.json');

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
            fs.mkdir(path.dirname(LOCAL_SAVE_FILE), { recursive: true }, () => {
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
