// ============================================================
// Стартовый проект «The Lost Silence» — интро по канону лора:
// пробуждение в капсуле, первый контакт с Матисом (Flux Nomads)
// ============================================================

import { Project, uid, defaultTheme } from './types';

export function seedProject(): Project {
  // ---- переменные ----
  const vRepFlux = uid('var');
  const vRepSylv = uid('var');
  const vRepWood = uid('var');
  const vRepCav = uid('var');
  const vRepAer = uid('var');
  const vRepHyd = uid('var');
  const vSilence = uid('var');
  const vMeshTrust = uid('var');
  const vKnowsTruth = uid('var');
  const vCredits = uid('var');

  // ---- сцены ----
  const sMenu = uid('scene');
  const sCapsule = uid('scene');
  const sLab = uid('scene');

  // ---- диалог «Пробуждение» ----
  const dIntro = uid('dlg');
  const n1 = uid('nd'); // реплика Матиса
  const n2 = uid('nd'); // реплика Матиса 2
  const n3 = uid('nd'); // выбор игрока
  const n4 = uid('nd'); // ветка: осторожный ответ
  const n5 = uid('nd'); // ветка: враждебный ответ
  const n6 = uid('nd'); // действие: рост тишины
  const n7 = uid('nd'); // условие по репутации
  const n8 = uid('nd'); // реплика доверия
  const n9 = uid('nd'); // реплика настороженности
  const nJump = uid('nd'); // переход в лабораторию
  const nEnd = uid('nd');

  const c1 = uid('ch');
  const c2 = uid('ch');
  const c3 = uid('ch');

  return {
    formatVersion: 1,
    meta: { name: 'The Lost Silence' },
    startSceneId: sMenu,
    theme: defaultTheme(),
    idleRules: [
      {
        id: uid('idle'), title: 'Контракты Flux Nomads (пример idle)',
        varId: vCredits, ratePerMin: 2, max: 1000, offline: true, enabled: true,
      },
    ],
    variables: [
      { id: vRepFlux, name: 'rep_flux', title: 'Flux Nomads', type: 'number', initial: 0, category: 'reputation', tracked: true, description: 'Репутация у мобильных логистов и разведчиков' },
      { id: vRepSylv, name: 'rep_sylvarium', title: 'Sylvarium', type: 'number', initial: 0, category: 'reputation', description: 'Репутация у операторов биосферы' },
      { id: vRepWood, name: 'rep_woodhaven', title: 'Woodhaven', type: 'number', initial: 0, category: 'reputation', description: 'Репутация у хранителей преемственности' },
      { id: vRepCav, name: 'rep_cavernium', title: 'Cavernium', type: 'number', initial: 0, category: 'reputation', description: 'Репутация у подземных инженеров' },
      { id: vRepAer, name: 'rep_aeralis', title: 'Aeralis', type: 'number', initial: 0, category: 'reputation', description: 'Репутация у операторов атмосферы' },
      { id: vRepHyd, name: 'rep_hydrosynth', title: 'Hydrosynth', type: 'number', initial: 0, category: 'reputation', description: 'Репутация у хранителей глубин' },
      { id: vSilence, name: 'silence', title: 'Внутренняя тишина', type: 'number', initial: 100, category: 'general', tracked: true, description: 'ГГ — единственный, кто помнит тишину. Ресурс восприятия OldNet.' },
      { id: vMeshTrust, name: 'mesh_trust', title: 'Доверие к Mesh', type: 'number', initial: 0, category: 'general', tracked: true, description: 'Насколько ГГ принимает второй голос' },
      { id: vKnowsTruth, name: 'knows_truth', title: 'Знает правду о 2034', type: 'boolean', initial: false, category: 'general', tracked: true, description: 'Узнал ли игрок правду о катастрофе' },
      { id: vCredits, name: 'credits', title: 'Кредиты', type: 'number', initial: 0, category: 'general', description: 'Валюта контрактов (для idle-систем)' },
    ],
    scenes: [
      {
        id: sMenu,
        name: 'Главное меню',
        kind: 'page',
        background: 'linear-gradient(180deg, #04070c 0%, #0a1622 60%, #071019 100%)',
        guides: [{ axis: 'x', pos: 960 }, { axis: 'y', pos: 540 }],
        elements: [
          {
            id: uid('el'), name: 'Заголовок', type: 'text',
            x: 160, y: 330, w: 1600, h: 130,
            text: 'THE LOST SILENCE',
            style: { textColor: '#e6edf3', fontSize: 92, fontWeight: '200', textAlign: 'center', letterSpacing: 24, fontFamily: "'Segoe UI', sans-serif" },
          },
          {
            id: uid('el'), name: 'Подзаголовок', type: 'text',
            x: 460, y: 470, w: 1000, h: 60,
            text: '2670. Мир выжил. Тишина — нет.',
            style: { textColor: '#5f7a8a', fontSize: 28, fontWeight: '300', textAlign: 'center', letterSpacing: 6 },
          },
          {
            id: uid('el'), name: 'Кнопка «Начать»', type: 'button',
            x: 810, y: 640, w: 300, h: 72,
            text: 'НАЧАТЬ',
            style: { fill: 'rgba(79,209,197,0.10)', textColor: '#4fd1c5', fontSize: 26, letterSpacing: 8, radius: 4, borderColor: '#2a6f68', borderWidth: 1, textAlign: 'center' },
            action: { type: 'gotoScene', sceneId: sCapsule },
          },
        ],
      },
      {
        id: sCapsule,
        name: 'Стазисная капсула',
        kind: 'location',
        background: 'radial-gradient(ellipse at 50% 40%, #0d1a24 0%, #050a10 70%, #020508 100%)',
        guides: [],
        elements: [
          {
            id: uid('el'), name: 'Нарратив', type: 'text',
            x: 260, y: 200, w: 1400, h: 320,
            text: 'Пробуждение №7301.\n\nСтекло перед глазами. Знакомые микротрещины. Свет мигает — раньше он не мигал.\n\nДесять минут сознания. Как всегда. Как 600 лет подряд.\n\nНо сегодня за стеклом — движение.',
            style: { textColor: '#aebfca', fontSize: 34, fontWeight: '300', textAlign: 'center', lineHeight: 1.6 },
          },
          {
            id: uid('el'), name: 'Кнопка «Всмотреться»', type: 'button',
            x: 760, y: 700, w: 400, h: 76,
            text: 'Всмотреться в силуэт',
            style: { fill: 'rgba(230,237,243,0.05)', textColor: '#e6edf3', fontSize: 26, radius: 6, borderColor: '#33454f', borderWidth: 1, textAlign: 'center' },
            action: { type: 'startDialogue', dialogueId: dIntro },
          },
        ],
      },
      {
        id: sLab,
        name: 'Мёртвая лаборатория',
        kind: 'location',
        background: 'linear-gradient(180deg, #0a0f12 0%, #131a1d 50%, #0a0d0f 100%)',
        guides: [],
        elements: [
          {
            id: uid('el'), name: 'Счётчик кредитов', type: 'text',
            x: 1460, y: 40, w: 420, h: 50,
            text: '⌬ Кредиты: {credits}',
            style: { textColor: '#4fd1c5', fontSize: 26, textAlign: 'right', letterSpacing: 2 },
          },
          {
            id: uid('el'), name: 'Описание', type: 'text',
            x: 310, y: 380, w: 1300, h: 260,
            text: 'Лаборатория умирала шесть веков — и почти закончила.\n\nКоррозия съела маркировку на стенах. Матис уже возится с дверным контуром.\n\nЗдесь начинается ваш путь в мир, который вас не ждал.',
            style: { textColor: '#9fb2bc', fontSize: 32, fontWeight: '300', textAlign: 'center', lineHeight: 1.6 },
          },
        ],
      },
    ],
    dialogues: [
      {
        id: dIntro,
        name: 'Пробуждение — Матис',
        startNodeId: n1,
        nodes: [
          {
            id: n1, type: 'line', x: 80, y: 60,
            speaker: 'Матис',
            text: 'Тише, тише. Не дёргайся — замки капсулы прикипели, я срежу крепление. Ты… вообще меня понимаешь?',
            next: n2,
          },
          {
            id: n2, type: 'line', x: 80, y: 220,
            speaker: 'Матис',
            text: 'Узел числился мёртвым в реестрах. «Утраченная единица». А у тебя даже Mesh-сигнатуры нет. Ты хоть знаешь, какой сейчас год?',
            next: n3,
          },
          {
            id: n3, type: 'choice', x: 80, y: 390,
            choices: [
              {
                id: c1, text: '«2034… или чуть позже. Сколько я проспал?»',
                conditions: [], next: n4,
                effects: [{ varId: vRepFlux, op: 'add', value: 2 }],
              },
              {
                id: c2, text: '«Отойди от капсулы. Кто ты такой?»',
                conditions: [], next: n5,
                effects: [{ varId: vRepFlux, op: 'sub', value: 1 }],
              },
              {
                id: c3, text: 'Молчать. Слушать тишину — впервые за 600 лет.',
                conditions: [], next: n6,
                effects: [{ varId: vSilence, op: 'add', value: 5 }],
              },
            ],
          },
          {
            id: n4, type: 'line', x: 480, y: 260,
            speaker: 'Матис',
            text: 'Проспал?.. Друг, на дворе 2670-е. Шестьсот лет. Всё, что ты знал, — теперь запрещённый архив.',
            next: n7,
          },
          {
            id: n5, type: 'line', x: 480, y: 430,
            speaker: 'Матис',
            text: 'Спокойно! Матис, Flux Nomads. Я вскрываю мёртвые узлы, а не людей. Хотя ты первый живой «архивный объект» на моей памяти.',
            next: n7,
          },
          {
            id: n6, type: 'set', x: 480, y: 600,
            effects: [{ varId: vMeshTrust, op: 'sub', value: 1 }],
            next: n5,
          },
          {
            id: n7, type: 'branch', x: 880, y: 390,
            conditions: [{ varId: vRepFlux, op: 'gte', value: 1 }],
            nextTrue: n8,
            nextFalse: n9,
          },
          {
            id: n8, type: 'line', x: 1260, y: 280,
            speaker: 'Матис',
            text: 'Держись за меня — выведу. Только уговор: про то, что ты «до-сетевой», молчим. Есть системы, которым лучше о тебе не знать.',
            next: nJump,
          },
          {
            id: n9, type: 'line', x: 1260, y: 480,
            speaker: 'Матис',
            text: 'Ладно, недоверие — это честно. Но вариантов у тебя немного: капсула сдохла. Идём — по дороге решишь, враг я или нет.',
            next: nJump,
          },
          {
            id: nJump, type: 'jump', x: 1640, y: 390,
            gotoSceneId: sLab,
            next: nEnd,
          },
          {
            id: nEnd, type: 'end', x: 1900, y: 390,
          },
        ],
      },
    ],
  };
}
