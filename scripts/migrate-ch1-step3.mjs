// ============================================================
// Глава 1, шаг 3: сцена 1.4 «Руины у периметра» (ch1-act1.md) —
// белая зона с Тэмуром и развилкой А/Б, жёлтая зона с таймером
// экспозиции (Scene.zone), сцены спасения 1.4a/1.4b, шина данных,
// мини-поручение «Ключи Тэмура».
//
// Читает local-save/project.json → пишет local-save/project-ch1-step3.tls.json.
// Запуск: node scripts/migrate-ch1-step3.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'local-save', 'project.json');
const OUT = path.join(ROOT, 'local-save', 'project-ch1-step3.tls.json');

const p = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
const log = [];
let uidN = 0;
const uid = (prefix) => `${prefix}_c1c${Date.now().toString(36)}${(uidN++).toString(36)}`;

const sceneByName = (name) => p.scenes.find((s) => s.name === name);
const varByName = (name) => p.variables.find((v) => v.name === name);
const itemByName = (name) => (p.items ?? []).find((i) => i.name === name);
const npcByName = (name) => (p.npcs ?? []).find((n) => n.name === name);

const sOutside = sceneByName('За воротами');
const sMap = sceneByName('Аванпост Flux Nomads');
const nTemur = npcByName('Тэмур Эласко');
const iBus = itemByName('Шина данных старого стандарта');
const iStim = itemByName('Стим-инъектор');
const iCoilJunk = itemByName('Обгоревшая обмотка');
const iBolt = itemByName('Гнутый крепёж');
if (!sOutside || !sMap?.campMap || !nTemur || !iBus) throw new Error('сначала загрузите шаг 2 (нет «За воротами»/шины/Тэмура)');

// ---------- переменные ----------
const vars = [
  ['ch1_temur_talk', 'Гл.1: поговорил с Тэмуром у руин', 'boolean', false],
  ['ch1_temur_helped', 'Гл.1: Тэмур подстраховал (путь А)', 'boolean', false],
  ['ch1_went_yellow', 'Гл.1: полез в жёлтую один', 'boolean', false],
  ['ch1_temur_saved', 'Гл.1: Тэмур вытащил из зоны', 'boolean', false],
  ['ch1_yellow_rescued', 'Гл.1: вытянут верёвкой', 'boolean', false],
  ['ch1_temur_keys', 'Гл.1: поручение «ключи Тэмура»', 'boolean', false],
  ['ch1_temur_after', 'Гл.1: Тэмур рассказал про гнездо', 'boolean', false],
  ['ch1_ruins_look', 'Гл.1: осмотров у руин', 'number', 0],
  ['ch1_yellow_look', 'Гл.1: осмотров в жёлтой', 'number', 0],
  ['ch1_p_r1', 'Гл.1: стойки корпуса обысканы', 'boolean', false],
  ['ch1_p_r2', 'Гл.1: балка поднята', 'boolean', false],
];
for (const [name, title, type, initial] of vars) {
  if (!varByName(name)) p.variables.push({ id: uid('var'), name, title, type, initial, category: 'general' });
}
log.push(`+ переменные шага 3 (${vars.length})`);
const V = (name) => varByName(name).id;
const is = (name, op, value) => ({ varId: V(name), op, value });
const eq = (name, value = true) => is(name, 'eq', value);
const set = (name, value = true) => ({ varId: V(name), op: 'set', value });
const relTemur = nTemur.relationVarId;

// ---------- утилиты диалогов ----------
const line = (npc, text) => ({ id: uid('nd'), type: 'line', x: 0, y: 0, speakerNpcId: npc?.id ?? null, text, next: null });
const doSet = (effects, giveItems) => ({ id: uid('nd'), type: 'set', x: 0, y: 0, effects, ...(giveItems ? { giveItems } : {}), next: null });
const branch = (conditions) => ({ id: uid('nd'), type: 'branch', x: 0, y: 0, conditions, nextTrue: null, nextFalse: null });
const endN = () => ({ id: uid('nd'), type: 'end', x: 0, y: 0 });
const mkDialogue = (name, nodes) => {
  nodes.forEach((n, i) => { n.x = 80 + (i % 6) * 340; n.y = 80 + Math.floor(i / 6) * 200; });
  const d = { id: uid('dlg'), name, startNodeId: nodes[0].id, nodes };
  p.dialogues.push(d);
  log.push(`+ диалог «${name}»`);
  return d;
};
const seq = (...nodes) => {
  for (let i = 0; i < nodes.length - 1; i++) {
    const n = nodes[i];
    if (n.type === 'line' || n.type === 'set') n.next = nodes[i + 1].id;
    if (n.type === 'choice') n.choices.forEach((c) => { if (!c.next) c.next = nodes[i + 1].id; });
  }
  return nodes;
};
const ask = (...texts) => ({
  id: uid('nd'), type: 'choice', x: 0, y: 0,
  choices: texts.map((t) => ({ id: uid('ch'), text: t, conditions: [], effects: [], next: null })),
});

// ---------- d14: главный разговор с Тэмуром ----------
let d14;
{
  const n1 = line(nTemur, 'Стой, где стоишь. …А. Привидение Лии.\n\nСлухи ходят быстрее тебя. Чего у руин забыл?');
  const q1 = ask('Кай послал. Ищу шину данных, старый стандарт.', 'Ты Тэмур? Мне сказали спросить тебя про падальщика.');
  const n2 = line(nTemur, 'Шина — в третьем корпусе, там стойки связи ещё не выпотрошены. Одна беда: корпус за жёлтой линией. Наполовину.\n\n(не переставая подкрашивать метку) Правила простые. Белая — фон, ходи. Жёлтая — помеха, не ходи. Красная — угроза, беги. Чёрная… чёрных тут нет. И хорошо.');
  const q2 = ask('А что там, за жёлтой? Выглядит так же.');
  const n3 = line(nTemur, 'В том и дело, что так же. Глазам верить перестаёшь — вот что там.\n\nЗайдёшь — поймёшь. Только не глубоко и не надолго. И скажи мне сначала, чтоб я знал, когда начинать тебя искать.\n\nИ считай. В жёлтой время не идёт — то есть идёт, но не для тебя. Поэтому считаешь: раз-два-три. Дошёл до плохих чисел — разворачивайся, где бы ни стоял.');
  const nA = line(nTemur, 'Вдоль плит, по левому краю — там фон тоньше, метки почти белые. Держи верёвку. Дёрнешь два раза — тяну.\n\nИ не хватай ничего лишнего. Взял шину — развернулся — вышел.');
  const nB = line(nTemur, 'Ну да. Все быстрые. (возвращается к метке) Третий корпус. Я посчитаю до пятисот.');
  const fork = {
    id: uid('nd'), type: 'choice', x: 0, y: 0,
    choices: [
      { id: uid('ch'), text: 'Подскажешь, как дойти чисто?', conditions: [],
        effects: [set('ch1_temur_talk'), set('ch1_temur_helped'), { varId: relTemur, op: 'add', value: 3 }], next: nA.id },
      { id: uid('ch'), text: 'Разберусь. Я быстро.', conditions: [],
        effects: [set('ch1_temur_talk')], next: nB.id },
    ],
  };
  const e1 = endN(), e2 = endN();
  seq(n1, q1, n2, q2, n3, fork);
  nA.next = e1.id; nB.next = e2.id;
  d14 = mkDialogue('Гл.1 · 1.4 — Тэмур у руин', [n1, q1, n2, q2, n3, fork, nA, e1, nB, e2]);
}

// Тэмур, пока шина не взята
let dWait;
{
  const b = branch([eq('ch1_temur_helped')]);
  const a = line(nTemur, 'Верёвка у меня. Два рывка — тяну.\n\nВдоль плит, по левому краю. И не хватай лишнего.');
  const bb = line(nTemur, '…Сто двадцать. Я считаю, ты ходишь.\n\nНе тяни.');
  const e1 = endN(), e2 = endN();
  b.nextTrue = a.id; b.nextFalse = bb.id; a.next = e1.id; bb.next = e2.id;
  dWait = mkDialogue('Гл.1 · 1.4 — Тэмур (ждёт)', [b, a, e1, bb, e2]);
}

// шина в жёлтой зоне
let dBus;
{
  const b = branch([eq('ch1_temur_helped')]);
  const a = line(null, '[i]Идёшь вдоль плит. Воздух за метками плотнее — не давит, просто… присутствует.\n\nСтойка связи. Шина выходит из зажимов неохотно, как зуб. Два рывка верёвки не понадобились — но знать, что она есть, было приятно.[/]');
  const bb = line(null, '[i]Шину берёшь с третьей попытки — пальцы промахиваются мимо зажимов.\n\nНа выходе будет легче. Наверное.[/]');
  const give = doSet([set('ch1_bus_found')], [{ itemId: iBus.id, qty: 1 }]);
  const e = endN();
  b.nextTrue = a.id; b.nextFalse = bb.id; a.next = give.id; bb.next = give.id; give.next = e.id;
  dBus = mkDialogue('Гл.1 · 1.4 — Стойка связи (шина)', [b, a, bb, give, e]);
}

// после шины: реакция + гнездо + ключи
let dAfter;
{
  const b = branch([eq('ch1_temur_helped')]);
  const a1 = line(nTemur, 'Взял? Вот и всё приключение. Верёвку сматываю.');
  const b1 = line(nTemur, 'Триста сорок. Быстро.\n\n…И зря один. Ну, живой — и ладно.');
  const bSet = doSet([set('ch1_went_yellow')]);
  const q = ask('Кай говорил, ты знаешь, где гнездо падальщика.');
  const n2 = line(nTemur, 'Знаю. Овраг за старой водокачкой, к северо-востоку. Летает туда каждую ночь, как по расписанию. Днём обычно дома.\n\nРаз всё равно пойдёшь — глянь там моё. За месяц пропали три ключа и фонарь. Эта дрянь тащит всё, что блестит.\n\nНайдёшь ключи — верни. Остальное забирай, мне чужого не надо.');
  const q2 = ask('Верну.');
  const n3 = line(nTemur, 'Посмотрим. (пауза) Метки жёлтые — помнишь, да?\n\nВот так с ними всегда и будет.');
  const fin = doSet([set('ch1_temur_after'), set('ch1_temur_keys')]);
  const e = endN();
  b.nextTrue = a1.id; b.nextFalse = b1.id;
  a1.next = q.id; b1.next = bSet.id; bSet.next = q.id;
  seq(q, n2, q2, n3, fin, e);
  dAfter = mkDialogue('Гл.1 · 1.4 — Тэмур (после шины)', [b, a1, b1, bSet, q, n2, q2, n3, fin, e]);
}

// осмотры: белая зона
let dLookW;
{
  const n1 = doSet([{ varId: V('ch1_ruins_look'), op: 'add', value: 1 }]);
  const b1 = branch([is('ch1_ruins_look', 'lte', 1)]);
  const l1 = line(null, '[i]«Метки подкрашены недавно. Тэмурова работа — за своим сном он так не следит.»[/]');
  const b2 = branch([is('ch1_ruins_look', 'lte', 2)]);
  const l2 = line(null, '[i]«Третий корпус — вон тот, со шпилем антенны. Наполовину за жёлтой линией. Как назло — нужной половиной.»[/]');
  const l3 = line(null, '[i]«Всё осмотрел. Дальше — только за метки.»[/]');
  const e1 = endN(), e2 = endN(), e3 = endN();
  n1.next = b1.id;
  b1.nextTrue = l1.id; l1.next = e1.id;
  b1.nextFalse = b2.id;
  b2.nextTrue = l2.id; l2.next = e2.id;
  b2.nextFalse = l3.id; l3.next = e3.id;
  dLookW = mkDialogue('Гл.1 · 1.4 — Осмотреться (белая)', [n1, b1, l1, e1, b2, l2, e2, l3, e3]);
}

// осмотры: жёлтая зона (искажённые)
let dLookY;
{
  const n1 = doSet([{ varId: V('ch1_yellow_look'), op: 'add', value: 1 }]);
  const b1 = branch([is('ch1_yellow_look', 'lte', 1)]);
  const l1 = line(null, '[i]«Столбы стоят не там, где стояли. Или я не там, где стоял.»[/]');
  const b2 = branch([is('ch1_yellow_look', 'lte', 2)]);
  const l2 = line(null, '[i]«Тихо. Слишком знакомо тихо. Так было в капсуле.»[/]');
  const l3 = line(null, '[i]«Шина. Вон она. Бери и уходи, бери и уходи, бери и…»[/]');
  const e1 = endN(), e2 = endN(), e3 = endN();
  n1.next = b1.id;
  b1.nextTrue = l1.id; l1.next = e1.id;
  b1.nextFalse = b2.id;
  b2.nextTrue = l2.id; l2.next = e2.id;
  b2.nextFalse = l3.id; l3.next = e3.id;
  dLookY = mkDialogue('Гл.1 · 1.4 — Осмотреться (жёлтая)', [n1, b1, l1, e1, b2, l2, e2, l3, e3]);
}

// точки обыска (белая зона)
let dR1;
{
  const n1 = doSet([set('ch1_p_r1'), is('ch1_rnd', 'random', 2)]);
  const b = branch([is('ch1_rnd', 'eq', 1)]);
  const good = line(null, '[i]В стойках первого корпуса — обмотка, которую поленились выдирать. Зря поленились.[/]');
  const give = doSet([], [{ itemId: iCoilJunk.id, qty: 2 }]);
  const bad = line(null, '[i]Выпотрошено давно и качественно. Здесь работали профессионалы лени.[/]');
  const e1 = endN(), e2 = endN();
  n1.next = b.id; b.nextTrue = good.id; good.next = give.id; give.next = e1.id;
  b.nextFalse = bad.id; bad.next = e2.id;
  dR1 = mkDialogue('Гл.1 · 1.4 — Стойки первого корпуса', [n1, b, good, give, e1, bad, e2]);
}
let dR2;
{
  const n1 = doSet([set('ch1_p_r2'), is('ch1_rnd', 'random', 2)]);
  const b = branch([is('ch1_rnd', 'eq', 1)]);
  const good = line(null, '[i]Под балкой — чей-то старый схрон: аптечка, завёрнутая в плёнку. Хозяин за ней уже не придёт.[/]');
  const give = doSet([], [{ itemId: iStim.id, qty: 1 }]);
  const bad = line(null, '[i]Под балкой — крепёж. Гнутый, конечно. Здесь всё гнутое.[/]');
  const give2 = doSet([], [{ itemId: iBolt.id, qty: 2 }]);
  const e1 = endN(), e2 = endN();
  n1.next = b.id; b.nextTrue = good.id; good.next = give.id; give.next = e1.id;
  b.nextFalse = bad.id; bad.next = give2.id; give2.next = e2.id;
  dR2 = mkDialogue('Гл.1 · 1.4 — Обрушенный навес', [n1, b, good, give, e1, bad, give2, e2]);
}

// диалоги сцен спасения
let d14a;
{
  const n1 = line(nTemur, 'Живой. Смотри на меня. Пальцы чувствуешь?');
  const rem = line(null, '[i]Кивнуть получается со второго раза. Ты лежишь на белой стороне меток. Спина мокрая — тебя тащили.[/]');
  const n2 = line(nTemur, 'Я сказал: не глубоко и не надолго. Ты услышал «глубоко» и «надолго».\n\nДо скольких досчитал?');
  const q = ask('Сбился.');
  const n3 = line(nTemur, 'Вот. Все так говорят. Сбился — значит, уже давно пора было выходить.\n\nЗапомни, как тебе сейчас. Это «помеха». Просто помеха, самый низ жёлтой. А теперь представь красную. Представил? Больше не делай так.');
  const bBus = branch([eq('ch1_bus_found', false)]);
  const busLine = line(null, '[i]В кармане — шина. Прихватил, пока тащили. Хоть что-то сегодня по плану.[/]');
  const busGive = doSet([set('ch1_bus_found')], [{ itemId: iBus.id, qty: 1 }]);
  const fin = doSet([set('ch1_temur_saved'), { varId: relTemur, op: 'sub', value: 1 }]);
  const e = endN();
  seq(n1, rem, n2, q, n3, bBus);
  bBus.nextTrue = busLine.id; busLine.next = busGive.id; busGive.next = fin.id;
  bBus.nextFalse = fin.id; fin.next = e.id;
  d14a = mkDialogue('Гл.1 · 1.4a — Вытащил', [n1, rem, n2, q, n3, bBus, busLine, busGive, fin, e]);
}
let d14b;
{
  const n1 = line(nTemur, 'Всё. Сядь. Дыши.');
  const n2 = line(nTemur, 'Шину взял? Значит, больше туда не надо. Лучше не рисковать — отдышись, и в лагерь.\n\nДля первого раза — нормально. Все первый раз выходят не сами. Почти все.');
  const bBus = branch([eq('ch1_bus_found', false)]);
  const busLine = line(null, '[i]Шина — в кармане: сунул, когда воздух ещё слушался. Хоть что-то по плану.[/]');
  const busGive = doSet([set('ch1_bus_found')], [{ itemId: iBus.id, qty: 1 }]);
  const fin = doSet([set('ch1_yellow_rescued')]);
  const e = endN();
  seq(n1, n2, bBus);
  bBus.nextTrue = busLine.id; busLine.next = busGive.id; busGive.next = fin.id;
  bBus.nextFalse = fin.id; fin.next = e.id;
  d14b = mkDialogue('Гл.1 · 1.4b — Отдышись', [n1, n2, bBus, busLine, busGive, fin, e]);
}

// ---------- сцены ----------
const pointStyle = {
  fill: 'transparent', textColor: '#cfe8e5', fontSize: 26, radius: 8,
  borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, textAlign: 'left', fontWeight: '300',
};
const quietStyle = { ...pointStyle, textColor: '#8fa2af', fontSize: 24, borderColor: 'rgba(255,255,255,0.08)' };
const dangerStyle = { ...pointStyle, textColor: '#e5c07b', borderColor: 'rgba(229,192,123,0.25)' };
const exitStyle = {
  fill: 'transparent', textColor: '#8fa2af', fontSize: 22, radius: 0,
  borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1, textAlign: 'center', letterSpacing: 2, fontWeight: '300',
};
const el = (props) => ({ id: uid('el'), visible: true, style: {}, ...props });
const kicker = (text) => el({ name: 'Кикер', type: 'text', x: 40, y: 120, w: 980, h: 50, text, style: { textColor: '#5f7a8a', fontSize: 20, fontWeight: '300', letterSpacing: 3 } });
const narr = (text, h2 = 220, y = 200) => el({ name: 'Нарратив', type: 'text', x: 310, y, w: 1300, h: h2, text, style: { textColor: '#aebfca', fontSize: 29, fontWeight: '300', lineHeight: 1.6 } });

// белая зона — руины
const sRuins = {
  id: uid('scene'), name: 'Руины у периметра (гл.1 — 1.4)', kind: 'location',
  background: 'linear-gradient(180deg, #14161a 0%, #262624 55%, #141517 100%)',
  guides: [], hudMode: 'off',
  elements: [
    kicker('ПУСТОШЬ · РУИНЫ У ПЕРИМЕТРА'),
    narr('Белые метки на столбах — свежие, подкрашенные. Кто-то следит за ними внимательнее, чем за собственным сном.\n\nДальше, между корпусами, метки жёлтые. За ними всё то же самое: песок, бетон, ржавь. Вообще всё то же самое. Непонятно, почему туда так не хочется идти.'),
    el({ name: 'Тэмур (1.4)', type: 'button', x: 360, y: 470, w: 760, h: 58,
      text: '◊ Тэмур на наблюдательном посту, банка с краской в руке', style: { ...pointStyle },
      action: { type: 'startDialogue', dialogueId: d14.id },
      visibleIf: [eq('ch1_temur_talk', false)] }),
    el({ name: 'Тэмур (ждёт)', type: 'button', x: 360, y: 470, w: 760, h: 58,
      text: '◊ Тэмур подкрашивает метку', style: { ...pointStyle },
      action: { type: 'startDialogue', dialogueId: dWait.id },
      visibleIf: [eq('ch1_temur_talk'), eq('ch1_bus_found', false)] }),
    el({ name: 'Тэмур (после шины)', type: 'button', x: 360, y: 470, w: 760, h: 58,
      text: '◊ Тэмур опускает бинокль', style: { ...pointStyle },
      action: { type: 'startDialogue', dialogueId: dAfter.id },
      visibleIf: [eq('ch1_bus_found'), eq('ch1_temur_after', false)] }),
    el({ name: 'Стойки', type: 'button', x: 360, y: 542, w: 760, h: 58,
      text: '· Стойки первого корпуса', style: { ...pointStyle },
      action: { type: 'startDialogue', dialogueId: dR1.id },
      visibleIf: [eq('ch1_p_r1', false)] }),
    el({ name: 'Навес', type: 'button', x: 360, y: 614, w: 760, h: 58,
      text: '[Сила] Приподнять балку обрушенного навеса', style: { ...pointStyle },
      action: { type: 'startDialogue', dialogueId: dR2.id },
      visibleIf: [eq('ch1_p_r2', false), { varId: varByName('atk').id, op: 'gte', value: p.hero?.baseStats?.atk ?? 10 }] }),
    el({ name: 'За маркеры', type: 'button', x: 360, y: 686, w: 760, h: 58,
      text: '▲ Перешагнуть жёлтые маркеры', style: { ...dangerStyle },
      action: { type: 'gotoScene', sceneId: '' }, // жёлтая зона (ниже)
      visibleIf: [eq('ch1_temur_talk')] }),
    el({ name: 'Осмотреться', type: 'button', x: 1180, y: 470, w: 380, h: 58,
      text: '· Осмотреться', style: { ...quietStyle },
      action: { type: 'startDialogue', dialogueId: dLookW.id } }),
    el({ name: 'К воротам', type: 'button', x: 40, y: 950, w: 340, h: 60,
      text: '‹ К ВОРОТАМ', style: { ...exitStyle },
      action: { type: 'gotoScene', sceneId: sOutside.id } }),
  ],
};
p.scenes.push(sRuins);

// сцены спасения (нужны id до жёлтой зоны)
const s14a = {
  id: uid('scene'), name: 'Руины — очнулся (гл.1 — 1.4a)', kind: 'location',
  background: 'linear-gradient(180deg, #191512 0%, #24201c 55%, #15130f 100%)',
  guides: [], hudMode: 'off',
  onEnterDialogueId: d14a.id,
  elements: [
    kicker('РУИНЫ · БЕЛАЯ СТОРОНА МЕТОК'),
    narr('Мир возвращается рывками: сначала небо. Потом плечо, в которое упирается чьё-то колено. Потом злость. Не твоя.', 160),
    el({ name: 'Встать', type: 'button', x: 360, y: 760, w: 760, h: 64,
      text: '➜ Подняться на ноги', style: { ...pointStyle },
      action: { type: 'gotoScene', sceneId: sRuins.id } }),
  ],
};
const s14b = {
  id: uid('scene'), name: 'Руины — отдышись (гл.1 — 1.4b)', kind: 'location',
  background: 'linear-gradient(180deg, #151713 0%, #21231d 55%, #131510 100%)',
  guides: [], hudMode: 'off',
  onEnterDialogueId: d14b.id,
  elements: [
    kicker('РУИНЫ · БЕЛАЯ СТОРОНА МЕТОК'),
    narr('Два рывка верёвки. Потом ещё два — уже не твои. Потом белая сторона меток и руки, которые разжимаются с трудом.', 160),
    el({ name: 'Встать', type: 'button', x: 360, y: 760, w: 760, h: 64,
      text: '➜ Отдышаться и встать', style: { ...pointStyle },
      action: { type: 'gotoScene', sceneId: sRuins.id } }),
  ],
};
p.scenes.push(s14a, s14b);

// жёлтая зона
const sYellow = {
  id: uid('scene'), name: 'Руины — за жёлтой линией (гл.1)', kind: 'location',
  background: 'linear-gradient(180deg, #1a1a14 0%, #2b2a1e 55%, #191811 100%)',
  guides: [], hudMode: 'off',
  zone: {
    exposureSec: 300, dmgPerSec: 2, recoverySec: 60, hpExitPct: 50,
    hpExits: [
      { conditions: [eq('ch1_temur_helped')], sceneId: s14b.id },
      { conditions: [], sceneId: s14a.id },
    ],
  },
  bgEffects: [
    { id: uid('fx'), type: 'glitch', intensity: 30, conditions: [eq('ch1_temur_helped', false)] },
    { id: uid('fx'), type: 'vignette', intensity: 55, conditions: [eq('ch1_temur_helped', false)] },
    { id: uid('fx'), type: 'vignette', intensity: 30, conditions: [eq('ch1_temur_helped')] },
  ],
  elements: [
    kicker('РУИНЫ · ЗА ЖЁЛТОЙ ЛИНИЕЙ'),
    narr('За метками ничего не меняется.\n\nПотом ты замечаешь, что уже минуту стоишь и смотришь, как не меняется ничего.', 180),
    el({ name: 'Стойка связи', type: 'button', x: 360, y: 500, w: 760, h: 58,
      text: '◊ Стойка связи в третьем корпусе — шина', style: { ...pointStyle },
      action: { type: 'startDialogue', dialogueId: dBus.id },
      visibleIf: [eq('ch1_bus_found', false)] }),
    el({ name: 'Осмотреться', type: 'button', x: 1180, y: 500, w: 380, h: 58,
      text: '· Осмотреться', style: { ...quietStyle },
      action: { type: 'startDialogue', dialogueId: dLookY.id } }),
    el({ name: 'Назад', type: 'button', x: 40, y: 950, w: 460, h: 60,
      text: '‹ НАЗАД, ЗА БЕЛЫЕ МЕТКИ', style: { ...exitStyle },
      action: { type: 'gotoScene', sceneId: sRuins.id } }),
  ],
};
p.scenes.push(sYellow);
sRuins.elements.find((e) => e.name === 'За маркеры').action.sceneId = sYellow.id;
log.push('+ сцены: руины (белая), за жёлтой линией (zone 300с/2hp/60с, выброс 50% → 1.4a/1.4b), 1.4a, 1.4b');

// ---------- «За воротами»: руины открываются ----------
const stub = sOutside.elements.find((e) => e.name === 'Руины (позже)');
if (stub) sOutside.elements = sOutside.elements.filter((e) => e !== stub);
sOutside.elements.splice(sOutside.elements.findIndex((e) => e.name === 'В лагерь'), 0,
  el({ name: 'К руинам', type: 'button', x: 360, y: 630, w: 760, h: 64,
    text: '➜ Руины у периметра — на запад', style: { ...pointStyle },
    action: { type: 'gotoScene', sceneId: sRuins.id } }));
log.push('«За воротами»: заглушка руин заменена переходом в сцену 1.4');

// ---------- карта: пометка про шину ----------
const gatesNode = sMap.campMap.nodes.find((n) => n.title === 'Ворота');
if (gatesNode) {
  gatesNode.marks = [
    { id: uid('mm'), text: '◊ на запад: руины — шина', conditions: [eq('ch1_coil_found'), eq('ch1_bus_found', false)] },
    ...(gatesNode.marks ?? []),
  ];
  log.push('узел «Ворота»: пометка «на запад: руины — шина»');
}

fs.writeFileSync(OUT, JSON.stringify(p, null, 2));
console.log('Готово:', OUT);
for (const l of log) console.log(' •', l);
