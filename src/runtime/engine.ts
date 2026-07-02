// ============================================================
// Runtime-движок The Lost Silence.
// Рендерит сцены, играет диалоги, считает переменные/репутацию.
// Используется предпросмотром редактора и экспортированной игрой.
// ============================================================

import {
  Project, Scene, SceneElement, Dialogue, DialogueNode,
  Condition, Effect, VarValue, CANVAS_W, CANVAS_H,
} from '../core/types';
import { materializeFactionReps, computeFactionRep, npcPortrait } from '../core/npc';

export interface EngineOptions {
  onVarsChanged?: (state: Record<string, VarValue>) => void;
  onSceneChanged?: (scene: Scene) => void;
  /** Сохранять прогресс игрока (localStorage) и считать оффлайн-прогресс. Для предпросмотра — false. */
  persist?: boolean;
}

interface SaveData {
  vars: Record<string, VarValue>;
  sceneId: string | null;
  savedAt: number;
}

export class Engine {
  project: Project;
  root: HTMLElement;          // контейнер 16:9 (масштабируется снаружи)
  state: Record<string, VarValue> = {};
  opts: EngineOptions;

  private sceneLayer: HTMLElement;
  private hudLayer!: HTMLElement;
  private dialogueLayer: HTMLElement;
  private factionPanelOpen = false;
  private currentScene: Scene | null = null;
  private currentDialogue: Dialogue | null = null;
  private tickTimer: number | undefined;
  private saveTimer: number | undefined;
  private destroyed = false;

  constructor(project: Project, root: HTMLElement, opts: EngineOptions = {}) {
    this.project = project;
    this.root = root;
    this.opts = opts;

    root.innerHTML = '';
    root.style.position = 'relative';
    root.style.overflow = 'hidden';
    root.style.fontFamily = project.theme.font;

    this.sceneLayer = document.createElement('div');
    this.sceneLayer.style.cssText = 'position:absolute;inset:0;';
    this.hudLayer = document.createElement('div');
    this.hudLayer.style.cssText = `position:absolute;inset:0;pointer-events:none;
      font-size:calc(26 * 100cqw / ${CANVAS_W});`;
    this.dialogueLayer = document.createElement('div');
    this.dialogueLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    root.appendChild(this.sceneLayer);
    root.appendChild(this.hudLayer);
    root.appendChild(this.dialogueLayer);

    for (const v of project.variables) this.state[v.id] = v.initial;
    materializeFactionReps(project, this.state);
  }

  /** Уровень Осколка (0 — устройства нет) */
  get oskolokLevel(): number {
    const name = this.project.oskolokVarName;
    if (!name) return 99; // переменная не настроена — ничего не скрываем
    const def = this.project.variables.find((v) => v.name === name);
    return def ? Number(this.state[def.id] ?? 0) : 99;
  }

  start() {
    let startId = this.project.startSceneId ?? this.project.scenes[0]?.id;

    // восстановление сохранения + оффлайн-прогресс
    if (this.opts.persist) {
      const save = this.loadSave();
      if (save) {
        for (const v of this.project.variables) {
          if (save.vars[v.id] !== undefined) this.state[v.id] = save.vars[v.id];
        }
        if (save.sceneId && this.project.scenes.some((s) => s.id === save.sceneId)) {
          startId = save.sceneId;
        }
        const offlineMin = Math.max(0, (Date.now() - save.savedAt) / 60000);
        this.applyIdle(offlineMin, true);
      }
    }

    if (startId) this.gotoScene(startId);
    this.opts.onVarsChanged?.(this.state);
    this.startIdleTicks();
  }

  /** Останавливает таймеры (вызывать при закрытии предпросмотра) */
  destroy() {
    this.destroyed = true;
    clearInterval(this.tickTimer);
    clearTimeout(this.saveTimer);
  }

  // ---------- idle-системы ----------
  private startIdleTicks() {
    const rules = this.project.idleRules?.filter((r) => r.enabled) ?? [];
    if (rules.length === 0) return;
    this.tickTimer = window.setInterval(() => {
      if (this.destroyed) return;
      this.applyIdle(1 / 60, false); // тик раз в секунду
    }, 1000);
  }

  /** Начисляет idle-прирост за minutes минут. offlineOnly=true — только правила с offline. */
  private applyIdle(minutes: number, offlineOnly: boolean) {
    const rules = this.project.idleRules?.filter((r) => r.enabled) ?? [];
    let changed = false;
    for (const r of rules) {
      if (offlineOnly && !r.offline) continue;
      if (!this.checkConditions(r.conditions)) continue;
      const cur = Number(this.state[r.varId] ?? 0);
      let next = cur + r.ratePerMin * minutes;
      if (r.max !== undefined) next = Math.min(next, Math.max(cur, r.max));
      if (next !== cur) {
        this.state[r.varId] = Math.round(next * 1000) / 1000;
        changed = true;
      }
    }
    if (changed) {
      this.opts.onVarsChanged?.(this.state);
      this.renderScene();
      this.scheduleSave();
    }
  }

  // ---------- сохранение прогресса ----------
  private saveKey(): string {
    return `tls_save_${this.project.meta.name}`;
  }

  private loadSave(): SaveData | null {
    try {
      const raw = localStorage.getItem(this.saveKey());
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s && typeof s.savedAt === 'number' && s.vars) return s as SaveData;
    } catch { /* повреждено или нет доступа */ }
    return null;
  }

  private scheduleSave() {
    if (!this.opts.persist) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        const data: SaveData = {
          vars: this.state,
          sceneId: this.currentScene?.id ?? null,
          savedAt: Date.now(),
        };
        localStorage.setItem(this.saveKey(), JSON.stringify(data));
      } catch { /* нет доступа к хранилищу */ }
    }, 400);
  }

  // ---------- переменные ----------
  /** Подставляет значения переменных в текст: «Кредиты: {credits}» */
  interpolate(text: string): string {
    return text.replace(/\{(\w+)\}/g, (match, name: string) => {
      const def = this.project.variables.find((v) => v.name === name);
      if (!def) return match;
      const val = this.state[def.id];
      if (typeof val === 'boolean') return val ? 'да' : 'нет';
      if (typeof val === 'number') return String(Math.floor(val));
      return String(val ?? '');
    });
  }

  checkConditions(conds: Condition[] | undefined): boolean {
    if (!conds || conds.length === 0) return true;
    return conds.every((c) => {
      const cur = this.state[c.varId];
      const v = c.value;
      switch (c.op) {
        case 'eq': return cur === v || String(cur) === String(v);
        case 'ne': return cur !== v && String(cur) !== String(v);
        case 'gt': return Number(cur) > Number(v);
        case 'gte': return Number(cur) >= Number(v);
        case 'lt': return Number(cur) < Number(v);
        case 'lte': return Number(cur) <= Number(v);
      }
    });
  }

  applyEffects(effects: Effect[] | undefined) {
    if (!effects || effects.length === 0) return;
    const isComputed = (id: string) =>
      this.project.variables.find((v) => v.id === id)?.category === 'computed';
    const isRelation = (id: string) =>
      this.project.npcs?.some((n) => n.relationVarId === id) ?? false;
    for (const e of effects) {
      if (isComputed(e.varId)) continue; // вычисляемые менять нельзя
      const cur = this.state[e.varId];
      switch (e.op) {
        case 'set': this.state[e.varId] = e.value; break;
        case 'add': this.state[e.varId] = Number(cur ?? 0) + Number(e.value); break;
        case 'sub': this.state[e.varId] = Number(cur ?? 0) - Number(e.value); break;
        case 'toggle': this.state[e.varId] = !cur; break;
      }
      // отношения NPC зажаты в 0..100
      if (isRelation(e.varId)) {
        this.state[e.varId] = Math.max(0, Math.min(100, Number(this.state[e.varId]) || 0));
      }
    }
    materializeFactionReps(this.project, this.state);
    this.opts.onVarsChanged?.(this.state);
    this.renderScene(); // условная видимость элементов могла измениться
    this.scheduleSave();
  }

  // ---------- сцены ----------
  gotoScene(id: string) {
    const scene = this.project.scenes.find((s) => s.id === id);
    if (!scene) return;
    this.currentScene = scene;
    this.renderScene();
    this.opts.onSceneChanged?.(scene);
    this.scheduleSave();
    if (scene.onEnterDialogueId) this.startDialogue(scene.onEnterDialogueId);
  }

  private renderScene() {
    const scene = this.currentScene;
    if (!scene) return;
    this.sceneLayer.innerHTML = '';
    this.sceneLayer.style.background = scene.background;
    if (scene.bgImage) {
      this.sceneLayer.style.backgroundImage = `url(${scene.bgImage})`;
      this.sceneLayer.style.backgroundSize = 'cover';
      this.sceneLayer.style.backgroundPosition = 'center';
    }

    const sorted = [...scene.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    for (const el of sorted) {
      if (el.visible === false) continue;
      if (!this.checkConditions(el.visibleIf)) continue;
      this.sceneLayer.appendChild(this.renderElement(el));
    }
    this.renderHUD();
  }

  // ---------- HUD Осколка ----------
  private renderHUD() {
    this.hudLayer.innerHTML = '';
    const factions = this.project.factions ?? [];
    // панель фракций доступна с ур.2 Осколка
    if (this.oskolokLevel < 2 || factions.length === 0) return;

    const btn = document.createElement('div');
    btn.textContent = '◈';
    btn.title = 'Осколок: репутация фракций';
    btn.style.cssText = `position:absolute;top:2.5%;left:2%;width:1.7em;height:1.7em;
      display:flex;align-items:center;justify-content:center;border-radius:0.4em;
      background:rgba(10,16,22,0.85);border:1px solid ${this.project.theme.accent}55;
      color:${this.project.theme.accent};cursor:pointer;pointer-events:auto;user-select:none;`;
    btn.onclick = () => { this.factionPanelOpen = !this.factionPanelOpen; this.renderHUD(); };
    this.hudLayer.appendChild(btn);

    if (!this.factionPanelOpen) return;
    const panel = document.createElement('div');
    panel.style.cssText = `position:absolute;top:2.5%;left:calc(2% + 2.1em);min-width:11em;
      background:rgba(8,13,18,0.94);border:1px solid rgba(255,255,255,0.1);
      border-radius:0.5em;padding:0.7em 0.9em;pointer-events:auto;
      font-size:0.72em;color:#cfd9e2;backdrop-filter:blur(4px);`;
    const title = document.createElement('div');
    title.textContent = 'РЕПУТАЦИЯ ФРАКЦИЙ';
    title.style.cssText = `letter-spacing:2px;font-size:0.72em;opacity:0.55;margin-bottom:0.7em;`;
    panel.appendChild(title);
    for (const f of factions) {
      const info = computeFactionRep(this.project, f, (id) => this.state[id]);
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:0.6em;';
      const top = document.createElement('div');
      top.style.cssText = 'display:flex;justify-content:space-between;gap:1.5em;';
      const nm = document.createElement('span');
      nm.textContent = f.name;
      nm.style.color = f.color;
      const val = document.createElement('span');
      val.textContent = info.met > 0 ? `${info.rep}%` : '—';
      top.append(nm, val);
      row.appendChild(top);
      const meta = document.createElement('div');
      meta.textContent = `связей: ${info.met} из ${info.total}`;
      meta.style.cssText = 'opacity:0.45;font-size:0.85em;';
      row.appendChild(meta);
      const bar = document.createElement('div');
      bar.style.cssText = `margin-top:0.25em;height:0.25em;border-radius:1em;
        background:rgba(255,255,255,0.1);overflow:hidden;`;
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;width:${info.rep}%;background:${f.color};border-radius:1em;`;
      bar.appendChild(fill);
      row.appendChild(bar);
      panel.appendChild(row);
    }
    this.hudLayer.appendChild(panel);
  }

  renderElement(el: SceneElement): HTMLElement {
    const d = document.createElement('div');
    const s = el.style;
    const pct = (v: number, total: number) => `${(v / total) * 100}%`;
    d.style.cssText = `position:absolute;box-sizing:border-box;
      left:${pct(el.x, CANVAS_W)};top:${pct(el.y, CANVAS_H)};
      width:${pct(el.w, CANVAS_W)};height:${pct(el.h, CANVAS_H)};`;
    if (el.rotation) d.style.transform = `rotate(${el.rotation}deg)`;
    if (s.opacity !== undefined) d.style.opacity = String(s.opacity);

    // Размер шрифта задан в логических px (от 1080p) → переводим в проценты контейнера через cqw
    const fontSize = s.fontSize ?? 24;
    const common = () => {
      if (s.fill) d.style.background = s.fill;
      if (s.radius) d.style.borderRadius = `${s.radius}px`;
      if (s.borderWidth) d.style.border = `${s.borderWidth}px solid ${s.borderColor ?? '#fff'}`;
      if (s.shadow) d.style.boxShadow = '0 8px 32px rgba(0,0,0,0.55)';
      d.style.color = s.textColor ?? '#fff';
      d.style.fontSize = `calc(${fontSize} * 100cqw / ${CANVAS_W})`;
      if (s.fontFamily) d.style.fontFamily = s.fontFamily;
      if (s.fontWeight) d.style.fontWeight = s.fontWeight;
      if (s.fontStyle) d.style.fontStyle = s.fontStyle;
      if (s.letterSpacing) d.style.letterSpacing = `calc(${s.letterSpacing} * 100cqw / ${CANVAS_W})`;
      d.style.lineHeight = String(s.lineHeight ?? 1.4);
      d.style.textAlign = s.textAlign ?? 'left';
      d.style.whiteSpace = 'pre-wrap';
    };

    switch (el.type) {
      case 'text':
        common();
        d.textContent = this.interpolate(el.text ?? '');
        break;
      case 'rect':
        common();
        break;
      case 'button': {
        common();
        d.style.display = 'flex';
        d.style.alignItems = 'center';
        d.style.justifyContent = s.textAlign === 'left' ? 'flex-start' : s.textAlign === 'right' ? 'flex-end' : 'center';
        d.style.cursor = 'pointer';
        d.style.userSelect = 'none';
        d.style.transition = 'filter .15s, transform .1s';
        d.textContent = this.interpolate(el.text ?? '');
        d.onmouseenter = () => { d.style.filter = 'brightness(1.5)'; };
        d.onmouseleave = () => { d.style.filter = ''; };
        break;
      }
      case 'image': {
        if (el.src) {
          const img = document.createElement('img');
          img.src = el.src;
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
          if (s.radius) img.style.borderRadius = `${s.radius}px`;
          d.appendChild(img);
        } else {
          d.style.background = 'rgba(255,255,255,0.06)';
        }
        if (s.opacity !== undefined) d.style.opacity = String(s.opacity);
        break;
      }
      case 'hotspot':
        d.style.cursor = 'pointer';
        break;
    }

    if (el.action && el.action.type !== 'none') {
      d.style.cursor = 'pointer';
      d.addEventListener('click', () => this.runAction(el));
    }
    return d;
  }

  private runAction(el: SceneElement) {
    const a = el.action!;
    if (a.effects) this.applyEffects(a.effects);
    if (a.type === 'gotoScene' && a.sceneId) this.gotoScene(a.sceneId);
    if (a.type === 'startDialogue' && a.dialogueId) this.startDialogue(a.dialogueId);
  }

  // ---------- диалоги ----------
  startDialogue(id: string) {
    const dlg = this.project.dialogues.find((d) => d.id === id);
    if (!dlg || !dlg.startNodeId) return;
    this.currentDialogue = dlg;
    this.showNode(dlg.startNodeId);
  }

  private node(id: string | null | undefined): DialogueNode | null {
    if (!id || !this.currentDialogue) return null;
    return this.currentDialogue.nodes.find((n) => n.id === id) ?? null;
  }

  private showNode(id: string) {
    const n = this.node(id);
    if (!n) { this.endDialogue(); return; }

    switch (n.type) {
      case 'set':
        this.applyEffects(n.effects);
        this.advance(n.next);
        return;
      case 'branch':
        this.advance(this.checkConditions(n.conditions) ? n.nextTrue : n.nextFalse);
        return;
      case 'jump':
        if (n.gotoSceneId) this.gotoScene(n.gotoSceneId);
        this.advance(n.next);
        return;
      case 'end':
        this.endDialogue();
        return;
      case 'line':
        this.renderLine(n);
        return;
      case 'choice':
        this.renderChoice(n);
        return;
    }
  }

  private advance(next: string | null | undefined) {
    if (next) this.showNode(next);
    else this.endDialogue();
  }

  private endDialogue() {
    this.currentDialogue = null;
    this.dialogueLayer.innerHTML = '';
  }

  private makeBox(): HTMLElement {
    const t = this.project.theme;
    this.dialogueLayer.innerHTML = '';
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;left:6%;right:6%;bottom:4%;
      background:${t.dialogueBox};color:${t.dialogueText};
      border:1px solid rgba(255,255,255,0.08);border-radius:10px;
      padding:2.2% 3%;pointer-events:auto;backdrop-filter:blur(6px);
      font-size:calc(30 * 100cqw / ${CANVAS_W});line-height:1.5;`;
    this.dialogueLayer.appendChild(box);
    return box;
  }

  private renderLine(n: DialogueNode) {
    const t = this.project.theme;
    const box = this.makeBox();

    const npc = n.speakerNpcId ? this.project.npcs?.find((x) => x.id === n.speakerNpcId) : undefined;
    if (npc) {
      // первое знакомство
      if (this.state[npc.metVarId] !== true) {
        this.state[npc.metVarId] = true;
        materializeFactionReps(this.project, this.state);
        this.opts.onVarsChanged?.(this.state);
        this.scheduleSave();
      }
      const head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;gap:0.7em;margin-bottom:0.55em;';
      const img = document.createElement('img');
      img.src = npcPortrait(this.project, npc);
      img.style.cssText = `width:2.4em;height:2.4em;border-radius:0.35em;flex:0 0 auto;`;
      head.appendChild(img);
      const nameWrap = document.createElement('div');
      const sp = document.createElement('div');
      sp.style.cssText = `color:${t.speakerColor};font-size:0.75em;letter-spacing:2px;
        text-transform:uppercase;font-weight:600;`;
      sp.textContent = npc.name;
      nameWrap.appendChild(sp);
      // Осколок ур.1+: видно отношение собеседника
      if (this.oskolokLevel >= 1) {
        const rel = Number(this.state[npc.relationVarId] ?? 0);
        const bar = document.createElement('div');
        bar.style.cssText = `margin-top:0.25em;width:9em;height:0.28em;border-radius:1em;
          background:rgba(255,255,255,0.12);overflow:hidden;`;
        const fill = document.createElement('div');
        fill.style.cssText = `height:100%;width:${rel}%;border-radius:1em;
          background:${relColor(rel)};transition:width .3s;`;
        bar.appendChild(fill);
        bar.title = `Отношение: ${rel}/100`;
        nameWrap.appendChild(bar);
      }
      head.appendChild(nameWrap);
      box.appendChild(head);
    } else if (n.speaker) {
      const sp = document.createElement('div');
      sp.style.cssText = `color:${t.speakerColor};font-size:0.75em;letter-spacing:2px;
        text-transform:uppercase;margin-bottom:0.5em;font-weight:600;`;
      sp.textContent = n.speaker;
      box.appendChild(sp);
    }
    const txt = document.createElement('div');
    txt.style.whiteSpace = 'pre-wrap';
    txt.textContent = this.interpolate(n.text ?? '');
    box.appendChild(txt);

    const hint = document.createElement('div');
    hint.style.cssText = `margin-top:0.8em;text-align:right;opacity:0.45;font-size:0.65em;`;
    hint.textContent = '▸ дальше';
    box.appendChild(hint);

    box.style.cursor = 'pointer';
    box.onclick = () => this.advance(n.next);
  }

  private renderChoice(n: DialogueNode) {
    const t = this.project.theme;
    const box = this.makeBox();
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:0.5em;';
    box.appendChild(list);

    const available = (n.choices ?? []).filter((c) => this.checkConditions(c.conditions));
    const relIds = new Set((this.project.npcs ?? []).map((x) => x.relationVarId));
    for (const c of available) {
      const btn = document.createElement('div');
      btn.style.cssText = `background:${t.choiceBg};color:${t.choiceText};
        padding:0.6em 1em;border-radius:6px;cursor:pointer;
        border:1px solid rgba(255,255,255,0.06);transition:background .15s;`;
      btn.textContent = this.interpolate(c.text);
      // Осколок ур.3+: подсказки — как вариант повлияет на отношения
      if (this.oskolokLevel >= 3) {
        let delta = 0;
        for (const e of c.effects) {
          if (!relIds.has(e.varId)) continue;
          if (e.op === 'add') delta += Number(e.value);
          if (e.op === 'sub') delta -= Number(e.value);
        }
        if (delta !== 0) {
          const mark = document.createElement('span');
          mark.textContent = delta > 0 ? ' ▲' : ' ▼';
          mark.style.color = delta > 0 ? '#98c379' : '#e06c75';
          btn.appendChild(mark);
        }
      }
      btn.onmouseenter = () => { btn.style.background = t.choiceHover; };
      btn.onmouseleave = () => { btn.style.background = t.choiceBg; };
      btn.onclick = () => {
        this.applyEffects(c.effects);
        this.advance(c.next);
      };
      list.appendChild(btn);
    }
    if (available.length === 0) {
      // нет доступных вариантов — диалог не должен зависнуть
      this.endDialogue();
    }
  }
}

/** Цвет индикатора отношения: красный → жёлтый → зелёный */
function relColor(rel: number): string {
  if (rel < 34) return '#e06c75';
  if (rel < 67) return '#e5c07b';
  return '#98c379';
}

/**
 * Вписывает игровой контейнер 16:9 в родителя (letterbox) и
 * включает container queries для масштабирования шрифтов.
 */
export function fitStage(stage: HTMLElement, parent: HTMLElement) {
  stage.style.containerType = 'size';
  const resize = () => {
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    let w = pw;
    let h = (pw * 9) / 16;
    if (h > ph) { h = ph; w = (ph * 16) / 9; }
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
  };
  resize();
  new ResizeObserver(resize).observe(parent);
}
