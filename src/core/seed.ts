// ============================================================
// Стартовый проект «The Lost Silence» — интро по канону лора:
// пробуждение в капсуле, первый контакт с Матисом (Flux Nomads).
// Демонстрирует: NPC/отношения, фракции, Осколок, idle, {подстановку}.
// ============================================================

import { Project, ItemDef, uid, defaultTheme } from './types';
import { createFaction, createNPC } from './npc';
import { ensureHeroSystem } from './hero';

export function seedProject(): Project {
  // ---- обычные переменные ----
  const vSilence = uid('var');
  const vMeshTrust = uid('var');
  const vKnowsTruth = uid('var');
  const vCredits = uid('var');
  const vOskolok = uid('var');
  const vKills = uid('var');
  const idleContracts = uid('idle');

  // ---- сцены ----
  const sMenu = uid('scene');
  const sCapsule = uid('scene');
  const sLab = uid('scene');

  // ---- диалог «Пробуждение» ----
  const dIntro = uid('dlg');
  const n1 = uid('nd');
  const n2 = uid('nd');
  const n3 = uid('nd');
  const n4 = uid('nd');
  const n5 = uid('nd');
  const n6 = uid('nd');
  const n7 = uid('nd');
  const n8 = uid('nd');
  const n9 = uid('nd');
  const nJump = uid('nd');
  const nGive = uid('nd');
  const nEnd = uid('nd');

  const project: Project = {
    formatVersion: 1,
    meta: { name: 'The Lost Silence' },
    startSceneId: sMenu,
    theme: defaultTheme(),
    oskolokVarName: 'oskolok',
    currencyVarName: 'credits',
    factions: [],
    npcs: [],
    idleRules: [
      {
        id: idleContracts, title: 'Контракты Flux Nomads (пример idle)',
        varId: vCredits, ratePerMin: 2, max: 1000, offline: true, enabled: true,
      },
    ],
    variables: [
      { id: vOskolok, name: 'oskolok', title: 'Уровень Осколка', type: 'number', initial: 0, category: 'general', tracked: true, description: '0 — нет устройства; 1 — отношения; 2 — панель фракций; 3 — подсказки; 4 — следы OldNet' },
      { id: vSilence, name: 'silence', title: 'Внутренняя тишина', type: 'number', initial: 100, category: 'general', tracked: true, description: 'ГГ — единственный, кто помнит тишину. Ресурс восприятия OldNet.' },
      { id: vMeshTrust, name: 'mesh_trust', title: 'Доверие к Mesh', type: 'number', initial: 0, category: 'general', tracked: true, description: 'Насколько ГГ принимает второй голос' },
      { id: vKnowsTruth, name: 'knows_truth', title: 'Знает правду о 2034', type: 'boolean', initial: false, category: 'general', tracked: true, description: 'Узнал ли игрок правду о катастрофе' },
      { id: vCredits, name: 'credits', title: 'Кредиты', type: 'number', initial: 0, category: 'general', description: 'Валюта контрактов (idle-доход)' },
      { id: vKills, name: 'kills_total', title: 'Побед в боях', type: 'number', initial: 0, category: 'general', description: 'Движок увеличивает сам после каждой победы' },
    ],
    scenes: [],
    dialogues: [],
  };

  // ---- фракции (цвета — фирменные) ----
  const fFlux = createFaction(project, 'Flux Nomads', '#4fd1c5');
  const fSylv = createFaction(project, 'Sylvarium', '#98c379');
  const fWood = createFaction(project, 'Woodhaven', '#d19a66');
  fWood.repMode = 'equal'; // община — все голоса равны
  const fCav = createFaction(project, 'Cavernium', '#b39cf0');
  const fAer = createFaction(project, 'Aeralis', '#7db8f0');
  const fHyd = createFaction(project, 'Hydrosynth', '#56b6c2');

  // ---- герой и предметы ----
  const heroVars = ensureHeroSystem(project);
  const items: ItemDef[] = [
    {
      id: uid('item'), name: 'Комбинезон стазиса', type: 'armor', slot: 'body',
      rarity: 'worn', price: 5,
      stats: { def: 2 }, description: 'Истлевшая ткань 2030-х. Пахнет шестью веками ожидания.',
    },
    {
      id: uid('item'), name: 'Резак Матиса', type: 'weapon', slot: 'weapon',
      rarity: 'decent', price: 40,
      stats: { atk: 6, crit_chance: 3 },
      description: 'Плазменный резак для вскрытия мёртвых узлов. «Верни, когда найдёшь себе нормальный».',
    },
    {
      id: uid('item'), name: 'Разгрузка кочевника', type: 'armor', slot: 'accessory',
      rarity: 'decent', price: 30, cellsBonus: 4,
      stats: { endur: 1 }, description: 'Ремни и подсумки Flux Nomads. +4 ячейки инвентаря.',
    },
    {
      id: uid('item'), name: 'Стим-инъектор', type: 'consumable', rarity: 'decent',
      price: 15, stack: 5,
      useEffects: [{ varId: heroVars['hp'], op: 'add', value: 30 }],
      description: 'Полевой медицинский стимулятор. +30 HP.',
    },
    {
      id: uid('item'), name: 'Компонент мёртвого узла', type: 'resource', rarity: 'junk',
      price: 2, stack: 20,
      description: 'Ресурс для ремонта и улучшений (пригодится дронам-сборщикам).',
    },
    {
      id: uid('item'), name: 'Ключ-карта лаборатории', type: 'resource', rarity: 'high',
      price: 0, questItem: true,
      description: 'Карта доступа из вашей прошлой жизни. Квестовый предмет — нельзя выбросить.',
    },
    {
      id: uid('item'), name: 'Фрагмент OldNet', type: 'resource', rarity: 'legendary',
      price: 0, stack: 5,
      description: 'Зашифрованный обрывок старого интернета. Расшифровывается в Журнале (⌬ OldNet).',
    },
  ];
  project.items = items;
  project.hero!.startItems = [
    { itemId: items[0].id, qty: 1 },  // комбинезон
    { itemId: items[5].id, qty: 1 },  // ключ-карта
  ];

  // ---- мобы ----
  const mobDrone = uid('mob');
  project.mobs = [
    {
      id: mobDrone, name: 'Сорванный дрон-охранник',
      hp: 45, atk: 9, def: 2, telegraphMs: 1500, critChance: 5,
      expReward: 70, creditsReward: 15,
      drops: [
        { itemId: items[4].id, qty: 2, chance: 80 },   // компоненты узла
        { itemId: items[6].id, qty: 1, chance: 100 },  // фрагмент OldNet (демо)
      ],
      description: 'Охранная автоматика лаборатории. 600 лет без обслуживания — протоколы сорваны.',
    },
  ];

  // ---- журнал: задания, улучшения, расшифровка ----
  project.upgrades = [
    {
      id: uid('up'), title: 'Дрон-сборщик', maxLevel: 5,
      costVarName: 'credits', costBase: 50, costGrowth: 1.6,
      targetIdleRuleId: idleContracts, ratePerLevel: 1, enabled: true,
      description: 'Восстановленный дрон приносит дополнительные контрактные кредиты.',
    },
  ];
  project.decodes = [
    {
      id: uid('dec'), title: 'Обрывок новостной ленты — весна 2034',
      itemId: items[6].id, durationMin: 1, enabled: true, // 1 мин — для демо; в реальной игре часы
      rewardText: '«…Комиссия по инцидентам публикует финальный отчёт: причины синхронного отказа биометрических реестров установить не удалось. Списки пропавших закрыты по требованию…»\n\n[Дальше данные повреждены. Но дата отчёта — за три дня ДО официальной даты катастрофы.]',
      rewardEffects: [{ varId: vKnowsTruth, op: 'set', value: true }, { varId: vCredits, op: 'add', value: 40 }],
    },
  ];

  // ---- NPC ----
  const matis = createNPC(project, 'Матис', fFlux.id);
  matis.weight = 3;
  matis.description = 'Разведчик Flux Nomads. Вскрыл капсулу ГГ при проверке мёртвого узла. Первый контакт героя с миром 2670+.';
  const relMatis = matis.relationVarId;

  const ren = createNPC(project, 'Рен', fFlux.id);
  ren.weight = 1;
  ren.description = 'Техник ангара Flux Nomads (пример: рядовой NPC с весом 1).';

  const sajla = createNPC(project, 'Сайла', fHyd.id);
  sajla.weight = 6;
  sajla.description = 'Куратор глубинных архивов Hydrosynth. Интересуется OldNet (пример: влиятельный NPC).';

  // ---- задания (нужны id переменных NPC, поэтому после их создания) ----
  project.quests = [
    {
      id: uid('q'), title: 'Контракт дня: доверие кочевника', kind: 'daily',
      description: 'Поддерживайте отношения с Матисом (10+). Flux Nomads платят за надёжных.',
      conditions: [{ varId: matis.relationVarId, op: 'gte', value: 10 }],
      rewardEffects: [{ varId: vCredits, op: 'add', value: 25 }],
      enabled: true,
    },
    {
      id: uid('q'), title: 'Недельная зачистка', kind: 'weekly',
      description: 'Победите хотя бы одного противника за неделю.',
      conditions: [{ varId: vKills, op: 'gte', value: 1 }],
      rewardEffects: [{ varId: vCredits, op: 'add', value: 50 }],
      rewardItems: [{ itemId: items[3].id, qty: 2 }], // стимы
      enabled: true,
    },
    {
      id: uid('q'), title: 'Первая правда', kind: 'story',
      description: 'Расшифруйте фрагмент OldNet и узнайте, что скрывает официальная история.',
      conditions: [{ varId: vKnowsTruth, op: 'eq', value: true }],
      rewardEffects: [{ varId: vSilence, op: 'add', value: 10 }],
      enabled: true,
    },
  ];

  // ---- сцены ----
  project.scenes = [
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
          x: 460, y: 480, w: 1000, h: 60,
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
          id: uid('el'), name: 'Описание', type: 'text',
          x: 310, y: 360, w: 1300, h: 260,
          text: 'Лаборатория умирала шесть веков — и почти закончила.\n\nКоррозия съела маркировку на стенах. Матис уже возится с дверным контуром.\n\nЗдесь начинается ваш путь в мир, который вас не ждал.',
          style: { textColor: '#9fb2bc', fontSize: 32, fontWeight: '300', textAlign: 'center', lineHeight: 1.6 },
        },
        {
          // демо систем: выдать Осколок ур.2 → появится шкала отношений и панель фракций ◈
          id: uid('el'), name: 'Кнопка «Осколок» (демо)', type: 'button',
          x: 360, y: 700, w: 560, h: 70,
          text: 'Надеть Осколок (демо: откроет репутацию)',
          style: { fill: 'rgba(79,209,197,0.08)', textColor: '#4fd1c5', fontSize: 24, radius: 6, borderColor: '#2a6f68', borderWidth: 1, textAlign: 'center' },
          action: { type: 'setVars', effects: [{ varId: vOskolok, op: 'set', value: 2 }] },
          visibleIf: [{ varId: vOskolok, op: 'lt', value: 2 }],
        },
        {
          // демо боя
          id: uid('el'), name: 'Кнопка «Бой» (демо)', type: 'button',
          x: 1000, y: 700, w: 560, h: 70,
          text: '⚔ Дрон-охранник активировался! (демо боя)',
          style: { fill: 'rgba(224,108,117,0.08)', textColor: '#e06c75', fontSize: 24, radius: 6, borderColor: '#7a3a40', borderWidth: 1, textAlign: 'center' },
          action: { type: 'startCombat', mobId: mobDrone },
        },
      ],
    },
  ];

  // ---- диалог ----
  project.dialogues = [
    {
      id: dIntro,
      name: 'Пробуждение — Матис',
      startNodeId: n1,
      nodes: [
        {
          id: n1, type: 'line', x: 80, y: 60,
          speakerNpcId: matis.id,
          text: 'Тише, тише. Не дёргайся — замки капсулы прикипели, я срежу крепление. Ты… вообще меня понимаешь?',
          next: n2,
        },
        {
          id: n2, type: 'line', x: 80, y: 220,
          speakerNpcId: matis.id,
          text: 'Узел числился мёртвым в реестрах. «Утраченная единица». А у тебя даже Mesh-сигнатуры нет. Ты хоть знаешь, какой сейчас год?',
          next: n3,
        },
        {
          id: n3, type: 'choice', x: 80, y: 390,
          choices: [
            {
              id: uid('ch'), text: '«2034… или чуть позже. Сколько я проспал?»',
              conditions: [], next: n4,
              effects: [{ varId: relMatis, op: 'add', value: 15 }],
            },
            {
              id: uid('ch'), text: '«Отойди от капсулы. Кто ты такой?»',
              conditions: [], next: n5,
              effects: [{ varId: relMatis, op: 'sub', value: 10 }],
            },
            {
              id: uid('ch'), text: 'Молчать. Слушать тишину — впервые за 600 лет.',
              conditions: [], next: n6,
              effects: [{ varId: vSilence, op: 'add', value: 5 }],
            },
          ],
        },
        {
          id: n4, type: 'line', x: 480, y: 260,
          speakerNpcId: matis.id,
          text: 'Проспал?.. Друг, на дворе 2670-е. Шестьсот лет. Всё, что ты знал, — теперь запрещённый архив.',
          next: n7,
        },
        {
          id: n5, type: 'line', x: 480, y: 430,
          speakerNpcId: matis.id,
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
          conditions: [{ varId: relMatis, op: 'gte', value: 10 }],
          nextTrue: n8,
          nextFalse: n9,
        },
        {
          id: n8, type: 'line', x: 1260, y: 280,
          speakerNpcId: matis.id,
          text: 'Держись за меня — выведу. Держи резак и стимы — там, куда идём, пригодятся. Только уговор: про то, что ты «до-сетевой», молчим.',
          next: nGive,
        },
        {
          // выдача предметов + опыт за первый контакт
          id: nGive, type: 'set', x: 1260, y: 160,
          giveItems: [
            { itemId: items[1].id, qty: 1 },
            { itemId: items[2].id, qty: 1 },
            { itemId: items[3].id, qty: 3 },
          ],
          effects: [{ varId: heroVars['exp'], op: 'add', value: 40 }],
          next: nJump,
        },
        {
          id: n9, type: 'line', x: 1260, y: 480,
          speakerNpcId: matis.id,
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
  ];

  return project;
}
