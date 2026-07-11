// ============================================================
// Глава 1, шаг 1: титул главы + сцена 1.0 «Лагерь. Две недели» +
// диалоги 1.1 «Мастерская Лии» и 1.2 «Склад Кая» (тексты — дословно
// docs/dev/chapters/ch1-act1.md) + квест «Второй голос» (6 этапов).
// Диалоги-знакомств Лии/Кая переписаны нейтрально: их прежние биты
// («привидение», ставка склада, «расходы, назначение неясно»)
// зарезервированы каноном сцен 1.1/1.2.
//
// Читает local-save/project.json → пишет local-save/project-ch1-step1.tls.json.
// Запуск: node scripts/migrate-ch1-step1.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'local-save', 'project.json');
const OUT = path.join(ROOT, 'local-save', 'project-ch1-step1.tls.json');

const p = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
const log = [];
let uidN = 0;
const uid = (prefix) => `${prefix}_c1a${Date.now().toString(36)}${(uidN++).toString(36)}`;

const sceneByName = (name) => p.scenes.find((s) => s.name === name);
const dlgByName = (name) => p.dialogues.find((d) => d.name === name);
const npcByName = (name) => (p.npcs ?? []).find((n) => n.name === name);
const varByName = (name) => p.variables.find((v) => v.name === name);

const sYard = sceneByName('Двор лагеря');
const sWorkshop = sceneByName('Мастерская Лии');
const sDepot = sceneByName('Склад Кая');
const sMap = sceneByName('Аванпост Flux Nomads');
const nMatis = npcByName('Матис Йордан');
const nLiya = npcByName('Лия Ромеро-Санг');
const nLori = npcByName('Лори Никадзе');
const nJust = npcByName('Джаст Верден');
const nKai = npcByName('Кай Муромото');
if (!sYard || !sWorkshop || !sDepot || !sMap?.campMap) throw new Error('нет сцен лагеря/карты — сначала загрузите каркас (migrate-camp)');
if (!nMatis || !nLiya || !nLori || !nJust || !nKai) throw new Error('не найдены NPC');

// ---------- переменные главы ----------
const flags = [
  ['ch1_started', 'Гл.1: началась'],
  ['ch1_liya_brief', 'Гл.1: Лия рассказала об Осколке'],
  ['ch1_kai_list', 'Гл.1: договорились с Каем'],
  ['ch1_coil_found', 'Гл.1: катушка найдена'],
  ['ch1_bus_found', 'Гл.1: шина найдена'],
  ['ch1_nest_tried', 'Гл.1: попытка добыть кристалл'],
  ['ch1_kai_order', 'Гл.1: заказ Кая получен'],
  ['ch1_act1_done', 'Гл.1: акт 1 завершён'],
];
for (const [name, title] of flags) {
  if (!varByName(name)) {
    p.variables.push({ id: uid('var'), name, title, type: 'boolean', initial: false, category: 'general' });
  }
}
log.push(`+ флаги главы 1 (${flags.length})`);
const V = (name) => varByName(name).id;
const is = (name, value = true) => ({ varId: V(name), op: 'eq', value });
const set = (name, value = true) => ({ varId: V(name), op: 'set', value });

// ---------- утилиты диалогов ----------
const line = (npc, text) => ({ id: uid('nd'), type: 'line', x: 0, y: 0, speakerNpcId: npc?.id ?? null, text, next: null });
const ask = (text) => ({ id: uid('nd'), type: 'choice', x: 0, y: 0, choices: [{ id: uid('ch'), text, conditions: [], effects: [], next: null }] });
const endN = () => ({ id: uid('nd'), type: 'end', x: 0, y: 0 });
/** Линейная цепочка: соединяет ноды по порядку (choice с одним вариантом = вопрос игрока) */
const chain = (name, nodes) => {
  for (let i = 0; i < nodes.length - 1; i++) {
    const n = nodes[i], next = nodes[i + 1].id;
    if (n.type === 'choice') n.choices.forEach((c) => { if (!c.next) c.next = next; });
    else if (n.type === 'line' || n.type === 'set') n.next = next;
  }
  nodes.forEach((n, i) => { n.x = 80 + (i % 6) * 340; n.y = 80 + Math.floor(i / 6) * 220; });
  const d = { id: uid('dlg'), name, startNodeId: nodes[0].id, nodes };
  p.dialogues.push(d);
  log.push(`+ диалог «${name}» (${nodes.length} нод)`);
  return d;
};

// ---------- диалог 1.0 — двор, Матис ----------
const d10 = chain('Гл.1 · 1.0 — Двор. Две недели (Матис)', [
  line(nMatis, 'Доброе. Выспался?\n\nЯ к Лии — обещал глянуть крепление у неё в мастерской. Она, кстати, тебя со вчера ищет. Пойдём вместе, заодно провожу.'),
  ask('Что-то случилось?'),
  line(nMatis, 'У неё — нет. У неё идея. Это, по опыту, серьёзнее.\n\nНе переживай. Её идеи обычно кончаются тем, что кому-то становится легче жить. Чаще всего — не ей.'),
  ask('Что за идея?'),
  line(nMatis, 'Пусть сама. Она рассказывает лучше, чем я пересказываю. Идём.'),
  { id: uid('nd'), type: 'set', x: 0, y: 0, effects: [set('ch1_started')], next: null },
  endN(),
]);

// ---------- диалог 1.1 — мастерская, «Второй голос» ----------
const d11 = chain('Гл.1 · 1.1 — Мастерская Лии', [
  line(nLiya, 'Матиса слышу. Второго не слышу — значит, второй ты. Заходи, привидение.'),
  ask('Привидение?'),
  line(nLiya, 'Mesh тебя не видит. Идёшь по лагерю — а сигнала нет. На складе уже спорят, скрипишь ты по ночам или просачиваешься сквозь стены.\n\nЯ поставила на «просачиваешься», не подведи.'),
  line(nMatis, 'Крепление гляну.'),
  line(nLiya, 'Оно живое, я проверяла. …Ладно, гляди. Тебе же спокойнее.'),
  line(null, '[i]Матис кивает и отходит к верстаку — как человек, который делает это не в первый и не в сотый раз.[/]'),
  line(nLiya, '(вполголоса, тебе) Он всё равно глянет. Он всегда глядит. Однажды вытащил меня из одного очень плохого места — и с тех пор считает, что я держусь на честном слове и его крепеже.'),
  line(nLiya, 'Так. Теперь ты. Смотри сюда.'),
  line(null, '[i]Она сдёргивает тряпку. Под ней — разъёмы, обрезки шин, корпус от чего-то, что умерло задолго до твоего стазиса.[/]'),
  line(nLiya, 'Mesh тебе не поставить. И не смотри так — я в черепа не лезу, я в них только стучусь.\n\nНо можно собрать внешний контур. Браслет. Он будет слушать мир за тебя и переводить: двери, маркеры, счётчики. Людей.'),
  ask('Людей?'),
  line(nLiya, 'Люди — это в основном то, чего они не говорят. Mesh читает это всю жизнь, мы и не замечаем. А ты ходишь среди нас как среди закрытых ящиков.\n\nБраслет ящики приоткроет. Немного. На большее нужны детали получше — но и это добудем, дай срок.'),
  ask('Из чего собирать будешь?'),
  line(nLiya, 'Из того, чего этот мир стесняется. Старый стандарт, мёртвые протоколы, пара плат старше Джаста.\n\nВыйдет грубо. Неродно. Осколок старого мира на новом запястье…\n\n…О. А это имя. Так и запишем: «Осколок».'),
  line(nLiya, 'И главное. Вот тут — вот такая штука. (щёлкает ногтем по корпусу) Выключатель.\n\nСнял — его нет. Выключил — он молчит. Это рука, а не голова. С нами так нельзя. С тобой — можно.'),
  ask('А голос? У вас у всех есть голос.'),
  line(nLiya, 'Будет и голос. Тот самый, который у всех. Не пугайся, он вежливый. Вежливее всех, кого ты тут встретишь, включая меня.\n\nЧестно? Не знаю, как он с тобой заговорит. С нами он с рождения. А ты для него… новенький.'),
  ask('Мне не нужен голос в голове.'),
  line(nLiya, 'Поэтому и выключатель, привидение. Ты будешь первым человеком за шестьсот лет, у которого есть выбор.\n\n(пауза) Даже завидно.'),
  line(nLiya, 'Теперь плохая часть. Половины деталей у меня нет — и не будет, пока ты не сходишь к Каю. Склад, центральный ряд. Список я ему уже сбросила.\n\nИ вот что: не давай ему себя пересчитать.'),
  ask('Пересчитать?'),
  line(nLiya, 'Кай всё меряет в строках расхода. Тебя он пока записал в убытки. Сходи и стань цифрой, которая сходится.'),
  { id: uid('nd'), type: 'set', x: 0, y: 0, effects: [set('ch1_liya_brief')], next: null },
  endN(),
]);

// ---------- диалог 1.2 — склад Кая ----------
const relKai = nKai.relationVarId;
const n8a = line(nKai, 'Принеси — посмотрим. Переучёт у меня каждую декаду, успеешь.');
const n8b = line(nKai, 'В «Матис». Отдельная графа. Не всем такая положена.');
const n9 = line(nKai, 'Всё, иди, не мешай считать. Мешок под мелочь возьми у выхода. Бесплатно. Но верни.');
const forkKai = {
  id: uid('nd'), type: 'choice', x: 0, y: 0,
  choices: [
    { id: uid('ch'), text: 'Принесу все три — пересмотришь графу?', conditions: [], effects: [{ varId: relKai, op: 'add', value: 2 }], next: n8a.id },
    { id: uid('ch'), text: 'В какую графу ты записал Матиса, когда он меня притащил?', conditions: [], effects: [{ varId: relKai, op: 'add', value: 1 }], next: n8b.id },
  ],
};
const d12nodes = [
  line(nKai, 'Погоди. …Пятнадцать, шестнадцать. Так.\n\nВсё, слушаю. Ты от Лии, за деталями. Список пришёл вчера, я почитал.\n\nИнтересный список. Половина есть на складе. Вторая половина есть в природе. Где-то.'),
  ask('Это как понимать?'),
  line(nKai, 'Так и понимать. Провода, крепёж, изоляцию — соберу к вечеру, это не вопрос.\n\nА три позиции будешь добывать сам. Резонансную катушку старого стандарта я тебе со стеллажа не сниму — у меня склад, а не музей.'),
  ask('Какие три?'),
  line(nKai, 'Катушка — раз. Шина данных, тоже старый стандарт — два. И кристалл памяти, целый, не колотый — три.\n\nКатушку ищи на кладбище техники за северными воротами. Их там было навалом. Лет двести назад. Ну — вдруг повезёт.\n\nШину — в руинах у периметра. Только смотри на столбы: белая метка — ходи спокойно, жёлтая — разворачивайся и уходи. Не потому что я вредный, а потому что жёлтая.'),
  ask('А кристалл?'),
  line(nKai, 'А с кристаллом весело. Целые в одном месте водятся — там, где их никто не берёт.\n\nУ падальщика. Дрон такой, старый, собирает всё блестящее уже лет тридцать. В его гнезде кристалл точно есть, и не один. Вопрос, как он к тебе отнесётся.\n\nГде гнездо — спроси Тэмура. Он ночами у периметра, он видел, куда эта штука летает.'),
  line(null, '[i]Он спускается, ставит галочку в лист. Потом смотрит на ряд и пересчитывает заново. Ловит твой взгляд.[/]'),
  line(nKai, 'Привычка. Дважды посчитать дешевле, чем один раз ошибиться.'),
  ask('Лия сказала, ты записал меня в убытки.'),
  line(nKai, 'В «расходы, назначение неясно». Это другая графа. Получше.\n\nБез обид. Ты ешь, спишь, койку занимаешь — это я вижу каждый день. Что лагерь получает взамен — пока нет. Я считаю. Работа такая.\n\nЛия считает иначе. Лия часто считает иначе и, что самое противное, часто права. Поэтому заказ я собираю.'),
  forkKai,
];
// ветки сходятся на финальной реплике
n8a.next = n9.id;
n8b.next = n9.id;
const setKai = { id: uid('nd'), type: 'set', x: 0, y: 0, effects: [set('ch1_kai_list')], next: null };
const endKai = endN();
n9.next = setKai.id;
setKai.next = endKai.id;
const d12 = chain('Гл.1 · 1.2 — Склад Кая', d12nodes);
// добавляем несшитые chain'ом хвосты веток вручную
for (const n of [n8a, n8b, n9, setKai, endKai]) d12.nodes.push(n);
d12.nodes.forEach((n, i) => { n.x = 80 + (i % 6) * 340; n.y = 80 + Math.floor(i / 6) * 220; });

// ---------- напоминалки ----------
const dLiyaRemind = chain('Гл.1 — Лия (напоминание)', [
  line(nLiya, 'Кай. Склад, центральный ряд. Список у него давно.\n\nПридёшь с деталями — соберу. И помни: не дай ему себя пересчитать.'),
  endN(),
]);
const dKaiRemind = chain('Гл.1 — Кай (напоминание)', [
  line(nKai, 'Катушка — кладбище за северными воротами. Шина — руины у периметра, и смотри на метки: белая — ходи, жёлтая — разворачивайся.\n\nИ мешок потом верни.'),
  endN(),
]);

// ---------- сцены: титул + 1.0 ----------
const sTitle = {
  id: uid('scene'), name: 'Глава 1 · Осколок (титул)', kind: 'page',
  background: '#04070c', guides: [], hudMode: 'off', fadeSec: 1.6,
  elements: [
    {
      id: uid('el'), name: 'Кикер', type: 'text', x: 660, y: 400, w: 600, h: 60,
      text: 'ГЛАВА 1', style: { textColor: '#5f7a8a', fontSize: 26, fontWeight: '300', letterSpacing: 14, textAlign: 'center' },
      fx: { in: 'fade', inDelay: 0.5, inDur: 1.2 },
    },
    {
      id: uid('el'), name: 'Название', type: 'text', x: 360, y: 480, w: 1200, h: 130,
      text: 'ОСКОЛОК', style: { textColor: '#e6edf3', fontSize: 88, fontWeight: '200', letterSpacing: 30, textAlign: 'center' },
      fx: { in: 'blur', inDelay: 1.1, inDur: 1.6 },
    },
  ],
};
p.scenes.push(sTitle);

const s10 = {
  id: uid('scene'), name: 'Двор. Две недели (гл.1 — 1.0)', kind: 'location',
  background: 'linear-gradient(180deg, #101821 0%, #232b31 55%, #131a20 100%)',
  guides: [], hudMode: 'off',
  onEnterDialogueId: d10.id,
  elements: [
    {
      id: uid('el'), name: 'Кикер', type: 'text', x: 40, y: 120, w: 900, h: 50,
      text: 'АВАНПОСТ · ДВОР · РАННЕЕ УТРО', style: { textColor: '#5f7a8a', fontSize: 20, fontWeight: '300', letterSpacing: 3 },
    },
    {
      id: uid('el'), name: 'Нарратив', type: 'text', x: 310, y: 210, w: 1300, h: 430,
      text: 'Две недели. Лагерь привык к тебе быстрее, чем ты к нему.\n\nТы научился вставать до сирены. Отличать гул генератора от гула ветра. Не вздрагивать, когда двери открываются перед другими — и молчат перед тобой.\n\nЭтот мир разговаривает со своими. Постоянно, негромко, обо всём. Ты в нём — тихое место, мимо которого разговор течёт.\n\nШестьсот лет назад это называлось «остаться наедине с собой». Здесь этому нет названия.',
      style: { textColor: '#aebfca', fontSize: 29, fontWeight: '300', lineHeight: 1.6 },
    },
    {
      id: uid('el'), name: 'В мастерскую', type: 'button', x: 360, y: 800, w: 760, h: 64,
      text: '➜ Идти с Матисом в мастерскую',
      style: { fill: 'transparent', textColor: '#cfe8e5', fontSize: 26, radius: 8, borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, textAlign: 'left', fontWeight: '300' },
      action: { type: 'gotoScene', sceneId: sWorkshop.id },
      visibleIf: [is('ch1_started')],
    },
    {
      id: uid('el'), name: 'К схеме', type: 'button', x: 40, y: 950, w: 340, h: 60,
      text: '‹ К СХЕМЕ ЛАГЕРЯ',
      style: { fill: 'transparent', textColor: '#8fa2af', fontSize: 22, radius: 0, borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1, textAlign: 'center', letterSpacing: 2, fontWeight: '300' },
      action: { type: 'gotoScene', sceneId: sMap.id },
      visibleIf: [is('ch1_started')],
    },
  ],
};
p.scenes.push(s10);
sTitle.autoNext = { sceneId: s10.id, delaySec: 5 };
log.push('+ сцены: титул главы (autoNext 5с, фейд 1.6с) и «Двор. Две недели» (1.0)');

// ---------- вход в главу: тихая строка во дворе ----------
sYard.elements.push({
  id: uid('el'), name: 'Вход в главу 1', type: 'button', x: 360, y: 700, w: 760, h: 64,
  text: '· Дни идут своим чередом',
  style: { fill: 'transparent', textColor: '#8fa2af', fontSize: 24, radius: 8, borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, textAlign: 'left', fontWeight: '300' },
  action: { type: 'gotoScene', sceneId: sTitle.id },
  visibleIf: [
    { varId: nLiya.metVarId, op: 'eq', value: true },
    { varId: nLori.metVarId, op: 'eq', value: true },
    { varId: nJust.metVarId, op: 'eq', value: true },
    is('ch1_started', false),
  ],
});
log.push('двор: строка «· Дни идут своим чередом» (видна после 3 знакомств) → титул → 1.0');

// ---------- мастерская: точки главы 1 ----------
const pKnowLiya = sWorkshop.elements.find((e) => e.action?.type === 'startDialogue' && dlgByName('Мастерская — Лия (знакомство)')?.id === e.action.dialogueId);
if (pKnowLiya) pKnowLiya.visibleIf = [...(pKnowLiya.visibleIf ?? []), is('ch1_started', false)];
sWorkshop.elements.push({
  id: uid('el'), name: 'Лия (1.1)', type: 'button', x: 360, y: 560, w: 760, h: 64,
  text: '◊ Лия у верстака — у неё идея',
  style: { fill: 'transparent', textColor: '#cfe8e5', fontSize: 26, radius: 8, borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, textAlign: 'left', fontWeight: '300' },
  action: { type: 'startDialogue', dialogueId: d11.id },
  visibleIf: [is('ch1_started'), is('ch1_liya_brief', false)],
});
sWorkshop.elements.push({
  id: uid('el'), name: 'Лия (напоминание)', type: 'button', x: 360, y: 560, w: 760, h: 64,
  text: '◊ Лия за верстаком',
  style: { fill: 'transparent', textColor: '#cfe8e5', fontSize: 26, radius: 8, borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, textAlign: 'left', fontWeight: '300' },
  action: { type: 'startDialogue', dialogueId: dLiyaRemind.id },
  visibleIf: [is('ch1_liya_brief')],
});
log.push('мастерская: знакомство скрыто в гл.1, добавлены точки 1.1 и напоминание');

// ---------- склад: точки главы 1 ----------
const pKnowKai = sDepot.elements.find((e) => e.action?.type === 'startDialogue' && dlgByName('Склад — Кай (знакомство)')?.id === e.action.dialogueId);
if (pKnowKai) pKnowKai.visibleIf = [...(pKnowKai.visibleIf ?? []), is('ch1_started', false)];
sDepot.elements.push({
  id: uid('el'), name: 'Кай занят', type: 'text', x: 360, y: 520, w: 760, h: 50,
  text: '· Кай занят пересчётом',
  style: { textColor: '#5f7a8a', fontSize: 24, fontWeight: '300' },
  visibleIf: [is('ch1_started'), is('ch1_liya_brief', false)],
});
sDepot.elements.push({
  id: uid('el'), name: 'Кай (1.2)', type: 'button', x: 360, y: 520, w: 760, h: 64,
  text: '◊ Кай на стремянке, считает ящики',
  style: { fill: 'transparent', textColor: '#cfe8e5', fontSize: 26, radius: 8, borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, textAlign: 'left', fontWeight: '300' },
  action: { type: 'startDialogue', dialogueId: d12.id },
  visibleIf: [is('ch1_liya_brief'), is('ch1_kai_list', false)],
});
sDepot.elements.push({
  id: uid('el'), name: 'Кай (напоминание)', type: 'button', x: 360, y: 520, w: 760, h: 64,
  text: '◊ Кай собирает заказ',
  style: { fill: 'transparent', textColor: '#cfe8e5', fontSize: 26, radius: 8, borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, textAlign: 'left', fontWeight: '300' },
  action: { type: 'startDialogue', dialogueId: dKaiRemind.id },
  visibleIf: [is('ch1_kai_list')],
});
log.push('склад: знакомство скрыто в гл.1, добавлены точки 1.2 и напоминание');

// ---------- живые пометки на карте ----------
const mapNode = (title) => sMap.campMap.nodes.find((n) => n.title === title);
const wsNode = mapNode('Мастерская');
if (wsNode) wsNode.marks = [
  { id: uid('mm'), text: '◊ Лия ждёт — Матис проводит', conditions: [is('ch1_started'), is('ch1_liya_brief', false)] },
  ...(wsNode.marks ?? []),
];
const depNode = mapNode('Склад Кая');
if (depNode) depNode.marks = [
  { id: uid('mm'), text: '◊ к Каю, за списком', conditions: [is('ch1_liya_brief'), is('ch1_kai_list', false)] },
  ...(depNode.marks ?? []),
];
log.push('карта: пометки-компасы «Лия ждёт» и «к Каю, за списком»');

// ---------- знакомства Лии/Кая: убрать биты, зарезервированные сценами 1.1/1.2 ----------
const dKnowLiya = dlgByName('Мастерская — Лия (знакомство)');
if (dKnowLiya) {
  const nodes = dKnowLiya.nodes;
  const first = nodes.find((n) => n.id === dKnowLiya.startNodeId);
  first.text = 'О. Новенький Матиса. Постой там секунду — у меня тут всё разложено в порядке, который со стороны выглядит как беспорядок.\n\nЯ Лия. Чиню всё, что ездит, и примерно половину того, что ездить не должно.';
  const choiceNode = nodes.find((n) => n.type === 'choice');
  if (choiceNode?.choices?.[0]) {
    choiceNode.choices[0].text = 'Я не помешаю?';
    const a = nodes.find((n) => n.id === choiceNode.choices[0].next);
    if (a) a.text = 'Помешаешь — узнаешь об этом первым, я не стесняюсь.\n\nОсваивайся. Тут вокруг да около не ходят — экономит всем время.';
  }
  const last = nodes.find((n) => n.type === 'line' && n.text?.startsWith('Ладно, привидение'));
  if (last) last.text = 'Будет дело — заходи. У меня тут всегда что-нибудь звенит.';
  log.push('знакомство Лии переписано («привидение» и ставка склада уехали в канон 1.1)');
}
const dKnowKai = dlgByName('Склад — Кай (знакомство)');
if (dKnowKai) {
  const first = dKnowKai.nodes.find((n) => n.id === dKnowKai.startNodeId);
  first.text = 'Погоди. …Сорок один, сорок два. Так, слушаю.\n\nОн смотрит поверх списка.\n\nА. Новенький. Осматриваешься? Осматривайся. Только коробки не переставляй: у каждой тут своё место, и оно не случайное.';
  log.push('знакомство Кая переписано («расходы, назначение неясно» уехало в канон 1.2)');
}

// ---------- квест «Второй голос» ----------
if (!(p.quests ?? []).some((q) => q.title === 'Второй голос')) {
  p.quests.push({
    id: uid('q'), title: 'Второй голос', kind: 'story',
    description: 'Лия хочет собрать браслет-суррогат Mesh — «Осколок». Нужны детали: часть соберёт Кай, остальное придётся добыть самому.',
    conditions: [],
    steps: [
      { id: uid('qs'), text: 'Поговорить с Лией', conditions: [is('ch1_liya_brief')] },
      { id: uid('qs'), text: 'Договориться с Каем', conditions: [is('ch1_kai_list')] },
      { id: uid('qs'), text: 'Найти катушку и шину', conditions: [is('ch1_coil_found'), is('ch1_bus_found')] },
      { id: uid('qs'), text: 'Попытаться добыть кристалл', conditions: [is('ch1_nest_tried')] },
      { id: uid('qs'), text: 'Забрать заказ у Кая', conditions: [is('ch1_kai_order')] },
      { id: uid('qs'), text: 'Вернуться к Лии', conditions: [is('ch1_act1_done')] },
    ],
    rewardEffects: [{ varId: varByName('exp').id, op: 'add', value: 40 }],
    rewardItems: [],
    enabled: true,
  });
  log.push('+ квест «Второй голос» (6 этапов; в журнале появится вместе с HUD после Осколка)');
}

fs.writeFileSync(OUT, JSON.stringify(p, null, 2));
console.log('Готово:', OUT);
for (const l of log) console.log(' •', l);
