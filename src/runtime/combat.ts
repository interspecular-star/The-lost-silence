// ============================================================
// Боевая система: пошаговые QTE-окна.
// Ход игрока: Атака / Спецудар (фокус).
// Ход моба: замах (полоса) → Уклон / Парирование в окне реакции.
// ============================================================

import { MobDef, CANVAS_W } from '../core/types';
import { heroVarId } from '../core/hero';
import { mobIcon } from '../core/hero';
import type { Engine } from './engine';

const SPEC_COST = 25;        // фокус за спецудар
const SPEC_MULT = 1.8;       // множитель спецудара
const PARRY_REFLECT = 0.5;   // доля отражённого урона
const PARRY_FOC_GAIN = 10;   // фокус за успешное парирование

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

  let mobHp = mob.hp;
  let phase: 'player' | 'telegraph' | 'over' = 'player';
  let telegraphTimer = 0;
  let telegraphStart = 0;
  let reactionSpent = false;
  let rafId = 0;

  // ---------- UI ----------
  const layer = document.createElement('div');
  layer.style.cssText = `position:absolute;inset:0;z-index:40;pointer-events:auto;
    background:rgba(3,6,9,0.88);backdrop-filter:blur(3px);display:flex;flex-direction:column;
    align-items:center;justify-content:space-between;font-size:calc(28 * 100cqw / ${CANVAS_W});
    color:#cfd9e2;padding:3% 6%;`;
  engine.root.appendChild(layer);

  // — моб —
  const mobBox = document.createElement('div');
  mobBox.style.cssText = 'display:flex;align-items:center;gap:1em;';
  const mobImg = document.createElement('img');
  mobImg.src = mobIcon(mob);
  mobImg.style.cssText = 'width:4.5em;height:4.5em;border-radius:0.5em;';
  mobBox.appendChild(mobImg);
  const mobInfo = document.createElement('div');
  const mobName = document.createElement('div');
  mobName.textContent = mob.name;
  mobName.style.cssText = 'font-size:1.1em;font-weight:600;color:#e06c75;letter-spacing:1px;';
  mobInfo.appendChild(mobName);
  const mobHpBar = bar('#e06c75', '14em');
  mobInfo.appendChild(mobHpBar.wrap);
  mobBox.appendChild(mobInfo);
  layer.appendChild(mobBox);

  // — центр: лог + полоса замаха —
  const mid = document.createElement('div');
  mid.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0.8em;width:60%;';
  const log = document.createElement('div');
  log.style.cssText = 'min-height:2.6em;text-align:center;font-size:0.85em;opacity:0.9;line-height:1.5;';
  log.textContent = `${mob.name} приближается!`;
  mid.appendChild(log);
  const teleWrap = document.createElement('div');
  teleWrap.style.cssText = `width:100%;height:0.8em;border-radius:1em;background:rgba(255,255,255,0.08);
    overflow:hidden;opacity:0;transition:opacity .15s;position:relative;`;
  const teleFill = document.createElement('div');
  teleFill.style.cssText = 'height:100%;width:100%;background:#e5c07b;border-radius:1em;';
  teleWrap.appendChild(teleFill);
  const zoneMark = document.createElement('div');
  zoneMark.style.cssText = `position:absolute;top:0;bottom:0;left:0;background:rgba(152,195,121,0.25);
    border-right:2px solid #98c379;`;
  teleWrap.appendChild(zoneMark);
  mid.appendChild(teleWrap);
  layer.appendChild(mid);

  // — игрок: полосы + кнопки —
  const bottom = document.createElement('div');
  bottom.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0.7em;width:70%;';
  const heroBars = document.createElement('div');
  heroBars.style.cssText = 'display:flex;gap:1.5em;align-items:center;';
  const hpBar = bar('#98c379', '11em', 'HP');
  const focBar = bar('#7db8f0', '11em', 'FOC');
  heroBars.append(hpBar.wrap, focBar.wrap);
  bottom.appendChild(heroBars);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:0.8em;';
  const btnAttack = combatBtn('⚔ Атака', '#e6edf3');
  const btnSpec = combatBtn(`✦ Спецудар (${SPEC_COST})`, '#b39cf0');
  const btnDodge = combatBtn('➟ Уклон', '#98c379');
  const btnParry = combatBtn('🛡 Парировать', '#e5c07b');
  buttons.append(btnAttack, btnSpec, btnDodge, btnParry);
  bottom.appendChild(buttons);
  layer.appendChild(bottom);

  function bar(color: string, width: string, label?: string) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:0.4em;';
    if (label) {
      const l = document.createElement('span');
      l.textContent = label;
      l.style.cssText = 'font-size:0.6em;opacity:0.6;letter-spacing:1px;';
      wrap.appendChild(l);
    }
    const outer = document.createElement('div');
    outer.style.cssText = `width:${width};height:0.55em;border-radius:1em;
      background:rgba(255,255,255,0.09);overflow:hidden;`;
    const fill = document.createElement('div');
    fill.style.cssText = `height:100%;width:100%;background:${color};border-radius:1em;transition:width .25s;`;
    outer.appendChild(fill);
    wrap.appendChild(outer);
    const text = document.createElement('span');
    text.style.cssText = 'font-size:0.65em;opacity:0.75;min-width:4em;';
    wrap.appendChild(text);
    return { wrap, fill, text };
  }

  function combatBtn(label: string, color: string): HTMLElement {
    const b = document.createElement('div');
    b.textContent = label;
    b.style.cssText = `padding:0.55em 1.1em;border-radius:0.45em;border:1px solid ${color}55;
      color:${color};background:rgba(12,18,24,0.9);cursor:pointer;user-select:none;
      font-size:0.85em;transition:filter .12s,opacity .12s;`;
    return b;
  }

  function setEnabled(el: HTMLElement, on: boolean) {
    el.style.opacity = on ? '1' : '0.28';
    el.style.pointerEvents = on ? 'auto' : 'none';
  }

  function refresh() {
    mobHpBar.fill.style.width = `${Math.max(0, (mobHp / mob.hp) * 100)}%`;
    mobHpBar.text.textContent = `${Math.max(0, Math.ceil(mobHp))}/${mob.hp}`;
    hpBar.fill.style.width = `${(v('hp') / Math.max(1, v('hp_max'))) * 100}%`;
    hpBar.text.textContent = `${Math.floor(v('hp'))}/${Math.floor(v('hp_max'))}`;
    focBar.fill.style.width = `${(v('foc') / Math.max(1, v('foc_max'))) * 100}%`;
    focBar.text.textContent = `${Math.floor(v('foc'))}/${Math.floor(v('foc_max'))}`;
    const playerTurn = phase === 'player';
    setEnabled(btnAttack, playerTurn);
    setEnabled(btnSpec, playerTurn && v('foc') >= SPEC_COST);
    setEnabled(btnDodge, phase === 'telegraph' && !reactionSpent);
    setEnabled(btnParry, phase === 'telegraph' && !reactionSpent);
  }

  function say(text: string) { log.textContent = text; }

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
    refresh();
    setTimeout(startTelegraph, 650);
    phase = 'over'; // блокируем кнопки до замаха
    refresh();
  }

  function startTelegraph() {
    phase = 'telegraph';
    reactionSpent = false;
    telegraphStart = performance.now();
    teleWrap.style.opacity = '1';
    // окно реакции: шире с ловкостью
    const windowMs = Math.min(mob.telegraphMs, 350 + v('agi') * 15);
    zoneMark.style.width = `${(windowMs / mob.telegraphMs) * 100}%`;
    say(`${mob.name} замахивается — жми в зелёной зоне!`);
    refresh();

    const tick = (now: number) => {
      const elapsed = now - telegraphStart;
      const left = Math.max(0, mob.telegraphMs - elapsed);
      teleFill.style.width = `${(left / mob.telegraphMs) * 100}%`;
      if (left <= 0) { mobHit('Ты не успел среагировать!'); return; }
      if (phase === 'telegraph') rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    void telegraphTimer;
  }

  function reactionWindowLeft(): number {
    return Math.max(0, mob.telegraphMs - (performance.now() - telegraphStart));
  }

  function tryDodge() {
    if (phase !== 'telegraph' || reactionSpent) return;
    const left = reactionWindowLeft();
    const windowMs = Math.min(mob.telegraphMs, 350 + v('agi') * 15);
    if (left <= windowMs) {
      endTelegraph();
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
    const windowMs = Math.min(mob.telegraphMs, 350 + v('agi') * 15) * 0.45;
    if (left <= windowMs) {
      endTelegraph();
      const reflected = Math.round(mob.atk * PARRY_REFLECT);
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
    let dmg = Math.max(1, mob.atk - v('def'));
    if (isCrit) dmg = Math.round(dmg * 1.5);
    setV('hp', v('hp') - dmg);
    say(`${prefix} −${dmg} HP${isCrit ? ' (крит)' : ''}`);
    if (v('hp') <= 0) { lose(); return; }
    playerTurn();
  }

  function endTelegraph() {
    cancelAnimationFrame(rafId);
    teleWrap.style.opacity = '0';
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
    setTimeout(() => {
      layer.remove();
      engine.inCombat = false;
      onEnd(winRes);
    }, 1300);
  }

  // ---------- события ----------
  btnAttack.onclick = () => playerAttack(false);
  btnSpec.onclick = () => playerAttack(true);
  btnDodge.onclick = tryDodge;
  btnParry.onclick = tryParry;

  refresh();
}
