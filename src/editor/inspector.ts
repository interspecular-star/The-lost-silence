// ============================================================
// Правый sidebar: инспектор мира / элементов / нод диалога
// ============================================================

import { Store } from '../core/store';
import {
  SceneElement, DialogueNode, Condition, Effect, VarValue, VarType,
  ELEMENT_TYPE_LABELS, NODE_TYPE_LABELS, SCENE_KIND_LABELS, uid,
  BgEffectType, BG_EFFECT_META, SceneBackgroundAdjust, Scene,
  BoxSurface, BoxBorderFx, BoxStyle, BoxTempo, BoxIntensity, ElementFxKind, TextGuard,
} from '../core/types';
import { TEXT_GUARD_LABELS } from '../runtime/elementfx';
import { BOX_BORDER_LABELS, BOX_SURFACE_LABELS, BOX_TEMPO_LABELS, BOX_INTENSITY_LABELS } from '../runtime/boxfx';
import { materialPreview } from './matpreview';
import { duplicateElement } from '../core/store';
import { colorField, backgroundField } from './colorui';
import { richTextArea } from './richtext';
import {
  h, row, field, section, textInput, numberInput, textArea,
  selectInput, checkbox, toast, pickImageFile, rangeInput,
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
      row('HUD', selectInput(scene.hudMode ?? 'auto', [
        ['auto', 'Авто (скрыт на страницах)'],
        ['on', 'Показывать'],
        ['off', 'Скрывать'],
      ], (v) => mutate(() => { scene.hudMode = v as typeof scene.hudMode; }))),
    ));

    const bgUpload = h('button', { class: 'btn small block', text: '📁 Загрузить картинку фона…' });
    bgUpload.onclick = async () => {
      const uri = await pickImageFile();
      if (uri) mutate(() => { scene.bgImage = uri; });
    };
    const bgClear = h('button', { class: 'btn small block danger-ghost', text: '✕ Убрать картинку' });
    bgClear.onclick = () => mutate(() => { scene.bgImage = undefined; });
    root.appendChild(section('Фон',
      backgroundField(scene.background, (v) => mutate(() => { scene.background = v; })),
      h('div', { class: 'hint', text: 'Образцы и пресеты — быстрый выбор «на глаз». В текстовое поле по-прежнему можно вписать свой цвет или CSS-градиент.' }),
      bgUpload,
      ...(scene.bgImage ? [bgClear] : []),
    ));

    const bg = scene.bg ?? {};
    const bgAdjust = <K extends keyof SceneBackgroundAdjust>(key: K, v: number) => mutate(() => {
      scene.bg = { ...(scene.bg ?? {}), [key]: v };
    });
    root.appendChild(section('Настройка изображения',
      row('Прозрачность', rangeInput(bg.opacity ?? 100, 0, 100, 1, (v) => bgAdjust('opacity', v))),
      row('Яркость', rangeInput(bg.brightness ?? 100, 0, 200, 1, (v) => bgAdjust('brightness', v))),
      row('Контраст', rangeInput(bg.contrast ?? 100, 0, 200, 1, (v) => bgAdjust('contrast', v))),
      row('Размытие', rangeInput(bg.blur ?? 0, 0, 20, 0.5, (v) => bgAdjust('blur', v))),
      row('Положение X', rangeInput(bg.posX ?? 50, 0, 100, 1, (v) => bgAdjust('posX', v))),
      row('Положение Y', rangeInput(bg.posY ?? 50, 0, 100, 1, (v) => bgAdjust('posY', v))),
      row('Масштаб', rangeInput(bg.scale ?? 100, 100, 200, 1, (v) => bgAdjust('scale', v))),
      row('Параллакс', rangeInput(bg.parallax ?? 0, -100, 100, 1, (v) => bgAdjust('parallax', v))),
      h('div', {
        class: 'hint',
        text: 'Параллакс сдвигает фон за курсором в предпросмотре/игре: положительное значение — обычный (фон «плывёт» позади), отрицательное — обратный (фон тянется к курсору). Масштаб и параллакс видны только в F5, не на холсте.',
      }),
    ));

    root.appendChild(bgEffectsSection(scene));

    // переопределение материалов на этой сцене (сцена > фракция > тема)
    const sceneMaterial = (
      title: string,
      get: () => Scene['dialogueBoxStyle'],
      assign: (v: Scene['dialogueBoxStyle']) => void,
      withHover: boolean,
    ): HTMLElement[] => {
      const cur = get();
      const setPatch = (patch: NonNullable<Scene['dialogueBoxStyle']>) => mutate(() => {
        assign({ ...(get() ?? {}), ...patch });
      });
      const toggle = checkbox(!!cur, (v) => mutate(() => {
        assign(v ? { surface: 'spatial', border: 'shimmer' } : undefined);
      }), title);
      if (!cur) return [toggle];
      return [
        toggle,
        row('Поверхность', selectInput(cur.surface ?? 'default',
          Object.entries(BOX_SURFACE_LABELS) as [string, string][],
          (v) => setPatch({ surface: v as BoxSurface }))),
        row('Рамка', selectInput(cur.border ?? 'none',
          Object.entries(BOX_BORDER_LABELS) as [string, string][],
          (v) => setPatch({ border: v as BoxBorderFx }))),
        ...(withHover && (cur.border ?? 'none') !== 'none'
          ? [checkbox(!!cur.hoverOnly, (v) => setPatch({ hoverOnly: v || undefined }), 'рамка только при наведении')]
          : []),
        ...((cur.surface ?? 'default') === 'spatial' ? [
          row('Стекло, %', rangeInput(cur.glass ?? 14, 0, 40, 1, (v) => setPatch({ glass: v }))),
          row('Скругление', rangeInput(cur.radius ?? (withHover ? 10 : 16), 0, 28, 1, (v) => setPatch({ radius: v }))),
        ] : []),
        ...borderTuning(cur, setPatch),
        materialPreview(cur, store.project.theme.accent, withHover ? 'button' : 'panel',
          withHover ? store.project.theme.choiceBg : store.project.theme.dialogueBox),
      ];
    };
    root.appendChild(section('Материалы на этой сцене',
      ...sceneMaterial('переопределить диалоговый блок', () => scene.dialogueBoxStyle, (v) => { scene.dialogueBoxStyle = v; }, false),
      ...sceneMaterial('переопределить варианты ответа', () => scene.choiceStyle, (v) => { scene.choiceStyle = v; }, true),
      h('div', { class: 'hint', text: 'Приоритет: сцена > фракция собеседника > тема проекта. Выключенная галка — сцена наследует общий вид.' }),
    ));

    const dlgOptions: [string, string][] = [['', '— нет —'], ...store.project.dialogues.map((d) => [d.id, d.name] as [string, string])];
    root.appendChild(section('При входе в сцену',
      row('Диалог', selectInput(scene.onEnterDialogueId ?? '', dlgOptions,
        (v) => mutate(() => { scene.onEnterDialogueId = v || undefined; }))),
      h('div', { class: 'hint', text: 'Диалог запустится автоматически, когда игрок попадёт в эту сцену.' }),
    ));

    // автопереход + длительность фейда (флэшбэки, титры глав)
    const sceneOptions: [string, string][] = [['', '— нет (сцена ждёт игрока) —'],
      ...store.project.scenes.filter((s) => s.id !== scene.id).map((s) => [s.id, s.name] as [string, string])];
    root.appendChild(section('Переход дальше',
      row('Автопереход в', selectInput(scene.autoNext?.sceneId ?? '', sceneOptions, (v) => mutate(() => {
        scene.autoNext = v ? { sceneId: v, delaySec: scene.autoNext?.delaySec ?? 4 } : undefined;
      }))),
      ...(scene.autoNext ? [
        row('Через, с', numberInput(scene.autoNext.delaySec, (v) => mutate(() => {
          scene.autoNext = { ...scene.autoNext!, delaySec: Math.max(0.3, v) };
        }))),
      ] : []),
      row('Фейд ухода, с', numberInput(scene.fadeSec ?? 0.22, (v) => mutate(() => {
        scene.fadeSec = v === 0.22 ? undefined : Math.max(0, Math.min(5, v));
      }))),
      h('div', { class: 'hint', text: 'Автопереход — для флэшбэков и титров глав: сцена сама уходит дальше (диалог и бой не прерываются — подождёт). «Фейд ухода» — скорость затемнения при уходе С этой сцены: 1.5–2 для кинематографичных смен глав.' }),
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
    const ds = t.dialogueBoxStyle ?? {};
    const setDs = (patch: Partial<NonNullable<typeof t.dialogueBoxStyle>>) => mutate(() => {
      t.dialogueBoxStyle = { ...(t.dialogueBoxStyle ?? {}), ...patch };
    });
    root.appendChild(section('Оформление игры',
      row('Акцент', colorRow(t.accent, (v) => mutate(() => { t.accent = v; }))),
      row('Окно диалога', textInput(t.dialogueBox, (v) => mutate(() => { t.dialogueBox = v; }))),
      row('Текст диалога', colorRow(t.dialogueText, (v) => mutate(() => { t.dialogueText = v; }))),
      row('Имя героя', colorRow(t.speakerColor, (v) => mutate(() => { t.speakerColor = v; }))),
      row('Шрифт', textInput(t.font, (v) => mutate(() => { t.font = v; }))),
      h('div', { class: 'hint', text: 'Эти настройки задают вид диалогового окна во всей игре.' }),
    ));

    // материал диалогового блока (spatial/рамки) — см. runtime/boxfx.ts
    root.appendChild(section('Материал диалогового блока',
      row('Поверхность', selectInput(ds.surface ?? 'default',
        Object.entries(BOX_SURFACE_LABELS) as [string, string][],
        (v) => setDs({ surface: v as BoxSurface }))),
      row('Рамка', selectInput(ds.border ?? 'none',
        Object.entries(BOX_BORDER_LABELS) as [string, string][],
        (v) => setDs({ border: v as BoxBorderFx }))),
      ...((ds.surface ?? 'default') === 'spatial' ? [
        row('Стекло, %', rangeInput(ds.glass ?? 14, 0, 40, 1, (v) => setDs({ glass: v }))),
        row('Скругление', rangeInput(ds.radius ?? 16, 0, 28, 1, (v) => setDs({ radius: v }))),
      ] : []),
      ...borderTuning(ds, setDs),
      materialPreview(t.dialogueBoxStyle, t.accent, 'panel', t.dialogueBox),
      h('div', { class: 'hint', text: 'Видно в предпросмотре (F5) и в игре. Песочница со всеми стилями: страница /style-lab.html на адресе редактора (проект не трогает).' }),
    ));

    // материал вариантов ответа
    const cs = t.choiceStyle ?? {};
    const setCs = (patch: Partial<NonNullable<typeof t.choiceStyle>>) => mutate(() => {
      t.choiceStyle = { ...(t.choiceStyle ?? {}), ...patch };
    });
    root.appendChild(section('Материал вариантов ответа',
      row('Поверхность', selectInput(cs.surface ?? 'default',
        Object.entries(BOX_SURFACE_LABELS) as [string, string][],
        (v) => setCs({ surface: v as BoxSurface }))),
      row('Рамка', selectInput(cs.border ?? 'none',
        Object.entries(BOX_BORDER_LABELS) as [string, string][],
        (v) => setCs({ border: v as BoxBorderFx }))),
      ...((cs.border ?? 'none') !== 'none'
        ? [checkbox(!!cs.hoverOnly, (v) => setCs({ hoverOnly: v || undefined }), 'рамка только при наведении')]
        : []),
      ...((cs.surface ?? 'default') === 'spatial' ? [
        row('Стекло, %', rangeInput(cs.glass ?? 14, 0, 40, 1, (v) => setCs({ glass: v }))),
        row('Скругление', rangeInput(cs.radius ?? 10, 0, 20, 1, (v) => setCs({ radius: v }))),
      ] : []),
      ...borderTuning(cs, setCs),
      materialPreview(t.choiceStyle, t.accent, 'button', t.choiceBg),
    ));

    // ---- библиотека материалов (H2): именованные пресеты проекта ----
    const libSection = section('Библиотека материалов');
    const mats = store.project.materials ?? [];
    if (mats.length === 0) {
      libSection.appendChild(h('div', { class: 'hint', text: 'Именованные пресеты («Архон», «Допрос», «Костёр»…). Назначаются на NPC, диалог или отдельную реплику — приоритетнее фракции и сцены.' }));
    }
    const boxControls = (cur: BoxStyle, set: (patch: Partial<BoxStyle>) => void, kind: 'panel' | 'button'): HTMLElement[] => [
      row('Поверхность', selectInput(cur.surface ?? 'default',
        Object.entries(BOX_SURFACE_LABELS) as [string, string][],
        (v) => set({ surface: v as BoxSurface }))),
      row('Рамка', selectInput(cur.border ?? 'none',
        Object.entries(BOX_BORDER_LABELS) as [string, string][],
        (v) => set({ border: v as BoxBorderFx }))),
      ...(kind === 'button' && (cur.border ?? 'none') !== 'none'
        ? [checkbox(!!cur.hoverOnly, (v) => set({ hoverOnly: v || undefined }), 'рамка только при наведении')]
        : []),
      ...((cur.surface ?? 'default') === 'spatial' ? [
        row('Стекло, %', rangeInput(cur.glass ?? 14, 0, 40, 1, (v) => set({ glass: v }))),
        row('Скругление', rangeInput(cur.radius ?? (kind === 'button' ? 10 : 16), 0, 28, 1, (v) => set({ radius: v }))),
      ] : []),
      ...borderTuning(cur, set),
    ];
    for (const m of mats) {
      const card = h('div', { class: 'cond-card' });
      const head = h('div', { style: 'display:flex;gap:6px;align-items:center;' });
      head.appendChild(textInput(m.name, (v) => mutate(() => { m.name = v; })));
      const del = h('button', { class: 'del', text: '✕', title: 'Удалить материал' });
      del.onclick = () => mutate(() => {
        store.project.materials = (store.project.materials ?? []).filter((x) => x.id !== m.id);
      });
      head.appendChild(del);
      card.appendChild(head);
      for (const el of boxControls(m.box, (p) => mutate(() => { Object.assign(m.box, p); }), 'panel')) card.appendChild(el);
      card.appendChild(materialPreview(m.box, m.box.accent ?? t.accent, 'panel', t.dialogueBox));
      card.appendChild(checkbox(!!m.choice, (v) => mutate(() => {
        m.choice = v ? { surface: 'spatial', border: 'none' } : undefined;
      }), 'свой материал вариантов ответа'));
      if (m.choice) {
        const ch = m.choice;
        for (const el of boxControls(ch, (p) => mutate(() => { Object.assign(ch, p); }), 'button')) card.appendChild(el);
        card.appendChild(materialPreview(ch, ch.accent ?? t.accent, 'button', t.choiceBg));
      }
      libSection.appendChild(card);
    }
    const addMat = h('button', { class: 'btn small', text: '+ материал' });
    addMat.onclick = () => mutate(() => {
      store.project.materials = [...(store.project.materials ?? []), {
        id: uid('mat'), name: 'Новый материал', box: { surface: 'spatial', border: 'shimmer' },
      }];
    });
    libSection.appendChild(addMat);
    libSection.appendChild(h('div', { class: 'hint', text: 'Где назначить: реплика/диалог — в нодовом редакторе; NPC — в «Персонажах». Правка пресета меняет вид везде, где он использован.' }));
    root.appendChild(libSection);
  }

  // палитра + пипетка + текст (см. colorui.ts)
  const colorRow = colorField;

  /** Общие ручки рамки: темп/сила/свой цвет (показываются, когда рамка выбрана) */
  function borderTuning(cur: BoxStyle, set: (patch: Partial<BoxStyle>) => void): HTMLElement[] {
    if ((cur.border ?? 'none') === 'none') return [];
    return [
      row('Темп', selectInput(cur.tempo ?? 'normal',
        Object.entries(BOX_TEMPO_LABELS) as [string, string][],
        (v) => set({ tempo: v === 'normal' ? undefined : v as BoxTempo }))),
      row('Сила', selectInput(cur.intensity ?? 'normal',
        Object.entries(BOX_INTENSITY_LABELS) as [string, string][],
        (v) => set({ intensity: v === 'normal' ? undefined : v as BoxIntensity }))),
      row('Цвет рамки', colorRow(cur.accent ?? '', (v) => set({ accent: v || undefined }))),
    ];
  }

  const BG_EFFECT_OPTIONS: [string, string][] = Object.entries(BG_EFFECT_META).map(([k, m]) => [k, m.label]);

  function bgEffectsSection(scene: Scene): HTMLElement {
    const rules = scene.bgEffects ?? [];
    const list = h('div');
    rules.forEach((rule, i) => {
      const meta = BG_EFFECT_META[rule.type];
      const card = h('div', { class: 'cond-card' });
      const typeRow = h('div', { class: 'row' });
      typeRow.appendChild(selectInput(rule.type, BG_EFFECT_OPTIONS, (v) => mutate(() => {
        rule.type = v as BgEffectType;
        if (BG_EFFECT_META[rule.type].hasColor && !rule.color) rule.color = '#3a6ea5';
      })));
      const del = h('button', { class: 'del', text: '✕', title: 'Удалить эффект' });
      del.onclick = () => mutate(() => { scene.bgEffects = rules.filter((_, j) => j !== i); });
      typeRow.appendChild(del);
      card.appendChild(typeRow);
      card.appendChild(h('div', { class: 'hint', text: meta.hint }));
      card.appendChild(row('Сила', rangeInput(rule.intensity, 0, 100, 1, (v) => mutate(() => { rule.intensity = v; }))));
      if (meta.hasColor) {
        card.appendChild(row('Цвет', colorRow(rule.color ?? '#3a6ea5', (v) => mutate(() => { rule.color = v; }))));
      }
      card.appendChild(h('div', { class: 'hint', text: 'Условия (пусто — эффект активен всегда):' }));
      card.appendChild(conditionsEditor(rule.conditions, (list2) => mutate(() => { rule.conditions = list2; })));
      list.appendChild(card);
    });
    const add = h('button', { class: 'btn small', text: '+ эффект' });
    add.onclick = () => mutate(() => {
      scene.bgEffects = [...rules, { id: uid('bgfx'), type: 'vignette' as BgEffectType, intensity: 60, conditions: [] }];
    });
    return section('Эффекты фона',
      list, add,
      h('div', {
        class: 'hint',
        text: 'Наслаиваются друг на друга, когда условия истинны — так можно показать напряжение, усталость, сбой Mesh и т.д. Видно только в F5, не на холсте.',
      }),
    );
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
        richTextArea(el.text ?? '', (v) => mutate(() => { el.text = v; }), el.type === 'text' ? 5 : 2),
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
        styleSection.appendChild(row('Заливка', colorRow(s.fill ?? '', (v) => mutate(() => { s.fill = v || undefined; }))));
      }
      if (el.type === 'text' || el.type === 'button') {
        styleSection.appendChild(row('Цвет текста', colorRow(s.textColor ?? '#e6edf3', (v) => mutate(() => { s.textColor = v; }))));
        styleSection.appendChild(row('Читаемость', selectInput(s.guard ?? '',
          Object.entries(TEXT_GUARD_LABELS) as [string, string][],
          (v) => mutate(() => {
            s.guard = (v || undefined) as TextGuard | undefined;
            if (!s.guard) s.guardPower = undefined;
          }))));
        if (s.guard) {
          styleSection.appendChild(row('Сила', rangeInput(s.guardPower ?? 2, 1, 3, 1,
            (v) => mutate(() => { s.guardPower = v === 2 ? undefined : v; }))));
        }
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
        field('Цвет рамки', colorRow(s.borderColor ?? '', (v) => mutate(() => { s.borderColor = v || undefined; }))),
      );
      styleSection.appendChild(g2);
      styleSection.appendChild(checkbox(!!s.shadow, (v) => mutate(() => { s.shadow = v || undefined; }), 'тень'));
    } else {
      styleSection.appendChild(h('div', { class: 'hint', text: 'Зона клика невидима в игре — видна только в редакторе.' }));
    }
    root.appendChild(styleSection);

    // материал кнопки (spatial/анимированная рамка)
    if (el.type === 'button') {
      const bs = el.boxStyle ?? {};
      const setBs = (patch: Partial<NonNullable<typeof el.boxStyle>>) => mutate(() => {
        el.boxStyle = { ...(el.boxStyle ?? {}), ...patch };
      });
      root.appendChild(section('Материал кнопки',
        row('Поверхность', selectInput(bs.surface ?? 'default',
          Object.entries(BOX_SURFACE_LABELS) as [string, string][],
          (v) => setBs({ surface: v as BoxSurface }))),
        row('Рамка', selectInput(bs.border ?? 'none',
          Object.entries(BOX_BORDER_LABELS) as [string, string][],
          (v) => setBs({ border: v as BoxBorderFx }))),
        ...((bs.border ?? 'none') !== 'none'
          ? [checkbox(!!bs.hoverOnly, (v) => setBs({ hoverOnly: v || undefined }), 'рамка только при наведении')]
          : []),
        ...((bs.surface ?? 'default') === 'spatial'
          ? [row('Стекло, %', rangeInput(bs.glass ?? 14, 0, 40, 1, (v) => setBs({ glass: v })))]
          : []),
        ...borderTuning(bs, setBs),
        materialPreview({ ...bs, radius: bs.radius ?? s.radius ?? 10 }, store.project.theme.accent, 'button', s.fill || 'rgba(79,209,197,0.10)'),
        h('div', { class: 'hint', text: 'Скругление берётся из «Стиля» выше. Поверхность видна на холсте, анимации рамки — в предпросмотре (F5) и игре.' }),
      ));
    }

    // действие
    const actionSection = section('Действие по клику');
    const action = el.action ?? { type: 'none' as const };
    actionSection.appendChild(row('Тип', selectInput(action.type,
      [['none', '— нет —'], ['gotoScene', 'Перейти в сцену'], ['startDialogue', 'Запустить диалог'], ['setVars', 'Изменить переменные'], ['startCombat', 'Начать бой'], ['openInventory', 'Открыть инвентарь']],
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

    // появление/исчезновение (титры глав, флэшбэки)
    if (el.type !== 'hotspot') {
      const fx = el.fx ?? {};
      const setFx = (patch: Partial<NonNullable<typeof el.fx>>) => mutate(() => {
        el.fx = { ...(el.fx ?? {}), ...patch };
        // пустой объект = нет анимации
        if (!el.fx.in && el.fx.outAt === undefined) el.fx = undefined;
      });
      const fxOptions: [string, string][] = [
        ['', '— нет —'], ['fade', 'Проявление'], ['blur', 'Из размытия'],
        ['rise', 'Подъём'], ['zoom', 'Наплыв (зум)'],
      ];
      root.appendChild(section('Появление / исчезновение',
        row('Появление', selectInput(fx.in ?? '', fxOptions,
          (v) => setFx({ in: (v || undefined) as ElementFxKind | undefined }))),
        ...(fx.in ? [
          row('Задержка, с', numberInput(fx.inDelay ?? 0, (v) => setFx({ inDelay: v || undefined }))),
          row('Длительность, с', numberInput(fx.inDur ?? 0.9, (v) => setFx({ inDur: v === 0.9 ? undefined : v }))),
        ] : []),
        row('Исчезнуть через, с', numberInput(fx.outAt ?? 0, (v) => setFx({ outAt: v > 0 ? v : undefined }))),
        ...(fx.outAt !== undefined ? [
          row('Как исчезает', selectInput(fx.out ?? 'fade', fxOptions.slice(1),
            (v) => setFx({ out: v as ElementFxKind }))),
          row('Длительность, с', numberInput(fx.outDur ?? 0.9, (v) => setFx({ outDur: v === 0.9 ? undefined : v }))),
        ] : []),
        h('div', { class: 'hint', text: 'Для титров глав: появление «Из размытия» с задержкой, исчезновение через N секунд, а у сцены — автопереход (панель «Мир»). 0 в «Исчезнуть через» = не исчезает. Видно в предпросмотре (F5), на холсте — статично.' }),
      ));
    }

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
    const matOptions: [string, string][] = [
      ['', '— авто (NPC/фракция/сцена/тема) —'],
      ...(store.project.materials ?? []).map((m) => [m.id, m.name] as [string, string]),
    ];
    root.appendChild(section('Свойства',
      row('Название', textInput(dlg.name, (v) => mutate(() => { dlg.name = v; }))),
      row('Материал', selectInput(dlg.materialId ?? '', matOptions,
        (v) => mutate(() => { dlg.materialId = v || undefined; }))),
      h('div', { class: 'hint', text: 'Материал всего диалога («допрос», «сон»…) — из библиотеки (панель «Мир»). Перекрывает NPC/фракцию/сцену; одну реплику можно перекрасить в её ноде.' }),
    ));

    // динамические правила: условия → материал (первое истинное побеждает)
    const rulesSec = section('Материал по условиям');
    for (const r of dlg.materialRules ?? []) {
      const card = h('div', { class: 'cond-card' });
      const head = h('div', { style: 'display:flex;gap:6px;align-items:center;' });
      head.appendChild(selectInput(r.materialId, matOptions.slice(1), (v) => mutate(() => { r.materialId = v; })));
      const del = h('button', { class: 'del', text: '✕', title: 'Удалить правило' });
      del.onclick = () => mutate(() => {
        dlg.materialRules = (dlg.materialRules ?? []).filter((x) => x !== r);
      });
      head.appendChild(del);
      card.appendChild(head);
      card.appendChild(h('div', { style: 'font-size:10px;color:var(--text-faint);margin-top:4px;', text: 'Когда условия истинны:' }));
      card.appendChild(conditionsEditor(r.conditions, (list) => mutate(() => { r.conditions = list; })));
      rulesSec.appendChild(card);
    }
    const addRule = h('button', { class: 'btn small', text: '+ правило' });
    addRule.onclick = () => {
      const first = (store.project.materials ?? [])[0];
      if (!first) { toast('Сначала создайте материал в библиотеке (панель «Мир»)', true); return; }
      mutate(() => {
        dlg.materialRules = [...(dlg.materialRules ?? []), { conditions: [], materialId: first.id }];
      });
    };
    rulesSec.appendChild(addRule);
    rulesSec.appendChild(h('div', { class: 'hint', text: 'Живой диалог: «накал ≥ 60 → Сердцебиение». Проверяется на каждой реплике; первое истинное правило побеждает.' }));
    root.appendChild(rulesSec);
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
      sec.appendChild(richTextArea(node.text ?? '', (v) => mutate(() => { node.text = v; }), 6));
      if ((store.project.materials ?? []).length > 0) {
        sec.appendChild(row('Материал', selectInput(node.materialId ?? '', [
          ['', '— как у диалога —'],
          ...(store.project.materials ?? []).map((m) => [m.id, m.name] as [string, string]),
        ], (v) => mutate(() => { node.materialId = v || undefined; }))));
      }
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
        card.appendChild(richTextArea(c.text, (v) => mutate(() => { c.text = v; }), 2));

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
      if ((store.project.whispers ?? []).length > 0) {
        sec.appendChild(h('div', { class: 'insp-section-title', style: 'margin-top:10px;', text: '◈ Прошептать' }));
        sec.appendChild(row('Шёпот', selectInput(node.whisperId ?? '', [
          ['', '— нет —'],
          ...(store.project.whispers ?? []).map((w) => [w.id, w.name] as [string, string]),
        ], (v) => mutate(() => { node.whisperId = v || undefined; }))));
        sec.appendChild(h('div', { class: 'hint', text: 'Голос Архона прозвучит, когда диалог пройдёт эту ноду (если mesh_on). Шёпоты создаются в режиме «Журнал».' }));
      }
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
      qty.style.width = '84px';
      qty.style.flex = '0 0 84px';
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

  // допустимые операции зависят от типа переменной — «+»/«−» для булевых значений
  // молча превращают true/false в число (0/1), и такое значение потом не match'ится
  // ни с одним условием «=true»/«=false»; для строк осмысленно только «=»
  function opsForType(type: VarType | undefined): [string, string][] {
    if (type === 'boolean') return [['set', '='], ['toggle', '⇄']];
    if (type === 'string') return [['set', '=']];
    return [['set', '='], ['add', '+'], ['sub', '−']];
  }

  function effectsEditor(list: Effect[], commit: (list: Effect[]) => void): HTMLElement {
    const wrap = h('div');
    list.forEach((e, i) => {
      const card = h('div', { class: 'cond-card' });
      const r = h('div', { class: 'row' });
      const type = store.getVariable(e.varId)?.type;
      r.appendChild(selectInput(e.varId, varOptions(true), (v) => {
        const copy = [...list];
        const def = store.getVariable(v);
        const validOps = opsForType(def?.type).map(([op]) => op);
        copy[i] = {
          ...e, varId: v,
          op: validOps.includes(e.op) ? e.op : 'set',
          value: def?.type === 'boolean' ? true : def?.type === 'number' ? 0 : '',
        };
        commit(copy);
      }));
      r.appendChild(selectInput(e.op, opsForType(type), (v) => {
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
