// ============================================================
// Канал Архона — «шёпот» (H3, docs/dev/design-whisper.md).
// Неблокирующая полоса под HUD: печатающийся текст, глиф ◈,
// чипы-ответы (клик по полосе или Q), молчание = ответ.
// Игру не останавливает; mesh_on=false глушит канал полностью.
// ============================================================

import { WhisperDef, WhisperChip, Project } from '../core/types';
import type { Engine } from './engine';
import { renderRichInto } from './textfx';

/** Гарантирует переменные канала: mesh_on / mesh_ignored / mesh_answered (для условий) */
export function ensureWhisperVars(project: Project) {
  const specs: [string, string, 'boolean' | 'number', boolean | number][] = [
    ['mesh_on', 'Mesh (Осколок) включён', 'boolean', true],
    ['mesh_ignored', 'Шёпотов проигнорировано', 'number', 0],
    ['mesh_answered', 'Ответов голосу', 'number', 0],
  ];
  for (const [name, title, type, initial] of specs) {
    if (!project.variables.some((v) => v.name === name)) {
      project.variables.push({
        id: `var_${name}`, name, title, type, initial,
      } as Project['variables'][number]);
    }
  }
}

/** Запись журнала шёпота (хранится в сейве, последние 50) */
export interface WhisperLogEntry {
  text: string;          // что сказал голос (без разметки не чистим — журнал рисует rich)
  answer?: string;       // выбранный чип; отсутствует = «— промолчал» (если чипы были)
  hadChips?: boolean;
  at: number;            // timestamp
}

export class WhisperSystem {
  shown = new Set<string>();          // не-repeatable, уже прозвучавшие
  log: WhisperLogEntry[] = [];
  private queue: string[] = [];
  private activeDef: WhisperDef | null = null;
  private bar: HTMLElement | null = null;
  private chipsOpen = false;
  private answered = false;
  private rereading = false;   // показ из глифа «перечитать» — без журнала и счётчиков
  private layer: HTMLElement;
  private glyph: HTMLElement | null = null;
  private timers: number[] = [];
  // общий тайминг канала (для idle-пауз): отсчёт тишины — со старта игры,
  // иначе первый idle-шёпот выстреливал мгновенно («молчали с 1970 года»)
  private lastShownAt = Date.now();
  private cooldowns: Record<string, number> = {}; // id → когда можно снова (repeatable)
  private destroyed = false;

  constructor(private eng: Engine) {
    ensureWhisperStyles();
    this.layer = document.createElement('div');
    this.layer.className = 'ws-layer';
    this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:40;';
    eng.root.appendChild(this.layer);
    document.addEventListener('keydown', this.onKey);
  }

  destroy() {
    this.destroyed = true;
    for (const t of this.timers) clearTimeout(t);
    document.removeEventListener('keydown', this.onKey);
    this.layer.remove();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.code !== 'KeyQ') return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    if (this.activeDef) { this.toggleChips(); e.preventDefault(); }
  };

  private later(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(() => { if (!this.destroyed) fn(); }, ms));
  }

  // ---------- канал включён? ----------
  private meshOn(): boolean {
    const v = this.eng.project.variables.find((x) => x.name === 'mesh_on');
    if (!v) return true; // переменной нет — канал открыт (удобно для тестов)
    return this.eng.state[v.id] !== false;
  }

  private bump(varName: 'mesh_ignored' | 'mesh_answered') {
    const v = this.eng.project.variables.find((x) => x.name === varName);
    if (!v) return;
    this.eng.state[v.id] = Number(this.eng.state[v.id] ?? 0) + 1;
    this.eng.opts.onVarsChanged?.(this.eng.state);
  }

  // ---------- триггеры (зовёт движок) ----------
  onSceneEnter(sceneId: string) {
    this.collect('enterScene', (w) => !w.sceneId || w.sceneId === sceneId);
  }

  onDialogueEnd(dialogueId: string | undefined) {
    this.collect('dialogueEnd', (w) => !w.dialogueId || w.dialogueId === dialogueId);
  }

  /** Ручной запуск (эффект «прошептать», лаборатория, отладка) */
  whisper(id: string, jumpQueue = false) {
    const def = (this.eng.project.whispers ?? []).find((w) => w.id === id);
    if (!def) return;
    if (jumpQueue) this.queue.unshift(id);
    else this.enqueue(def);
    this.pump();
  }

  /** Тик раз в секунду: качаем очередь + idle-шёпоты */
  tick() {
    if (!this.meshOn()) return;
    // idle: тишина в канале дольше кулдауна, вне боя и диалога
    if (!this.activeDef && this.queue.length === 0 && !this.eng.inCombat && !this.eng.isDialogueActive()) {
      const now = Date.now();
      for (const w of this.eng.project.whispers ?? []) {
        if (w.trigger !== 'idle') continue;
        if (!this.canPlay(w)) continue;
        const cdMs = (w.cooldownMin ?? 3) * 60_000;
        if (now - this.lastShownAt < cdMs) continue;
        if (now < (this.cooldowns[w.id] ?? 0)) continue;
        this.enqueue(w);
        break;
      }
    }
    this.pump();
  }

  private collect(trigger: WhisperDef['trigger'], match: (w: WhisperDef) => boolean) {
    if (!this.meshOn()) return;
    for (const w of this.eng.project.whispers ?? []) {
      if (w.trigger !== trigger || !match(w)) continue;
      if (this.canPlay(w)) this.enqueue(w);
    }
    this.pump();
  }

  private canPlay(w: WhisperDef): boolean {
    if (!w.repeatable && this.shown.has(w.id)) return false;
    if (w.repeatable && Date.now() < (this.cooldowns[w.id] ?? 0)) return false;
    if (this.queue.includes(w.id) || this.activeDef?.id === w.id) return false;
    return this.eng.checkConditions(w.conditions);
  }

  private enqueue(w: WhisperDef) {
    if (this.queue.length >= 3) return;         // Архон не бубнит
    if (w.priority === 'important') this.queue.unshift(w.id);
    else this.queue.push(w.id);
  }

  private pump() {
    if (this.activeDef || this.queue.length === 0) return;
    if (!this.meshOn()) { this.queue = []; return; }
    if (this.eng.inCombat) return;              // подождём паузу боя
    const id = this.queue.shift()!;
    const def = (this.eng.project.whispers ?? []).find((w) => w.id === id);
    if (!def) { this.pump(); return; }
    const show = () => this.show(def);
    if (def.delaySec) this.later(show, def.delaySec * 1000);
    else show();
  }

  // ---------- полоса ----------
  private show(def: WhisperDef) {
    if (this.activeDef) { this.queue.unshift(def.id); return; }
    this.activeDef = def;
    this.answered = false;
    this.chipsOpen = false;
    this.shown.add(def.id);
    this.lastShownAt = Date.now();
    if (def.repeatable) this.cooldowns[def.id] = Date.now() + (def.cooldownMin ?? 3) * 60_000;
    this.glyph?.remove(); this.glyph = null;

    const bar = document.createElement('div');
    bar.className = 'ws-bar';
    if (this.eng.isDialogueActive()) bar.classList.add('ws-dimmed');
    const inner = document.createElement('div');
    inner.className = 'ws-inner';
    const g = document.createElement('span');
    g.className = 'ws-glyph';
    g.textContent = '◈';
    const txt = document.createElement('span');
    txt.className = 'ws-text';
    renderRichInto(txt, `[type]${this.eng.interpolate(def.text)}[/]`);
    inner.append(g, txt);
    if (def.chips?.length) {
      const hint = document.createElement('span');
      hint.className = 'ws-hint';
      hint.textContent = 'ОТВЕТИТЬ · Q';
      inner.appendChild(hint);
    }
    bar.appendChild(inner);
    const line = document.createElement('div');
    line.className = 'ws-line';
    bar.appendChild(line);
    bar.onclick = () => this.toggleChips();
    this.layer.appendChild(bar);
    this.bar = bar;
    requestAnimationFrame(() => bar.classList.add('ws-in'));

    const holdMs = (def.holdSec ?? 6) * 1000 + def.text.length * 30;
    this.later(() => { if (this.activeDef === def && !this.chipsOpen) this.dismiss(); }, holdMs);
  }

  private toggleChips() {
    const def = this.activeDef;
    if (!def || !this.bar) return;
    if (!def.chips?.length) { this.dismiss(); return; } // без чипов клик просто закрывает
    if (this.chipsOpen) return;
    this.chipsOpen = true;
    const rowEl = document.createElement('div');
    rowEl.className = 'ws-chips';
    for (const chip of def.chips.slice(0, 3)) {
      const b = document.createElement('button');
      b.className = 'ws-chip';
      renderRichInto(b, this.eng.interpolate(chip.text), { hoverRoot: b });
      b.onclick = (e) => { e.stopPropagation(); this.answer(chip); };
      rowEl.appendChild(b);
    }
    this.bar.appendChild(rowEl);
    requestAnimationFrame(() => rowEl.classList.add('ws-in'));
  }

  private answer(chip: WhisperChip) {
    const def = this.activeDef;
    if (!def) return;
    this.answered = true;
    this.bump('mesh_answered');
    this.pushLog({ text: def.text, answer: chip.text, hadChips: true, at: Date.now() });
    this.eng.applyEffects(chip.effects);
    this.dismiss(true);
    if (chip.replyWhisperId) this.later(() => this.whisper(chip.replyWhisperId!, true), 900);
  }

  private dismiss(skipLog = false) {
    const def = this.activeDef;
    if (!def || !this.bar) return;
    if (!skipLog && !this.rereading) {
      if (def.chips?.length && !this.answered) this.bump('mesh_ignored');
      this.pushLog({ text: def.text, hadChips: !!def.chips?.length, at: Date.now() });
    }
    this.rereading = false;
    const bar = this.bar;
    this.bar = null;
    this.activeDef = null;
    bar.classList.remove('ws-in');
    this.later(() => bar.remove(), 400);
    this.showGlyph(def);
    this.eng.requestSave();
    this.later(() => this.pump(), 1200);
  }

  /** Свёрнутый глиф ◈: последний шёпот можно перечитать */
  private showGlyph(def: WhisperDef) {
    const g = document.createElement('button');
    g.className = 'ws-mini';
    g.textContent = '◈';
    g.title = 'Перечитать последний шёпот';
    g.onclick = () => {
      g.remove(); this.glyph = null;
      // повторный показ без чипов, журнала и счётчиков — просто перечитать
      this.rereading = true;
      this.show({ ...def, chips: undefined, holdSec: Math.max(def.holdSec ?? 6, 5) });
    };
    this.layer.appendChild(g);
    this.glyph = g;
    requestAnimationFrame(() => g.classList.add('ws-in'));
  }

  private pushLog(e: WhisperLogEntry) {
    this.log.push(e);
    if (this.log.length > 50) this.log = this.log.slice(-50);
  }
}

// ---------- стили ----------
let injected = false;
export function ensureWhisperStyles() {
  if (injected || document.getElementById('tls-whisper-styles')) { injected = true; return; }
  injected = true;
  const st = document.createElement('style');
  st.id = 'tls-whisper-styles';
  st.textContent = `
.ws-bar {
  position: absolute;
  left: 0; right: 0;
  top: 8.5%;
  pointer-events: auto;
  cursor: pointer;
  background: color-mix(in srgb, #0a0f16 94%, transparent);
  backdrop-filter: blur(14px);
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity .3s ease, transform .3s ease;
  font-size: calc(26 * 100cqw / 1920);
}
.ws-bar.ws-in { opacity: 1; transform: translateY(0); }
.ws-bar.ws-dimmed { opacity: 0.8; }
.ws-inner {
  display: flex; align-items: baseline; gap: 0.7em;
  padding: 0.55em 1.6em 0.6em;
  color: #cfd9e2;
}
.ws-glyph {
  flex: 0 0 auto;
  color: #7ee8dc;
  animation: ws-glyph-a 2.8s ease-in-out infinite;
}
.ws-text { flex: 1; line-height: 1.35; }
.ws-hint {
  flex: 0 0 auto;
  font-size: 0.6em; letter-spacing: 2px;
  color: color-mix(in srgb, #7ee8dc 55%, transparent);
  animation: ws-glyph-a 2.8s ease-in-out infinite;
}
.ws-line {
  height: 1px;
  background: linear-gradient(90deg, transparent, #4fd1c5 30%, #7db8f0 70%, transparent);
  animation: ws-spectrum 9s ease-in-out infinite;
}
.ws-chips {
  display: flex; gap: 0.6em;
  padding: 0 1.6em 0.7em;
  opacity: 0; transform: translateY(-4px);
  transition: opacity .25s ease, transform .25s ease;
}
.ws-chips.ws-in { opacity: 1; transform: none; }
.ws-chip {
  pointer-events: auto;
  background: color-mix(in srgb, #7ee8dc 8%, transparent);
  border: 1px solid color-mix(in srgb, #7ee8dc 30%, transparent);
  border-radius: 999px;
  color: #cfe8e4;
  font: inherit; font-size: 0.75em;
  padding: 0.3em 1.1em;
  cursor: pointer;
  transition: background .15s, border-color .15s;
}
.ws-chip:hover {
  background: color-mix(in srgb, #7ee8dc 18%, transparent);
  border-color: #7ee8dc;
}
.ws-mini {
  position: absolute;
  top: 8.5%; right: 1.2%;
  pointer-events: auto;
  background: none; border: none; cursor: pointer;
  color: color-mix(in srgb, #7ee8dc 45%, transparent);
  font-size: calc(24 * 100cqw / 1920);
  opacity: 0; transition: opacity .4s ease;
  animation: ws-glyph-a 3.5s ease-in-out infinite;
}
.ws-mini.ws-in { opacity: 1; }
.ws-mini:hover { color: #7ee8dc; }
@keyframes ws-glyph-a { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
@keyframes ws-spectrum { 0%,100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(45deg); } }
@media (prefers-reduced-motion: reduce) {
  .ws-glyph, .ws-hint, .ws-line, .ws-mini { animation: none !important; }
  .ws-bar, .ws-chips { transition: none; }
}
`;
  document.head.appendChild(st);
}
