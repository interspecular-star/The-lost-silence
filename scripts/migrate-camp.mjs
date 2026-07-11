// ============================================================
// I2: каркас лагеря в проекте владельца.
// Читает local-save/project.json (резервную копию), добавляет карту
// аванпоста + сцены лагеря + диалоги-знакомства, отвязывает Осколок
// от интро и переделывает квест «Наладить связи» в «Освоиться».
// Результат: local-save/project-camp.tls.json — владелец загружает
// его в редакторе (📂), сам файл резервной копии НЕ трогаем.
//
// Запуск: node scripts/migrate-camp.mjs
// Скрипт идемпотентен по входу: читает только project.json, пишет
// только project-camp.tls.json.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'local-save', 'project.json');
const OUT = path.join(ROOT, 'local-save', 'project-camp.tls.json');

const p = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
const log = [];

let uidN = 0;
const uid = (prefix) => `${prefix}_mig${Date.now().toString(36)}${(uidN++).toString(36)}`;

// ---------- справочники ----------
const sceneByName = (name) => p.scenes.find((s) => s.name === name);
const npcByName = (name) => (p.npcs ?? []).find((n) => n.name === name);
const varByName = (name) => p.variables.find((v) => v.name === name);

const sMap = sceneByName('Аванпост Flux Nomads');
const sHangar = sceneByName('Ангар Flux Nomads');
const sHome = sceneByName('Новый дом');
if (!sMap || !sHangar || !sHome) throw new Error('не найдены опорные сцены (Аванпост/Ангар/Новый дом)');

const NPC = {};
for (const name of ['Матис Йордан', 'Лия Ромеро-Санг', 'Лори Никадзе', 'Джаст Верден', 'Кай Муромото',
  'Тэмур Эласко', 'Аниша Гхал', 'Ференц Ташиев', 'Омар Кьян', 'Зора Микалян', 'Марек Бринн',
  'Хани Мдале', 'Тала Верихо', 'Ю Накао', 'Рами Альмора']) {
  const n = npcByName(name);
  if (!n) throw new Error(`NPC не найден: ${name}`);
  NPC[name] = n;
}
const vExp = varByName('exp');
if (!vExp) throw new Error('переменная exp не найдена');

// ---------- переменная ворот ----------
if (!varByName('gates_open')) {
  p.variables.push({
    id: uid('var'), name: 'gates_open', title: 'Ворота лагеря открыты', type: 'boolean',
    initial: false, category: 'general',
    description: 'Глава 1 откроет выход за периметр (вылазки).',
  });
  log.push('+ переменная gates_open (ворота, глава 1)');
}
const vGates = varByName('gates_open');

// ---------- стили ----------
const kickerStyle = { textColor: '#5f7a8a', fontSize: 20, fontWeight: '300', letterSpacing: 3 };
const narrStyle = { textColor: '#aebfca', fontSize: 30, fontWeight: '300', lineHeight: 1.6 };
const pointStyle = {
  fill: 'transparent', textColor: '#cfe8e5', fontSize: 26, radius: 8,
  borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, textAlign: 'left', fontWeight: '300',
};
const exitStyle = {
  fill: 'transparent', textColor: '#8fa2af', fontSize: 22, radius: 0,
  borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1, textAlign: 'center', letterSpacing: 2, fontWeight: '300',
};

const el = (props) => ({ id: uid('el'), visible: true, style: {}, ...props });
const kicker = (text) => el({ name: 'Кикер', type: 'text', x: 40, y: 120, w: 800, h: 50, text, style: { ...kickerStyle } });
const narr = (text, h = 300) => el({ name: 'Нарратив', type: 'text', x: 310, y: 230, w: 1300, h, text, style: { ...narrStyle } });
const point = (name, text, dialogueId, y = 620) => el({
  name, type: 'button', x: 360, y, w: 760, h: 64, text, style: { ...pointStyle },
  action: { type: 'startDialogue', dialogueId },
});
const toMap = () => el({
  name: 'К схеме', type: 'button', x: 40, y: 950, w: 340, h: 60, text: '‹ К СХЕМЕ ЛАГЕРЯ',
  style: { ...exitStyle }, action: { type: 'gotoScene', sceneId: sMap.id },
});

// ---------- диалоги-знакомства ----------
const line = (npc, text, next) => ({ id: uid('nd'), type: 'line', x: 0, y: 0, speakerNpcId: npc?.id ?? null, text, next });
const mkDialogue = (name, build) => {
  const nodes = build();
  nodes.forEach((n, i) => { n.x = 80 + i * 360; n.y = 120; });
  const d = { id: uid('dlg'), name, startNodeId: nodes[0].id, nodes };
  p.dialogues.push(d);
  log.push(`+ диалог «${name}»`);
  return d;
};

const dMatis = mkDialogue('Ангар — Матис у верстака', () => {
  const n1 = line(NPC['Матис Йордан'],
    'А, ты. Иди сюда, подержи вот здесь. Не отпускай, пока не скажу… Всё, отпускай.\n\nОн вылезает из-под платформы и вытирает руки.\n\nПолдня она у меня стучала. Теперь не стучит. Считай, день удался.', null);
  const n2 = line(NPC['Матис Йордан'],
    'Осваивайся. Двор видел? Лори там всех кормит — скажешь, что от меня, получишь добавку. Лия в мастерской у энергоблока, Кай на складе.\n\nИ к Джасту зайди сам, он на узле связи. Любит знать, кто у него живёт.', null);
  const nEnd = { id: uid('nd'), type: 'end', x: 0, y: 0 };
  n1.next = n2.id; n2.next = nEnd.id;
  return [n1, n2, nEnd];
});

const dLiya = mkDialogue('Мастерская — Лия (знакомство)', () => {
  const n1 = line(NPC['Лия Ромеро-Санг'],
    'Матиса я слышу за два ряда. А тебя — нет. Идёшь, а сигнала нет. Интересный ты эффект…\n\nЗаходи, привидение. Только руками ничего не трогай: тут всё лежит как надо, даже если выглядит наоборот.', null);
  const n3a = line(NPC['Лия Ромеро-Санг'],
    'Mesh тебя не видит. Для половины лагеря ты, строго говоря, не существуешь. На складе спорили: скрипишь ты по ночам или просачиваешься сквозь стены.\n\nЯ поставила на второе. Не подведи.', null);
  const n3b = line(NPC['Лия Ромеро-Санг'],
    'Крепление для платформы. Третье за месяц. Кто-то — не будем показывать пальцем на весь второй экипаж — уверен, что тормозить можно об камни.', null);
  const n4 = line(NPC['Лия Ромеро-Санг'],
    'Ладно, привидение. Будет дело — заходи. У меня тут всегда что-нибудь звенит.', null);
  const n2 = {
    id: uid('nd'), type: 'choice', x: 0, y: 0,
    choices: [
      { id: uid('ch'), text: 'Привидение?', conditions: [], effects: [], next: n3a.id },
      { id: uid('ch'), text: 'Что собираешь?', conditions: [], effects: [], next: n3b.id },
    ],
  };
  const nEnd = { id: uid('nd'), type: 'end', x: 0, y: 0 };
  n1.next = n2.id; n3a.next = n4.id; n3b.next = n4.id; n4.next = nEnd.id;
  return [n1, n2, n3a, n3b, n4, nEnd];
});

const dLori = mkDialogue('Двор — Лори (знакомство)', () => {
  const relLori = NPC['Лори Никадзе'].relationVarId;
  const n1 = line(NPC['Лори Никадзе'],
    'Новенький. Миска.\n\nЭто не вопрос: она уже наливает.\n\nЕшь здесь, на ходу не смей. Рассыпешь — птицы обнаглеют, а виновата буду я.', null);
  const n3a = line(NPC['Лори Никадзе'],
    '«Спасибо»… Вежливый. Ладно.\n\nДобавка будет, если миску вернёшь сам. Вымытую.', null);
  const n3b = line(NPC['Лори Никадзе'],
    'Молчит и ест. Хоть один нормальный тут завёлся.\n\nДобавка там же, где первая.', null);
  const n2 = {
    id: uid('nd'), type: 'choice', x: 0, y: 0,
    choices: [
      { id: uid('ch'), text: 'Спасибо.', conditions: [], effects: [{ varId: relLori, op: 'add', value: 1 }], next: n3a.id },
      { id: uid('ch'), text: '[Молча взять миску]', conditions: [], effects: [{ varId: relLori, op: 'add', value: 1 }], next: n3b.id },
    ],
  };
  const nEnd = { id: uid('nd'), type: 'end', x: 0, y: 0 };
  n1.next = n2.id; n3a.next = nEnd.id; n3b.next = nEnd.id;
  return [n1, n2, n3a, n3b, nEnd];
});

const dJust = mkDialogue('Узел связи — Джаст (знакомство)', () => {
  const n1 = line(NPC['Джаст Верден'],
    'Так это ты — человек из капсулы.\n\nОн рассматривает тебя без спешки, как груз, который надо правильно закрепить.\n\nМатис за тебя поручился. Это много. Но это его слово, не твоё.', null);
  const n2 = line(NPC['Джаст Верден'],
    'Живи, осматривайся, помогай, где рук не хватает. Своё слово скажешь делами — тут по-другому не умеют.\n\nВопросы будут — я обычно здесь, у связи.', null);
  const nEnd = { id: uid('nd'), type: 'end', x: 0, y: 0 };
  n1.next = n2.id; n2.next = nEnd.id;
  return [n1, n2, nEnd];
});

const dKai = mkDialogue('Склад — Кай (знакомство)', () => {
  const n1 = line(NPC['Кай Муромото'],
    'Погоди. …Сорок один, сорок два. Так, слушаю.\n\nОн смотрит поверх списка.\n\nА, новенький. В ведомости ты проходишь как «расходы, назначение неясно». Не обижайся: графа как графа, бывают хуже.', null);
  const n2 = line(NPC['Кай Муромото'],
    'Понадобится что со склада — приходи со списком. Без списка не приходи.', null);
  const nEnd = { id: uid('nd'), type: 'end', x: 0, y: 0 };
  n1.next = n2.id; n2.next = nEnd.id;
  return [n1, n2, nEnd];
});

// ---------- сцены лагеря ----------
const mkScene = (name, background, elements) => {
  const s = {
    id: uid('scene'), name, kind: 'location', background, guides: [],
    hudMode: 'off', elements,
  };
  p.scenes.push(s);
  log.push(`+ сцена «${name}»`);
  return s;
};

const sYard = mkScene('Двор лагеря', 'linear-gradient(180deg, #0d141b 0%, #1c232b 60%, #10161c 100%)', [
  kicker('АВАНПОСТ · ДВОР'),
  narr('Костёр посреди двора горит, кажется, всегда — не для тепла, для разговора.\n\nЗдесь проще всего понять, чем живёт лагерь: кто вернулся, кто собирается, у кого что сломалось. На тебя всё ещё поглядывают — но уже без напряжения: чужак, который моет свою миску, наполовину свой.'),
  point('Лори', '◊ Лори у полевой кухни', dLori.id),
  toMap(),
]);

const sWorkshop = mkScene('Мастерская Лии', 'linear-gradient(180deg, #101820 0%, #1d2731 60%, #121820 100%)', [
  kicker('АВАНПОСТ · МАСТЕРСКАЯ'),
  narr('Мастерскую слышно раньше, чем видно: у энергоблока звенит, шипит и изредка ругается.\n\nНа верстаке — разложенные по тряпке детали. Порядок тут свой, понятный только хозяйке.', 240),
  point('Лия', '◊ Лия за верстаком', dLiya.id, 560),
  toMap(),
]);

const sDepot = mkScene('Склад Кая', 'linear-gradient(180deg, #0e1319 0%, #191f27 60%, #0f141a 100%)', [
  kicker('АВАНПОСТ · СКЛАД'),
  narr('Стеллажи до потолка, всё подписано, всё посчитано. Единственное место в лагере, где ничего не звенит и не капает.', 180),
  point('Кай', '◊ Кай считает ящики', dKai.id, 520),
  toMap(),
]);

const sComms = mkScene('Узел связи', 'linear-gradient(180deg, #0c1420 0%, #16202e 60%, #0d141e 100%)', [
  kicker('АВАНПОСТ · УЗЕЛ СВЯЗИ'),
  narr('Антенны на мачтах, карты на столе, ровный шелест эфира. Отсюда лагерь слушает пустошь.', 180),
  point('Джаст', '◊ Джаст у карт', dJust.id, 520),
  toMap(),
]);

const sMed = mkScene('Медпункт', 'linear-gradient(180deg, #0f151b 0%, #1a2129 60%, #101519 100%)', [
  kicker('АВАНПОСТ · МЕДПУНКТ'),
  narr('Тихо и чисто — до неправдоподобия.\n\nАниша занята: кто-то из второго экипажа опять решил, что перчатки — для слабых. Зайти можно будет позже.', 240),
  toMap(),
]);

// ---------- карта на сцене «Аванпост Flux Nomads» ----------
const mk = (id, title, sceneId, x, y, size, extra = {}) => ({ id, title, sceneId, x, y, size, ...extra });
const ids = { yard: uid('mn'), hangar: uid('mn'), workshop: uid('mn'), depot: uid('mn'), comms: uid('mn'), med: uid('mn'), gates: uid('mn') };
const mark = (text, conditions = []) => ({ id: uid('mm'), text, conditions });
const metFalse = (npc) => [{ varId: npc.metVarId, op: 'eq', value: false }];

sMap.hudMode = 'off';
sMap.campMap = {
  homeNodeId: ids.yard,
  nodes: [
    mk(ids.yard, 'Двор', sYard.id, 50, 52, 16, {
      tagline: 'костёр, кухня, разговоры',
      marks: [mark('◊ Лори кормит', metFalse(NPC['Лори Никадзе'])), mark('· костёр горит')],
      npcIds: [NPC['Лори Никадзе'].id, NPC['Ю Накао'].id, NPC['Рами Альмора'].id],
    }),
    mk(ids.hangar, 'Ангар', sHangar.id, 67, 35, 15, {
      tagline: 'сварка и лебёдки',
      marks: [mark('· Матис у верстака')],
      npcIds: [NPC['Матис Йордан'].id, NPC['Зора Микалян'].id, NPC['Марек Бринн'].id],
    }),
    mk(ids.workshop, 'Мастерская', sWorkshop.id, 33, 37, 14, {
      tagline: 'звенит с утра',
      marks: [mark('◊ Лия что-то мастерит', metFalse(NPC['Лия Ромеро-Санг'])), mark('· звенит с утра')],
      npcIds: [NPC['Лия Ромеро-Санг'].id, NPC['Хани Мдале'].id, NPC['Тала Верихо'].id],
    }),
    mk(ids.depot, 'Склад Кая', sDepot.id, 68, 68, 12, {
      tagline: 'всё посчитано. дважды',
      marks: [mark('◊ Кай у ведомостей', metFalse(NPC['Кай Муромото'])), mark('· пересчёт')],
      npcIds: [NPC['Кай Муромото'].id],
    }),
    mk(ids.comms, 'Узел связи', sComms.id, 31, 68, 12, {
      tagline: 'антенны и карты',
      marks: [mark('◊ представиться Джасту', metFalse(NPC['Джаст Верден'])), mark('· антенны и карты')],
      npcIds: [NPC['Джаст Верден'].id, NPC['Ференц Ташиев'].id, NPC['Омар Кьян'].id],
    }),
    mk(ids.med, 'Медпункт', sMed.id, 78, 84, 8, {
      tagline: 'тихо и чисто', dim: 40,
      npcIds: [NPC['Аниша Гхал'].id],
    }),
    mk(ids.gates, 'Ворота', undefined, 22, 85, 8, {
      tagline: 'периметр; дальше — пустошь', dim: 45,
      lockedIf: [{ varId: vGates.id, op: 'eq', value: false }],
      lockedText: 'Караульный качает головой: без сопровождения за периметр — никуда.',
      npcIds: [NPC['Тэмур Эласко'].id],
    }),
  ],
  links: [
    { a: ids.yard, b: ids.hangar }, { a: ids.yard, b: ids.workshop },
    { a: ids.yard, b: ids.depot }, { a: ids.yard, b: ids.comms },
    { a: ids.comms, b: ids.gates }, { a: ids.depot, b: ids.med },
  ],
};
if (!sMap.elements.some((e) => e.name === 'Кикер')) {
  sMap.elements.push(kicker('АВАНПОСТ ФЛАКС-НОМАДОВ'));
}
log.push('+ карта на сцене «Аванпост Flux Nomads» (7 узлов, 6 дорожек)');

// ---------- ангар: отвязка Осколка ----------
const dropDialogues = [];
for (const name of ['Ангар — Осколок', 'Ангар — Рен']) {
  const d = p.dialogues.find((x) => x.name === name);
  if (d) dropDialogues.push(d.id);
}
const beforeEls = sHangar.elements.length;
sHangar.elements = sHangar.elements.filter((e) =>
  !(e.action?.dialogueId && dropDialogues.includes(e.action.dialogueId))
  && e.name !== 'Подсказка-журнал');
sHangar.elements.push(point('Матис', '◊ Матис у верстака', dMatis.id, 470));
sHangar.elements.push(toMap());
sHangar.hudMode = 'off';
p.dialogues = p.dialogues.filter((d) => !dropDialogues.includes(d.id));
log.push(`ангар: убраны выдача Осколка, «Рен» и демо-подсказка (${beforeEls}→${sHangar.elements.length} элементов), добавлены Матис и выход к схеме`);

// ---------- квест «Наладить связи» → «Освоиться» ----------
const quest = p.quests?.find((q) => q.title === 'Наладить связи');
if (quest) {
  quest.title = 'Освоиться';
  quest.description = 'Лагерь присматривается к чужаку. Познакомьтесь с людьми: Лия в мастерской, Лори у костра, Джаст на узле связи.';
  quest.kind = 'story';
  quest.conditions = [];
  quest.steps = [
    { id: uid('qs'), text: 'Заглянуть к Лии в мастерскую', conditions: [{ varId: NPC['Лия Ромеро-Санг'].metVarId, op: 'eq', value: true }] },
    { id: uid('qs'), text: 'Поесть у Лори во дворе', conditions: [{ varId: NPC['Лори Никадзе'].metVarId, op: 'eq', value: true }] },
    { id: uid('qs'), text: 'Представиться Джасту на узле связи', conditions: [{ varId: NPC['Джаст Верден'].metVarId, op: 'eq', value: true }] },
  ];
  quest.rewardEffects = [{ varId: vExp.id, op: 'add', value: 25 }];
  quest.rewardItems = [];
  log.push('квест «Наладить связи» → «Освоиться» (3 знакомства, награда 25 опыта, без Осколка)');
}

// ---------- «Новый дом»: опечатка ----------
for (const e of sHome.elements) {
  if (e.text === 'Осмотрется') { e.text = 'Осмотреться'; log.push('«Новый дом»: опечатка «Осмотрется» исправлена'); }
}

// ---------- запись ----------
fs.writeFileSync(OUT, JSON.stringify(p, null, 2));
console.log('Готово:', OUT);
for (const l of log) console.log(' •', l);
