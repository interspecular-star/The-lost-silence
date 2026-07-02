// ============================================================
// Стартовый проект «The Lost Silence» — играбельное интро
// по Тому III лора: цикл пробуждений (600 лет) → спасение →
// мёртвая лаборатория → поверхность → ангар Flux Nomads.
// Демонстрирует все системы: NPC/репутация, Осколок, предметы,
// бой, idle, задания, расшифровка OldNet.
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
  const vLabLooted = uid('var');    // осмотрел стеллажи
  const vLabTerminal = uid('var');  // вскрыл терминал
  const vDroneDown = uid('var');    // дрон повержен
  const idleContracts = uid('idle');

  // ---- сцены ----
  const sMenu = uid('scene');
  const sWake1 = uid('scene');   // пробуждение №0001 (ярость)
  const sWake2 = uid('scene');   // пробуждение №2450 (привычка)
  const sCapsule = uid('scene'); // пробуждение №7301 (движение)
  const sLab = uid('scene');
  const sSurface = uid('scene'); // разлом / первый взгляд на мир
  const sHangar = uid('scene');  // ангар Flux Nomads

  // ---- диалоги ----
  const dWake1 = uid('dlg');
  const dWake2 = uid('dlg');
  const dIntro = uid('dlg');     // Матис вскрывает капсулу
  const dTerminal = uid('dlg');  // локальный архив лаборатории
  const dAfterFight = uid('dlg');// Матис после боя
  const dRen = uid('dlg');       // техник Рен в ангаре
  const dOskolok = uid('dlg');   // Матис выдаёт Осколок

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
        id: idleContracts, title: 'Контракты Flux Nomads',
        varId: vCredits, ratePerMin: 2, max: 1000, offline: true, enabled: true,
      },
    ],
    variables: [
      { id: vOskolok, name: 'oskolok', title: 'Уровень Осколка', type: 'number', initial: 0, category: 'general', tracked: true, description: '0 — нет устройства; 1 — отношения; 2 — панель фракций; 3 — подсказки; 4 — следы OldNet' },
      { id: vSilence, name: 'silence', title: 'Внутренняя тишина', type: 'number', initial: 100, category: 'general', tracked: true, description: 'ГГ — единственный, кто помнит тишину. Ресурс восприятия OldNet.' },
      { id: vMeshTrust, name: 'mesh_trust', title: 'Доверие к Mesh', type: 'number', initial: 0, category: 'general', tracked: true, description: 'Насколько ГГ принимает второй голос' },
      { id: vKnowsTruth, name: 'knows_truth', title: 'Знает правду о 2034', type: 'boolean', initial: false, category: 'general', tracked: true },
      { id: vCredits, name: 'credits', title: 'Кредиты', type: 'number', initial: 0, category: 'general', description: 'Валюта контрактов (idle-доход)' },
      { id: vKills, name: 'kills_total', title: 'Побед в боях', type: 'number', initial: 0, category: 'general', description: 'Движок увеличивает сам после каждой победы' },
      { id: vLabLooted, name: 'lab_looted', title: 'Лаборатория: стеллажи осмотрены', type: 'boolean', initial: false, category: 'general' },
      { id: vLabTerminal, name: 'lab_terminal', title: 'Лаборатория: терминал вскрыт', type: 'boolean', initial: false, category: 'general' },
      { id: vDroneDown, name: 'drone_down', title: 'Лаборатория: дрон повержен', type: 'boolean', initial: false, category: 'general' },
    ],
    scenes: [],
    dialogues: [],
  };

  // ---- фракции ----
  const fFlux = createFaction(project, 'Flux Nomads', '#4fd1c5');
  const fSylv = createFaction(project, 'Sylvarium', '#98c379');
  const fWood = createFaction(project, 'Woodhaven', '#d19a66');
  fWood.repMode = 'equal';
  const fCav = createFaction(project, 'Cavernium', '#b39cf0');
  const fAer = createFaction(project, 'Aeralis', '#7db8f0');
  const fHyd = createFaction(project, 'Hydrosynth', '#56b6c2');
  void fSylv; void fCav; void fAer;

  // ---- герой и предметы ----
  ensureHeroSystem(project);
  const heroVars: Record<string, string> = {};
  for (const v of project.variables) heroVars[v.name] = v.id;

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
    {
      id: uid('item'), name: 'Осколок (прототип)', type: 'gadget', slot: 'gadget',
      rarity: 'archon', price: 0, questItem: true,
      stats: { foc_max: 10 },
      description: 'Внешний суррогат Cerebral Mesh, собранный Матисом из старых узлов. Единственный в мире — как и его хозяин.',
    },
  ];
  project.items = items;
  const iSuit = items[0], iCutter = items[1], iRig = items[2], iStim = items[3],
    iPart = items[4], iKeycard = items[5], iFragment = items[6], iOskolok = items[7];
  project.hero!.startItems = [
    { itemId: iSuit.id, qty: 1 },
    { itemId: iKeycard.id, qty: 1 },
  ];

  // ---- мобы ----
  const mobDrone = uid('mob');
  project.mobs = [
    {
      id: mobDrone, name: 'Сорванный дрон-охранник',
      hp: 45, atk: 9, def: 2, telegraphMs: 1500, critChance: 5,
      expReward: 70, creditsReward: 15,
      drops: [
        { itemId: iPart.id, qty: 2, chance: 80 },
        { itemId: iStim.id, qty: 1, chance: 40 },
      ],
      description: 'Охранная автоматика лаборатории. 600 лет без обслуживания — протоколы сорваны.',
    },
  ];

  // ---- журнал: улучшения и расшифровка ----
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
      itemId: iFragment.id, durationMin: 3, enabled: true,
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
  ren.description = 'Техник ангара Flux Nomads. Молодая, любопытная, никогда не выключала Mesh.';
  const relRen = ren.relationVarId;

  const sajla = createNPC(project, 'Сайла', fHyd.id);
  sajla.weight = 6;
  sajla.description = 'Куратор глубинных архивов Hydrosynth. Интересуется OldNet. Появится в следующих главах.';

  // ---- задания ----
  project.quests = [
    {
      id: uid('q'), title: 'Наладить связи', kind: 'story',
      description: 'Познакомьтесь с техником Рен в ангаре — Матису нужен второй голос за вас, чтобы откалибровать Осколок.',
      conditions: [{ varId: ren.metVarId, op: 'eq', value: true }, { varId: vOskolok, op: 'gte', value: 1 }],
      rewardEffects: [{ varId: vOskolok, op: 'set', value: 2 }],
      enabled: true,
    },
    {
      id: uid('q'), title: 'Первая правда', kind: 'story',
      description: 'Расшифруйте фрагмент OldNet и узнайте, что скрывает официальная история.',
      conditions: [{ varId: vKnowsTruth, op: 'eq', value: true }],
      rewardEffects: [{ varId: vSilence, op: 'add', value: 10 }],
      enabled: true,
    },
    {
      id: uid('q'), title: 'Контракт дня: доверие кочевника', kind: 'daily',
      description: 'Поддерживайте отношения с Матисом (10+). Flux Nomads платят за надёжных.',
      conditions: [{ varId: relMatis, op: 'gte', value: 10 }],
      rewardEffects: [{ varId: vCredits, op: 'add', value: 25 }],
      enabled: true,
    },
    {
      id: uid('q'), title: 'Недельная зачистка', kind: 'weekly',
      description: 'Победите хотя бы одного противника за неделю.',
      conditions: [{ varId: vKills, op: 'gte', value: 1 }],
      rewardEffects: [{ varId: vCredits, op: 'add', value: 50 }],
      rewardItems: [{ itemId: iStim.id, qty: 2 }],
      enabled: true,
    },
  ];

  // ============================================================
  // СЦЕНЫ
  // ============================================================
  const narrStyle = { textColor: '#aebfca', fontSize: 34, fontWeight: '300', textAlign: 'center' as const, lineHeight: 1.6 };
  const btnStyle = { fill: 'rgba(230,237,243,0.05)', textColor: '#e6edf3', fontSize: 26, radius: 6, borderColor: '#33454f', borderWidth: 1, textAlign: 'center' as const };

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
          action: { type: 'gotoScene', sceneId: sWake1 },
        },
      ],
    },

    // ---------- ПРОЛОГ: цикл пробуждений ----------
    {
      id: sWake1,
      name: 'Пробуждение №0001',
      kind: 'location',
      background: 'radial-gradient(ellipse at 50% 45%, #16242e 0%, #060b10 65%, #020508 100%)',
      guides: [],
      onEnterDialogueId: dWake1,
      elements: [
        {
          id: uid('el'), name: 'Нарратив', type: 'text',
          x: 260, y: 260, w: 1400, h: 300,
          text: 'Холод. Стекло в ладони от лица.\n\nСистема мягко произносит внутри капсулы: «Плановое пробуждение. Десять минут когнитивной активности».\n\nЗа стеклом — лаборатория. Пустая. Свет ровный, безжизненный.\n\nВы вспоминаете, зачем легли сюда. «Я пережду. Я проснусь, когда всё устаканится».',
          style: narrStyle,
        },
      ],
    },
    {
      id: sWake2,
      name: 'Пробуждение №2450',
      kind: 'location',
      background: 'radial-gradient(ellipse at 50% 45%, #101a21 0%, #04080c 65%, #010304 100%)',
      guides: [],
      onEnterDialogueId: dWake2,
      elements: [
        {
          id: uid('el'), name: 'Нарратив', type: 'text',
          x: 260, y: 260, w: 1400, h: 300,
          text: 'Двести четыре года.\n\nВы больше не бьёте в стекло. Ярость закончилась где-то на втором десятилетии, отчаяние — на первом веке.\n\nОсталась привычка: проснуться. Осознать. Сосчитать трещины в потолке. Уснуть.\n\nТрещин стало сорок три. В прошлый раз было сорок две.',
          style: narrStyle,
        },
      ],
    },
    {
      id: sCapsule,
      name: 'Пробуждение №7301',
      kind: 'location',
      background: 'radial-gradient(ellipse at 50% 40%, #0d1a24 0%, #050a10 70%, #020508 100%)',
      guides: [],
      elements: [
        {
          id: uid('el'), name: 'Нарратив', type: 'text',
          x: 260, y: 200, w: 1400, h: 320,
          text: 'Пробуждение №7301.\n\nСтекло перед глазами. Знакомые микротрещины. Свет мигает — раньше он не мигал.\n\nШестьсот лет. Система давно перестала называть пробуждения «плановыми».\n\nНо сегодня за стеклом — движение.',
          style: narrStyle,
        },
        {
          id: uid('el'), name: 'Кнопка «Всмотреться»', type: 'button',
          x: 760, y: 700, w: 400, h: 76,
          text: 'Всмотреться в силуэт',
          style: btnStyle,
          action: { type: 'startDialogue', dialogueId: dIntro },
        },
      ],
    },

    // ---------- ЛАБОРАТОРИЯ ----------
    {
      id: sLab,
      name: 'Мёртвая лаборатория',
      kind: 'location',
      background: 'linear-gradient(180deg, #0a0f12 0%, #131a1d 50%, #0a0d0f 100%)',
      guides: [],
      elements: [
        {
          id: uid('el'), name: 'Описание', type: 'text',
          x: 310, y: 150, w: 1300, h: 220,
          text: 'Ноги держат плохо — шесть веков без шага.\n\nЛаборатория умирала вместе с вами: коррозия съела маркировку, половина стеллажей обрушилась. Матис возится с дверным контуром и вполголоса ругается на «до-сетевые замки».',
          style: { ...narrStyle, fontSize: 30 },
        },
        {
          id: uid('el'), name: 'Стеллажи (осмотреть)', type: 'button',
          x: 260, y: 480, w: 420, h: 70,
          text: '◆ Осмотреть стеллажи',
          style: btnStyle,
          action: {
            type: 'setVars',
            effects: [{ varId: vLabLooted, op: 'set', value: true }],
            giveItems: [{ itemId: iPart.id, qty: 3 }],
          },
          visibleIf: [{ varId: vLabLooted, op: 'eq', value: false }],
        },
        {
          id: uid('el'), name: 'Терминал (вскрыть)', type: 'button',
          x: 750, y: 480, w: 420, h: 70,
          text: '⌬ Локальный архив-терминал',
          style: btnStyle,
          action: { type: 'startDialogue', dialogueId: dTerminal },
          visibleIf: [{ varId: vLabTerminal, op: 'eq', value: false }],
        },
        {
          id: uid('el'), name: 'Дрон (бой)', type: 'button',
          x: 1240, y: 480, w: 420, h: 70,
          text: '⚔ Дрон-охранник ожил!',
          style: { ...btnStyle, fill: 'rgba(224,108,117,0.08)', textColor: '#e06c75', borderColor: '#7a3a40' },
          action: { type: 'startCombat', mobId: mobDrone, winDialogueId: dAfterFight },
          visibleIf: [{ varId: vDroneDown, op: 'eq', value: false }, { varId: vLabTerminal, op: 'eq', value: true }],
        },
        {
          id: uid('el'), name: 'Выход (после боя)', type: 'button',
          x: 710, y: 700, w: 500, h: 76,
          text: '➜ Подняться к разлому',
          style: { ...btnStyle, textColor: '#4fd1c5', borderColor: '#2a6f68', fill: 'rgba(79,209,197,0.08)' },
          action: { type: 'gotoScene', sceneId: sSurface },
          visibleIf: [{ varId: vDroneDown, op: 'eq', value: true }],
        },
      ],
    },

    // ---------- ПОВЕРХНОСТЬ ----------
    {
      id: sSurface,
      name: 'Разлом — первый взгляд',
      kind: 'location',
      background: 'linear-gradient(180deg, #1a2733 0%, #2c4a5a 45%, #0e1a22 100%)',
      guides: [],
      elements: [
        {
          id: uid('el'), name: 'Нарратив', type: 'text',
          x: 210, y: 200, w: 1500, h: 420,
          text: 'Свет. Настоящий, дневной — впервые за шестьсот лет.\n\nМир не кончился. Он вырос: на горизонте, сквозь дымку, поднимается ВЕРТИКАЛЬ — стена города, уходящая за облака. Nexus. Даже воздух здесь как будто отфильтрован.\n\nМатис смотрит на вашу реакцию, не на город: «Впечатляет, да? Сто сорок миллиардов человек. И ни одного, кто помнит, каким был мир до. Кроме тебя».\n\nВнизу, в тени разлома, — лагерь: мачты, тягачи, палатки-модули. Люди. Живые.',
          style: { ...narrStyle, fontSize: 31 },
        },
        {
          id: uid('el'), name: 'В лагерь', type: 'button',
          x: 710, y: 720, w: 500, h: 76,
          text: '➜ Спуститься в лагерь кочевников',
          style: btnStyle,
          action: { type: 'gotoScene', sceneId: sHangar },
        },
      ],
    },

    // ---------- АНГАР FLUX NOMADS ----------
    {
      id: sHangar,
      name: 'Ангар Flux Nomads',
      kind: 'location',
      background: 'linear-gradient(180deg, #10151a 0%, #1d2429 55%, #12161a 100%)',
      guides: [],
      elements: [
        {
          id: uid('el'), name: 'Описание', type: 'text',
          x: 310, y: 150, w: 1300, h: 180,
          text: 'Ангар гудит: сварка, лебёдки, чей-то смех. Рабочий город на колёсах, а не витрина цивилизации.\n\nЗдесь на вас смотрят. Недолго — но смотрят: у вас нет Mesh-сигнатуры, и для них вы «пустое место» в буквальном смысле.',
          style: { ...narrStyle, fontSize: 30 },
        },
        {
          id: uid('el'), name: 'Матис (Осколок)', type: 'button',
          x: 350, y: 470, w: 420, h: 70,
          text: '💬 Матис зовёт к верстаку',
          style: btnStyle,
          action: { type: 'startDialogue', dialogueId: dOskolok },
          visibleIf: [{ varId: vOskolok, op: 'eq', value: 0 }],
        },
        {
          id: uid('el'), name: 'Рен (знакомство)', type: 'button',
          x: 1150, y: 470, w: 420, h: 70,
          text: '💬 Техник у соседнего стенда',
          style: btnStyle,
          action: { type: 'startDialogue', dialogueId: dRen },
          visibleIf: [{ varId: vOskolok, op: 'gte', value: 1 }],
        },
        {
          id: uid('el'), name: 'Подсказка-журнал', type: 'text',
          x: 460, y: 700, w: 1000, h: 120,
          text: 'Демо-версия интро завершается здесь.\nЗагляните в Журнал 📋 — там задания, улучшения дронов и расшифровка OldNet.\nКонтракты Flux Nomads уже капают кредитами — даже пока игра закрыта.',
          style: { textColor: '#5f7a8a', fontSize: 24, fontWeight: '300', textAlign: 'center', lineHeight: 1.6 },
          visibleIf: [{ varId: vOskolok, op: 'gte', value: 2 }],
        },
      ],
    },
  ];

  // ============================================================
  // ДИАЛОГИ
  // ============================================================

  // ---------- Пробуждение №0001: ярость ----------
  {
    const n1 = uid('nd'), n2 = uid('nd'), n3a = uid('nd'), n3b = uid('nd'), n3c = uid('nd'),
      n4 = uid('nd'), nJ = uid('nd'), nE = uid('nd');
    project.dialogues.push({
      id: dWake1, name: 'Цикл 0001 — первое пробуждение', startNodeId: n1,
      nodes: [
        {
          id: n1, type: 'line', x: 80, y: 60,
          text: 'Месяц. Прошёл всего месяц — а мир снаружи уже должен был «устаканиваться» без вас.\n\nДесять минут сознания. Что вы делаете?',
          next: n2,
        },
        {
          id: n2, type: 'choice', x: 80, y: 230,
          choices: [
            { id: uid('ch'), text: 'Бить в стекло. Со всей силы.', conditions: [], effects: [], next: n3a },
            { id: uid('ch'), text: 'Кричать. Кто-нибудь же слышит.', conditions: [], effects: [], next: n3b },
            { id: uid('ch'), text: 'Закрыть глаза и дышать.', conditions: [], effects: [{ varId: vSilence, op: 'add', value: 2 }], next: n3c },
          ],
        },
        {
          id: n3a, type: 'line', x: 480, y: 120,
          text: 'Стекло не отвечает. Даже звук удара — глухой, чужой, как через вату.\n\nКапсула не предусматривала выход изнутри. Вы это знали, когда ложились.',
          next: n4,
        },
        {
          id: n3b, type: 'line', x: 480, y: 290,
          text: 'Крик тонет в четырёх литрах воздуха капсулы.\n\nСистема вежливо снижает подачу кислорода: «Зафиксирована паническая реакция».',
          next: n4,
        },
        {
          id: n3c, type: 'line', x: 480, y: 460,
          text: 'Вдох. Выдох.\n\nВпервые вы замечаете: в голове — только вы. Ни лент, ни уведомлений, ни звонков. Тишина, которой вы не знали с детства.\n\nОна пугает. Пока — пугает.',
          next: n4,
        },
        {
          id: n4, type: 'line', x: 880, y: 290,
          text: '«Плановое возвращение в стазис через десять секунд».\n\nТемнота приходит как вода.',
          next: nJ,
        },
        { id: nJ, type: 'jump', x: 1260, y: 290, gotoSceneId: sWake2, next: nE },
        { id: nE, type: 'end', x: 1540, y: 290 },
      ],
    });
  }

  // ---------- Пробуждение №2450: привычка ----------
  {
    const n1 = uid('nd'), n2 = uid('nd'), n3 = uid('nd'), nJ = uid('nd'), nE = uid('nd');
    project.dialogues.push({
      id: dWake2, name: 'Цикл 2450 — привычка', startNodeId: n1,
      nodes: [
        {
          id: n1, type: 'line', x: 80, y: 60,
          text: 'Система давно подмешивает вам сгенерированные воспоминания — «подпорки для разума». Пляж, на котором вы не были. Друзья, которых не существовало.\n\nВы знаете, что они ненастоящие. Но без них вы бы не выжили.',
          next: n2,
        },
        {
          id: n2, type: 'choice', x: 80, y: 240,
          choices: [
            {
              id: uid('ch'), text: 'Держаться за настоящие воспоминания. Какими бы старыми они ни были.',
              conditions: [], effects: [{ varId: vSilence, op: 'add', value: 3 }], next: n3,
            },
            {
              id: uid('ch'), text: 'Принять подделку. Так легче.',
              conditions: [], effects: [{ varId: vMeshTrust, op: 'add', value: 2 }], next: n3,
            },
          ],
        },
        {
          id: n3, type: 'line', x: 480, y: 240,
          text: 'Свет мигнул. В прошлый раз он не мигал.\n\nЛаборатория стареет. Капсула не вечна — и выход из неё, возможно, смертелен. Но без выхода конец просто… растянут.\n\nТемнота. Снова.',
          next: nJ,
        },
        { id: nJ, type: 'jump', x: 880, y: 240, gotoSceneId: sCapsule, next: nE },
        { id: nE, type: 'end', x: 1160, y: 240 },
      ],
    });
  }

  // ---------- Матис вскрывает капсулу ----------
  {
    const n1 = uid('nd'), n2 = uid('nd'), n3 = uid('nd'), n4 = uid('nd'), n5 = uid('nd'),
      n6 = uid('nd'), n7 = uid('nd'), n8 = uid('nd'), n9 = uid('nd'),
      nGiveA = uid('nd'), nGiveB = uid('nd'), nJ = uid('nd'), nE = uid('nd');
    project.dialogues.push({
      id: dIntro, name: 'Пробуждение — Матис', startNodeId: n1,
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
          id: n8, type: 'line', x: 1260, y: 260,
          speakerNpcId: matis.id,
          text: 'Держись за меня — выведу. Держи резак и стимы, там, куда идём, пригодятся. Уговор: про то, что ты «до-сетевой», молчим. Есть системы, которым лучше о тебе не знать.',
          next: nGiveA,
        },
        {
          id: nGiveA, type: 'set', x: 1260, y: 130,
          giveItems: [
            { itemId: iCutter.id, qty: 1 },
            { itemId: iRig.id, qty: 1 },
            { itemId: iStim.id, qty: 3 },
          ],
          effects: [{ varId: heroVars['exp'], op: 'add', value: 40 }],
          next: nJ,
        },
        {
          id: n9, type: 'line', x: 1260, y: 480,
          speakerNpcId: matis.id,
          text: 'Недоверие — это честно. Но вариантов у тебя немного: капсула сдохла. Держи хотя бы резак — безоружного я тебя не поведу. По дороге решишь, враг я или нет.',
          next: nGiveB,
        },
        {
          id: nGiveB, type: 'set', x: 1260, y: 620,
          giveItems: [{ itemId: iCutter.id, qty: 1 }, { itemId: iStim.id, qty: 1 }],
          effects: [{ varId: heroVars['exp'], op: 'add', value: 20 }],
          next: nJ,
        },
        { id: nJ, type: 'jump', x: 1640, y: 390, gotoSceneId: sLab, next: nE },
        { id: nE, type: 'end', x: 1900, y: 390 },
      ],
    });
  }

  // ---------- Терминал лаборатории ----------
  {
    const n1 = uid('nd'), n2 = uid('nd'), n3 = uid('nd'), nSet = uid('nd'), nE = uid('nd');
    project.dialogues.push({
      id: dTerminal, name: 'Лаборатория — локальный архив', startNodeId: n1,
      nodes: [
        {
          id: n1, type: 'line', x: 80, y: 60,
          text: 'Терминал мёртв шесть веков — но локальный буфер цел: он никогда не был подключён к сетям, поэтому его никто не чистил.\n\nВаша ключ-карта подходит.',
          next: n2,
        },
        {
          id: n2, type: 'line', x: 80, y: 230,
          speakerNpcId: matis.id,
          text: 'Стой-стой… это что, нефильтрованные данные? До-катастрофные?! Так. Этого я не видел, ты этого не находил. Забирай — и МОЛЧА. За такое в Nexus стирают из реестров. Уже навсегда.',
          next: n3,
        },
        {
          id: n3, type: 'line', x: 480, y: 140,
          text: 'Вы извлекаете кристалл с зашифрованным фрагментом старого интернета.\n\n[Фрагмент OldNet добавлен в инвентарь. Расшифровка — в Журнале 📋, вкладка ⌬ OldNet.]',
          next: nSet,
        },
        {
          id: nSet, type: 'set', x: 480, y: 320,
          giveItems: [{ itemId: iFragment.id, qty: 1 }],
          effects: [
            { varId: vLabTerminal, op: 'set', value: true },
            { varId: heroVars['exp'], op: 'add', value: 25 },
          ],
          next: nE,
        },
        { id: nE, type: 'end', x: 880, y: 230 },
      ],
    });
  }

  // ---------- После боя с дроном ----------
  {
    const n1 = uid('nd'), n2 = uid('nd'), nSet = uid('nd'), nE = uid('nd');
    project.dialogues.push({
      id: dAfterFight, name: 'Лаборатория — после боя', startNodeId: n1,
      nodes: [
        {
          id: n1, type: 'line', x: 80, y: 60,
          speakerNpcId: matis.id,
          text: 'Неплохо для человека, который шестьсот лет не вставал! Дрон дохлый, протоколы у него сорваны — обычное дело на мёртвых узлах. Настоящие охотники выглядят иначе… и я надеюсь, ты их никогда не увидишь.',
          next: n2,
        },
        {
          id: n2, type: 'line', x: 80, y: 240,
          speakerNpcId: matis.id,
          text: 'Всё, уходим. Дверь я вскрыл. Наверху — разлом, а за ним наш лагерь. Готовься: мир слегка… подрос.',
          next: nSet,
        },
        {
          id: nSet, type: 'set', x: 480, y: 150,
          effects: [{ varId: vDroneDown, op: 'set', value: true }],
          next: nE,
        },
        { id: nE, type: 'end', x: 480, y: 330 },
      ],
    });
  }

  // ---------- Ангар: Матис выдаёт Осколок ----------
  {
    const n1 = uid('nd'), n2 = uid('nd'), n3 = uid('nd'), n4a = uid('nd'), n4b = uid('nd'),
      nGive = uid('nd'), n5 = uid('nd'), nE = uid('nd');
    project.dialogues.push({
      id: dOskolok, name: 'Ангар — Осколок', startNodeId: n1,
      nodes: [
        {
          id: n1, type: 'line', x: 80, y: 60,
          speakerNpcId: matis.id,
          text: 'Смотри. Собрал за ночь из трёх мёртвых узлов. Внешний контур Mesh — без иглы в мозг. Мы такие делаем для детей до инициализации… ну и для одного древнего деда, получается.',
          next: n2,
        },
        {
          id: n2, type: 'line', x: 80, y: 230,
          speakerNpcId: matis.id,
          text: 'Без него ты слепой: не видишь, как к тебе относятся, не видишь репутацию у фракций. Люди 2670-го читают это с рождения — а ты ходишь наощупь.\n\nНадевай. Это не контроль. Это… очки.',
          next: n3,
        },
        {
          id: n3, type: 'choice', x: 80, y: 400,
          choices: [
            {
              id: uid('ch'), text: 'Надеть. Правила мира лучше видеть.',
              conditions: [], effects: [{ varId: vMeshTrust, op: 'add', value: 3 }], next: n4a,
            },
            {
              id: uid('ch'), text: 'Надеть — но с оговоркой: «Снимается — снимаю».',
              conditions: [], effects: [{ varId: vSilence, op: 'add', value: 3 }], next: n4b,
            },
          ],
        },
        {
          id: n4a, type: 'line', x: 480, y: 300,
          speakerNpcId: matis.id,
          text: 'Вот и правильно. Только не привыкай ему верить больше, чем себе, — эту ошибку человечество уже делало.',
          next: nGive,
        },
        {
          id: n4b, type: 'line', x: 480, y: 480,
          speakerNpcId: matis.id,
          text: 'Ха! Первый человек на моей памяти, который ставит условия куску кремния. Мне это нравится. Договорились: снимается — снимаешь.',
          next: nGive,
        },
        {
          id: nGive, type: 'set', x: 880, y: 390,
          giveItems: [{ itemId: iOskolok.id, qty: 1 }],
          effects: [
            { varId: vOskolok, op: 'set', value: 1 },
            { varId: relMatis, op: 'add', value: 5 },
            { varId: heroVars['exp'], op: 'add', value: 30 },
          ],
          next: n5,
        },
        {
          id: n5, type: 'line', x: 1260, y: 390,
          speakerNpcId: matis.id,
          text: 'Работает: видишь шкалу под моим именем? Это я. Калибровку под фракции сделает Рен — она у стенда напротив. Познакомься: тебе здесь жить, а ей — интересно. Только про капсулу — молчок.',
          next: nE,
        },
        { id: nE, type: 'end', x: 1640, y: 390 },
      ],
    });
  }

  // ---------- Ангар: Рен ----------
  {
    const n1 = uid('nd'), n2 = uid('nd'), n3a = uid('nd'), n3b = uid('nd'), n3c = uid('nd'),
      n4 = uid('nd'), nE = uid('nd');
    project.dialogues.push({
      id: dRen, name: 'Ангар — Рен', startNodeId: n1,
      nodes: [
        {
          id: n1, type: 'line', x: 80, y: 60,
          speakerNpcId: ren.id,
          text: 'О! Ты новенький Матиса. У тебя сигнатура как у выключенного тостера, знаешь? Не обижайся — это даже красиво. Тихо так.\n\nЯ Рен. Чиню всё, что летает, и половину того, что не должно.',
          next: n2,
        },
        {
          id: n2, type: 'choice', x: 80, y: 240,
          choices: [
            {
              id: uid('ch'), text: '«Рад знакомству. Матис говорит, ты лучший техник лагеря».',
              conditions: [], effects: [{ varId: relRen, op: 'add', value: 12 }], next: n3a,
            },
            {
              id: uid('ch'), text: '«Каково это — всю жизнь с голосом в голове?»',
              conditions: [], effects: [{ varId: relRen, op: 'add', value: 6 }, { varId: vSilence, op: 'add', value: 2 }], next: n3b,
            },
            {
              id: uid('ch'), text: 'Кивнуть и промолчать.',
              conditions: [], effects: [], next: n3c,
            },
          ],
        },
        {
          id: n3a, type: 'line', x: 520, y: 130,
          speakerNpcId: ren.id,
          text: '«Лучший» — это он мягко. Единственный, кто согласен чинить его рухлядь!\n\nДавай сюда браслет, откалибрую под фракционные частоты. Готово. Теперь ты видишь мир почти как мы.',
          next: n4,
        },
        {
          id: n3b, type: 'line', x: 520, y: 310,
          speakerNpcId: ren.id,
          text: 'Каково?.. — она впервые за разговор замолкает. — Не знаю. А каково без него? Вот честно: иногда я… ладно, неважно. Давай браслет, откалибрую.\n\n[Кажется, вы задали вопрос, который она сама себе не задавала.]',
          next: n4,
        },
        {
          id: n3c, type: 'line', x: 520, y: 490,
          speakerNpcId: ren.id,
          text: 'Молчаливый, значит. Ну, в нашем деле не худшее качество. Браслет давай — Матис просил откалибровать.',
          next: n4,
        },
        {
          id: n4, type: 'line', x: 960, y: 310,
          text: '[Знакомство с Рен установлено. Загляните в Журнал 📋 — сюжетное задание «Наладить связи» выполнено: калибровка откроет панель репутации фракций ◈.]',
          next: nE,
        },
        { id: nE, type: 'end', x: 1340, y: 310 },
      ],
    });
  }

  return project;
}
