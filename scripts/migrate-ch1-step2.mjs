// ============================================================
// Глава 1, шаг 2: сцена 1.3 «Кладбище техники» (ch1-act1.md) +
// сцена-хаб «За воротами» + открытие ворот в конце 1.2.
// Механики: точки обыска со случайным лутом (эффект 'random'),
// проверки [Сила]/[Ловкость] с гарантированными порогами,
// «Осмотреться» со счётчиком внутреннего голоса и скрытым люком.
//
// Читает local-save/project.json → пишет local-save/project-ch1-step2.tls.json.
// Запуск: node scripts/migrate-ch1-step2.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'local-save', 'project.json');
const OUT = path.join(ROOT, 'local-save', 'project-ch1-step2.tls.json');

const p = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
const log = [];
let uidN = 0;
const uid = (prefix) => `${prefix}_c1b${Date.now().toString(36)}${(uidN++).toString(36)}`;

const sceneByName = (name) => p.scenes.find((s) => s.name === name);
const varByName = (name) => p.variables.find((v) => v.name === name);
const itemByName = (name) => (p.items ?? []).find((i) => i.name === name);

const sMap = sceneByName('Аванпост Flux Nomads');
const d12 = p.dialogues.find((d) => d.name === 'Гл.1 · 1.2 — Склад Кая');
if (!sMap?.campMap || !d12) throw new Error('нет карты/диалога 1.2 — сначала загрузите шаг 1');

// ---------- переменные ----------
const vars = [
  ['ch1_rnd', 'Гл.1: бросок случайности', 'number', 0],
  ['ch1_scrap_look', 'Гл.1: осмотров кладбища', 'number', 0],
  ['ch1_servo_found', 'Гл.1: сервопривод найден', 'boolean', false],
  ['ch1_p_corpses', 'Гл.1: куча корпусов обыскана', 'boolean', false],
  ['ch1_p_cont', 'Гл.1: контейнер обыскан', 'boolean', false],
  ['ch1_p_crane', 'Гл.1: кабина крана обыскана', 'boolean', false],
  ['ch1_p_stack', 'Гл.1: штабель осмотрен', 'boolean', false],
  ['ch1_p_hatch', 'Гл.1: люк вскрыт', 'boolean', false],
];
for (const [name, title, type, initial] of vars) {
  if (!varByName(name)) p.variables.push({ id: uid('var'), name, title, type, initial, category: 'general' });
}
log.push(`+ переменные шага 2 (${vars.length})`);
const V = (name) => varByName(name).id;
const is = (name, op, value) => ({ varId: V(name), op, value });
const eq = (name, value = true) => is(name, 'eq', value);
const set = (name, value = true) => ({ varId: V(name), op: 'set', value });

// ---------- предметы ----------
const newItems = [
  { name: 'Резонансная катушка', type: 'resource', rarity: 'decent', price: 0, questItem: true, stack: 1,
    description: 'Старый стандарт. Сердце будущего Осколка — деталь №1 из списка Лии.' },
  { name: 'Шина данных старого стандарта', type: 'resource', rarity: 'decent', price: 0, questItem: true, stack: 1,
    description: 'Мёртвый протокол, живое железо. Деталь №2 из списка Лии.' },
  { name: 'Рабочий сервопривод', type: 'resource', rarity: 'decent', price: 25, stack: 1,
    description: 'Блестящая исправная деталь. Кому-то нужнее, чем тебе… или ценнее.' },
  { name: 'Обгоревшая обмотка', type: 'resource', rarity: 'junk', price: 4, stack: 10,
    description: 'Медь пережила пожар. Кай примет по весу.' },
  { name: 'Гнутый крепёж', type: 'resource', rarity: 'junk', price: 3, stack: 10,
    description: 'Разогнуть дешевле, чем отлить новый.' },
  { name: 'Пласт изоляции', type: 'resource', rarity: 'junk', price: 5, stack: 10,
    description: 'Двести лет в песке — и хоть бы что.' },
];
for (const it of newItems) {
  if (!itemByName(it.name)) p.items.push({ id: uid('item'), ...it });
}
log.push(`+ предметы (${newItems.length}: детали, сервопривод, хлам)`);
const I = (name) => itemByName(name).id;
const iStim = itemByName('Стим-инъектор');
if (!iStim) throw new Error('нет Стим-инъектора');

// ---------- утилиты диалогов ----------
const line = (text) => ({ id: uid('nd'), type: 'line', x: 0, y: 0, speakerNpcId: null, text, next: null });
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
const seq = (...nodes) => { // линейная сшивка line/set
  for (let i = 0; i < nodes.length - 1; i++) {
    const n = nodes[i];
    if (n.type === 'line' || n.type === 'set') n.next = nodes[i + 1].id;
  }
  return nodes;
};

// ---------- 1.3: мини-диалоги точек ----------
// Генераторный блок — гарантированная катушка
const dGen = mkDialogue('Гл.1 · 1.3 — Генераторный блок', seq(
  line('[i]Кто-то уже снял кожух, но до обмотки не добрался — руки были толще твоих.\n\nКатушка выходит целой. Старый стандарт, тяжёлая, честная.[/]'),
  doSet([set('ch1_coil_found')], [{ itemId: I('Резонансная катушка'), qty: 1 }]),
  endN(),
));

// Куча корпусов — random 1..3: 1-2 хлам, 3 пусто
{
  const n1 = doSet([set('ch1_p_corpses'), is('ch1_rnd', 'random', 3)]);
  const b = branch([is('ch1_rnd', 'lte', 2)]);
  const good = line('[i]Между рёбрами корпусов — уцелевшая обмотка. Мелочь, но Кай принимает по весу.[/]');
  const goodGive = doSet([], [{ itemId: I('Обгоревшая обмотка'), qty: 2 }]);
  const bad = line('[i]Пусто. До тебя здесь прошли три поколения сборщиков — и все с руками.[/]');
  const e1 = endN(), e2 = endN();
  n1.next = b.id; b.nextTrue = good.id; b.nextFalse = bad.id;
  good.next = goodGive.id; goodGive.next = e1.id; bad.next = e2.id;
  mkDialogue('Гл.1 · 1.3 — Куча корпусов', [n1, b, good, goodGive, e1, bad, e2]);
}

// Опрокинутый контейнер — random 1..3: 1 расходник, 2 хлам, 3 пусто
{
  const n1 = doSet([set('ch1_p_cont'), is('ch1_rnd', 'random', 3)]);
  const b1 = branch([is('ch1_rnd', 'eq', 1)]);
  const stim = line('[i]Аптечный ящик, задвинутый под самое дно. Внутри — стим-инъектор, даже не вскрытый.[/]');
  const stimGive = doSet([], [{ itemId: iStim.id, qty: 1 }]);
  const b2 = branch([is('ch1_rnd', 'eq', 2)]);
  const junk = line('[i]Крепёж. Гнутый, но это поправимо.[/]');
  const junkGive = doSet([], [{ itemId: I('Гнутый крепёж'), qty: 3 }]);
  const bad = line('[i]Контейнер честно пуст. Даже песка внутри меньше, чем снаружи.[/]');
  const e1 = endN(), e2 = endN(), e3 = endN();
  n1.next = b1.id;
  b1.nextTrue = stim.id; stim.next = stimGive.id; stimGive.next = e1.id;
  b1.nextFalse = b2.id;
  b2.nextTrue = junk.id; junk.next = junkGive.id; junkGive.next = e2.id;
  b2.nextFalse = bad.id; bad.next = e3.id;
  mkDialogue('Гл.1 · 1.3 — Опрокинутый контейнер', [n1, b1, stim, stimGive, e1, b2, junk, junkGive, e2, bad, e3]);
}

// Кабина крана — [Сила]
const dCrane = mkDialogue('Гл.1 · 1.3 — Кабина крана', seq(
  line('[i]Дверь заклинило намертво — но петли старше тебя на пятьсот лет. Упор, рывок — металл сдаётся с обиженным скрипом.\n\nВнутри: аптечка под сиденьем и моток изоляции.[/]'),
  doSet([set('ch1_p_crane')], [{ itemId: iStim.id, qty: 1 }, { itemId: I('Пласт изоляции'), qty: 2 }]),
  endN(),
));

// Штабель плит — [Ловкость]
const dStack = mkDialogue('Гл.1 · 1.3 — Штабель плит', seq(
  line('[i]Сверху видно всё кладбище: ряды, ряды, ряды — и дорогу до самых ворот.\n\nГде-то за дальними рядами блеснуло и погасло. Один раз. Больше не повторилось.\n\nВ ласточкином гнезде из проводов — уцелевшая обмотка.[/]'),
  doSet([set('ch1_p_stack')], [{ itemId: I('Обгоревшая обмотка'), qty: 1 }]),
  endN(),
));

// Занесённый песком люк — скрытая точка
const dHatch = mkDialogue('Гл.1 · 1.3 — Занесённый люк', seq(
  line('[i]Под просевшей плитой — ремонтный кэш. Цел, потому что не блестел.\n\nВнутри — то, за чем сборщики не нагибаются: изоляция, крепёж и аптечка старого образца.[/]'),
  doSet([set('ch1_p_hatch')], [
    { itemId: I('Пласт изоляции'), qty: 2 },
    { itemId: I('Гнутый крепёж'), qty: 2 },
    { itemId: iStim.id, qty: 1 },
  ]),
  endN(),
));

// «Осмотреться» — счётчик + внутренний голос
{
  const n1 = doSet([{ varId: V('ch1_scrap_look'), op: 'add', value: 1 }]);
  const b1 = branch([is('ch1_scrap_look', 'lte', 1)]);
  const l1 = line('[i]«Под завалами — хлам. Хлам, хлам, ещё раз хлам. Двести лет как разграблено.»[/]');
  const b2 = branch([is('ch1_scrap_look', 'lte', 2)]);
  const l2 = line('[i]«Дрон. Лежит смирно… надеюсь, не оживёт. Ладно. Не буду проверять.»[/]');
  const b3 = branch([is('ch1_scrap_look', 'lte', 3)]);
  const l3 = line('[i]«Хм. Вон та плита просела, а песок вокруг неё — нет. Под ней что-то есть.»\n\nРядом с плитой, в пыли — сервопривод. Рабочий. Блестит так, что даже неловко.[/]');
  const l3give = doSet([set('ch1_servo_found')], [{ itemId: I('Рабочий сервопривод'), qty: 1 }]);
  const l4 = line('[i]«Всё. Здесь я видел каждый болт. Пора к руинам.»[/]');
  const e1 = endN(), e2 = endN(), e3 = endN(), e4 = endN();
  n1.next = b1.id;
  b1.nextTrue = l1.id; l1.next = e1.id;
  b1.nextFalse = b2.id;
  b2.nextTrue = l2.id; l2.next = e2.id;
  b2.nextFalse = b3.id;
  b3.nextTrue = l3.id; l3.next = l3give.id; l3give.next = e3.id;
  b3.nextFalse = l4.id; l4.next = e4.id;
  mkDialogue('Гл.1 · 1.3 — Осмотреться', [n1, b1, l1, e1, b2, l2, e2, b3, l3, l3give, e3, l4, e4]);
}
const dLook = p.dialogues.find((d) => d.name === 'Гл.1 · 1.3 — Осмотреться');

// ---------- сцены ----------
const pointStyle = {
  fill: 'transparent', textColor: '#cfe8e5', fontSize: 26, radius: 8,
  borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, textAlign: 'left', fontWeight: '300',
};
const quietStyle = { ...pointStyle, textColor: '#8fa2af', fontSize: 24, borderColor: 'rgba(255,255,255,0.08)' };
const exitStyle = {
  fill: 'transparent', textColor: '#8fa2af', fontSize: 22, radius: 0,
  borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1, textAlign: 'center', letterSpacing: 2, fontWeight: '300',
};
const el = (props) => ({ id: uid('el'), visible: true, style: {}, ...props });
const atkBase = p.hero?.baseStats?.atk ?? 10;
const agiBase = p.hero?.baseStats?.agi ?? 5;

// «За воротами» — хаб пустоши (руины и овраг добавятся шагами 3–4)
const sOutside = {
  id: uid('scene'), name: 'За воротами', kind: 'location',
  background: 'linear-gradient(180deg, #131418 0%, #24221d 55%, #141416 100%)',
  guides: [], hudMode: 'off',
  elements: [
    el({ name: 'Кикер', type: 'text', x: 40, y: 120, w: 900, h: 50, text: 'ПУСТОШЬ · ЗА СЕВЕРНЫМИ ВОРОТАМИ', style: { textColor: '#5f7a8a', fontSize: 20, fontWeight: '300', letterSpacing: 3 } }),
    el({ name: 'Нарратив', type: 'text', x: 310, y: 220, w: 1300, h: 220,
      text: 'Пустошь начинается сразу за створом: на севере — ряды ржавых остовов до горизонта, на западе — ломаная линия руин.\n\nВдоль дорог — столбы с белыми метками. Подкрашены недавно: Тэмурова работа.',
      style: { textColor: '#aebfca', fontSize: 29, fontWeight: '300', lineHeight: 1.6 } }),
    el({ name: 'На кладбище', type: 'button', x: 360, y: 540, w: 760, h: 64,
      text: '➜ Кладбище техники — на север', style: { ...pointStyle },
      action: { type: 'gotoScene', sceneId: '' } }),
    el({ name: 'Руины (позже)', type: 'text', x: 360, y: 630, w: 760, h: 50,
      text: '· Руины у периметра — на запад (дальше белых меток пока не ходи)',
      style: { textColor: '#5f7a8a', fontSize: 24, fontWeight: '300' } }),
    el({ name: 'В лагерь', type: 'button', x: 40, y: 950, w: 340, h: 60,
      text: '‹ ВЕРНУТЬСЯ В ЛАГЕРЬ', style: { ...exitStyle },
      action: { type: 'gotoScene', sceneId: sMap.id } }),
  ],
};
p.scenes.push(sOutside);

// «Кладбище техники» — сцена 1.3
const sScrap = {
  id: uid('scene'), name: 'Кладбище техники (гл.1 — 1.3)', kind: 'location',
  background: 'linear-gradient(180deg, #16171a 0%, #2a2620 55%, #171716 100%)',
  guides: [], hudMode: 'off',
  elements: [
    el({ name: 'Кикер', type: 'text', x: 40, y: 120, w: 900, h: 50, text: 'ПУСТОШЬ · КЛАДБИЩЕ ТЕХНИКИ', style: { textColor: '#5f7a8a', fontSize: 20, fontWeight: '300', letterSpacing: 3 } }),
    el({ name: 'Нарратив', type: 'text', x: 310, y: 200, w: 1300, h: 200,
      text: 'Кай не соврал: катушки здесь были. Лет двести назад. С тех пор кладбище пережило три поколения сборщиков, и всё, что лежало сверху, давно унесли.\n\nЗначит, смотреть надо там, куда лень было лезть.',
      style: { textColor: '#aebfca', fontSize: 29, fontWeight: '300', lineHeight: 1.6 } }),
    // точки обыска
    el({ name: 'Генераторный блок', type: 'button', x: 360, y: 440, w: 760, h: 58,
      text: '· Полуразобранный генераторный блок в дальнем ряду', style: { ...pointStyle },
      action: { type: 'startDialogue', dialogueId: dGen.id },
      visibleIf: [eq('ch1_coil_found', false)] }),
    el({ name: 'Куча корпусов', type: 'button', x: 360, y: 512, w: 760, h: 58,
      text: '· Куча корпусов', style: { ...pointStyle },
      action: { type: 'startDialogue', dialogueId: p.dialogues.find((d) => d.name === 'Гл.1 · 1.3 — Куча корпусов').id },
      visibleIf: [eq('ch1_p_corpses', false)] }),
    el({ name: 'Контейнер', type: 'button', x: 360, y: 584, w: 760, h: 58,
      text: '· Опрокинутый контейнер', style: { ...pointStyle },
      action: { type: 'startDialogue', dialogueId: p.dialogues.find((d) => d.name === 'Гл.1 · 1.3 — Опрокинутый контейнер').id },
      visibleIf: [eq('ch1_p_cont', false)] }),
    el({ name: 'Кабина крана', type: 'button', x: 360, y: 656, w: 760, h: 58,
      text: '[Сила] Отжать заклинившую дверь кабины крана', style: { ...pointStyle },
      action: { type: 'startDialogue', dialogueId: dCrane.id },
      visibleIf: [eq('ch1_p_crane', false), is('atk', 'gte', atkBase)] }),
    el({ name: 'Штабель плит', type: 'button', x: 360, y: 728, w: 760, h: 58,
      text: '[Ловкость] Забраться на штабель плит', style: { ...pointStyle },
      action: { type: 'startDialogue', dialogueId: dStack.id },
      visibleIf: [eq('ch1_p_stack', false), is('agi', 'gte', agiBase)] }),
    el({ name: 'Люк', type: 'button', x: 360, y: 800, w: 760, h: 58,
      text: '◊ Просевшая плита — под ней люк', style: { ...pointStyle, textColor: '#4fd1c5' },
      action: { type: 'startDialogue', dialogueId: dHatch.id },
      visibleIf: [is('ch1_scrap_look', 'gte', 3), eq('ch1_p_hatch', false)] }),
    // осмотреться + выход
    el({ name: 'Осмотреться', type: 'button', x: 1180, y: 440, w: 380, h: 58,
      text: '· Осмотреться', style: { ...quietStyle },
      action: { type: 'startDialogue', dialogueId: dLook.id } }),
    el({ name: 'К воротам', type: 'button', x: 40, y: 950, w: 340, h: 60,
      text: '‹ К ВОРОТАМ', style: { ...exitStyle },
      action: { type: 'gotoScene', sceneId: sOutside.id } }),
  ],
};
p.scenes.push(sScrap);
sOutside.elements.find((e) => e.name === 'На кладбище').action.sceneId = sScrap.id;
log.push('+ сцены «За воротами» (хаб пустоши) и «Кладбище техники» (6 точек + осмотреться)');

// ---------- ворота: открытие в конце 1.2 + узел карты ----------
const setNode12 = d12.nodes.find((n) => n.type === 'set' && (n.effects ?? []).some((e) => e.varId === V('ch1_kai_list')));
if (!setNode12) throw new Error('в диалоге 1.2 не найдена set-нода');
if (!setNode12.effects.some((e) => e.varId === V('gates_open'))) {
  setNode12.effects.push(set('gates_open'));
  log.push('диалог 1.2: в финале открываются ворота (gates_open=true)');
}
const gatesNode = sMap.campMap.nodes.find((n) => n.title === 'Ворота');
if (gatesNode) {
  gatesNode.sceneId = sOutside.id;
  gatesNode.marks = [
    { id: uid('mm'), text: '◊ путь на север открыт', conditions: [eq('gates_open', true), eq('ch1_coil_found', false)] },
    ...(gatesNode.marks ?? []),
  ];
  log.push('узел «Ворота»: ведёт в «За воротами», пометка «путь на север открыт»');
}

fs.writeFileSync(OUT, JSON.stringify(p, null, 2));
console.log('Готово:', OUT);
for (const l of log) console.log(' •', l);
