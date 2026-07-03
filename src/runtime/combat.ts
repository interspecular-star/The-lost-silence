// ============================================================
// Боевая система: пошаговые QTE-окна.
// Ход игрока: Атака / Спецудар (фокус) / Скан (Осколок) / Защита / Предмет.
// Ход моба: замах (полоса) → Уклон / Парирование в окне реакции.
// Хоткеи: A атака, S спецудар, D защита, ПРОБЕЛ уклон, E парирование.
// ============================================================

import { MobDef, MobAttack, CANVAS_W } from '../core/types';
import { heroVarId } from '../core/hero';
import { mobIcon } from '../core/hero';
import type { Engine } from './engine';

const SPEC_COST = 25;        // фокус за спецудар
const SPEC_MULT = 1.8;       // множитель спецудара
const PARRY_REFLECT = 0.5;   // доля отражённого урона
const PARRY_FOC_GAIN = 10;   // фокус за успешное парирование
const SCAN_COST = 10;        // фокус за сканирование Осколком
const GUARD_REDUCE = 0.5;    // защита: доля урона, которая проходит
const GUARD_FOC_GAIN = 10;   // фокус за принятый в защите удар

export function runCombat(
  engine: Engine,
  mob: MobDef,
  onEnd: (win: boolean) => void,
) {
  engine.inCombat = true;
  const st = engine.state;
  const v = (name: string) => Number(st[heroVarId(engine.project, name) ?? ''] ?? 0);
  const setV = (name: string, val: number) => {
    const id = heroVarId(engine.project, name);
    if (id) st[id] = Math.round(val * 10) / 10;
  };

  // список атак моба: заданные автором или одна стандартная
  const attacks: MobAttack[] = (mob.attacks ?? []).filter((a) => a.weight > 0);
  if (attacks.length === 0) {
    attacks.push({ id: 'std', name: 'Атака', atkMult: 1, telegraphMs: mob.telegraphMs, weight: 1 });
  }
  const pickAttack = (): MobAttack => {
    const total = attacks.reduce((s, a) => s + a.weight, 0);
    let r = Math.random() * total;
    for (const a of attacks) { r -= a.weight; if (r <= 0) return a; }
    return attacks[attacks.length - 1];
  };

  let mobHp = mob.hp;
  let phase: 'player' | 'telegraph' | 'over' = 'player';
  let telegraphStart = 0;
  let currentAttack: MobAttack = attacks[0];
  let reactionSpent = false;
  let guarding = false;
  // скан доступен только с Осколком (ур. 1+); без настроенной переменной — всегда
  let scanned = false;
  const canScan = engine.oskolokLevel >= 1;
  let rafId = 0;

  // ---------- UI ----------
  const layer = document.createElement('div');
  layer.style.cssText = `position:absolute;inset:0;z-index:40;pointer-events:auto;
    background:rgba(3,6,9,0.94);backdrop-filter:blur(4px);display:flex;flex-direction:column;
    align-items:center;justify-content:space-between;font-size:calc(28 * 100cqw / ${CANVAS_W});
    color:#cfd9e2;padding:3.5% 7%;`;
  engine.root.appendChild(layer);

  // — верх: моб по центру —
  const mobBox = document.createElement('div');
  mobBox.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0.7em;';
  const mobName = document.createElement('div');
  mobName.textContent = mob.name.toUpperCase();
  mobName.style.cssText = 'font-size:0.85em;font-weight:400;color:#e6edf3;letter-spacing:5px;';
  mobBox.appendChild(mobName);
  // строка сигнатуры: до скана — «не опознана», после — защита/крит/атаки
  const sig = document.createElement('div');
  sig.style.cssText = 'font-size:0.55em;letter-spacing:3px;color:#5f7a8a;';
  mobBox.appendChild(sig);
  const mobHpBar = bar('#e06c75', '13em');
  mobBox.appendChild(mobHpBar.wrap);
  const mobImg = document.createElement('img');
  mobImg.src = mobIcon(mob);
  mobImg.style.cssText = `width:6.5em;height:6.5em;border:1px solid rgba(255,255,255,0.1);
    padding:0.4em;box-sizing:border-box;margin-top:0.3em;`;
  mobImg.draggable = false;
  mobBox.appendChild(mobImg);
  layer.appendChild(mobBox);

  function renderSig() {
    if (scanned) {
      const names = attacks.map((a) => a.name).join(' · ');
      sig.textContent = `ЗАЩИТА ${mob.def} · КРИТ ${mob.critChance ?? 0}% · ${names}`;
      sig.style.color = '#4fd1c5';
    } else {
      sig.textContent = canScan ? 'СИГНАТУРА НЕ ОПОЗНАНА' : 'СИГНАТУРА НЕДОСТУПНА БЕЗ ОСКОЛКА';
    }
  }

  // — центр: лог + подпись + полоса замаха —
  const mid = document.createElement('div');
  mid.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0.7em;width:64%;';
  const log = document.createElement('div');
  log.style.cssText = `font-style:italic;font-weight:300;color:#8fa2af;text-align:center;
    font-size:0.9em;line-height:1.5;min-height:2.4em;`;
  log.textContent = `«${mob.name} приближается».`;
  mid.appendChild(log);
  const teleLabel = document.createElement('div');
  teleLabel.textContent = 'ТОЧНЫЙ УДАР — ЖМИ В ЗЕЛЁНОЙ ЗОНЕ';
  teleLabel.style.cssText = `font-size:0.62em;letter-spacing:4px;color:#5f7a8a;
    opacity:0;transition:opacity .15s;`;
  mid.appendChild(teleLabel);
  const teleWrap = document.createElement('div');
  teleWrap.style.cssText = `width:100%;height:0.55em;background:rgba(255,255,255,0.06);
    border:1px solid rgba(255,255,255,0.08);overflow:hidden;opacity:0;transition:opacity .15s;
    position:relative;box-sizing:border-box;`;
  const teleFill = document.createElement('div');
  teleFill.style.cssText = 'height:100%;width:100%;background:#8a949e;';
  teleWrap.appendChild(teleFill);
  const zoneMark = document.createElement('div');
  zoneMark.style.cssText = `position:absolute;top:0;bottom:0;left:0;background:rgba(152,195,121,0.3);
    border-right:2px solid #98c379;`;
  teleWrap.appendChild(zoneMark);
  mid.appendChild(teleWrap);
  layer.appendChild(mid);

  // — низ: полосы игрока + плитки действий —
  const bottom = document.createElement('div');
  bottom.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:1em;width:84%;';
  const heroBars = document.createElement('div');
  heroBars.style.cssText = 'display:flex;gap:2em;align-items:center;';
  const hpBar = bar('#e06c75', '11em', 'HP');
  const focBar = bar('#7db8f0', '11em', 'FOC');
  heroBars.append(hpBar.wrap, focBar.wrap);
  bottom.appendChild(heroBars);

  // строка выбора расходника (появляется по кнопке «Предмет»)
  const itemStrip = document.createElement('div');
  itemStrip.style.cssText = `display:none;gap:0.5em;justify-content:center;flex-wrap:wrap;width:100%;`;
  bottom.appendChild(itemStrip);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:0.6em;justify-content:center;width:100%;flex-wrap:wrap;';
  const btnAttack = combatBtn('⚔', 'АТАКА', '#4fd1c5', 'A');
  const btnSpec = combatBtn('✦', `ФОКУС · ${SPEC_COST}`, '#7db8f0', 'S');
  const btnScan = combatBtn('⌖', `СКАН · ${SCAN_COST}`, '#56b6c2');
  const btnGuard = combatBtn('▣', 'ЗАЩИТА', '#aebfca', 'D');
  const btnItem = combatBtn('✚', 'ПРЕДМЕТ', '#b39cf0');
  const btnDodge = combatBtn('➟', 'УКЛОН', '#98c379', 'ПРОБЕЛ');
  const btnParry = combatBtn('◈', 'ПАРИРОВАНИЕ', '#e5c07b', 'E');
  buttons.append(btnAttack, btnSpec, btnScan, btnGuard, btnItem, btnDodge, btnParry);
  bottom.appendChild(buttons);
  layer.appendChild(bottom);

  function bar(color: string, width: string, label?: string) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:0.5em;';
    if (label) {
      const l = document.createElement('span');
      l.textContent = label;
      l.style.cssText = 'font-size:0.52em;color:#5f7a8a;letter-spacing:2px;';
      wrap.appendChild(l);
    }
    const outer = document.createElement('div');
    outer.style.cssText = `width:${width};height:3px;background:rgba(255,255,255,0.09);overflow:hidden;`;
    const fill = document.createElement('div');
    fill.style.cssText = `height:100%;width:100%;background:${color};transition:width .25s;`;
    outer.appendChild(fill);
    wrap.appendChild(outer);
    const text = document.createElement('span');
    text.style.cssText = 'font-size:0.6em;color:#5f7a8a;min-width:4em;letter-spacing:1px;';
    wrap.appendChild(text);
    return { wrap, fill, text };
  }

  function combatBtn(glyph: string, label: string, color: string, key?: string): HTMLElement {
    const b = document.createElement('div');
    b.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:0.35em;
      padding:0.65em 1em;border:1px solid ${color}44;min-width:5.6em;
      color:${color};background:rgba(255,255,255,0.015);cursor:pointer;user-select:none;
      transition:border-color .12s,background .12s,opacity .12s;`;
    const g = document.createElement('div');
    g.textContent = glyph;
    g.style.cssText = 'font-size:1em;';
    const l = document.createElement('div');
    l.textContent = label;
    l.style.cssText = 'font-size:0.55em;letter-spacing:2.5px;white-space:nowrap;';
    b.append(g, l);
    if (key) {
      const k = document.createElement('div');
      k.textContent = key;
      k.style.cssText = `font-size:0.42em;letter-spacing:2px;color:#5f7a8a;`;
      b.appendChild(k);
    }
    b.onmouseenter = () => { b.style.borderColor = color; b.style.background = `${color}11`; };
    b.onmouseleave = () => { b.style.borderColor = `${color}44`; b.style.background = 'rgba(255,255,255,0.015)'; };
    return b;
  }

  function setEnabled(el: HTMLElement, on: boolean) {
    el.style.opacity = on ? '1' : '0.28';
    el.style.pointerEvents = on ? 'auto' : 'none';
  }

  function consumables(): { index: number; name: string; qty: number }[] {
    const res: { index: number; name: string; qty: number }[] = [];
    engine.inventory.forEach((cell, index) => {
      const def = engine.project.items?.find((i) => i.id === cell.itemId);
      if (def && def.type === 'consumable') res.push({ index, name: def.name, qty: cell.qty });
    });
    return res;
  }

  function refresh() {
    mobHpBar.fill.style.width = `${Math.max(0, (mobHp / mob.hp) * 100)}%`;
    mobHpBar.text.textContent = scanned ? `${Math.max(0, Math.ceil(mobHp))}/${mob.hp}` : '— / —';
    hpBar.fill.style.width = `${(v('hp') / Math.max(1, v('hp_max'))) * 100}%`;
    hpBar.text.textContent = `${Math.floor(v('hp'))}/${Math.floor(v('hp_max'))}`;
    focBar.fill.style.width = `${(v('foc') / Math.max(1, v('foc_max'))) * 100}%`;
    focBar.text.textContent = `${Math.floor(v('foc'))}/${Math.floor(v('foc_max'))}`;
    const playerTurn = phase === 'player';
    setEnabled(btnAttack, playerTurn);
    setEnabled(btnSpec, playerTurn && v('foc') >= SPEC_COST);
    setEnabled(btnScan, playerTurn && canScan && !scanned && v('foc') >= SCAN_COST);
    setEnabled(btnGuard, playerTurn);
    setEnabled(btnItem, playerTurn && consumables().length > 0);
    setEnabled(btnDodge, phase === 'telegraph' && !reactionSpent);
    setEnabled(btnParry, phase === 'telegraph' && !reactionSpent);
    if (!playerTurn) itemStrip.style.display = 'none';
    renderSig();
  }

  function say(text: string) { log.textContent = text; }

  /** Ход игрока сделан — моб замахивается */
  function passTurnToMob() {
    phase = 'over'; // блокируем кнопки до замаха
    refresh();
    setTimeout(startTelegraph, 650);
  }

  // ---------- механика ----------
  function playerAttack(spec: boolean) {
    if (phase !== 'player') return;
    if (spec) {
      if (v('foc') < SPEC_COST) return;
      setV('foc', v('foc') - SPEC_COST);
    }
    const variance = 0.85 + Math.random() * 0.3;
    let dmg = Math.max(1, v('atk') * variance - mob.def);
    const isCrit = Math.random() * 100 < v('crit_chance');
    if (isCrit) dmg *= v('crit_pow') / 100;
    if (spec) dmg *= SPEC_MULT;
    dmg = Math.round(dmg);
    mobHp -= dmg;
    say(`${spec ? 'Спецудар' : 'Атака'}: ${dmg} урона${isCrit ? ' — КРИТ!' : ''}`);
    if (mobHp <= 0) { win(); return; }
    passTurnToMob();
  }

  function playerScan() {
    if (phase !== 'player' || !canScan || scanned || v('foc') < SCAN_COST) return;
    setV('foc', v('foc') - SCAN_COST);
    scanned = true;
    const names = attacks.map((a) => a.name).join(', ');
    say(`Осколок вскрывает сигнатуру: защита ${mob.def}, атаки — ${names}.`);
    passTurnToMob();
  }

  function playerGuard() {
    if (phase !== 'player') return;
    guarding = true;
    say('Ты уходишь в защиту: удар пройдёт вполсилы и вернёт фокус.');
    passTurnToMob();
  }

  function toggleItemStrip() {
    if (phase !== 'player') return;
    if (itemStrip.style.display !== 'none') { itemStrip.style.display = 'none'; return; }
    itemStrip.innerHTML = '';
    for (const c of consumables()) {
      const b = document.createElement('div');
      b.textContent = `✚ ${c.name} ×${c.qty}`;
      b.style.cssText = `padding:0.45em 0.9em;border:1px solid #b39cf044;color:#b39cf0;
        cursor:pointer;user-select:none;font-size:0.62em;letter-spacing:2px;`;
      b.onmouseenter = () => { b.style.borderColor = '#b39cf0'; };
      b.onmouseleave = () => { b.style.borderColor = '#b39cf044'; };
      b.onclick = () => {
        if (phase !== 'player') return;
        itemStrip.style.display = 'none';
        engine.useItem(c.index);
        say(`Использовано: ${c.name}.`);
        passTurnToMob();
      };
      itemStrip.appendChild(b);
    }
    itemStrip.style.display = 'flex';
  }

  function startTelegraph() {
    phase = 'telegraph';
    reactionSpent = false;
    currentAttack = pickAttack();
    telegraphStart = performance.now();
    teleWrap.style.opacity = '1';
    teleLabel.style.opacity = '1';
    // окно реакции: шире с ловкостью
    const windowMs = Math.min(currentAttack.telegraphMs, 350 + v('agi') * 15);
    zoneMark.style.width = `${(windowMs / currentAttack.telegraphMs) * 100}%`;
    if (scanned && attacks.length > 1) {
      teleLabel.textContent = `${currentAttack.name.toUpperCase()} — ЖМИ В ЗЕЛЁНОЙ ЗОНЕ`;
      say(`${mob.name}: ${currentAttack.name}!`);
    } else {
      teleLabel.textContent = 'ТОЧНЫЙ УДАР — ЖМИ В ЗЕЛЁНОЙ ЗОНЕ';
      say(`${mob.name} замахивается — жми в зелёной зоне!`);
    }
    refresh();

    const tick = (now: number) => {
      const elapsed = now - telegraphStart;
      const left = Math.max(0, currentAttack.telegraphMs - elapsed);
      teleFill.style.width = `${(left / currentAttack.telegraphMs) * 100}%`;
      if (left <= 0) { mobHit('Ты не успел среагировать!'); return; }
      if (phase === 'telegraph') rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function reactionWindowLeft(): number {
    return Math.max(0, currentAttack.telegraphMs - (performance.now() - telegraphStart));
  }

  function tryDodge() {
    if (phase !== 'telegraph' || reactionSpent) return;
    const left = reactionWindowLeft();
    const windowMs = Math.min(currentAttack.telegraphMs, 350 + v('agi') * 15);
    if (left <= windowMs) {
      endTelegraph();
      guarding = false;
      say('Уклон! Урон избегнут.');
      playerTurn();
    } else {
      reactionSpent = true;
      say('Слишком рано! Попытка потрачена.');
      refresh();
    }
  }

  function tryParry() {
    if (phase !== 'telegraph' || reactionSpent) return;
    const left = reactionWindowLeft();
    const windowMs = Math.min(currentAttack.telegraphMs, 350 + v('agi') * 15) * 0.45;
    if (left <= windowMs) {
      endTelegraph();
      guarding = false;
      const reflected = Math.round(mob.atk * currentAttack.atkMult * PARRY_REFLECT);
      mobHp -= reflected;
      setV('foc', Math.min(v('foc_max'), v('foc') + PARRY_FOC_GAIN));
      say(`Парирование! ${reflected} урона отражено, +${PARRY_FOC_GAIN} фокуса.`);
      if (mobHp <= 0) { win(); return; }
      playerTurn();
    } else {
      reactionSpent = true;
      say('Рано для парирования! Попытка потрачена.');
      refresh();
    }
  }

  function mobHit(prefix: string) {
    endTelegraph();
    const isCrit = Math.random() * 100 < (mob.critChance ?? 0);
    let dmg = Math.max(1, Math.round(mob.atk * currentAttack.atkMult - v('def')));
    if (isCrit) dmg = Math.round(dmg * 1.5);
    const attackName = attacks.length > 1 ? ` (${currentAttack.name})` : '';
    if (guarding) {
      guarding = false;
      dmg = Math.max(1, Math.ceil(dmg * GUARD_REDUCE));
      setV('foc', Math.min(v('foc_max'), v('foc') + GUARD_FOC_GAIN));
      setV('hp', v('hp') - dmg);
      say(`Блок${attackName}: −${dmg} HP, +${GUARD_FOC_GAIN} фокуса.`);
    } else {
      setV('hp', v('hp') - dmg);
      say(`${prefix}${attackName} −${dmg} HP${isCrit ? ' (крит)' : ''}`);
    }
    if (v('hp') <= 0) { lose(); return; }
    playerTurn();
  }

  function endTelegraph() {
    cancelAnimationFrame(rafId);
    teleWrap.style.opacity = '0';
    teleLabel.style.opacity = '0';
    phase = 'over';
    refresh();
  }

  function playerTurn() {
    setTimeout(() => {
      phase = 'player';
      refresh();
    }, 550);
  }

  // ---------- исходы ----------
  function win() {
    endTelegraph();
    say(`${mob.name} повержен!`);
    // счётчик побед (для заданий) — если автор создал переменную kills_total
    const killsId = heroVarId(engine.project, 'kills_total');
    if (killsId) engine.applyEffects([{ varId: killsId, op: 'add', value: 1 }]);
    // награды
    const expId = heroVarId(engine.project, 'exp');
    if (expId && mob.expReward) {
      engine.applyEffects([{ varId: expId, op: 'add', value: mob.expReward }]);
      engine.notify(`+ ${mob.expReward} опыта`, '#e5c07b');
    }
    const curName = engine.project.currencyVarName ?? 'credits';
    const curId = heroVarId(engine.project, curName);
    if (curId && mob.creditsReward) {
      engine.applyEffects([{ varId: curId, op: 'add', value: mob.creditsReward }]);
      engine.notify(`+ ${mob.creditsReward} ⌬`, '#4fd1c5');
    }
    const granted = mob.drops.filter((d) => Math.random() * 100 < d.chance);
    if (granted.length) {
      engine.giveItems(granted.map((d) => ({ itemId: d.itemId, qty: d.qty })));
    }
    finish(true);
  }

  function lose() {
    endTelegraph();
    setV('hp', 1); // поражение не убивает — герой уползает
    say('Ты повержен…');
    finish(false);
  }

  function finish(winRes: boolean) {
    phase = 'over';
    refresh();
    window.removeEventListener('keydown', onKey);
    setTimeout(() => {
      layer.remove();
      engine.inCombat = false;
      onEnd(winRes);
    }, 1300);
  }

  // ---------- события ----------
  btnAttack.onclick = () => playerAttack(false);
  btnSpec.onclick = () => playerAttack(true);
  btnScan.onclick = playerScan;
  btnGuard.onclick = playerGuard;
  btnItem.onclick = toggleItemStrip;
  btnDodge.onclick = tryDodge;
  btnParry.onclick = tryParry;

  // хоткеи (e.code — не зависит от раскладки)
  const onKey = (e: KeyboardEvent) => {
    if (!layer.isConnected) { window.removeEventListener('keydown', onKey); return; }
    if (e.repeat) return;
    switch (e.code) {
      case 'Space': e.preventDefault(); tryDodge(); break;
      case 'KeyE': tryParry(); break;
      case 'KeyA': playerAttack(false); break;
      case 'KeyS': playerAttack(true); break;
      case 'KeyD': playerGuard(); break;
    }
  };
  window.addEventListener('keydown', onKey);

  refresh();
}
