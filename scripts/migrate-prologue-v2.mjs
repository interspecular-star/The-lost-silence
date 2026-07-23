// ============================================================
// Усиление пролога по docs/dev/chapters/prologue.md (v3), поверх
// уже существующего авторского контента (Сэм/Прогулка до аванпоста/
// камерный тур Джаста-Аниши-Лии-Кая-Лори) — НИЧЕГО не удаляет,
// только добавляет/обогащает узкие места, отмеченные как черновик.
//
// Что делает:
// 1) Новый предмет «Механические часы» (стартовый, как ключ-карта).
// 2) В «Интро. Звонок Сэма» — вставка сцены «ИИ подобрал отказ»
//    (машина знает мой ответ раньше меня) перед финальным согласием.
// 3) В сцене «Флэшбэк_1.7» — протокол сдачи вещей у капсулы: часы
//    Сэм не берёт («не по регламенту»), карта остаётся у ГГ.
// 4) Новая сцена «Новый мир - Тишина» между «Прогулка до аванпоста_6»
//    и «Flux Nomads»: замолчавшие птицы, дрожащий воздух, стеклянная
//    лиса, счёт вслух, белая метка-разметка на обочине (задел под
//    payoff у Джаста).
// 5) В «Пролог — Джаст: чужак в лагере» — реплика «Ты — фон»,
//    привязанная к белой метке из п.4.
// 6) «Медпункт — Аниша (знакомство)» — переписана как обучающая
//    петля: «нормально»/«терпимо» не принимаются, ведут к честному
//    третьему ответу.
// 7) «Мастерская — Лия (знакомство)» — смягчённый тизер про то, что
//    Матис когда-то откопал и её (без возраста/подробностей —
//    решение владельца: полное признание оставляем арке акта 2).
// 8) «Склад — Кай (знакомство)» — деталь «строго, как с бюджетом».
// 9) «Пролог — Жилые помещения (финал)» — более полное прощание
//    Матиса + ритуал: карта и часы рядом на ящике.
//
// Читает local-save/project.json (НЕ трогает её), пишет
// local-save/project-prologue-v2.tls.json — загрузить в редакторе
// через «📂 Открыть», затем «✓ Проверка» + плейтест.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'local-save', 'project.json');
const OUT = path.join(ROOT, 'local-save', 'project-prologue-v2.tls.json');

const p = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
const log = [];

let uidN = 0;
const uid = (prefix) => `${prefix}_pv2${Date.now().toString(36)}${(uidN++).toString(36)}`;

const dlgByName = (name) => {
  const d = p.dialogues.find((x) => x.name === name);
  if (!d) throw new Error(`диалог не найден: ${name}`);
  return d;
};
const sceneByName = (name) => {
  const s = p.scenes.find((x) => x.name === name);
  if (!s) throw new Error(`сцена не найдена: ${name}`);
  return s;
};
const nodeById = (d, id) => d.nodes.find((n) => n.id === id);
const npcByName = (name) => {
  const n = (p.npcs ?? []).find((x) => x.name === name);
  if (!n) throw new Error(`NPC не найден: ${name}`);
  return n;
};

// ============================================================
// 1) Механические часы — второй личный предмет ГГ
// ============================================================
{
  const already = p.items.find((i) => /механические часы/i.test(i.name));
  if (!already) {
    const item = {
      id: uid('item'), name: 'Механические часы', type: 'resource', rarity: 'high',
      price: 0, questItem: true,
      description: 'Отцовские. Заводятся вручную — полтора оборота. Единственный счёт здесь, который ведёте вы сами.',
    };
    p.items.push(item);
    p.hero.startItems = p.hero.startItems ?? [];
    p.hero.startItems.push({ itemId: item.id, qty: 1 });
    log.push('+ предмет «Механические часы» (стартовый)');
  } else {
    log.push('= «Механические часы» уже есть — не трогаю');
  }
}

// ============================================================
// 2) «Интро. Звонок Сэма» — вставка ИИ-подсказки-отказа
// ============================================================
{
  const d = dlgByName('Интро. Звонок Сэма');
  const anchorFrom = nodeById(d, 'nd_mr7lak5tf1'); // Сэм: «Возможно. Но это шанс начать всё заново.»
  const anchorTo = nodeById(d, 'nd_mr7lbcxdf2'); // «Мне почти нечего было терять. Поэтому я согласился»
  if (!anchorFrom || !anchorTo) throw new Error('не найдены опорные ноды в «Интро. Звонок Сэма»');

  if (anchorFrom.next === anchorTo.id) {
    const n1 = uid('nd'), n2 = uid('nd'), n3 = uid('nd'), n4 = uid('nd'), n5 = uid('nd');
    const inserted = [
      { id: n1, type: 'line', x: anchorFrom.x + 40, y: anchorFrom.y + 140,
        text: 'Я тянул с ответом четыре дня. Причин отказаться набралось много, и все были хорошими.', next: n2 },
      { id: n2, type: 'line', x: anchorFrom.x + 260, y: anchorFrom.y + 140,
        text: 'На четвёртый день сел писать отказ. Открыл переписку, набрал два слова — и застрял, подбирая третье.', next: n3 },
      { id: n3, type: 'line', x: anchorFrom.x + 480, y: anchorFrom.y + 140,
        text: 'Помощник — тот, что всегда под рукой, — подобрал остальное сам. Серым, вежливым текстом, готовым к отправке:\n\n«Спасибо, но я вынужден отказаться. Это не для меня».', next: n4 },
      { id: n4, type: 'line', x: anchorFrom.x + 700, y: anchorFrom.y + 140,
        text: 'Я смотрел на эти слова дольше, чем на любые слова в своей жизни. Они были мои — интонация, длина, даже это трусливое «вынужден». Машина знала мой ответ раньше меня.', next: n5 },
      { id: n5, type: 'line', x: anchorFrom.x + 920, y: anchorFrom.y + 140,
        text: 'Я стёр подсказку по одной букве, медленно, как отдирают пластырь. И набрал сам, двумя пальцами, другое: «Я согласен».', next: anchorTo.id },
    ];
    d.nodes.push(...inserted);
    anchorFrom.next = n1;
    anchorTo.text = 'Мне почти нечего было терять.\n\nНо согласился я, кажется, не поэтому.';
    log.push('+ «Интро. Звонок Сэма»: вставлена сцена ИИ-подсказки-отказа (5 нод)');
  } else {
    log.push('= «Интро. Звонок Сэма» уже расширена — не трогаю');
  }
}

// ============================================================
// 3) «Флэшбэк_1.7» — протокол сдачи вещей + часы
// ============================================================
{
  const s = sceneByName('Флэшбэк_1.7');
  const el = s.elements.find((e) => e.name === 'Текст 1');
  if (!el) throw new Error('не найден текстовый элемент во «Флэшбэк_1.7»');
  const marker = 'Личные вещи';
  if (!el.text.includes(marker)) {
    el.text = 'У самой двери Сэм останавливается и протягивает руку ладонью вверх.\n\n'
      + '— Личные вещи. Всё, что с металлом, всё, что с батареей. Протокол.\n\n'
      + 'Я выкладываю телефон, ключи, мелочь. Последними — часы. Отцовские, механические. Сэм смотрит на них и не берёт.\n\n'
      + '— Механика? Не по регламенту.\n\n'
      + '— Твой проект тоже.\n\n'
      + 'Он молчит секунду. Потом закрывает мою ладонь с часами моими же пальцами — молча, как ставят печать.\n\n'
      + el.text;
    log.push('«Флэшбэк_1.7»: добавлен протокол сдачи вещей (часы остаются у ГГ)');
  } else {
    log.push('= «Флэшбэк_1.7» уже дополнена — не трогаю');
  }
}

// ============================================================
// 4) Новая сцена «Новый мир - Тишина» + мини-диалог
//    между «Прогулка до аванпоста_6» и «Flux Nomads»
// ============================================================
{
  const already = p.scenes.find((x) => x.name === 'Новый мир - Тишина');
  if (!already) {
    const dWalk6 = dlgByName('Прогулка до аванпоста_6');
    const jumpNode = dWalk6.nodes.find((n) => n.type === 'jump' && n.gotoSceneId);
    if (!jumpNode) throw new Error('не найдена jump-нода в «Прогулка до аванпоста_6»');
    const sFluxNomads = sceneByName('Flux Nomads');
    if (jumpNode.gotoSceneId !== sFluxNomads.id) throw new Error('«Прогулка до аванпоста_6» ведёт не туда, куда ожидалось — проверь вручную');

    const sSpusk2 = sceneByName('Новый мир - Спуск_2');
    const matis = npcByName('Матис Йордан');

    // мини-диалог: счёт, лиса, реакция игрока, белая метка
    const n1 = uid('nd'), n2 = uid('nd'), n3a = uid('nd'), n3b = uid('nd'), n4 = uid('nd'), nJ = uid('nd'), nE = uid('nd');
    const vTold = (() => {
      let v = p.variables.find((x) => x.name === 'pro_saw_marker');
      if (!v) {
        v = { id: uid('var'), name: 'pro_saw_marker', title: 'Пролог: видел белую метку у дороги', type: 'boolean', initial: false, category: 'general', description: 'Ставится по дороге в лагерь. Задел на будущий payoff (Джаст: «Ты — фон»).' };
        p.variables.push(v);
      }
      return v.id;
    })();
    const dSilence = {
      id: uid('dlg'), name: 'Дорога — тишина и лиса', startNodeId: n1,
      nodes: [
        { id: n1, type: 'line', x: 80, y: 120, speakerNpcId: matis.id,
          text: 'Держись рядом. Шагай, куда шагаю я.', next: n2 },
        { id: n2, type: 'choice', x: 440, y: 120, choices: [
          { id: uid('ch'), text: 'Что это было?', conditions: [], effects: [], next: n3a },
          { id: uid('ch'), text: '[Промолчать]', conditions: [], effects: [], next: n3b },
        ] },
        { id: n3a, type: 'line', x: 800, y: 40, speakerNpcId: matis.id,
          text: 'Край. Не наш вопрос сегодня. — Он смотрит на тебя чуть дольше обычного. — Считал ровно. Хорошо.', next: n4 },
        { id: n3b, type: 'line', x: 800, y: 220,
          text: 'Он не объясняет. Может, и сам не знает, как объяснить это так, чтобы не звучало страшнее, чем есть.', next: n4 },
        { id: n4, type: 'line', x: 1160, y: 120,
          text: 'Птицы возвращаются постепенно, по одной. Только сейчас ты понимаешь: тишина там была не той, которую ты знаешь.', next: nJ },
        { id: nJ, type: 'jump', x: 1520, y: 120, gotoSceneId: sFluxNomads.id, next: nE },
        { id: nE, type: 'end', x: 1880, y: 120 },
      ],
    };
    p.dialogues.push(dSilence);

    const sSilence = {
      id: uid('scene'), name: 'Новый мир - Тишина', kind: 'location',
      background: sSpusk2.background, bgImage: sSpusk2.bgImage,
      hudMode: 'off', folderId: sSpusk2.folderId, guides: [],
      bgEffects: [
        { id: uid('fx'), type: 'glitch', intensity: 12, conditions: [] },
        { id: uid('fx'), type: 'vignette', intensity: 35, conditions: [] },
      ],
      elements: [
        {
          id: uid('el'), name: 'Нарратив', type: 'text', visible: true,
          x: 210, y: 220, w: 1500, h: 420,
          text: 'Птицы вокруг вдруг замолкают. Не улетают — просто перестают, все разом, как оркестр по взмаху дирижёра.\n\n'
            + 'Матис замедляет шаг. Смотрит не вперёд — в сторону, туда, где воздух над травой едва заметно дрожит, как над раскалённым асфальтом. Только асфальта здесь нет, и жары тоже.\n\n'
            + 'Он начинает считать вполголоса, ровно, как метроном: — Один. Два. Три...\n\n'
            + 'Ты считаешь вместе с ним — сам не зная зачем.\n\n'
            + 'На середине счёта что-то серебристое и быстрое проносится у самой земли. Лиса. Стеклянная, будто светится изнутри.\n\n'
            + 'Матис обрывает счёт на середине числа, как обрывают лишнюю нитку.',
          style: { textColor: '#aebfca', fontSize: 30, fontWeight: '300', textAlign: 'center', lineHeight: 1.3, guard: 'scrim', guardPower: 1 },
          fx: { in: 'blur' },
        },
        {
          id: uid('el'), name: 'Продолжить', type: 'button', visible: true,
          x: 760, y: 800, w: 400, h: 70, zIndex: 2,
          text: '➜ Продолжить',
          style: { fill: 'transparent', textColor: '#8fa2af', fontSize: 24, radius: 6, borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1, textAlign: 'center', guard: 'shadow' },
          action: { type: 'startDialogue', dialogueId: dSilence.id },
          boxStyle: { surface: 'spatial', border: 'scan' },
        },
      ],
    };
    // отдельно — белая метка появляется чуть погодя, как деталь на обочине
    sSilence.elements.splice(1, 0, {
      id: uid('el'), name: 'Белая метка', type: 'text', visible: true,
      x: 210, y: 660, w: 1500, h: 100,
      text: 'Чуть в стороне, у обочины, — столбик с белой меткой. Простой, как дорожный знак из мира, где дорожных знаков больше нет. Матис проходит мимо, не глядя. Ты — нет.',
      style: { textColor: '#7d8f9c', fontSize: 24, fontWeight: '300', textAlign: 'center', lineHeight: 1.3, fontStyle: 'italic' },
    });
    p.scenes.splice(p.scenes.findIndex((x) => x.id === sSpusk2.id) + 1, 0, sSilence);

    // set-нода: пометить, что метку видели (эффект вешаем прямо на нарратив — проще: доп. set-нода в начале мини-диалога)
    const nSet = uid('nd');
    dSilence.nodes.push({ id: nSet, type: 'set', x: 40, y: 300, effects: [{ varId: vTold, op: 'set', value: true }], next: n1 });
    dSilence.startNodeId = nSet;

    jumpNode.gotoSceneId = sSilence.id;
    log.push('+ сцена «Новый мир - Тишина» (птицы/лиса/счёт/белая метка) между Прогулкой_6 и Flux Nomads');
  } else {
    log.push('= «Новый мир - Тишина» уже есть — не трогаю');
  }
}

// ============================================================
// 5) Джаст: «Ты — фон» (payoff белой метки)
// ============================================================
{
  const d = dlgByName('Пролог — Джаст: чужак в лагере');
  const nJust1 = nodeById(d, 'nd_promriow6ui8'); // Джаст: «Рассказывал. Вживую ты выглядишь бодрее...»
  if (!nJust1) throw new Error('не найдена реплика Джаста в «Пролог — Джаст: чужак в лагере»');
  const marker = 'Ты — фон';
  if (!nJust1.text.includes(marker)) {
    nJust1.text += '\n\nУ нас есть правило. Всё, что не размечено, мы называем не «опасность». Мы называем «фон» — пока не доказано обратное.\n\nТы — фон. Пока.';
    log.push('«Пролог — Джаст»: добавлен payoff «Ты — фон» (к белой метке по дороге)');
  } else {
    log.push('= payoff «Ты — фон» уже есть — не трогаю');
  }
}

// ============================================================
// 6) Аниша: обучающая петля (сглаженные ответы не принимаются)
// ============================================================
{
  const d = dlgByName('Медпункт — Аниша (знакомство)');
  const anisha = npcByName('Аниша Гхал');
  const already = d.nodes.some((n) => n.text?.includes('Оценки мне ставит начальство'));
  if (!already) {
    const n1 = d.nodes.find((n) => n.type === 'line' && n.text.startsWith('А, новенький'));
    const nCh = d.nodes.find((n) => n.type === 'choice');
    const nA = d.nodes.find((n) => n.id === nCh.choices[0].next); // «Все так говорят, пока не падают...»
    const nB = d.nodes.find((n) => n.id === nCh.choices[1].next); // «Шестьсот лет — это не сон...»
    const nAfter = d.nodes.find((n) => n.id === nA.next); // «Осваивайся. Голова закружится...»
    if (!n1 || !nCh || !nA || !nB || !nAfter) throw new Error('не удалось разобрать граф «Медпункт — Аниша»');

    // новый вопрос Аниши + честный третий вариант
    const nAsk = uid('nd'), nCh3 = uid('nd'), n3honest = uid('nd'), nReact = uid('nd');
    n1.next = nAsk;
    nCh.choices = [
      { id: uid('ch'), text: '«Нормально».', conditions: [], effects: [], next: nA.id },
      { id: uid('ch'), text: '«Терпимо».', conditions: [], effects: [], next: nB.id },
      { id: uid('ch'), text: 'Словами.', conditions: [], effects: [], next: n3honest },
    ];
    d.nodes.push(
      { id: nAsk, type: 'line', x: n1.x + 300, y: n1.y, speakerNpcId: anisha.id,
        text: 'Опиши, что чувствуешь сейчас.', next: nCh.id },
      { id: n3honest, type: 'line', x: nA.x, y: nA.y + 400, speakerNpcId: anisha.id,
        text: '(вы говорите своими словами — о тяжести в голове, резком свете, чужих руках)\n\nХорошо. Большинство сглаживают. Мне нужны слова, а не оценки. Ты дал слова — уже лучше многих.', next: nAfter.id },
    );
    // «Нормально»/«Терпимо» теперь отказ, а не согласие — ведут на честный ответ
    nA.text = '«Нормально» — это оценка. Оценки мне ставит начальство. Мне нужны слова.\n\nЕщё раз. Что чувствуешь.';
    nA.next = n3honest;
    nB.text = '«Терпимо» — это про то, сколько ты выдержишь. Я спрашиваю не сколько. Я спрашиваю что.\n\nСловами.';
    nB.next = n3honest;
    log.push('«Медпункт — Аниша»: переписана как обучающая петля (нормально/терпимо → честный ответ)');
  } else {
    log.push('= «Медпункт — Аниша» уже содержит петлю — не трогаю');
  }
}

// ============================================================
// 7) Лия: смягчённый тизер про Матиса (без возраста/подробностей)
// ============================================================
{
  const d = dlgByName('Мастерская — Лия (знакомство)');
  const already = d.nodes.some((n) => n.text?.includes('тоже когда-то откопал'));
  if (!already) {
    const n8 = nodeById(d, 'nd_migmrg7qf0i8'); // «Будет дело — заходи...»
    const n6 = nodeById(d, 'nd_migmrg7qf0i6');
    const n7 = nodeById(d, 'nd_migmrg7qf0i7');
    if (!n8 || !n6 || !n7) throw new Error('не удалось разобрать граф «Мастерская — Лия»');
    const lia = npcByName('Лия Ромеро-Санг');
    const nTease = uid('nd');
    d.nodes.push({ id: nTease, type: 'line', x: n8.x, y: n8.y - 200, speakerNpcId: lia.id,
      text: 'Матис с тобой долго возился, я гляжу.\n\nОн и меня когда-то откопал. Другая история, длинная — как-нибудь расскажу, если будет настроение.', next: n8.id });
    n6.next = nTease;
    n7.next = nTease;
    log.push('«Мастерская — Лия»: добавлен смягчённый тизер про спасение Матисом (без подробностей — держим для арки акта 2)');
  } else {
    log.push('= тизер у Лии уже есть — не трогаю');
  }
}

// ============================================================
// 8) Кай: «строго — как с бюджетом»
// ============================================================
{
  const d = dlgByName('Склад — Кай (знакомство)');
  const already = d.nodes.some((n) => n.text?.includes('посчитал неправильно'));
  if (!already) {
    const n1 = nodeById(d, 'nd_migmrg7qf0iq');
    const n2 = nodeById(d, 'nd_migmrg7qf0ir'); // «Понадобится что со склада...»
    if (!n1 || !n2) throw new Error('не удалось разобрать граф «Склад — Кай»');
    const kai = npcByName('Кай Муромото');
    const nStrict = uid('nd');
    d.nodes.push({ id: nStrict, type: 'line', x: n2.x + 200, y: n2.y, speakerNpcId: kai.id,
      text: 'Строго — это как с бюджетом. Всё, что выдаём, должно вернуться или объясниться.\n\nОдин раз посчитал неправильно. Хватило. — Он моргает, будто отгоняя мысль, и снова смотрит прямо.', next: n2.next });
    n2.next = nStrict;
    log.push('«Склад — Кай»: добавлена деталь «строго — как с бюджетом»');
  } else {
    log.push('= деталь у Кая уже есть — не трогаю');
  }
}

// ============================================================
// 9) Финал «Койка»: полное прощание Матиса + ритуал карта/часы
// ============================================================
{
  const d = dlgByName('Пролог — Жилые помещения (финал)');
  const already = d.nodes.some((n) => n.text?.includes('Ровер подвёл'));
  if (!already) {
    const n14 = nodeById(d, 'nd_promriow6ui14'); // Матис: «Вот. Койка у стены — твоя...»
    const n15 = nodeById(d, 'nd_promriow6ui15'); // «Впервые за шестьсот лет — не капсула...»
    if (!n14 || !n15) throw new Error('не удалось разобрать граф «Пролог — Жилые помещения (финал)»');
    const matis = npcByName('Матис Йордан');
    const nThanks = uid('nd'), nMatisReply = uid('nd'), nRitual = uid('nd');
    d.nodes.push(
      { id: nThanks, type: 'line', x: n14.x + 200, y: n14.y + 40,
        text: 'Спасибо, Матис. За то, что вытащил.', next: nMatisReply },
      { id: nMatisReply, type: 'line', x: n14.x + 400, y: n14.y + 40, speakerNpcId: matis.id,
        text: 'Не меня благодари. Ровер подвёл. — Пауза, дольше обычной. — Не выпадай.', next: nRitual },
      { id: nRitual, type: 'line', x: n14.x + 600, y: n14.y + 40,
        text: 'Он уходит, не дожидаясь ответа.\n\nВы достаёте из-за пазухи всё своё имущество и кладёте на ящик у койки. Карта — мёртвая, безымянная. Часы — рядом.\n\nЗаводите их. Полтора оборота. Тик.\n\nСтрелка трогается. Время здесь идёт — вы проверили.', next: n15.id },
    );
    n14.next = nThanks;
    log.push('«Пролог — Жилые помещения (финал)»: добавлено прощание Матиса + ритуал карта/часы');
  } else {
    log.push('= финал «Койка» уже дополнен — не трогаю');
  }
}

// ---------- запись ----------
fs.writeFileSync(OUT, JSON.stringify(p));
console.log(log.map((l) => '  ' + l).join('\n'));
console.log(`\nГотово: ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} МБ)`);
console.log('Владелец загружает файл в редакторе: «📂 Открыть», затем «✓ Проверка» + плейтест.');
