// ============================================================
// Финал пролога: Джаст отправляет ГГ знакомиться с лагерем.
// Последовательность: Знакомство. Джаст (onEnter-диалог, Матис+Джаст)
// → карта (метки тура) → медпункт (Аниша) / мастерская (Лия) /
// склад (Кай) → двор «Матис ждёт» (знакомство с Лори) → новая сцена
// «Жилые помещения» (финал, pro_done). Квест «Освоиться» переписан
// под эту последовательность. Дорожки карты удалены (решение владельца).
// Тексты диалогов — ЧЕРНОВИК, владелец переписывает сам.
//
// Читает local-save/project.json (резервную копию, НЕ трогает её),
// пишет local-save/project-prologue.tls.json — владелец загружает
// его в редакторе («📂 Открыть»).
//
// Запуск: node scripts/migrate-prologue.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'local-save', 'project.json');
const OUT = path.join(ROOT, 'local-save', 'project-prologue.tls.json');

const p = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
const log = [];

let uidN = 0;
const uid = (prefix) => `${prefix}_pro${Date.now().toString(36)}${(uidN++).toString(36)}`;

const sceneByName = (name) => p.scenes.find((s) => s.name === name);
const npcByName = (name) => (p.npcs ?? []).find((n) => n.name === name);
const varByName = (name) => p.variables.find((v) => v.name === name);
const cEq = (varId, value) => ({ varId, op: 'eq', value });

// ---------- опорные точки ----------
const sMap = sceneByName('Аванпост Flux Nomads');
const sJust = sceneByName('Знакомство. Джаст');
const sMed = sceneByName('Медпункт');
const sYard = sceneByName('Двор лагеря');
if (!sMap?.campMap || !sJust || !sMed || !sYard) throw new Error('не найдены опорные сцены (Аванпост-карта/Знакомство. Джаст/Медпункт/Двор)');

const NPC = {};
for (const name of ['Матис Йордан', 'Джаст Верден', 'Аниша Гхал', 'Лори Никадзе']) {
  const n = npcByName(name);
  if (!n) throw new Error(`NPC не найден: ${name}`);
  NPC[name] = n;
}
const vMet = {};
for (const [key, name] of [['just', 'met_dzhast_verden'], ['anisha', 'met_anisha_ghal'],
  ['liya', 'met_liya_romero_sang'], ['kai', 'met_kay_muromoto'], ['lori', 'met_lori_nikadze']]) {
  const v = varByName(name);
  if (!v) throw new Error(`переменная не найдена: ${name}`);
  vMet[key] = v.id;
}

// ---------- флаги пролога ----------
function ensureVar(name, title, description) {
  let v = varByName(name);
  if (!v) {
    v = { id: uid('var'), name, title, type: 'boolean', initial: false, category: 'general', description };
    p.variables.push(v);
    log.push(`+ переменная ${name}`);
  }
  return v.id;
}
const vTour = ensureVar('pro_tour', 'Пролог: Джаст отправил знакомиться',
  'Ставится в диалоге у Джаста. Открывает метки тура на карте лагеря.');
const vDone = ensureVar('pro_done', 'Пролог завершён',
  'Ставится в финале (жилые помещения). Отпирает узел «Жилые помещения» и обычную жизнь лагеря.');

// ---------- сцена «Жилые помещения» ----------
let sQuarters = sceneByName('Жилые помещения');
if (!sQuarters) {
  sQuarters = {
    id: uid('scene'),
    name: 'Жилые помещения',
    kind: 'location',
    background: 'linear-gradient(180deg, #131018 0%, #201b24 60%, #14101a 100%)',
    guides: [],
    hudMode: 'oskolok',
    folderId: sMed.folderId,
    elements: [
      {
        id: uid('el'), visible: true, type: 'text', name: 'Кикер',
        x: 40, y: 120, w: 800, h: 50,
        style: { textColor: '#5f7a8a', fontSize: 20, fontWeight: '300', letterSpacing: 3 },
        text: 'АВАНПОСТ · ЖИЛЫЕ ПОМЕЩЕНИЯ',
      },
      {
        id: uid('el'), visible: true, type: 'text', name: 'Нарратив',
        x: 310, y: 230, w: 1300, h: 240,
        style: { textColor: '#aebfca', fontSize: 30, fontWeight: '300', lineHeight: 1.6 },
        text: 'Ряды коек за брезентовыми перегородками. Чьи-то ботинки, чей-то храп, живое тепло.\n\nЗдесь не тихо — и это, оказывается, хорошо.',
      },
      {
        id: uid('el'), visible: true, type: 'button', name: 'К схеме',
        x: 40, y: 950, w: 340, h: 60,
        style: { fill: 'transparent', textColor: '#8fa2af', fontSize: 22, radius: 0, borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1, textAlign: 'center', letterSpacing: 2, fontWeight: '300' },
        text: '‹ К СХЕМЕ ЛАГЕРЯ',
        action: { type: 'gotoScene', sceneId: sMap.id },
      },
    ],
  };
  // рядом с остальными сценами лагеря
  const medIdx = p.scenes.findIndex((s) => s.id === sMed.id);
  p.scenes.splice(medIdx + 1, 0, sQuarters);
  log.push('+ сцена «Жилые помещения»');
}

// ---------- диалоги (тексты — черновик владельцу на переписывание) ----------
function addDialogue(dlg) {
  const old = p.dialogues.find((d) => d.name === dlg.name);
  if (old) { log.push(`= диалог «${dlg.name}» уже есть — не трогаю`); return old; }
  p.dialogues.push(dlg);
  log.push(`+ диалог «${dlg.name}» (${dlg.nodes.length} нод)`);
  return dlg;
}
const N = (x, y, node) => ({ x, y, ...node });

// 1) Джаст: Матис и Джаст обсудят судьбу ГГ без него — иди знакомься
const dJust = (() => {
  const nGuard = uid('nd'), n1 = uid('nd'), n2 = uid('nd'), nCh = uid('nd'),
    n3 = uid('nd'), n4 = uid('nd'), nSet = uid('nd'), nJump = uid('nd'), nEnd = uid('nd'), nEnd2 = uid('nd');
  return addDialogue({
    id: uid('dlg'),
    name: 'Пролог — Джаст: чужак в лагере',
    startNodeId: nGuard,
    nodes: [
      N(60, 300, { id: nGuard, type: 'branch', conditions: [cEq(vTour, true)], nextTrue: nEnd2, nextFalse: n1 }),
      N(340, 420, { id: nEnd2, type: 'end' }),
      N(340, 160, { id: n1, type: 'line', speakerNpcId: NPC['Матис Йордан'].id, text: 'Джаст, это он. Тот самый, из капсулы. Я по связи рассказывал.', next: n2 }),
      N(700, 160, { id: n2, type: 'line', speakerNpcId: NPC['Джаст Верден'].id, text: 'Рассказывал. Вживую ты выглядишь бодрее, чем в его пересказе.\n\nСадиться не предлагаю — разговор будет не с тобой.', next: nCh }),
      N(1060, 160, { id: nCh, type: 'choice', choices: [
        { id: uid('ch'), text: 'Мне бы понять, что со мной дальше.', conditions: [], effects: [], next: n3 },
        { id: uid('ch'), text: 'Я не напрашивался. Но спасибо, что пустили.', conditions: [], effects: [], next: n3 },
      ] }),
      N(1420, 160, { id: n3, type: 'line', speakerNpcId: NPC['Джаст Верден'].id, text: 'Вот это мы с Матисом и решим. Без тебя — не обижайся, так честнее.\n\nА ты пока пройдись по лагерю. Медпункт, мастерская, склад — пусть люди посмотрят на тебя, а ты на них. Здесь не любят незнакомых лиц за спиной.', next: n4 }),
      N(1780, 160, { id: n4, type: 'line', speakerNpcId: NPC['Матис Йордан'].id, text: 'Иди. Как закончим — найду тебя во дворе.', next: nSet }),
      N(2140, 160, { id: nSet, type: 'set', effects: [{ varId: vTour, op: 'set', value: true }], next: nJump }),
      N(2500, 160, { id: nJump, type: 'jump', gotoSceneId: sMap.id, next: nEnd }),
      N(2860, 160, { id: nEnd, type: 'end' }),
    ],
  });
})();
if (!sJust.onEnterDialogueId) {
  sJust.onEnterDialogueId = dJust.id;
  log.push('сцена «Знакомство. Джаст»: onEnter → новый диалог');
}

// 2) Медпункт — Аниша (знакомство; её реплика сама ставит met_*)
const dAnisha = (() => {
  const n1 = uid('nd'), nCh = uid('nd'), n2a = uid('nd'), n2b = uid('nd'), n3 = uid('nd'), nEnd = uid('nd');
  return addDialogue({
    id: uid('dlg'),
    name: 'Медпункт — Аниша (знакомство)',
    startNodeId: n1,
    nodes: [
      N(80, 160, { id: n1, type: 'line', speakerNpcId: NPC['Аниша Гхал'].id, text: 'А, новенький. Стой ровно, посмотри на меня. Зрачки в порядке — уже неплохо для человека твоего года выпуска.\n\nЯ Аниша. Всё, что болит, ломается и не спит по ночам, — ко мне.', next: nCh }),
      N(440, 160, { id: nCh, type: 'choice', choices: [
        { id: uid('ch'), text: 'Я в порядке.', conditions: [], effects: [], next: n2a },
        { id: uid('ch'), text: 'После шестисот лет сна — грех жаловаться.', conditions: [], effects: [], next: n2b },
      ] }),
      N(800, 40, { id: n2a, type: 'line', speakerNpcId: NPC['Аниша Гхал'].id, text: 'Все так говорят, пока не падают. Ладно, поверю. Пока.', next: n3 }),
      N(800, 280, { id: n2b, type: 'line', speakerNpcId: NPC['Аниша Гхал'].id, text: 'Шестьсот лет — это не сон, это диагноз. Будешь моим самым интересным пациентом, даже если здоров.', next: n3 }),
      N(1160, 160, { id: n3, type: 'line', speakerNpcId: NPC['Аниша Гхал'].id, text: 'Осваивайся. Голова закружится, сон пропадёт, в ушах зазвенит — не терпи и не геройствуй, приходи сразу.', next: nEnd }),
      N(1520, 160, { id: nEnd, type: 'end' }),
    ],
  });
})();
// кнопка Аниши в медпункте + нарратив без «зайти позже»
if (!sMed.elements.some((e) => e.action?.dialogueId === dAnisha.id)) {
  const narr = sMed.elements.find((e) => e.name === 'Нарратив');
  if (narr) narr.text = 'Тихо и чисто — до неправдоподобия. Пахнет антисептиком и сушёными травами; к этому сочетанию придётся привыкнуть.';
  sMed.elements.splice(sMed.elements.length - 1, 0, {
    id: uid('el'), visible: true, type: 'button', name: 'Аниша',
    x: 360, y: 620, w: 760, h: 64,
    style: { fill: 'transparent', textColor: '#cfe8e5', fontSize: 26, radius: 8, borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, textAlign: 'left', fontWeight: '300' },
    text: '◊ Аниша у смотрового стола',
    action: { type: 'startDialogue', dialogueId: dAnisha.id },
    visibleIf: [cEq(vMet.anisha, false)],
  });
  log.push('медпункт: кнопка «Аниша» + нарратив без «зайти позже»');
}

// 3) Двор — Матис ждёт, знакомит с Лори, уводит в жилые
const dYard = (() => {
  const n1 = uid('nd'), nCh = uid('nd'), n2 = uid('nd'), n3 = uid('nd'), nJump = uid('nd'), nEnd = uid('nd');
  return addDialogue({
    id: uid('dlg'),
    name: 'Пролог — Двор: Матис и Лори',
    startNodeId: n1,
    nodes: [
      N(80, 160, { id: n1, type: 'line', speakerNpcId: NPC['Матис Йордан'].id, text: 'Ну как тебе лагерь? Люди у нас громкие, но свои.\n\nМы с Джастом договорили. Остаёшься. Пока гостем — дальше видно будет.', next: nCh }),
      N(440, 160, { id: nCh, type: 'choice', choices: [
        { id: uid('ch'), text: 'И что теперь?', conditions: [], effects: [], next: n2 },
        { id: uid('ch'), text: 'Спасибо, Матис.', conditions: [], effects: [], next: n2 },
      ] }),
      N(800, 160, { id: n2, type: 'line', speakerNpcId: NPC['Лори Никадзе'].id, text: 'Матис! Вы вовремя, котёл как раз дошёл.\n\nЭто и есть твой спящий? Худой он какой-то для легенды. Садись, спящий, — сначала миска, потом всё остальное.', next: n3 }),
      N(1160, 160, { id: n3, type: 'line', speakerNpcId: NPC['Матис Йордан'].id, text: 'Это Лори. Запомни её — от неё зависит, каким будет твоё утро.\n\nДоедай. Пойдём, покажу, где будешь жить.', next: nJump }),
      N(1520, 160, { id: nJump, type: 'jump', gotoSceneId: sQuarters.id, next: nEnd }),
      N(1880, 160, { id: nEnd, type: 'end' }),
    ],
  });
})();
const tourDone = [cEq(vMet.anisha, true), cEq(vMet.liya, true), cEq(vMet.kai, true)];
if (!sYard.elements.some((e) => e.action?.dialogueId === dYard.id)) {
  sYard.elements.splice(sYard.elements.length - 1, 0, {
    id: uid('el'), visible: true, type: 'button', name: 'Матис (финал пролога)',
    x: 360, y: 540, w: 760, h: 64,
    style: { fill: 'transparent', textColor: '#cfe8e5', fontSize: 26, radius: 8, borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, textAlign: 'left', fontWeight: '300' },
    text: '◊ Матис ждёт у костра',
    action: { type: 'startDialogue', dialogueId: dYard.id },
    visibleIf: [cEq(vTour, true), ...tourDone, cEq(vDone, false)],
  });
  log.push('двор: кнопка «Матис ждёт у костра»');
}
// Лори у кухни — только после пролога (знакомит с ней Матис)
const elLori = sYard.elements.find((e) => e.action?.dialogueId === 'dlg_migmrg7qf0il');
if (elLori && !(elLori.visibleIf ?? []).length) {
  elLori.visibleIf = [cEq(vDone, true)];
  log.push('двор: «Лори у полевой кухни» видна после пролога (текст знакомства стоит переписать под повторный разговор)');
}
// вход в главу 1 — только после пролога
const elCh1 = sYard.elements.find((e) => e.action?.sceneId && e.name === 'Вход в главу 1');
if (elCh1 && !elCh1.visibleIf.some((c) => c.varId === vDone)) {
  elCh1.visibleIf.push(cEq(vDone, true));
  log.push('двор: вход в главу 1 требует завершённый пролог');
}

// 4) Жилые помещения — финал пролога (onEnter, с предохранителем на повторный вход)
const dFinal = (() => {
  const nGuard = uid('nd'), n1 = uid('nd'), n2 = uid('nd'), nSet = uid('nd'), nEnd = uid('nd'), nEnd2 = uid('nd');
  return addDialogue({
    id: uid('dlg'),
    name: 'Пролог — Жилые помещения (финал)',
    startNodeId: nGuard,
    nodes: [
      N(60, 300, { id: nGuard, type: 'branch', conditions: [cEq(vDone, true)], nextTrue: nEnd2, nextFalse: n1 }),
      N(340, 420, { id: nEnd2, type: 'end' }),
      N(340, 160, { id: n1, type: 'line', speakerNpcId: NPC['Матис Йордан'].id, text: 'Вот. Койка у стены — твоя. Небогато, но тепло и не дует.\n\nОтдыхай. Завтра начнётся обычная жизнь — она тут лучше, чем звучит.', next: n2 }),
      N(700, 160, { id: n2, type: 'line', text: 'Впервые за шестьсот лет — не капсула.\n\nПросто комната, где за перегородкой дышат люди.', next: nSet }),
      N(1060, 160, { id: nSet, type: 'set', effects: [{ varId: vDone, op: 'set', value: true }], next: nEnd }),
      N(1420, 160, { id: nEnd, type: 'end' }),
    ],
  });
})();
if (!sQuarters.onEnterDialogueId) {
  sQuarters.onEnterDialogueId = dFinal.id;
  log.push('сцена «Жилые помещения»: onEnter → финал пролога');
}

// ---------- карта: дорожки долой, узлы под пролог ----------
const cfg = sMap.campMap;
if (cfg.links?.length) { log.push(`карта: удалены дорожки (${cfg.links.length})`); }
delete cfg.links;

const nodeByTitle = (t) => cfg.nodes.find((n) => n.title === t);
const nQuarters = nodeByTitle('Жилые помещения');
if (!nQuarters) throw new Error('узел «Жилые помещения» не найден на карте');
if (!nQuarters.sceneId) {
  nQuarters.sceneId = sQuarters.id;
  nQuarters.tagline = 'койки, перегородки, чужие сны';
  nQuarters.lockedIf = [cEq(vDone, false)];
  nQuarters.lockedText = 'Место пока не выделили. Матис проводит, когда всё решится.';
  log.push('карта: узел «Жилые помещения» → сцена, заперт до финала пролога');
}

const nMed = nodeByTitle('Медпункт');
if (nMed && !(nMed.marks ?? []).length) {
  nMed.tagline = 'антисептик и сушёные травы';
  nMed.marks = [
    { id: uid('mm'), text: '◊ Аниша — стоит познакомиться', conditions: [cEq(vTour, true), cEq(vMet.anisha, false)] },
    { id: uid('mm'), text: '· тихо и чисто', conditions: [] },
  ];
  log.push('карта: медпункт — метка тура');
}

const nYardNode = nodeByTitle('Двор');
if (nYardNode) {
  nYardNode.marks = (nYardNode.marks ?? []).filter((m) => !m.text.includes('Лори кормит'));
  if (!nYardNode.marks.some((m) => m.text.includes('Матис ждёт'))) {
    nYardNode.marks.unshift({
      id: uid('mm'), text: '◊ Матис ждёт у костра',
      conditions: [cEq(vTour, true), ...tourDone, cEq(vDone, false)],
    });
  }
  log.push('карта: двор — «Матис ждёт у костра» вместо «Лори кормит»');
}

const nComm = nodeByTitle('Узел связи');
if (nComm) {
  const before = (nComm.marks ?? []).length;
  nComm.marks = (nComm.marks ?? []).filter((m) => !m.text.includes('представиться Джасту'));
  if ((nComm.marks ?? []).length !== before) log.push('карта: узел связи — метка «представиться Джасту» убрана (знакомство теперь в прологе)');
}

// узел связи: кнопка старого знакомства с Джастом прячется после пролога
const sComm = p.scenes.find((s) => s.id === nComm?.sceneId);
const elJust = sComm?.elements.find((e) => e.action?.dialogueId === 'dlg_migmrg7qf0ip');
if (elJust && !(elJust.visibleIf ?? []).length) {
  elJust.visibleIf = [cEq(vMet.just, false)];
  log.push('узел связи: старое знакомство с Джастом скрыто, когда Джаст уже знаком');
}

// ---------- квест «Освоиться» ----------
const quest = (p.quests ?? []).find((q) => q.title === 'Освоиться');
if (quest) {
  quest.description = 'Джаст отправил осмотреться: медпункт, мастерская, склад. Потом — во двор, Матис будет ждать у костра.';
  quest.steps = [
    { id: uid('qs'), text: 'Представиться Джасту', conditions: [cEq(vMet.just, true)] },
    { id: uid('qs'), text: 'Заглянуть в медпункт к Анише', conditions: [cEq(vMet.anisha, true)] },
    { id: uid('qs'), text: 'Заглянуть в мастерскую к Лии', conditions: [cEq(vMet.liya, true)] },
    { id: uid('qs'), text: 'Заглянуть на склад к Каю', conditions: [cEq(vMet.kai, true)] },
    { id: uid('qs'), text: 'Вернуться во двор — Матис ждёт', conditions: [cEq(vMet.lori, true)] },
    { id: uid('qs'), text: 'Обустроиться в жилых помещениях', conditions: [cEq(vDone, true)] },
  ];
  log.push('квест «Освоиться»: шаги под новую последовательность пролога');
}

// ---------- запись ----------
fs.writeFileSync(OUT, JSON.stringify(p));
console.log(log.map((l) => '  ' + l).join('\n'));
console.log(`\nГотово: ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} МБ)`);
console.log('Владелец загружает файл в редакторе: «📂 Открыть».');
