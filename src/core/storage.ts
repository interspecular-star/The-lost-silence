// ============================================================
// Сохранение / загрузка / экспорт игры
// ============================================================

import { Project } from './types';

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function safeFileName(name: string): string {
  return name.replace(/[^\wа-яА-ЯёЁ\- ]/g, '').trim().replace(/\s+/g, '-') || 'project';
}

/** Скачивает проект как .json */
export function saveProjectFile(project: Project) {
  download(
    `${safeFileName(project.meta.name)}.tls.json`,
    JSON.stringify(project, null, 2),
    'application/json',
  );
}

/** Открывает диалог выбора файла и читает проект */
export function openProjectFile(): Promise<Project> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error('Файл не выбран')); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const p = JSON.parse(String(reader.result));
          if (!p || p.formatVersion !== 1 || !Array.isArray(p.scenes)) {
            reject(new Error('Файл не является проектом The Lost Silence'));
            return;
          }
          resolve(p as Project);
        } catch {
          reject(new Error('Не удалось прочитать файл: повреждённый JSON'));
        }
      };
      reader.onerror = () => reject(new Error('Ошибка чтения файла'));
      reader.readAsText(file);
    };
    input.click();
  });
}

/**
 * Экспорт игры: один самодостаточный HTML-файл.
 * Работает на PC и мобильных браузерах без установки.
 */
export async function exportGame(project: Project) {
  const res = await fetch('runtime.js');
  if (!res.ok) throw new Error('runtime.js не найден — пересоберите проект (npm run runtime)');
  const runtime = await res.text();

  // JSON внутри <script>: экранируем закрывающие теги
  const data = JSON.stringify(project).replace(/<\//g, '<\\/');

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>${escapeHtml(project.meta.name)}</title>
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}</style>
</head>
<body>
<script>window.__TLS_PROJECT__=${data};</script>
<script>${runtime}</script>
</body>
</html>`;

  download(`${safeFileName(project.meta.name)}.html`, html, 'text/html');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
