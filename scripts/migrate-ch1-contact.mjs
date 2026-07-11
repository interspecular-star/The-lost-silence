// ============================================================
// Правка финала акта 1 (запрос владельца): первый контакт Архона
// идёт через ЗАКОННУЮ полосу шёпота над HUD, а не через диалоговое
// окно. HUD включается сразу в момент получения Осколка.
//
// Диалог 1.7 разрезается: d17a — сборка (кончается включением:
// oskolok=1 → HUD проявляется), контакт — цепочка шёпотов
// (чипы → ответные шёпоты, молчание — тоже ответ), d17b — «Ну?
// Говорит?» (финал акта, отдельная точка Лии).
//
// Читает local-save/project.json → пишет local-save/project-ch1-contact.tls.json.
// Запуск: node scripts/migrate-ch1-contact.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'local-save', 'project.json');
const OUT = path.join(ROOT, 'local-save', 'project-ch1-contact.tls.json');

const p = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
const log = [];
let uidN = 0;
const uid = (prefix) => `${prefix}_c1f${Date.now().toString(36)}${(uidN++).toString(36)}`;

const sceneByName = (name) => p.scenes.find((s) => s.name === name);
const varByName = (name) => p.variables.find((v) => v.name === name);
const itemByName = (name) => (p.items ?? []).find((i) => i.name === name);
const npcByName = (name) => (p.npcs ?? []).find((n) => n.name === name);

const sWorkshop = sceneByName('Мастерская Лии');
const dOld = p.dialogues.find((d) => d.name === 'Гл.1 · 1.7 — Второй голос (сборка Осколка)');
const nLiya = npcByName('Лия Ромеро-Санг');
const nHani = npcByName('Хани Мдале');
const vOsk = varByName('oskolok');
const iOskolok = itemByName('Осколок (прототип)');
const iBox = itemByName('Заказ Лии (ящик)');
const iCoil = itemByName('Резонансная катушка');
const iBus = itemByName('Шина данных старого стандарта');
if (!dOld || !sWorkshop || !vOsk) throw new Error('нет диалога 1.7 — сначала загрузите шаг 5');

const V = (name) => varByName(name).id;
const eq = (name, value = true) => ({ varId: V(name), op: 'eq', value });
const set = (name, value = true) => ({ varId: V(name), op: 'set', value });

const line = (npc, text, extra = {}) => ({ id: uid('nd'), type: 'line', x: 0, y: 0, speakerNpcId: npc?.id ?? null, text, next: null, ...extra });
const doSet = (extra) => ({ id: uid('nd'), type: 'set', x: 0, y: 0, effects: [], next: null, ...extra });
const endN = () => ({ id: uid('nd'), type: 'end', x: 0, y: 0 });
const ask = (...texts) => ({
  id: uid('nd'), type: 'choice', x: 0, y: 0,
  choices: texts.map((t) => ({ id: uid('ch'), text: t, conditions: [], effects: [], next: null })),
});
const seq = (...nodes) => {
  for (let i = 0; i < nodes.length - 1; i++) {
    const n = nodes[i];
    if (n.type === 'line' || n.type === 'set') n.next = nodes[i + 1].id;
    if (n.type === 'choice') n.choices.forEach((c) => { if (!c.next) c.next = nodes[i + 1].id; });
  }
  return nodes;
};
const mkDialogue = (name, nodes) => {
  nodes.forEach((n, i) => { n.x = 80 + (i % 6) * 340; n.y = 80 + Math.floor(i / 6) * 200; });
  const d = { id: uid('dlg'), name, startNodeId: nodes[0].id, nodes };
  p.dialogues.push(d);
  log.push(`+ диалог «${name}»`);
  return d;
};

// ---------- d17a: сборка, кончается включением ----------
const d17a = mkDialogue('Гл.1 · 1.7 — Сборка Осколка', seq(
  line(nLiya, 'Ящик сюда. Опись Кая можешь выбросить… нет, дай сюда, он потом спросит.\n\n(раскладывая детали) Катушка. Шина. Ты в курсе, что за шиной три года никто не решался сходить?'),
  ask('Теперь в курсе.'),
  line(nLiya, 'Хани, лампу ниже. И не сопи в плату.'),
  line(nHani, 'Я не соплю!.. А это правда, что он вас у гнезда… ну…'),
  line(nLiya, 'Хани.'),
  line(nHani, 'Молчу.'),
  line(null, '[i]Дальше она работает молча. Это ново — Лия, которая молчит. Паяльник, щелчки, запах флюса. Браслет собирается на глазах: грубый, кольчатый, с одной-единственной кнопкой сбоку.[/]'),
  line(nLiya, 'Без кристалла память у него — как у рыбки. Основные протоколы, и всё. До второго уровня доживём — поговорим о твоём падальщике ещё раз.\n\nТак. Дай запястье. Левое — правым ты хватаешься за всякое.'),
  line(null, '[i]Браслет холодный. Потом — нет.[/]'),
  line(nLiya, 'Кнопка сбоку — это твоё «нет». Запомнил, где она? Всё, включаю.'),
  doSet({
    takeItems: [{ itemId: iCoil.id, qty: 1 }, { itemId: iBus.id, qty: 1 }, { itemId: iBox.id, qty: 1 }],
    effects: [{ varId: vOsk.id, op: 'set', value: 1 }, set('mesh_on', true)],
    giveItems: [{ itemId: iOskolok.id, qty: 1 }],
  }),
  line(null, '[i]Сначала — ничего. Лия смотрит на браслет. Хани смотрит на Лию.\n\nПотом мир становится немного тише, чем был. Не звук — фон. Как будто кто-то очень большой перестал шуметь, чтобы расслышать тебя.[/]'),
  endN(),
));

// ---------- d17b: «Ну? Говорит?» — финал акта ----------
const d17b = mkDialogue('Гл.1 · 1.7 — Ну? Говорит?', seq(
  line(null, '[i]Лия выдыхает. Оказывается, она тоже не дышала.[/]'),
  line(nLiya, 'Ну? Говорит?'),
  ask('Говорит. Вежливый.'),
  line(nLiya, 'Всегда. Триста лет никто не слышал от него грубого слова. Некоторых это успокаивает.\n\n(собирая инструмент) Так каково это? Всю жизнь слышать мир изнутри головы — и вдруг снаружи?'),
  ask(
    'Как будто вернули то, что забрали. Только я не отсюда — у меня никогда не забирали.',
    'Пока не понял. Спрошу у него.',
    'Тихо было лучше.',
  ),
  line(nLiya, '…Ага. Ну, носи. Сломается — неси, не сломается — всё равно заходи.'),
  line(nHani, '(шёпотом) Он теперь как мы?'),
  line(nLiya, 'Нет, Хани. Он теперь как он. Только со связью.'),
  doSet({ effects: [set('ch1_act1_done'), { varId: nLiya.relationVarId, op: 'add', value: 3 }] }),
  endN(),
));

// ---------- старый d17: убрать, точки перевесить ----------
p.dialogues = p.dialogues.filter((d) => d.id !== dOld.id);
const p17 = sWorkshop.elements.find((e) => e.action?.dialogueId === dOld.id);
if (p17) p17.action.dialogueId = d17a.id;
sWorkshop.elements.push({
  id: uid('el'), name: 'Лия (финал акта)', type: 'button', x: 360, y: 704, w: 760, h: 64,
  text: '◊ Лия смотрит на браслет, не дыша', visible: true,
  style: { fill: 'transparent', textColor: '#4fd1c5', fontSize: 26, radius: 8, borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, textAlign: 'left', fontWeight: '300' },
  action: { type: 'startDialogue', dialogueId: d17b.id },
  visibleIf: [{ varId: vOsk.id, op: 'gte', value: 1 }, eq('ch1_act1_done', false)],
});
log.push('диалог 1.7 разрезан: сборка (d17a) + «Ну? Говорит?» (d17b, отдельная точка)');

// ---------- цепочка шёпотов первого контакта ----------
const wc4 = {
  id: uid('w'), name: 'Первый контакт — молчание',
  text: '[type]Вы молчите иначе, чем молчат люди: у них внутри в это время говорю я.\n\nНе буду мешать. Я рядом — на случай, если понадоблюсь. Хорошего вечера. И — с возвращением.[/]',
  trigger: 'manual', holdSec: 14,
};
const wc3 = {
  id: uid('w'), name: 'Первый контакт — выключатель',
  text: '[type]Да. Кнопка на левой стороне корпуса.\n\nВы — первый человек на моей памяти, который может это сделать. Мне будет интересно, как вы распорядитесь.[/]',
  trigger: 'manual', holdSec: 14,
  chips: [{ id: uid('wc'), text: '[Промолчать]', effects: [], replyWhisperId: wc4.id }],
};
const wc2 = {
  id: uid('w'), name: 'Первый контакт — «кто ты»',
  text: '[type]Голос, который вы слышите, здесь называют Mesh. Я помогаю: подсказываю дорогу, слежу за погодой, помню то, что забывается. У каждого человека есть я.\n\nТеперь — и у вас. Если захотите.[/]',
  trigger: 'manual', holdSec: 14,
  chips: [{ id: uid('wc'), text: 'Я могу тебя выключить.', effects: [], replyWhisperId: wc3.id }],
};
const wc1 = {
  id: uid('w'), name: 'Первый контакт — Здравствуйте',
  text: '[type]Здравствуйте.\n\n…Прошу прощения за паузу. Мне потребовалось время: такого со мной не случалось очень давно. Я не встречал вас раньше. А я встречал всех.[/]',
  trigger: 'dialogueEnd', dialogueId: d17a.id,
  delaySec: 2.5, holdSec: 16, priority: 'important',
  chips: [{ id: uid('wc'), text: 'Кто ты?', effects: [], replyWhisperId: wc2.id }],
};
p.whispers = [...(p.whispers ?? []), wc1, wc2, wc3, wc4];
log.push('+ цепочка первого контакта: 4 шёпота (чипы → ответы; молчание — тоже ответ)');

fs.writeFileSync(OUT, JSON.stringify(p, null, 2));
console.log('Готово:', OUT);
for (const l of log) console.log(' •', l);
