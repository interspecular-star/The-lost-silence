// ============================================================
// Правый sidebar: инспектор мира / элементов / нод диалога
// ============================================================

import { Store } from '../core/store';
import {
  SceneElement, DialogueNode, Condition, Effect, VarValue,
  ELEMENT_TYPE_LABELS, NODE_TYPE_LABELS, SCENE_KIND_LABELS, uid,
} from '../core/types';
import { duplicateElement } from '../core/store';
import {
  h, row, field, section, textInput, numberInput, textArea,
  selectInput, checkbox, toast, pickImageFile,
} from './ui';

export function mountInspector(root: HTMLElement, store: Store) {
  const render = () => {
    root.innerHTML = '';
    if (store.mode === 'scene') {
      const els = store.selectedElements;
      if (els.length === 1) renderElement(els[0]);
      else if (els.length > 1) renderMulti(els);
      else renderScene();
    } else if (store.mode === 'dialogue') {
      const node = store.selectedNode;
      if (node) renderNode(node);
      else renderDialogue();
    } else if (store.mode === 'npc') {
      renderNPCHelp();
    } else if (store.mode === 'items') {
      renderItemsHelp();
    } else if (store.mode === 'quests') {
      const title = h('div', { class: 'insp-title' });
      title.append('Журнал игрока');
      root.appendChild(title);
      root.appendChild(section('Ежедневный ритм',
        h('div', {
          class: 'hint',
          text: 'Суточные задания сбрасываются в полночь, недельные — в понедельник. «Расшифровка OldNet» идёт реальным временем даже при закрытой игре — главный крючок возвращения.\n\nРекомендация: держите 2–4 суточных задания от разных фракций, чтобы игрок ходил по разным NPC.',
        }),
      ));
    } else {
      renderVariablesHelp();
    }
  };

  function renderItemsHelp() {
    const title = h('div', { class: 'insp-title' });
    title.append('Предметы и герой');
    root.appendChild(title);
    root.appendChild(section('Как играется',
      h('div', {
        class: 'hint',
        text: 'В игре (не на страницах-меню) появляются:\n• полосы HP/фокуса и уровень (справа сверху)\n• кнопка 🎒 — инвентарь с манекеном\n\nВ инвентаре: перетащите предмет на слот — экипировка; клик — меню (экипировать/использовать/выбросить).\n\nРеген HP и фокуса идёт автоматически. Опыт (эффект «exp +N») сам повышает уровень и полностью лечит героя.',
      }),
    ));
    root.appendChild(section('Как выдавать предметы',
      h('div', {
        class: 'hint',
        text: '1. Элемент сцены → «Действие по клику» → раздел «Выдать предметы».\n2. Диалог → нода «Действие» → «Выдать предметы».\n\nТак делаются сундуки, награды за квесты и подарки NPC.',
      }),
    ));
  }

  function renderNPCHelp() {
    const title = h('div', { class: 'insp-title' });
    title.append('Персонажи и репутация');
    root.appendChild(title);
    root.appendChild(section('Уровни Осколка',
      h('div', {
        class: 'hint',
        text: 'Переменная oskolok управляет тем, что видит игрок:\n\n0 — устройства нет, репутация скрыта\n1 — шкала отношения собеседника в диалоге\n2 — панель репутации фракций (кнопка ◈ в игре)\n3 — подсказки ▲▼ у вариантов ответа\n4 — следы OldNet (будущая фаза)\n\nВыдайте устройство эффектом «oskolok = 1» в нужном месте сюжета.',
      }),
    ));
    root.appendChild(section('Формула репутации',
      h('div', {
        class: 'hint',
        text: 'Считаются только встреченные NPC.\n\n«Иерархия»: голос с весом 10 значит в 10 раз больше веса 1.\n«Община»: веса игнорируются.\n\nДля сюжетных порогов используйте условия вида:\n{frep_...} ≥ 40  И  связи — через условия «Знаком: Имя» = да.',
      }),
    ));
  }

  // Обёртка мутации: снимок → изменение → событие
  const mutate = (fn: () => void) => {
    store.snapshot();
    fn();
    store.emit('change');
  };

  // ================= СЦЕНА (мир) =================
  function renderScene() {
    const scene = store.currentScene;
    const title = h('div', { class: 'insp-title' });
    title.append('Мир / Сцена', h('span', { class: 'badge', text: scene ? SCENE_KIND_LABELS[scene.kind] : '—' }));
    root.appendChild(title);

    if (!scene) {
      root.appendChild(h('div', { class: 'hint', style: 'padding:0 14px;', text: 'Создайте сцену в левой панели.' }));
      return;
    }

    root.appendChild(section('Сцена',
      row('Название', textInput(scene.name, (v) => mutate(() => { scene.name = v; }))),
      row('Тип', selectInput(scene.kind, [['page', 'Страница'], ['location', 'Локация'], ['level', 'Уровень']],
        (v) => mutate(() => { scene.kind = v as typeof scene.kind; }))),
      row('Стартовая', checkbox(store.project.startSceneId === scene.id, (v) => mutate(() => {
        if (v) store.project.startSceneId = scene.id;
      }), 'игра начинается здесь')),
    ));

    const bgUpload = h('button', { class: 'btn small block', text: '📁 Загрузить картинку фона…' });
    bgUpload.onclick = async () => {
      const uri = await pickImageFile();
      if (uri) mutate(() => { scene.bgImage = uri; });
    };
    const bgClear = h('button', { class: 'btn small block danger-ghost', text: '✕ Убрать картинку' });
    bgClear.onclick = () => mutate(() => { scene.bgImage = undefined; });
    root.appendChild(section('Фон',
      row('Цвет/CSS', textInput(scene.background, (v) => mutate(() => { scene.background = v; }), { placeholder: '#0b1016 или градиент' })),
      h('div', { class: 'hint', text: 'Можно указать цвет (#0b1016) или CSS-градиент. Например: linear-gradient(180deg, #04070c, #0a1622)' }),
      bgUpload,
      ...(scene.bgImage ? [bgClear] : []),
    ));

    const dlgOptions: [string, string][] = [['', '— нет —'], ...store.project.dialogues.map((d) => [d.id, d.name] as [string, string])];
    root.appendChild(section('При входе в сцену',
      row('Диалог', selectInput(scene.onEnterDialogueId ?? '', dlgOptions,
        (v) => mutate(() => { scene.onEnterDialogueId = v || undefined; }))),
      h('div', { class: 'hint', text: 'Диалог запустится автоматически, когда игрок попадёт в эту сцену.' }),
    ));

    // направляющие
    const guidesSection = section('Направляющие');
    if (scene.guides.length === 0) {
      guidesSection.appendChild(h('div', { class: 'hint', text: 'Перетащите с линейки на холст. Элементы прилипают к направляющим при перемещении.' }));
    }
    for (const g of scene.guides) {
      const card = h('div', { class: 'cond-card' });
      const r = h('div', { class: 'row' });
      r.appendChild(h('span', { style: 'color:var(--text-dim);font-size:11px;width:14px;', text: g.axis === 'x' ? 'X' : 'Y' }));
      r.appendChild(numberInput(g.pos, (v) => mutate(() => { g.pos = v; })));
      const del = h('button', { class: 'del', text: '✕', title: 'Удалить направляющую' });
      del.onclick = () => mutate(() => { scene.guides = scene.guides.filter((x) => x !== g); });
      r.appendChild(del);
      card.appendChild(r);
      guidesSection.appendChild(card);
    }
    root.appendChild(guidesSection);

    // тема игры
    const t = store.project.theme;
    root.appendChild(section('Оформление игры',
      row('Акцент', colorRow(t.accent, (v) => mutate(() => { t.accent = v; }))),
      row('Окно диалога', textInput(t.dialogueBox, (v) => mutate(() => { t.dialogueBox = v; }))),
      row('Текст диалога', colorRow(t.dialogueText, (v) => mutate(() => { t.dialogueText = v; }))),
      row('Имя героя', colorRow(t.speakerColor, (v) => mutate(() => { t.speakerColor = v; }))),
      row('Шрифт', textInput(t.font, (v) => mutate(() => { t.font = v; }))),
      h('div', { class: 'hint', text: 'Эти настройки задают вид диалогового окна во всей игре.' }),
    ));
  }

  function colorRow(value: string, onChange: (v: string) => void): HTMLElement {
    const wrap = h('div', { style: 'display:flex;gap:6px;' });
    const color = h('input', { class: 'ed', type: 'color', style: 'flex:0 0 40px;' }) as HTMLInputElement;
    // input[type=color] понимает только #rrggbb
    color.value = /^#[0-9a-f]{6}$/i.test(value) ? value : '#4fd1c5';
    const text = textInput(value, onChange);
    color.oninput = () => { text.value = color.value; };
    color.onchange = () => onChange(color.value);
    wrap.append(color, text);
    return wrap;
  }

  // ================= ЭЛЕМЕНТ =================
  function renderElement(el: SceneElement) {
    const scene = store.currentScene!;
    const title = h('div', { class: 'insp-title' });
    title.append(el.name, h('span', { class: 'badge', text: ELEMENT_TYPE_LABELS[el.type] }));
    root.appendChild(title);

    root.appendChild(section('Элемент',
      row('Имя', textInput(el.name, (v) => mutate(() => { el.name = v; }))),
      (() => {
        const g = h('div', { class: 'insp-grid4' });
        g.append(
          field('X', numberInput(el.x, (v) => mutate(() => { el.x = v; }))),
          field('Y', numberInput(el.y, (v) => mutate(() => { el.y = v; }))),
          field('Ширина', numberInput(el.w, (v) => mutate(() => { el.w = Math.max(8, v); }))),
          field('Высота', numberInput(el.h, (v) => mutate(() => { el.h = Math.max(8, v); }))),
        );
        return g;
      })(),
      (() => {
        const g = h('div', { class: 'insp-grid2' });
        g.append(
          field('Поворот °', numberInput(el.rotation ?? 0, (v) => mutate(() => { el.rotation = v || undefined; }))),
          field('Слой (z)', numberInput(el.zIndex ?? 0, (v) => mutate(() => { el.zIndex = v; }))),
        );
        return g;
      })(),
      (() => {
        const r = h('div', { style: 'display:flex;gap:14px;margin-top:2px;' });
        r.append(
          checkbox(el.visible !== false, (v) => mutate(() => { el.visible = v ? undefined : false; }), 'видим'),
          checkbox(!!el.locked, (v) => mutate(() => { el.locked = v || undefined; }), 'заблокирован'),
        );
        return r;
      })(),
    ));

    // контент
    if (el.type === 'text' || el.type === 'button') {
      root.appendChild(section('Текст',
        textArea(el.text ?? '', (v) => mutate(() => { el.text = v; }), el.type === 'text' ? 5 : 2),
        h('div', { class: 'hint', text: 'Подстановка переменных: напишите {credits} — в игре появится текущее значение переменной с этим именем (кодом).' }),
      ));
    }
    if (el.type === 'image') {
      const upload = h('button', { class: 'btn small block accent', text: '📁 Загрузить файл…' });
      upload.onclick = async () => {
        const uri = await pickImageFile();
        if (uri) mutate(() => { el.src = uri; });
      };
      root.appendChild(section('Изображение',
        upload,
        h('div', { style: 'height:6px' }),
        row('или URL', textInput(el.src?.startsWith('data:') ? '(загружен файл)' : el.src ?? '', (v) => mutate(() => {
          if (v && v !== '(загружен файл)') el.src = v;
          if (!v) el.src = undefined;
        }), { placeholder: 'https://...' })),
        h('div', { class: 'hint', text: 'Загруженный файл встраивается в проект и работает в экспортированной игре без интернета.' }),
      ));
    }

    // стиль
    const s = el.style;
    const styleSection = section('Стиль');
    if (el.type !== 'hotspot') {
      if (el.type !== 'text') {
        styleSection.appendChild(row('Заливка', textInput(s.fill ?? '', (v) => mutate(() => { s.fill = v || undefined; }), { placeholder: 'цвет или rgba(...)' })));
      }
      if (el.type === 'text' || el.type === 'button') {
        styleSection.appendChild(row('Цвет текста', colorRow(s.textColor ?? '#e6edf3', (v) => mutate(() => { s.textColor = v; }))));
        const g = h('div', { class: 'insp-grid2' });
        g.append(
          field('Кегль', numberInput(s.fontSize ?? 24, (v) => mutate(() => { s.fontSize = v; }))),
          field('Насыщенность', selectInput(s.fontWeight ?? '400',
            [['200', 'Тонкий'], ['300', 'Лёгкий'], ['400', 'Обычный'], ['600', 'Полужирный'], ['700', 'Жирный']],
            (v) => mutate(() => { s.fontWeight = v; }))),
          field('Выравнивание', selectInput(s.textAlign ?? 'left',
            [['left', 'Слева'], ['center', 'По центру'], ['right', 'Справа']],
            (v) => mutate(() => { s.textAlign = v as typeof s.textAlign; }))),
          field('Межбуквенный', numberInput(s.letterSpacing ?? 0, (v) => mutate(() => { s.letterSpacing = v || undefined; }))),
          field('Межстрочный', numberInput(s.lineHeight ?? 1.4, (v) => mutate(() => { s.lineHeight = v; }))),
        );
        styleSection.appendChild(g);
      }
      const g2 = h('div', { class: 'insp-grid2' });
      g2.append(
        field('Скругление', numberInput(s.radius ?? 0, (v) => mutate(() => { s.radius = v || undefined; }))),
        field('Прозрачность', numberInput(s.opacity ?? 1, (v) => mutate(() => { s.opacity = v >= 1 ? undefined : Math.max(0, v); }))),
        field('Рамка, px', numberInput(s.borderWidth ?? 0, (v) => mutate(() => { s.borderWidth = v || undefined; }))),
        field('Цвет рамки', textInput(s.borderColor ?? '', (v) => mutate(() => { s.borderColor = v || undefined; }))),
      );
      styleSection.appendChild(g2);
      styleSection.appendChild(checkbox(!!s.shadow, (v) => mutate(() => { s.shadow = v || undefined; }), 'тень'));
    } else {
      styleSection.appendChild(h('div', { class: 'hint', text: 'Зона клика невидима в игре — видна только в редакторе.' }));
    }
    root.appendChild(styleSection);

    // действие
    const actionSection = section('Действие по клику');
    const action = el.action ?? { type: 'none' as const };
    actionSection.appendChild(row('Тип', selectInput(action.type,
      [['none', '— нет —'], ['gotoScene', 'Перейти в сцену'], ['startDialogue', 'Запустить диалог'], ['setVars', 'Изменить переменные'], ['startCombat', 'Начать бой']],
      (v) => mutate(() => { el.action = { type: v as typeof action.type, effects: el.action?.effects }; }))));
    if (action.type === 'gotoScene') {
      actionSection.appendChild(row('Сцена', selectInput(action.sceneId ?? '',
        [['', '— выберите —'], ...store.project.scenes.map((sc) => [sc.id, sc.name] as [string, string])],
        (v) => mutate(() => { action.sceneId = v || undefined; el.action = action; }))));
    }
    if (action.type === 'startDialogue') {
      actionSection.appendChild(row('Диалог', selectInput(action.dialogueId ?? '',
        [['', '— выберите —'], ...store.project.dialogues.map((d) => [d.id, d.name] as [string, string])],
        (v) => mutate(() => { action.dialogueId = v || undefined; el.action = action; }))));
    }
    if (action.type === 'startCombat') {
      const dlgOpts: [string, string][] = [['', '— ничего —'], ...store.project.dialogues.map((d) => [d.id, d.name] as [string, string])];
      actionSection.appendChild(row('Противник', selectInput(action.mobId ?? '',
        [['', '— выберите —'], ...(store.project.mobs ?? []).map((m) => [m.id, m.name] as [string, string])],
        (v) => mutate(() => { action.mobId = v || undefined; el.action = action; }))));
      actionSection.appendChild(row('Победа →', selectInput(action.winDialogueId ?? '', dlgOpts,
        (v) => mutate(() => { action.winDialogueId = v || undefined; el.action = action; }))));
      actionSection.appendChild(row('Поражение →', selectInput(action.loseDialogueId ?? '', dlgOpts,
        (v) => mutate(() => { action.loseDialogueId = v || undefined; el.action = action; }))));
      actionSection.appendChild(h('div', { class: 'hint', text: 'Поражение не убивает: герой остаётся с 1 HP. Награды (опыт, кредиты, дроп) настраиваются в карточке моба.' }));
    }
    if (action.type !== 'none') {
      actionSection.appendChild(h('div', { class: 'insp-section-title', style: 'margin-top:10px;', text: 'Эффекты при клике' }));
      actionSection.appendChild(effectsEditor(action.effects ?? [], (list) => mutate(() => {
        action.effects = list; el.action = action;
      })));
      actionSection.appendChild(h('div', { class: 'insp-section-title', style: 'margin-top:10px;', text: 'Выдать предметы' }));
      actionSection.appendChild(itemGrantsEditor(action.giveItems ?? [], (list) => mutate(() => {
        action.giveItems = list.length ? list : undefined; el.action = action;
      })));
    }
    root.appendChild(actionSection);

    // условная видимость
    const visSection = section('Показывать при условии');
    visSection.appendChild(conditionsEditor(el.visibleIf ?? [], (list) => mutate(() => {
      el.visibleIf = list.length ? list : undefined;
    })));
    visSection.appendChild(h('div', { class: 'hint', text: 'Если условия заданы, элемент виден в игре только когда все они выполнены.' }));
    root.appendChild(visSection);

    // операции
    const ops = section('Операции');
    const dupBtn = h('button', { class: 'btn block', text: '⧉ Дублировать (Ctrl+D)' });
    dupBtn.onclick = () => mutate(() => {
      const copy = duplicateElement(el);
      scene.elements.push(copy);
      store.selectedElementIds = [copy.id];
    });
    const upBtn = h('button', { class: 'btn small', text: '▲ Выше' });
    const downBtn = h('button', { class: 'btn small', text: '▼ Ниже' });
    upBtn.onclick = () => mutate(() => { el.zIndex = (el.zIndex ?? 0) + 1; });
    downBtn.onclick = () => mutate(() => { el.zIndex = (el.zIndex ?? 0) - 1; });
    const zRow = h('div', { style: 'display:flex;gap:6px;margin:8px 0;' });
    zRow.append(upBtn, downBtn);
    const delBtn = h('button', { class: 'btn block danger-ghost', text: '🗑 Удалить (Delete)' });
    delBtn.onclick = () => mutate(() => {
      scene.elements = scene.elements.filter((x) => x.id !== el.id);
      store.selectedElementIds = [];
    });
    ops.append(dupBtn, zRow, delBtn);
    root.appendChild(ops);
  }

  // ================= НЕСКОЛЬКО ЭЛЕМЕНТОВ =================
  function renderMulti(els: SceneElement[]) {
    const title = h('div', { class: 'insp-title' });
    title.append(`Выбрано: ${els.length}`, h('span', { class: 'badge', text: 'группа' }));
    root.appendChild(title);

    const align = (fn: (el: SceneElement, box: { x1: number; y1: number; x2: number; y2: number }) => void) => {
      mutate(() => {
        const box = {
          x1: Math.min(...els.map((e) => e.x)),
          y1: Math.min(...els.map((e) => e.y)),
          x2: Math.max(...els.map((e) => e.x + e.w)),
          y2: Math.max(...els.map((e) => e.y + e.h)),
        };
        els.forEach((e) => fn(e, box));
      });
    };

    const grid = h('div', { class: 'insp-grid2', style: 'grid-template-columns:1fr 1fr 1fr;' });
    const mk = (label: string, fn: () => void) => {
      const b = h('button', { class: 'btn small', text: label });
      b.onclick = fn;
      return b;
    };
    grid.append(
      mk('⭰ Лево', () => align((e, b) => { e.x = b.x1; })),
      mk('⭵ Центр', () => align((e, b) => { e.x = Math.round((b.x1 + b.x2) / 2 - e.w / 2); })),
      mk('⭲ Право', () => align((e, b) => { e.x = b.x2 - e.w; })),
      mk('⭱ Верх', () => align((e, b) => { e.y = b.y1; })),
      mk('⭶ Середина', () => align((e, b) => { e.y = Math.round((b.y1 + b.y2) / 2 - e.h / 2); })),
      mk('⭳ Низ', () => align((e, b) => { e.y = b.y2 - e.h; })),
    );
    root.appendChild(section('Выравнивание', grid));

    const delBtn = h('button', { class: 'btn block danger-ghost', text: '🗑 Удалить выбранные' });
    delBtn.onclick = () => mutate(() => {
      const scene = store.currentScene!;
      scene.elements = scene.elements.filter((x) => !store.selectedElementIds.includes(x.id));
      store.selectedElementIds = [];
    });
    root.appendChild(section('Операции', delBtn));
  }

  // ================= ДИАЛОГ (без выделенной ноды) =================
  function renderDialogue() {
    const dlg = store.currentDialogue;
    const title = h('div', { class: 'insp-title' });
    title.append('Диалог', h('span', { class: 'badge', text: dlg ? `${dlg.nodes.length} нод` : '—' }));
    root.appendChild(title);

    if (!dlg) {
      root.appendChild(h('div', { class: 'hint', style: 'padding:0 14px;', text: 'Создайте диалог в левой панели.' }));
      return;
    }
    root.appendChild(section('Свойства',
      row('Название', textInput(dlg.name, (v) => mutate(() => { dlg.name = v; }))),
    ));
    root.appendChild(section('Подсказки',
      h('div', {
        class: 'hint',
        text: 'Кликните ноду, чтобы редактировать её здесь.\n\n• Реплика — фраза персонажа\n• Выбор — варианты ответа игрока (с условиями и эффектами)\n• Условие — ветвление по переменным\n• Действие — изменение переменных\n• Переход — смена сцены\n• Конец — завершение диалога\n\nСвязи: тяните за круглый порт справа от ноды на другую ноду.',
      }),
    ));
  }

  // ================= НОДА ДИАЛОГА =================
  function renderNode(node: DialogueNode) {
    const dlg = store.currentDialogue!;
    const title = h('div', { class: 'insp-title' });
    title.append(`Нода: ${NODE_TYPE_LABELS[node.type]}`, dlg.startNodeId === node.id ? h('span', { class: 'badge', text: 'старт' }) : '');
    root.appendChild(title);

    if (node.type === 'line') {
      const npcOptions: [string, string][] = [
        ['', '— не NPC (текст ниже) —'],
        ...(store.project.npcs ?? []).map((n) => [n.id, n.name] as [string, string]),
      ];
      const sec = section('Реплика',
        row('Персонаж', selectInput(node.speakerNpcId ?? '', npcOptions,
          (v) => mutate(() => { node.speakerNpcId = v || null; }))),
      );
      if (!node.speakerNpcId) {
        sec.appendChild(row('Имя текстом', textInput(node.speaker ?? '', (v) => mutate(() => { node.speaker = v; }), { placeholder: 'Рассказчик / голос из динамика…' })));
      } else {
        sec.appendChild(h('div', { class: 'hint', text: 'Реплика NPC: при первом разговоре игрок «знакомится» с ним, в диалоге виден портрет и (с Осколком ур.1+) шкала отношения.' }));
      }
      sec.appendChild(textArea(node.text ?? '', (v) => mutate(() => { node.text = v; }), 6));
      root.appendChild(sec);
    }

    if (node.type === 'choice') {
      const sec = section('Варианты ответа');
      (node.choices ?? []).forEach((c, i) => {
        const card = h('div', { class: 'cond-card' });
        const head = h('div', { class: 'row' });
        head.appendChild(h('span', { style: 'color:var(--text-faint);font-size:10px;', text: `#${i + 1}` }));
        const del = h('button', { class: 'del', text: '✕', title: 'Удалить вариант' });
        del.onclick = () => mutate(() => { node.choices = node.choices!.filter((x) => x.id !== c.id); });
        head.appendChild(h('div', { style: 'flex:1' }));
        head.appendChild(del);
        card.appendChild(head);
        card.appendChild(textArea(c.text, (v) => mutate(() => { c.text = v; }), 2));

        card.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);margin-top:4px;', text: 'Условия показа:' }));
        card.appendChild(conditionsEditor(c.conditions, (list) => mutate(() => { c.conditions = list; })));
        card.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);margin-top:4px;', text: 'Эффекты выбора:' }));
        card.appendChild(effectsEditor(c.effects, (list) => mutate(() => { c.effects = list; })));
        sec.appendChild(card);
      });
      const add = h('button', { class: 'btn block', text: '+ Добавить вариант' });
      add.onclick = () => mutate(() => {
        node.choices = node.choices ?? [];
        node.choices.push({ id: uid('ch'), text: `Вариант ${node.choices.length + 1}`, conditions: [], effects: [], next: null });
      });
      sec.appendChild(add);
      root.appendChild(sec);
    }

    if (node.type === 'set') {
      const sec = section('Изменить переменные');
      sec.appendChild(effectsEditor(node.effects ?? [], (list) => mutate(() => { node.effects = list; })));
      sec.appendChild(h('div', { class: 'insp-section-title', style: 'margin-top:10px;', text: 'Выдать предметы' }));
      sec.appendChild(itemGrantsEditor(node.giveItems ?? [], (list) => mutate(() => {
        node.giveItems = list.length ? list : undefined;
      })));
      root.appendChild(sec);
    }

    if (node.type === 'branch') {
      const sec = section('Условия (все должны быть верны)');
      sec.appendChild(conditionsEditor(node.conditions ?? [], (list) => mutate(() => { node.conditions = list; })));
      sec.appendChild(h('div', { class: 'hint', text: 'Зелёный порт ✓ — если верно, красный ✗ — если нет.' }));
      root.appendChild(sec);
    }

    if (node.type === 'jump') {
      root.appendChild(section('Переход',
        row('Сцена', selectInput(node.gotoSceneId ?? '',
          [['', '— выберите —'], ...store.project.scenes.map((sc) => [sc.id, sc.name] as [string, string])],
          (v) => mutate(() => { node.gotoSceneId = v || undefined; }))),
        h('div', { class: 'hint', text: 'Игрок перенесётся в выбранную сцену. Если после перехода есть связь — диалог продолжится в новой сцене.' }),
      ));
    }

    // операции
    const ops = section('Операции');
    if (dlg.startNodeId !== node.id) {
      const startBtn = h('button', { class: 'btn block accent', text: '▶ Сделать стартовой нодой' });
      startBtn.onclick = () => mutate(() => { dlg.startNodeId = node.id; });
      ops.appendChild(startBtn);
      ops.appendChild(h('div', { style: 'height:6px' }));
    }
    const delBtn = h('button', { class: 'btn block danger-ghost', text: '🗑 Удалить ноду (Delete)' });
    delBtn.onclick = () => mutate(() => {
      dlg.nodes = dlg.nodes.filter((n) => n.id !== node.id);
      if (dlg.startNodeId === node.id) dlg.startNodeId = dlg.nodes[0]?.id ?? null;
      for (const n of dlg.nodes) {
        if (n.next === node.id) n.next = null;
        if (n.nextTrue === node.id) n.nextTrue = null;
        if (n.nextFalse === node.id) n.nextFalse = null;
        n.choices?.forEach((c) => { if (c.next === node.id) c.next = null; });
      }
      store.selectedNodeId = null;
    });
    ops.appendChild(delBtn);
    root.appendChild(ops);
  }

  // ================= ВЫДАЧА ПРЕДМЕТОВ =================
  function itemGrantsEditor(
    list: { itemId: string; qty: number }[],
    commit: (list: { itemId: string; qty: number }[]) => void,
  ): HTMLElement {
    const wrap = h('div');
    const items = store.project.items ?? [];
    list.forEach((g, i) => {
      const card = h('div', { class: 'cond-card' });
      const r = h('div', { class: 'row' });
      r.appendChild(selectInput(g.itemId, items.map((it) => [it.id, it.name] as [string, string]), (v) => {
        const copy = list.map((x) => ({ ...x }));
        copy[i].itemId = v;
        commit(copy);
      }));
      const qty = numberInput(g.qty, (v) => {
        const copy = list.map((x) => ({ ...x }));
        copy[i].qty = Math.max(1, Math.round(v));
        commit(copy);
      });
      qty.style.width = '60px';
      qty.style.flex = '0 0 60px';
      r.appendChild(qty);
      const del = h('button', { class: 'del', text: '✕' });
      del.onclick = () => commit(list.filter((_, j) => j !== i));
      r.appendChild(del);
      card.appendChild(r);
      wrap.appendChild(card);
    });
    const add = h('button', { class: 'btn small', text: '+ предмет' });
    add.onclick = () => {
      if (items.length === 0) { toast('Сначала создайте предмет (режим «Предметы»)', true); return; }
      commit([...list.map((x) => ({ ...x })), { itemId: items[0].id, qty: 1 }]);
    };
    wrap.appendChild(add);
    return wrap;
  }

  // ================= РЕДАКТОРЫ УСЛОВИЙ / ЭФФЕКТОВ =================
  function varOptions(forEffects = false): [string, string][] {
    return store.project.variables
      .filter((v) => !(forEffects && v.category === 'computed')) // вычисляемые менять нельзя
      .map((v) => [v.id, v.title]);
  }

  function valueEditor(varId: string, value: VarValue, onChange: (v: VarValue) => void): HTMLElement {
    const def = store.getVariable(varId);
    if (def?.type === 'boolean') {
      return selectInput(String(value === true), [['true', 'да'], ['false', 'нет']], (v) => onChange(v === 'true'));
    }
    if (def?.type === 'number') {
      return numberInput(Number(value) || 0, (v) => onChange(v));
    }
    return textInput(String(value ?? ''), (v) => onChange(v));
  }

  function conditionsEditor(list: Condition[], commit: (list: Condition[]) => void): HTMLElement {
    const wrap = h('div');
    list.forEach((c, i) => {
      const card = h('div', { class: 'cond-card' });
      const r = h('div', { class: 'row' });
      r.appendChild(selectInput(c.varId, varOptions(), (v) => {
        const copy = [...list];
        const def = store.getVariable(v);
        copy[i] = { ...c, varId: v, value: def?.type === 'boolean' ? true : def?.type === 'number' ? 0 : '' };
        commit(copy);
      }));
      r.appendChild(selectInput(c.op, [['eq', '='], ['ne', '≠'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤']], (v) => {
        const copy = [...list];
        copy[i] = { ...c, op: v as Condition['op'] };
        commit(copy);
      }));
      r.appendChild(valueEditor(c.varId, c.value, (v) => {
        const copy = [...list];
        copy[i] = { ...c, value: v };
        commit(copy);
      }));
      const del = h('button', { class: 'del', text: '✕' });
      del.onclick = () => commit(list.filter((_, j) => j !== i));
      r.appendChild(del);
      card.appendChild(r);
      wrap.appendChild(card);
    });
    const add = h('button', { class: 'btn small', text: '+ условие' });
    add.onclick = () => {
      const first = store.project.variables[0];
      if (!first) { toast('Сначала создайте переменную (режим «Переменные»)', true); return; }
      commit([...list, { varId: first.id, op: 'eq', value: first.type === 'boolean' ? true : first.type === 'number' ? 0 : '' }]);
    };
    wrap.appendChild(add);
    return wrap;
  }

  function effectsEditor(list: Effect[], commit: (list: Effect[]) => void): HTMLElement {
    const wrap = h('div');
    list.forEach((e, i) => {
      const card = h('div', { class: 'cond-card' });
      const r = h('div', { class: 'row' });
      r.appendChild(selectInput(e.varId, varOptions(true), (v) => {
        const copy = [...list];
        const def = store.getVariable(v);
        copy[i] = { ...e, varId: v, value: def?.type === 'boolean' ? true : def?.type === 'number' ? 0 : '' };
        commit(copy);
      }));
      r.appendChild(selectInput(e.op, [['set', '='], ['add', '+'], ['sub', '−'], ['toggle', '⇄']], (v) => {
        const copy = [...list];
        copy[i] = { ...e, op: v as Effect['op'] };
        commit(copy);
      }));
      if (e.op !== 'toggle') {
        r.appendChild(valueEditor(e.varId, e.value, (v) => {
          const copy = [...list];
          copy[i] = { ...e, value: v };
          commit(copy);
        }));
      }
      const del = h('button', { class: 'del', text: '✕' });
      del.onclick = () => commit(list.filter((_, j) => j !== i));
      r.appendChild(del);
      card.appendChild(r);
      wrap.appendChild(card);
    });
    const add = h('button', { class: 'btn small', text: '+ эффект' });
    add.onclick = () => {
      const first = store.project.variables.find((v) => v.category !== 'computed');
      if (!first) { toast('Сначала создайте переменную (режим «Переменные»)', true); return; }
      commit([...list, { varId: first.id, op: first.type === 'number' ? 'add' : 'set', value: first.type === 'boolean' ? true : first.type === 'number' ? 1 : '' }]);
    };
    wrap.appendChild(add);
    return wrap;
  }

  // ================= СПРАВКА ПО ПЕРЕМЕННЫМ =================
  function renderVariablesHelp() {
    const title = h('div', { class: 'insp-title' });
    title.append('Переменные');
    root.appendChild(title);
    root.appendChild(section('Как это работает',
      h('div', {
        class: 'hint',
        text: 'Переменные — память игры.\n\n• Репутация — отношение фракций к герою. Меняется эффектами в диалогах.\n• Обычные — флаги сюжета, ресурсы, счётчики.\n\nГде используются:\n• условия показа вариантов ответа\n• ветвления «Условие» в диалогах\n• условная видимость элементов сцены\n• эффекты выбора и действий\n\nОтметьте «Следить» — и переменная появится в панели наблюдения при предпросмотре игры.',
      }),
    ));
  }

  store.on('change', render);
  store.on('selection', render);
  store.on('mode', render);
  store.on('project', render);
  render();
}
