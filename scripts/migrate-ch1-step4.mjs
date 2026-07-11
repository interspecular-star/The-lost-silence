// ============================================================
// Глава 1, шаг 4: сцена 1.5 «Гнездо падальщика» (ch1-act1.md ред.2) —
// непобедимый страж, скриптовое поражение, сцена 1.5a «очнулся».
// Кристалл и ключи Тэмура остаются в гнезде (возвращение — акт 2+).
//
// Читает local-save/project.json → пишет local-save/project-ch1-step4.tls.json.
// Запуск: node scripts/migrate-ch1-step4.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'local-save', 'project.json');
const OUT = path.join(ROOT, 'local-save', 'project-ch1-step4.tls.json');

const p = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
const log = [];
let uidN = 0;
const uid = (prefix) => `${prefix}_c1d${Date.now().toString(36)}${(uidN++).toString(36)}`;

const sceneByName = (name) => p.scenes.find((s) => s.name === name);
const varByName = (name) => p.variables.find((v) => v.name === name);

const sOutside = sceneByName('За воротами');
const sMap = sceneByName('Аванпост Flux Nomads');
if (!sOutside || !varByName('ch1_temur_after')) throw new Error('сначала примените шаг 3');

// ---------- переменные ----------
const vars = [
  ['ch1_nest_look', 'Гл.1: осмотров у гнезда', 'number', 0],
  ['ch1_nest_bait', 'Гл.1: выкладывал сервопривод', 'boolean', false],
  ['ch1_servo_returned', 'Гл.1: сервопривод подобран обратно', 'boolean', false],
  ['ch1_scavenger_beaten_by', 'Гл.1: бит падальщиком', 'boolean', false],
];
for (const [name, title, type, initial] of vars) {
  if (!varByName(name)) p.variables.push({ id: uid('var'), name, title, type, initial, category: 'general' });
}
log.push(`+ переменные шага 4 (${vars.length})`);
const V = (name) => varByName(name).id;
const is = (name, op, value) => ({ varId: V(name), op, value });
const eq = (name, value = true) => is(name, 'eq', value);
const set = (name, value = true) => ({ varId: V(name), op: 'set', value });

// ---------- моб «Падальщик» — непобедимый страж ----------
let mob = (p.mobs ?? []).find((m) => m.name === 'Падальщик');
if (!mob) {
  mob = {
    id: uid('mob'), name: 'Падальщик',
    description: 'Старый дрон-собиратель. Тридцать лет тащит всё, что блестит. Непобедимый страж гнезда: сюда возвращаются другим человеком — сильнее и с планом.',
    hp: 9999, atk: 999, def: 500, telegraphMs: 150, critChance: 0,
    attacks: [{ id: uid('atk'), name: 'Бросок', atkMult: 1, telegraphMs: 150, weight: 1 }],
    expReward: 0, creditsReward: 0, drops: [],
  };
  p.mobs = [...(p.mobs ?? []), mob];
  log.push('+ моб «Падальщик» (hp 9999, урон 999, замах 150 мс — стена)');
}

// ---------- диалоги ----------
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

// сцена 1.5a — создаём раньше, чтобы jump знал id
const s15aId = uid('scene');

// поражение: ретроспектива (что произошло) → перенос на 1.5a
let dLose;
{
  const b = branch([eq('ch1_nest_bait')]);
  const aTxt = line('[i]Дрон спускался не сразу. Подошёл. Вертел сервопривод манипуляторами, подносил к линзе. Внутри что-то щёлкало — раз, другой.\n\nТретий щелчок был глубже и злее. Линза поднялась на тебя.\n\nДальше ты помнишь только рывок.[/]');
  const bTxt = line('[i]Он упал с купола без разгона, молча. Никакой сирены, никакого предупреждения.\n\nДальше ты помнишь только рывок.[/]');
  const fin = doSet([set('ch1_scavenger_beaten_by')]);
  const jump = { id: uid('nd'), type: 'jump', x: 0, y: 0, gotoSceneId: s15aId, next: null };
  const e = endN();
  b.nextTrue = aTxt.id; b.nextFalse = bTxt.id;
  aTxt.next = fin.id; bTxt.next = fin.id; fin.next = jump.id; jump.next = e.id;
  dLose = mkDialogue('Гл.1 · 1.5 — Поражение', [b, aTxt, bTxt, fin, jump, e]);
}

// осмотреться у гнезда
let dLookN;
{
  const n1 = doSet([{ varId: V('ch1_nest_look'), op: 'add', value: 1 }]);
  const b1 = branch([is('ch1_nest_look', 'lte', 1)]);
  const l1 = line('[i]«Гнездо как гнездо. Если бы сороку скрестили с экскаватором.»[/]');
  const b2 = branch([is('ch1_nest_look', 'lte', 2)]);
  const l2 = line('[i]«Кристаллы у него в глубине, под каркасом. Просто так не выдернешь.»[/]');
  const l3 = line('[i]«Он меня видит. Давно видит. И что-то в этом взгляде неправильное.»[/]');
  const e1 = endN(), e2 = endN(), e3 = endN();
  n1.next = b1.id;
  b1.nextTrue = l1.id; l1.next = e1.id;
  b1.nextFalse = b2.id;
  b2.nextTrue = l2.id; l2.next = e2.id;
  b2.nextFalse = l3.id; l3.next = e3.id;
  dLookN = mkDialogue('Гл.1 · 1.5 — Осмотреться', [n1, b1, l1, e1, b2, l2, e2, l3, e3]);
}

// 1.5a: внутренний голос + закрытие этапа 4
let d15a;
{
  const bServo = branch([eq('ch1_nest_bait')]);
  const servoLine = line('[i]Рядом, в пыли — сервопривод. Он его даже не взял.[/]');
  const servoSet = doSet([set('ch1_servo_returned')]);
  const v1 = line('[i]«Запишем. Правило этого века номер один: не верь сошедшей с ума машине.»[/]');
  const v2 = line('[i]«Кристалл там есть. И ключи там есть. Но за ними надо приходить другим человеком. Сильнее. И с планом.»[/]');
  const fin = doSet([set('ch1_nest_tried')]);
  const e = endN();
  bServo.nextTrue = servoLine.id; servoLine.next = servoSet.id; servoSet.next = v1.id;
  bServo.nextFalse = v1.id;
  v1.next = v2.id; v2.next = fin.id; fin.next = e.id;
  d15a = mkDialogue('Гл.1 · 1.5a — Очнулся', [bServo, servoLine, servoSet, v1, v2, fin, e]);
}

// ---------- сцены ----------
const pointStyle = {
  fill: 'transparent', textColor: '#cfe8e5', fontSize: 26, radius: 8,
  borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, textAlign: 'left', fontWeight: '300',
};
const quietStyle = { ...pointStyle, textColor: '#8fa2af', fontSize: 24, borderColor: 'rgba(255,255,255,0.08)' };
const dangerStyle = { ...pointStyle, textColor: '#e06c75', borderColor: 'rgba(224,108,117,0.3)' };
const exitStyle = {
  fill: 'transparent', textColor: '#8fa2af', fontSize: 22, radius: 0,
  borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1, textAlign: 'center', letterSpacing: 2, fontWeight: '300',
};
const el = (props) => ({ id: uid('el'), visible: true, style: {}, ...props });
const kicker = (text) => el({ name: 'Кикер', type: 'text', x: 40, y: 120, w: 980, h: 50, text, style: { textColor: '#5f7a8a', fontSize: 20, fontWeight: '300', letterSpacing: 3 } });
const narr = (text, h2 = 220, y = 200) => el({ name: 'Нарратив', type: 'text', x: 310, y, w: 1300, h: h2, text, style: { textColor: '#aebfca', fontSize: 29, fontWeight: '300', lineHeight: 1.6 } });

// гнездо
const sNest = {
  id: uid('scene'), name: 'Гнездо падальщика (гл.1 — 1.5)', kind: 'location',
  background: 'linear-gradient(180deg, #17181a 0%, #2c2a24 55%, #161715 100%)',
  guides: [], hudMode: 'off',
  elements: [
    kicker('ПУСТОШЬ · ОВРАГ ЗА СТАРОЙ ВОДОКАЧКОЙ'),
    narr('Тридцать лет коллекционирования. На дне оврага — купол из проволоки, лопастей и фольги. Он блестит весь, целиком, как ёлка посреди пустыря.\n\nОтсюда видно кристаллы, стопку посуды, чей-то зеркальный визор и — да, три ключа на кольце, с красной изолентой. Тэмуровы.\n\nСам хозяин сидит на куполе сверху. Не шевелится. Только линза объектива ведёт за тобой — медленно, как подсолнух за солнцем.', 320),
    el({ name: 'Сервопривод-обмен', type: 'button', x: 360, y: 600, w: 860, h: 58,
      text: '◊ [Положить сервопривод на открытое место и отойти]', style: { ...pointStyle, textColor: '#4fd1c5' },
      action: { type: 'startCombat', mobId: mob.id, loseDialogueId: dLose.id, effects: [set('ch1_nest_bait')] },
      visibleIf: [eq('ch1_servo_found'), eq('ch1_nest_tried', false)] }),
    el({ name: 'Подойти', type: 'button', x: 360, y: 672, w: 860, h: 58,
      text: '▲ Подойти к гнезду', style: { ...dangerStyle },
      action: { type: 'startCombat', mobId: mob.id, loseDialogueId: dLose.id },
      visibleIf: [eq('ch1_nest_tried', false)] }),
    el({ name: 'Гнездо после', type: 'text', x: 360, y: 620, w: 900, h: 60,
      text: '· Хозяин сидит на прежнем месте, будто ничего не было. За кристаллом и ключами — потом. Другим человеком.',
      style: { textColor: '#5f7a8a', fontSize: 24, fontWeight: '300', lineHeight: 1.4 },
      visibleIf: [eq('ch1_nest_tried')] }),
    el({ name: 'Осмотреться', type: 'button', x: 1180, y: 600, w: 380, h: 58,
      text: '· Осмотреться', style: { ...quietStyle },
      action: { type: 'startDialogue', dialogueId: dLookN.id } }),
    el({ name: 'Назад', type: 'button', x: 40, y: 950, w: 340, h: 60,
      text: '‹ К ВОРОТАМ', style: { ...exitStyle },
      action: { type: 'gotoScene', sceneId: sOutside.id } }),
  ],
};
p.scenes.push(sNest);

// 1.5a — очнулся на краю оврага
const s15a = {
  id: s15aId, name: 'Край оврага — очнулся (гл.1 — 1.5a)', kind: 'location',
  background: 'linear-gradient(180deg, #191614 0%, #262019 55%, #151311 100%)',
  guides: [], hudMode: 'off',
  onEnterDialogueId: d15a.id,
  elements: [
    kicker('ПУСТОШЬ · КРАЙ ОВРАГА'),
    narr('Сначала звон. Потом небо. Потом край оврага — ты лежишь наверху, метрах в тридцати от гнезда, и не помнишь, как здесь оказался. Ползком, судя по локтям.\n\nВнизу блестит купол. Хозяин сидит на прежнем месте, будто ничего не было.', 220),
    el({ name: 'В лагерь', type: 'button', x: 360, y: 760, w: 760, h: 64,
      text: '➜ Доковылять до ворот', style: { ...pointStyle },
      action: { type: 'gotoScene', sceneId: sOutside.id } }),
  ],
};
p.scenes.push(s15a);
log.push('+ сцены «Гнездо падальщика» (бой-стена, 2 пути к ваншоту) и «Край оврага» (1.5a)');

// ---------- «За воротами»: дорога к оврагу ----------
sOutside.elements.splice(sOutside.elements.findIndex((e) => e.name === 'В лагерь'), 0,
  el({ name: 'К оврагу', type: 'button', x: 360, y: 720, w: 760, h: 64,
    text: '➜ Овраг за старой водокачкой — северо-восток', style: { ...pointStyle },
    action: { type: 'gotoScene', sceneId: sNest.id },
    visibleIf: [eq('ch1_temur_after')] }));
log.push('«За воротами»: дорога к оврагу (открывается наводкой Тэмура)');

// ---------- пометка карты ----------
const gatesNode = sMap.campMap.nodes.find((n) => n.title === 'Ворота');
if (gatesNode) {
  gatesNode.marks = [
    { id: uid('mm'), text: '◊ северо-восток: овраг падальщика', conditions: [eq('ch1_temur_after'), eq('ch1_nest_tried', false)] },
    ...(gatesNode.marks ?? []),
  ];
  log.push('узел «Ворота»: пометка про овраг');
}

fs.writeFileSync(OUT, JSON.stringify(p, null, 2));
console.log('Готово:', OUT);
for (const l of log) console.log(' •', l);
