import { defineConfig } from 'vite';

// strictPort: если 5173 занят — упасть с явной ошибкой, а не тихо уехать на другой порт.
// localStorage (автосейв редактора) привязан к origin, порт включён — переезд на другой
// порт означает переезд на другое хранилище: правки не теряются, но становятся невидимы.
export default defineConfig({
  server: { port: 5173, strictPort: true },
});
