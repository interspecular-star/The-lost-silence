# The Lost Silence — редактор + игра

Нарративная игра (диалоги, решения, репутация, немного RPG/idle) в футуристическом сеттинге.
Владелец проекта — энтузиаст, НЕ программист: объяснять просто, решения по коду/геймдизайну принимает Claude.
Общение — на русском языке.

## Лор (канон)
`docs/dev/The lost silence lore.docx` (извлечённый текст: `docs/dev/lore.txt`).
Кратко: 2670+ год. Архон — беглец из схлопнувшегося верхнего слоя симуляции, живёт как «ИИ».
Катастрофа 2034 — исчезло 95% человечества (ошибка Архона, скрыта). Cerebral Mesh — обязательный
«второй голос» в сознании; CleanNet — стерильная сеть; OldNet — запретный старый интернет с правдой.
Nexus — планетарная мегаструктура «сглаживания». 6 фракций: Flux Nomads, Sylvarium, Woodhaven,
Cavernium, Aeralis, Hydrosynth. ГГ — человек из 2030-х, 600 лет в стазисе, без Mesh, помнит тишину.
Спасён Матисом (Flux Nomads). 3 финала: Отключение / Переписывание / Симбиоз.

## Архитектура
- **Стек**: Vite + TypeScript, без фреймворков. Редактор — веб-приложение; экспорт игры — один самодостаточный HTML (PC + мобильные браузеры).
- **Команды**: `npm run dev` (редактор на localhost), `npm run build` (dist/), `npm run runtime` (собирает public/runtime.js через esbuild — нужен для экспорта игры из редактора).
- Холст: логические координаты **1920×1080** (16:9), в игре элементы позиционируются в процентах, шрифты через `cqw` (container queries; `fitStage()` включает `container-type: size`).

### Файлы
- `src/core/types.ts` — вся модель данных (Project/Scene/SceneElement/Dialogue/DialogueNode/VariableDef/Condition/Effect/Theme). formatVersion: 1.
- `src/core/store.ts` — Store: состояние, undo/redo (снапшоты JSON, вызывать `store.snapshot()` ПЕРЕД мутацией, потом `store.emit('change')`), автосейв в localStorage (`tls_project`).
- `src/core/seed.ts` — стартовый проект по лору (меню, капсула, лаборатория, диалог с Матисом, переменные репутации 6 фракций).
- `src/core/storage.ts` — сохранение/загрузка `.tls.json`, экспорт игры (встраивает `public/runtime.js` + JSON проекта в один HTML).
- `src/runtime/engine.ts` — движок игры (сцены, диалоги, условия/эффекты). Общий для предпросмотра и экспорта. `standalone.ts` — вход экспортированной игры (`window.__TLS_PROJECT__`).
- `src/editor/` — main.ts (bootstrap, 3 режима: scene/dialogue/variables), topbar.ts, sidebar.ts (сцены по типам страница/локация/уровень + слои; диалоги), inspector.ts (правая панель: мир/элемент/нода/выравнивание), stage.ts (холст: зум ctrl+wheel, панорама space/средняя кнопка, линейки canvas, направляющие drag-с-линейки, прилипание к направляющим/краям/центрам/элементам, resize 8 ручек), graph.ts (нодовый редактор диалогов: порты, связи-безье, клик по линии = удалить), variables.ts, preview.ts (движок + панель отслеживаемых переменных), hotkeys.ts (Del, стрелки, Ctrl+D/Z/Y/S, F5 предпросмотр).

### Типы нод диалога
line (реплика), choice (варианты + условия показа + эффекты), set (эффекты), branch (условия → true/false), jump (смена сцены), end.

## Состояние (2026-07-02, вечер)
MVP протестирован автоматически (playwright-core + установленный Chrome, скрипты в scratchpad):
все режимы, прохождение диалога с эффектами/ветвлением, drag/resize/направляющие/прилипание,
порты графа, undo, экспорт игры (проверен в «мобильном» окне). Исправлено: обрезанный заголовок
в seed, полупрозрачный оверлей предпросмотра, favicon 404, слишком широкая зона захвата
направляющих (перехватывала клики по элементам). `window.__store` доступен из консоли для отладки.
Тест-паттерн: `node scripts/e2e-smoke.mjs` (если создан) или ad-hoc скрипты с
`import { chromium } from 'file:///C:/The%20lost%20silence/node_modules/playwright-core/index.mjs'`,
`chromium.launch({ channel: 'chrome', headless: true })`.

## Idle/RPG-подсистема (готово, протестировано)
- `IdleRule` в types.ts: переменная растёт со временем (ratePerMin, max, offline, conditions, enabled).
  Редактируются в режиме «Переменные» (таблица внизу). Пример в seed: кредиты 2/мин до 1000.
- Движок: тик раз в секунду; сейв игрока в `localStorage['tls_save_<имя проекта>']`
  (vars + sceneId + savedAt); оффлайн-прогресс начисляется при загрузке за (now − savedAt).
  `persist: true` только в экспортированной игре; предпросмотр всегда с чистого листа. `engine.destroy()` глушит таймеры.
- Интерполяция: `{имя_переменной}` в тексте элементов, репликах и вариантах ответа
  подменяется живым значением (числа — floor, boolean — да/нет).
- Загрузка изображений: кнопки в инспекторе (элемент-изображение и фон сцены) → data-URI
  (встраивается в проект и экспорт; предупреждение при >2.5 МБ из-за лимита localStorage).

## Дальнейшие планы (по приоритету)
Утверждён дизайн игровых систем: **`docs/dev/design.md`** (репутация через NPC с весами,
Осколок-Mesh со ступенями UI, характеристики, инвентарь 8 слотов+ячейки, пошаговые QTE-бои,
idle: контракты/дроны/расшифровка OldNet, суточные задания). Читать перед работой над системами.

Дорожная карта (фаза = модуль редактора + e2e + коммит):
1. ~~NPC и отношения~~ ✔ (2026-07-02): режим «Персонажи» (фракции: цвет/repMode
   weighted|equal/вычисляемая `{frep_*}`; NPC: вес 1–10, портрет data-URI или авто-силуэт,
   старт. отношение). Авто-переменные category:'npc' (`rel_*`, `met_*`) и 'computed' —
   скрыты из таблицы переменных, эффекты на computed запрещены. Реплика: `speakerNpcId`
   (знакомство ставится движком при первой реплике). Формула в `src/core/npc.ts`
   (`computeFactionRep`, материализация в state). Осколок: `project.oskolokVarName`
   (переменная oskolok 0–4) — ур.1 шкала отношения в диалоге, ур.2 HUD ◈ панель фракций,
   ур.3 подсказки ▲▼ на вариантах, ур.4 зарезервирован (OldNet). Отношения зажаты 0..100.
2. ~~Характеристики + предметы + инвентарь~~ ✔ (2026-07-02): режим «Предметы» — конфиг героя
   (`project.hero`: baseStats/growth по StatKey, baseCells, cellsPerEndur, regenHp/Foc,
   startItems) + карточки предметов (`project.items`: тип weapon/armor/gadget/consumable/
   resource, слот из 8, редкость junk→archon, статы, cellsBonus, stack, questItem-флаг,
   useEffects). `src/core/hero.ts`: ensureHeroSystem (авто-переменные category:'hero'
   lvl/exp/hp/foc + computed статы, exp_need), expNeed=100×lvl^1.5, materializeHeroStats,
   computeCells, itemIcon-плейсхолдеры. Движок: инвентарь/экипировка в сейве, giveItems
   (action.giveItems и set-ноды; стеки), useItem, equip/unequip, реген-тик, checkLevelUp
   (полный хил), HUD (полосы hp/foc, lvl, 🎒; не на kind:'page'), экран инвентаря
   (манекен 8 слотов, drag-and-drop pointer-события, клик-меню, сортировка, уведомления).
3. ~~Бои~~ ✔ (2026-07-02): режим «Мобы» (`project.mobs`: hp/atk/def/telegraphMs/critChance/
   expReward/creditsReward/drops с шансами). `src/runtime/combat.ts` — runCombat(engine, mob, onEnd):
   пошаговые QTE — Атака/Спецудар (25 foc, ×1.8, крит по crit_chance/crit_pow), замах моба
   (полоса telegraphMs, зелёная зона = окно уклона 350+agi×15 мс, парирование 45% окна:
   отражает 50% + 10 foc; ранний клик тратит попытку). Поражение = hp 1, без наград.
   Запуск: действие элемента 'startCombat' (mobId, winDialogueId/loseDialogueId).
   engine.inCombat глушит реген. HUD объединён: слева ◈+lvl+hp/foc+🎒, справа валюта
   (`project.currencyVarName`, по умолчанию 'credits').
4. ~~Idle-расширение + задания~~ ✔ (2026-07-02): режим «Журнал» — QuestDef (daily/weekly/story,
   условия→награды; ключи сброса в `runtime/journal.ts` resetKey: дата / ISO-неделя / 'once'),
   UpgradeDef (усиливает idle-правило: +ratePerLevel/мин за уровень, цена costBase×costGrowth^lvl,
   валюта по имени переменной), DecodeDef (предмет-фрагмент → реальное время durationMin →
   rewardText «кусок правды» + эффекты/предметы; работает оффлайн через timestamps).
   В игре: кнопка 📋 (HUD) → журнал с 3 вкладками. Сейв: claims/ups/decode.
   engine.effectiveRate() учитывает улучшения; движок сам ведёт `kills_total` (если переменная
   создана) — для заданий на победы. Демо в seed: 3 задания, дрон-сборщик, фрагмент OldNet
   (durationMin: 1 для демо).
5. Контент интро по Тому III — СЛЕДУЮЩАЯ (последняя фаза дорожной карты).

Прочее: мобильная адаптация редактора не нужна (мобильные — только игра).
~~Git~~ ✔ — github.com/interspecular-star/The-lost-silence (main). Коммитить по завершении крупных шагов.
