// ============================================================
// Глава 1, шаг 5 (финал акта 1): 1.6 «Возврат к Каю» (торговый блок
// на takeItems/sellTake) + 1.7 «Второй голос» (сборка Осколка,
// ПЕРВЫЙ КОНТАКТ с Архоном) + первые шёпоты (H3d) + hudMode 'oskolok'.
//
// ЦЕПОЧКА: читает local-save/project-ch1-step4.tls.json (выход шага 4),
// пишет local-save/project-ch1-step5.tls.json — владелец загружает ТОЛЬКО его.
// Запуск: node scripts/migrate-ch1-step5.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'local-save', 'project-ch1-step4.tls.json');
const OUT = path.join(ROOT, 'local-save', 'project-ch1-step5.tls.json');

const p = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
const log = [];
let uidN = 0;
const uid = (prefix) => `${prefix}_c1e${Date.now().toString(36)}${(uidN++).toString(36)}`;

const sceneByName = (name) => p.scenes.find((s) => s.name === name);
const varByName = (name) => p.variables.find((v) => v.name === name);
const itemByName = (name) => (p.items ?? []).find((i) => i.name === name);
const npcByName = (name) => (p.npcs ?? []).find((n) => n.name === name);

const sDepot = sceneByName('Склад Кая');
const sWorkshop = sceneByName('Мастерская Лии');
const sOutside = sceneByName('За воротами');
const sMap = sceneByName('Аванпост Flux Nomads');
const nKai = npcByName('Кай Муромото');
const nLiya = npcByName('Лия Ромеро-Санг');
const nHani = npcByName('Хани Мдале');
const nTemur = npcByName('Тэмур Эласко');
const iOskolok = itemByName('Осколок (прототип)');
if (!sDepot || !sWorkshop || !varByName('ch1_nest_tried') || !iOskolok) throw new Error('сначала выполните шаг 4 (migrate-ch1-step4)');

// ---------- переменные ----------
const vars = [
  ['ch1_temur_gate', 'Гл.1: Тэмур у ворот — честно про ключи', 'boolean', false],
  ['mesh_on', 'Mesh (Осколок) включён', 'boolean', true],
  ['mesh_ignored', 'Шёпотов проигнорировано', 'number', 0],
  ['mesh_answered', 'Ответов голосу', 'number', 0],
];
for (const [name, title, type, initial] of vars) {
  if (!varByName(name)) p.variables.push({ id: uid('var'), name, title, type, initial, category: 'general' });
}
const vOsk = varByName('oskolok');
if (vOsk) vOsk.description = '0 — нет устройства; 1 — отношения+Mesh; 2 — панель фракций; 3 — подсказки ▲▼; 4 — боевой скан; 5–10 — дальняя лестница (oskolok-mesh.md)';
log.push('+ переменные Mesh и Тэмура у ворот; описание oskolok → лестница 0–10');
const V = (name) => varByName(name).id;
const is = (name, op, value) => ({ varId: V(name), op, value });
const eq = (name, value = true) => is(name, 'eq', value);
const set = (name, value = true) => ({ varId: V(name), op: 'set', value });

// ---------- предмет: заказ Лии ----------
if (!itemByName('Заказ Лии (ящик)')) {
  p.items.push({
    id: uid('item'), name: 'Заказ Лии (ящик)', type: 'resource', rarity: 'decent',
    price: 0, questItem: true, stack: 1,
    description: 'Провода, крепёж, изоляция — всё по описи, опись сверху. Кай расписался сам.',
  });
  log.push('+ предмет «Заказ Лии (ящик)»');
}
const iBox = itemByName('Заказ Лии (ящик)');
const iCoil = itemByName('Резонансная катушка');
const iBus = itemByName('Шина данных старого стандарта');

// ---------- материал «Архон / Mesh» ----------
let matMesh = (p.materials ?? []).find((m) => m.name === 'Архон / Mesh');
if (!matMesh) {
  matMesh = {
    id: uid('mat'), name: 'Архон / Mesh',
    box: { surface: 'spatial', border: 'spectrum', glass: 10, radius: 16, tempo: 'slow', accent: '#4fd1c5' },
  };
  p.materials = [...(p.materials ?? []), matMesh];
  log.push('+ материал «Архон / Mesh» (spatial + спектр, медленный)');
}

// ---------- утилиты диалогов ----------
const line = (npc, text, extra = {}) => ({ id: uid('nd'), type: 'line', x: 0, y: 0, speakerNpcId: npc?.id ?? null, text, next: null, ...extra });
const meshLine = (text) => ({ id: uid('nd'), type: 'line', x: 0, y: 0, speakerNpcId: null, speaker: 'Mesh', materialId: matMesh.id, text: `[type.once]${text}[/]`, next: null });
const doSet = (extra) => ({ id: uid('nd'), type: 'set', x: 0, y: 0, effects: [], next: null, ...extra });
const branchN = (conditions) => ({ id: uid('nd'), type: 'branch', x: 0, y: 0, conditions, nextTrue: null, nextFalse: null });
const endN = () => ({ id: uid('nd'), type: 'end', x: 0, y: 0 });
const ask = (...texts) => ({
  id: uid('nd'), type: 'choice', x: 0, y: 0,
  choices: texts.map((t) => ({ id: uid('ch'), text: t, conditions: [], effects: [], next: null })),
});
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

// ---------- Тэмур у ворот (вставка по дороге) ----------
const dTemurGate = (() => {
  const n1 = line(nTemur, 'По походке вижу — был у оврага.');
  const q = ask('Ключи видел. Забрать не смог.');
  const n2 = line(nTemur, 'Живой — уже хорошо. Ключи никуда не денутся, он их не ест.\n\nЗначит, и ты теперь знаешь, какой он. Ну — не последний раз сходил.');
  const fin = doSet({ effects: [set('ch1_temur_gate'), { varId: nTemur.relationVarId, op: 'add', value: 1 }] });
  const e = endN();
  return mkDialogue('Гл.1 · 1.6 — Тэмур у ворот', seq(n1, q, n2, fin, e));
})();

// ---------- d16: возврат к Каю ----------
const d16 = (() => {
  const n1 = line(nKai, '…Сорок два. О. Живой.\n\nСлухи дошли раньше тебя: падальщик, овраг, героический отход ползком. Подробности врут?');
  const q1 = ask('Почти нет. Кристалла не будет.');
  const n2 = line(nKai, 'Кристалла не будет. (делает пометку) Два из трёх, значит.\n\nСкажу тебе штуку. За катушкой не ходили три года. За шиной — потому что жёлтая линия. Ты принёс обе за один день.\n\nА к падальщику вообще никто не ходит. Про это есть правило: к падальщику не ходят. Тебе его никто не сказал, потому что нормальному человеку оно не нужно.');
  const q2 = ask('Мог бы предупредить.');
  const n3 = line(nKai, 'Мог. Но ты бы всё равно пошёл — по глазам было видно. Зато теперь у правила есть живая иллюстрация. Ходячая. Это ценно.');
  const rem = line(null, '[i]Он выставляет на стойку ящик — собранный заказ: провода, крепёж, изоляция, всё по описи, опись сверху.[/]');
  const n4 = line(nKai, 'Заказ Лии. Распишись… а, тебе же нечем. Ладно, я распишусь, ты кивни.');
  const q3 = ask('[Кивнуть]');
  const n5 = line(nKai, 'И вот ещё. Хлам, что ты натаскал с кладбища, — могу принять. По весу, без обид.');
  // торговый блок: сдать всё / оставить
  const sell = doSet({
    takeItems: [
      { itemId: itemByName('Обгоревшая обмотка').id, qty: 0 },
      { itemId: itemByName('Гнутый крепёж').id, qty: 0 },
      { itemId: itemByName('Пласт изоляции').id, qty: 0 },
    ],
    sellTake: true,
  });
  const sold = line(nKai, '(пересчитывает не глядя — пальцы сами) …Записал. Цифра сходится.');
  const kept = line(nKai, 'Дело твоё. Предложение не сгорает.');
  const fork = {
    id: uid('nd'), type: 'choice', x: 0, y: 0,
    choices: [
      { id: uid('ch'), text: '[Сдать находки — по весу]', conditions: [], effects: [], next: sell.id },
      { id: uid('ch'), text: 'Оставлю себе.', conditions: [], effects: [], next: kept.id },
    ],
  };
  const n6 = line(nKai, 'Всё. Мешок, кстати, верни.');
  const q4 = ask('[Вернуть мешок]');
  const n7 = line(nKai, 'Смотри-ка. Вернул. (пауза, пометка в листе) Перевожу тебя из «расходов» в «оборотные средства». Поздравляю, это лучшая графа для человека без документов.');
  const fin = doSet({
    effects: [set('ch1_kai_order'), { varId: nKai.relationVarId, op: 'add', value: 3 }],
    giveItems: [{ itemId: iBox.id, qty: 1 }],
  });
  const e = endN();
  seq(n1, q1, n2, q2, n3, rem, n4, q3, n5, fork);
  sell.next = sold.id; sold.next = n6.id; kept.next = n6.id;
  seq(n6, q4, n7, fin, e);
  return mkDialogue('Гл.1 · 1.6 — Склад: заказ собран', [n1, q1, n2, q2, n3, rem, n4, q3, n5, fork, sell, sold, kept, n6, q4, n7, fin, e]);
})();

// ---------- d17: сборка Осколка, первый контакт ----------
const d17 = (() => {
  const n1 = line(nLiya, 'Ящик сюда. Опись Кая можешь выбросить… нет, дай сюда, он потом спросит.\n\n(раскладывая детали) Катушка. Шина. Ты в курсе, что за шиной три года никто не решался сходить?');
  const q1 = ask('Теперь в курсе.');
  const n2 = line(nLiya, 'Хани, лампу ниже. И не сопи в плату.');
  const n3 = line(nHani, 'Я не соплю!.. А это правда, что он вас у гнезда… ну…');
  const n4 = line(nLiya, 'Хани.');
  const n5 = line(nHani, 'Молчу.');
  const rem1 = line(null, '[i]Дальше она работает молча. Это ново — Лия, которая молчит. Паяльник, щелчки, запах флюса. Браслет собирается на глазах: грубый, кольчатый, с одной-единственной кнопкой сбоку.[/]');
  const n7 = line(nLiya, 'Без кристалла память у него — как у рыбки. Основные протоколы, и всё. До второго уровня доживём — поговорим о твоём падальщике ещё раз.\n\nТак. Дай запястье. Левое — правым ты хватаешься за всякое.');
  const rem2 = line(null, '[i]Браслет холодный. Потом — нет.[/]');
  const n9 = line(nLiya, 'Кнопка сбоку — это твоё «нет». Запомнил, где она? Всё, включаю.');
  const takeParts = doSet({ takeItems: [{ itemId: iCoil.id, qty: 1 }, { itemId: iBus.id, qty: 1 }, { itemId: iBox.id, qty: 1 }] });
  const rem3 = line(null, '[i]Сначала — ничего. Лия смотрит на браслет. Хани смотрит на Лию.\n\nПотом мир становится немного тише, чем был. Не звук — фон. Как будто кто-то очень большой перестал шуметь, чтобы расслышать тебя.[/]');
  const m1 = meshLine('Здравствуйте.');
  const m2 = meshLine('…Прошу прощения за паузу. Мне потребовалось время. Такого со мной не случалось очень давно.');
  const m3 = meshLine('Я не встречал вас раньше. А я встречал всех.');
  const q2 = ask('Кто ты?');
  const m4 = meshLine('Голос, который вы слышите, здесь называют Mesh. Я помогаю. Подсказываю дорогу, слежу за погодой, помню то, что забывается. У каждого человека есть я.\n\nТеперь — и у вас. Если захотите.');
  const q3 = ask('Я могу тебя выключить.');
  const m5 = meshLine('Да. Кнопка на левой стороне корпуса.\n\nВы — первый человек на моей памяти, который может это сделать. Мне будет интересно, как вы распорядитесь.');
  const q4 = ask('[Промолчать]');
  const m6 = meshLine('Вы молчите иначе, чем молчат люди. У них внутри в это время говорю я.\n\nНе буду мешать. Я рядом — на случай, если понадоблюсь. Хорошего вечера. И — с возвращением.');
  const giveOsk = doSet({
    effects: [{ varId: vOsk.id, op: 'set', value: 1 }, { varId: V('mesh_on'), op: 'set', value: true }],
    giveItems: [{ itemId: iOskolok.id, qty: 1 }],
  });
  const rem4 = line(null, '[i]Лия выдыхает. Оказывается, она тоже не дышала.[/]');
  const n12 = line(nLiya, 'Ну? Говорит?');
  const q5 = ask('Говорит. Вежливый.');
  const n13 = line(nLiya, 'Всегда. Триста лет никто не слышал от него грубого слова. Некоторых это успокаивает.\n\n(собирая инструмент) Так каково это? Всю жизнь слышать мир изнутри головы — и вдруг снаружи?');
  const q6 = ask(
    'Как будто вернули то, что забрали. Только я не отсюда — у меня никогда не забирали.',
    'Пока не понял. Спрошу у него.',
    'Тихо было лучше.',
  );
  const n14 = line(nLiya, '…Ага. Ну, носи. Сломается — неси, не сломается — всё равно заходи.');
  const n15 = line(nHani, '(шёпотом) Он теперь как мы?');
  const n16 = line(nLiya, 'Нет, Хани. Он теперь как он. Только со связью.');
  const fin = doSet({ effects: [set('ch1_act1_done'), { varId: nLiya.relationVarId, op: 'add', value: 3 }] });
  const e = endN();
  const nodes = seq(n1, q1, n2, n3, n4, n5, rem1, n7, rem2, n9, takeParts, rem3,
    m1, m2, m3, q2, m4, q3, m5, q4, m6, giveOsk, rem4, n12, q5, n13, q6, n14, n15, n16, fin, e);
  return mkDialogue('Гл.1 · 1.7 — Второй голос (сборка Осколка)', nodes);
})();

// ---------- точки на сценах ----------
const pointStyle = {
  fill: 'transparent', textColor: '#cfe8e5', fontSize: 26, radius: 8,
  borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, textAlign: 'left', fontWeight: '300',
};
const el = (props) => ({ id: uid('el'), visible: true, style: {}, ...props });

// склад: сдача заказа; напоминалка Кая — только до похода к гнезду
sDepot.elements.push(el({
  name: 'Кай (1.6)', type: 'button', x: 360, y: 592, w: 760, h: 64,
  text: '◊ Кай — заказ собран', style: { ...pointStyle, textColor: '#4fd1c5' },
  action: { type: 'startDialogue', dialogueId: d16.id },
  visibleIf: [eq('ch1_nest_tried'), eq('ch1_coil_found'), eq('ch1_bus_found'), eq('ch1_kai_order', false)],
}));
const kaiRemind = sDepot.elements.find((e) => e.name === 'Кай (напоминание)');
if (kaiRemind) kaiRemind.visibleIf = [...(kaiRemind.visibleIf ?? []), eq('ch1_nest_tried', false)];

// мастерская: сборка; напоминалка Лии — до получения заказа
sWorkshop.elements.push(el({
  name: 'Лия (1.7)', type: 'button', x: 360, y: 632, w: 760, h: 64,
  text: '◊ Лия ждёт — ящик у тебя', style: { ...pointStyle, textColor: '#4fd1c5' },
  action: { type: 'startDialogue', dialogueId: d17.id },
  visibleIf: [eq('ch1_kai_order'), eq('ch1_act1_done', false)],
}));
const liyaRemind = sWorkshop.elements.find((e) => e.name === 'Лия (напоминание)');
if (liyaRemind) liyaRemind.visibleIf = [...(liyaRemind.visibleIf ?? []), eq('ch1_kai_order', false)];

// «За воротами»: вставка Тэмура по дороге назад
sOutside.elements.splice(sOutside.elements.findIndex((e) => e.name === 'В лагерь'), 0,
  el({ name: 'Тэмур у створа', type: 'button', x: 360, y: 810, w: 760, h: 58,
    text: '◊ Тэмур у створа, смотрит на твою походку', style: { ...pointStyle },
    action: { type: 'startDialogue', dialogueId: dTemurGate.id },
    visibleIf: [eq('ch1_nest_tried'), eq('ch1_temur_gate', false)] }));
log.push('точки: склад (1.6), мастерская (1.7), Тэмур у створа');

// ---------- пометки карты ----------
const node = (title) => sMap.campMap.nodes.find((n) => n.title === title);
const depNode = node('Склад Кая');
if (depNode) depNode.marks = [
  { id: uid('mm'), text: '◊ заказ собран — забрать', conditions: [eq('ch1_nest_tried'), eq('ch1_kai_order', false)] },
  ...(depNode.marks ?? []),
];
const wsNode = node('Мастерская');
if (wsNode) wsNode.marks = [
  { id: uid('mm'), text: '◊ к Лии — собирать Осколок', conditions: [eq('ch1_kai_order'), eq('ch1_act1_done', false)] },
  ...(wsNode.marks ?? []),
];
log.push('карта: пометки «заказ собран» и «собирать Осколок»');

// ---------- hudMode: 'off' → 'oskolok' ТОЛЬКО на сценах лагеря/пустоши ----------
// (интро-сцены владельца — Пробуждения/Флэшбэки/Лаборатория — не трогаем: там его выбор)
const OUR_SCENES = [
  'Аванпост Flux Nomads', 'Ангар Flux Nomads', 'Двор лагеря', 'Мастерская Лии',
  'Склад Кая', 'Узел связи', 'Медпункт', 'Двор. Две недели (гл.1 — 1.0)',
  'За воротами', 'Кладбище техники (гл.1 — 1.3)', 'Руины у периметра (гл.1 — 1.4)',
  'Руины — очнулся (гл.1 — 1.4a)', 'Руины — отдышись (гл.1 — 1.4b)',
  'Руины — за жёлтой линией (гл.1)', 'Гнездо падальщика (гл.1 — 1.5)',
  'Край оврага — очнулся (гл.1 — 1.5a)',
];
let hudCount = 0;
for (const s of p.scenes) {
  if (OUR_SCENES.includes(s.name) && s.hudMode === 'off') { s.hudMode = 'oskolok'; hudCount++; }
}
log.push(`hudMode 'off' → 'oskolok' на ${hudCount} сценах лагеря/пустоши (интро владельца не тронуто)`);

// ---------- первые шёпоты Архона (H3d) ----------
if (!(p.whispers ?? []).some((w) => w.name === 'После Осколка — благодарность')) {
  p.whispers = [...(p.whispers ?? []),
    {
      id: uid('w'), name: 'После Осколка — благодарность',
      text: '[type]Вы выбрали не отключать меня. Спасибо.\n\nЯ постараюсь быть полезным. И — не быть лишним.[/]',
      trigger: 'enterScene', sceneId: sMap.id,
      conditions: [eq('ch1_act1_done')],
      delaySec: 2, priority: 'important',
      chips: [
        { id: uid('wc'), text: 'Посмотрим.', effects: [] },
        { id: uid('wc'), text: 'Не привыкай ко мне.', effects: [] },
      ],
    },
    {
      id: uid('w'), name: 'Подсказка про кнопку',
      text: '[type]Если захотите тишины — кнопка на левой стороне корпуса. Я не обижусь.\n\nЯ вообще не умею обижаться. Кажется.[/]',
      trigger: 'idle', repeatable: false,
      conditions: [{ varId: vOsk.id, op: 'gte', value: 1 }, eq('mesh_on', true), eq('ch1_act1_done')],
      delaySec: 1,
    },
    {
      id: uid('w'), name: 'За периметром слышу хуже',
      text: '[type]За периметром я слышу вас хуже. Если замолчу — это не обида. Это расстояние.[/]',
      trigger: 'enterScene', sceneId: sOutside.id,
      conditions: [{ varId: vOsk.id, op: 'gte', value: 1 }, eq('mesh_on', true)],
      delaySec: 3,
    },
  ];
  log.push('+ 3 первых шёпота Архона (H3d)');
}

fs.writeFileSync(OUT, JSON.stringify(p, null, 2));
console.log('Готово:', OUT);
for (const l of log) console.log(' •', l);
