// ============================================================
// Runtime-движок The Lost Silence.
// Рендерит сцены, играет диалоги, считает переменные/репутацию.
// Используется предпросмотром редактора и экспортированной игрой.
// ============================================================

import {
  Project, Scene, SceneElement, Dialogue, DialogueNode,
  Condition, Effect, VarValue, CANVAS_W, CANVAS_H,
  ItemDef, ItemGrant, ItemSlot, ITEM_SLOT_LABELS, RARITY_META, STAT_LABELS,
} from '../core/types';
import { materializeFactionReps, computeFactionRep, npcPortrait } from '../core/npc';
import {
  materializeHeroStats, computeCells, heroVarId, expNeed, itemIcon, STAT_KEYS,
} from '../core/hero';

interface InvCell { itemId: string; qty: number; }

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
  inv?: InvCell[];
  equip?: Partial<Record<ItemSlot, string>>;
}

export class Engine {
  project: Project;
  root: HTMLElement;          // контейнер 16:9 (масштабируется снаружи)
  state: Record<string, VarValue> = {};
  opts: EngineOptions;

  private sceneLayer: HTMLElement;
  private hudLayer!: HTMLElement;
  private dialogueLayer: HTMLElement;
  private invLayer!: HTMLElement;
  private factionPanelOpen = false;

  // инвентарь и экипировка
  inventory: InvCell[] = [];
  equipment: Partial<Record<ItemSlot, string>> = {};
  private invOpen = false;
  private notices: HTMLElement[] = [];
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
    this.invLayer = document.createElement('div');
    this.invLayer.style.cssText = `position:absolute;inset:0;pointer-events:none;
      font-size:calc(26 * 100cqw / ${CANVAS_W});`;
    root.appendChild(this.sceneLayer);
    root.appendChild(this.hudLayer);
    root.appendChild(this.dialogueLayer);
    root.appendChild(this.invLayer);

    for (const v of project.variables) this.state[v.id] = v.initial;
    this.recomputeDerived();
  }

  /** Включена ли система героя в проекте */
  get heroEnabled(): boolean {
    return heroVarId(this.project, 'lvl') !== null;
  }

  private itemDef(id: string): ItemDef | null {
    return this.project.items?.find((i) => i.id === id) ?? null;
  }

  equippedItems(): ItemDef[] {
    return Object.values(this.equipment)
      .map((id) => (id ? this.itemDef(id) : null))
      .filter((i): i is ItemDef => !!i);
  }

  /** Пересчёт всех вычисляемых значений (репутация, характеристики) */
  recomputeDerived() {
    materializeFactionReps(this.project, this.state);
    materializeHeroStats(this.project, this.state, this.equippedItems());
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
    let restored = false;
    if (this.opts.persist) {
      const save = this.loadSave();
      if (save) {
        restored = true;
        for (const v of this.project.variables) {
          if (save.vars[v.id] !== undefined) this.state[v.id] = save.vars[v.id];
        }
        this.inventory = save.inv ?? [];
        this.equipment = save.equip ?? {};
        if (save.sceneId && this.project.scenes.some((s) => s.id === save.sceneId)) {
          startId = save.sceneId;
        }
        const offlineMin = Math.max(0, (Date.now() - save.savedAt) / 60000);
        this.applyIdle(offlineMin, true);
      }
    }
    // стартовый инвентарь — только для новой игры
    if (!restored && this.project.hero?.startItems?.length) {
      this.giveItems(this.project.hero.startItems, true);
    }
    this.recomputeDerived();

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

  // ---------- уровни ----------
  private checkLevelUp() {
    const lvlId = heroVarId(this.project, 'lvl');
    const expId = heroVarId(this.project, 'exp');
    if (!lvlId || !expId) return;
    let lvl = Number(this.state[lvlId] ?? 1);
    let exp = Number(this.state[expId] ?? 0);
    let ups = 0;
    while (exp >= expNeed(lvl) && ups < 100) {
      exp -= expNeed(lvl);
      lvl++;
      ups++;
    }
    if (ups > 0) {
      this.state[lvlId] = lvl;
      this.state[expId] = exp;
      this.recomputeDerived();
      // новый уровень — полное восстановление
      const hpId = heroVarId(this.project, 'hp');
      const hpMaxId = heroVarId(this.project, 'hp_max');
      if (hpId && hpMaxId) this.state[hpId] = this.state[hpMaxId];
      this.notify(`▲ Уровень ${lvl}!`, '#e5c07b');
    }
  }

  // ---------- idle-системы ----------
  private startIdleTicks() {
    const rules = this.project.idleRules?.filter((r) => r.enabled) ?? [];
    if (rules.length === 0 && !this.heroEnabled) return;
    this.tickTimer = window.setInterval(() => {
      if (this.destroyed) return;
      this.applyIdle(1 / 60, false); // тик раз в секунду
      this.regenTick();
    }, 1000);
  }

  /** Реген hp/foc вне боя (1 секунда) */
  private regenTick() {
    if (!this.heroEnabled || !this.project.hero) return;
    const hpId = heroVarId(this.project, 'hp');
    const focId = heroVarId(this.project, 'foc');
    const hpMaxId = heroVarId(this.project, 'hp_max');
    const focMaxId = heroVarId(this.project, 'foc_max');
    let changed = false;
    if (hpId && hpMaxId) {
      const cur = Number(this.state[hpId] ?? 0);
      const max = Number(this.state[hpMaxId] ?? 0);
      if (cur < max) {
        this.state[hpId] = Math.min(max, Math.round((cur + this.project.hero.regenHp) * 10) / 10);
        changed = true;
      }
    }
    if (focId && focMaxId) {
      const cur = Number(this.state[focId] ?? 0);
      const max = Number(this.state[focMaxId] ?? 0);
      if (cur < max) {
        this.state[focId] = Math.min(max, Math.round((cur + this.project.hero.regenFoc) * 10) / 10);
        changed = true;
      }
    }
    if (changed) {
      this.opts.onVarsChanged?.(this.state);
      this.renderHUD();
      this.scheduleSave();
    }
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
          inv: this.inventory,
          equip: this.equipment,
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
    this.checkLevelUp();
    this.recomputeDerived();
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

  // ---------- HUD ----------
  private renderHUD() {
    // не трогаем всплывающие уведомления
    [...this.hudLayer.children].forEach((c) => {
      if (!this.notices.includes(c as HTMLElement)) c.remove();
    });
    this.renderHeroHUD();
    this.renderOskolokHUD();
  }

  /** Полосы hp/foc, уровень, кнопка инвентаря (не на страницах-меню) */
  private renderHeroHUD() {
    if (!this.heroEnabled) return;
    if (this.currentScene?.kind === 'page') return;
    const v = (name: string) => Number(this.state[heroVarId(this.project, name) ?? ''] ?? 0);
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:absolute;top:2.5%;right:2%;display:flex;align-items:center;
      gap:0.5em;pointer-events:none;`;

    const lvl = document.createElement('div');
    lvl.textContent = String(v('lvl'));
    lvl.title = `Уровень ${v('lvl')} · опыт ${Math.floor(v('exp'))}/${v('exp_need')}`;
    lvl.style.cssText = `width:1.6em;height:1.6em;border-radius:50%;display:flex;align-items:center;
      justify-content:center;background:rgba(10,16,22,0.85);border:1px solid #e5c07b88;
      color:#e5c07b;font-size:0.8em;font-weight:600;`;
    wrap.appendChild(lvl);

    const bars = document.createElement('div');
    bars.style.cssText = 'display:flex;flex-direction:column;gap:0.25em;width:8.5em;';
    const mkBar = (cur: number, max: number, color: string, label: string) => {
      const b = document.createElement('div');
      b.title = `${label}: ${Math.floor(cur)}/${Math.floor(max)}`;
      b.style.cssText = `height:0.5em;border-radius:1em;background:rgba(10,16,22,0.85);
        border:1px solid rgba(255,255,255,0.14);overflow:hidden;`;
      const f = document.createElement('div');
      f.style.cssText = `height:100%;width:${max > 0 ? (cur / max) * 100 : 0}%;background:${color};
        border-radius:1em;transition:width .3s;`;
      b.appendChild(f);
      return b;
    };
    bars.appendChild(mkBar(v('hp'), v('hp_max'), '#e06c75', 'Здоровье'));
    bars.appendChild(mkBar(v('foc'), v('foc_max'), '#7db8f0', 'Фокус'));
    wrap.appendChild(bars);

    const inv = document.createElement('div');
    inv.textContent = '🎒';
    inv.title = 'Инвентарь';
    inv.style.cssText = `width:1.7em;height:1.7em;display:flex;align-items:center;justify-content:center;
      border-radius:0.4em;background:rgba(10,16,22,0.85);border:1px solid rgba(255,255,255,0.18);
      cursor:pointer;pointer-events:auto;user-select:none;`;
    inv.onclick = () => { this.invOpen = !this.invOpen; this.renderInventory(); };
    wrap.appendChild(inv);

    this.hudLayer.appendChild(wrap);
  }

  private renderOskolokHUD() {
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
    if (a.giveItems?.length) this.giveItems(a.giveItems);
    if (a.effects) this.applyEffects(a.effects);
    if (a.type === 'gotoScene' && a.sceneId) this.gotoScene(a.sceneId);
    if (a.type === 'startDialogue' && a.dialogueId) this.startDialogue(a.dialogueId);
  }

  // ---------- операции с предметами ----------
  /** Выдаёт предметы (стеки учитываются). silent — без уведомлений */
  giveItems(grants: ItemGrant[], silent = false) {
    for (const g of grants) {
      const def = this.itemDef(g.itemId);
      if (!def) continue;
      let left = g.qty;
      const stackMax = Math.max(1, def.stack ?? 1);
      // добиваем существующие стеки
      for (const cell of this.inventory) {
        if (left <= 0) break;
        if (cell.itemId !== g.itemId || cell.qty >= stackMax) continue;
        const add = Math.min(left, stackMax - cell.qty);
        cell.qty += add;
        left -= add;
      }
      while (left > 0) {
        const add = Math.min(left, stackMax);
        this.inventory.push({ itemId: g.itemId, qty: add });
        left -= add;
      }
      if (!silent) this.notify(`+ ${def.name}${g.qty > 1 ? ` ×${g.qty}` : ''}`, RARITY_META[def.rarity].color);
    }
    this.recomputeDerived();
    this.scheduleSave();
    if (this.invOpen) this.renderInventory();
  }

  /** Использовать расходник из ячейки */
  useItem(cellIndex: number) {
    const cell = this.inventory[cellIndex];
    const def = cell ? this.itemDef(cell.itemId) : null;
    if (!cell || !def || def.type !== 'consumable') return;
    cell.qty -= 1;
    if (cell.qty <= 0) this.inventory.splice(cellIndex, 1);
    if (def.useEffects) this.applyEffects(def.useEffects);
    this.notify(`Использовано: ${def.name}`, '#98c379');
    this.scheduleSave();
    this.renderInventory();
    this.renderHUD();
  }

  /** Экипировать предмет из ячейки (обмен с надетым) */
  equipItem(cellIndex: number) {
    const cell = this.inventory[cellIndex];
    const def = cell ? this.itemDef(cell.itemId) : null;
    if (!cell || !def || !def.slot) return;
    const prev = this.equipment[def.slot];
    // из ячейки уходит 1 штука
    cell.qty -= 1;
    if (cell.qty <= 0) this.inventory.splice(cellIndex, 1);
    this.equipment[def.slot] = def.id;
    if (prev) this.giveItems([{ itemId: prev, qty: 1 }], true);
    this.recomputeDerived();
    this.opts.onVarsChanged?.(this.state);
    this.scheduleSave();
    this.renderInventory();
    this.renderHUD();
  }

  /** Снять предмет со слота в ячейки */
  unequipSlot(slot: ItemSlot) {
    const id = this.equipment[slot];
    if (!id) return;
    delete this.equipment[slot];
    this.giveItems([{ itemId: id, qty: 1 }], true);
    this.recomputeDerived();
    this.opts.onVarsChanged?.(this.state);
    this.scheduleSave();
    this.renderInventory();
    this.renderHUD();
  }

  /** Всплывающее уведомление в игре */
  private notify(text: string, color = '#cfd9e2') {
    const n = document.createElement('div');
    n.textContent = text;
    n.style.cssText = `position:absolute;right:2%;bottom:${6 + this.notices.length * 7}%;
      background:rgba(8,13,18,0.92);border:1px solid ${color}66;color:${color};
      padding:0.4em 0.9em;border-radius:0.4em;font-size:calc(24 * 100cqw / ${CANVAS_W});
      pointer-events:none;transition:opacity .4s;z-index:50;`;
    this.hudLayer.appendChild(n);
    this.notices.push(n);
    setTimeout(() => { n.style.opacity = '0'; }, 2200);
    setTimeout(() => {
      n.remove();
      this.notices = this.notices.filter((x) => x !== n);
    }, 2700);
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
        if (n.giveItems?.length) this.giveItems(n.giveItems);
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

  // ---------- инвентарь (экран) ----------
  renderInventory() {
    this.invLayer.innerHTML = '';
    if (!this.invOpen) return;

    const backdrop = document.createElement('div');
    backdrop.style.cssText = `position:absolute;inset:0;background:rgba(2,4,6,0.72);
      pointer-events:auto;backdrop-filter:blur(3px);`;
    backdrop.onclick = (e) => {
      if (e.target === backdrop) { this.invOpen = false; this.renderInventory(); }
    };
    this.invLayer.appendChild(backdrop);

    const panel = document.createElement('div');
    panel.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      width:82%;max-height:88%;background:#0c1218;border:1px solid rgba(255,255,255,0.12);
      border-radius:0.6em;padding:1em 1.2em;display:flex;gap:1.2em;font-size:0.75em;
      color:#cfd9e2;overflow:hidden;`;
    backdrop.appendChild(panel);

    // ---- манекен ----
    const left = document.createElement('div');
    left.style.cssText = 'flex:0 0 34%;display:flex;flex-direction:column;gap:0.5em;';
    const lt = document.createElement('div');
    lt.textContent = 'ЭКИПИРОВКА';
    lt.style.cssText = 'letter-spacing:2px;opacity:0.5;font-size:0.75em;';
    left.appendChild(lt);
    const slotsGrid = document.createElement('div');
    slotsGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:0.5em;';
    const slotOrder: ItemSlot[] = ['head', 'body', 'legs', 'feet', 'hands', 'weapon', 'gadget', 'accessory'];
    for (const slot of slotOrder) {
      slotsGrid.appendChild(this.slotCell(slot));
    }
    left.appendChild(slotsGrid);

    // сводка характеристик
    const stats = document.createElement('div');
    stats.style.cssText = `margin-top:0.6em;display:grid;grid-template-columns:1fr auto;
      gap:0.15em 1em;font-size:0.82em;opacity:0.9;`;
    const v = (name: string) => Number(this.state[heroVarId(this.project, name) ?? ''] ?? 0);
    const addStat = (label: string, val: string) => {
      const a = document.createElement('span'); a.textContent = label; a.style.opacity = '0.6';
      const b = document.createElement('span'); b.textContent = val; b.style.textAlign = 'right';
      stats.append(a, b);
    };
    addStat('Уровень', `${v('lvl')}  (${Math.floor(v('exp'))}/${v('exp_need')})`);
    for (const k of STAT_KEYS) addStat(STAT_LABELS[k], String(v(k)));
    left.appendChild(stats);
    panel.appendChild(left);

    // ---- ячейки ----
    const right = document.createElement('div');
    right.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:0.5em;min-width:0;';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:0.6em;';
    const rt = document.createElement('div');
    const cells = computeCells(this.project, v('endur'), this.equippedItems());
    rt.textContent = `ИНВЕНТАРЬ · ${this.inventory.length}/${cells}`;
    rt.style.cssText = 'letter-spacing:2px;opacity:0.5;font-size:0.75em;flex:1;';
    head.appendChild(rt);
    const mkSort = (label: string, fn: (a: InvCell, b: InvCell) => number) => {
      const b = document.createElement('div');
      b.textContent = label;
      b.style.cssText = `padding:0.15em 0.6em;border:1px solid rgba(255,255,255,0.15);
        border-radius:0.3em;cursor:pointer;font-size:0.75em;opacity:0.75;`;
      b.onclick = () => { this.inventory.sort(fn); this.scheduleSave(); this.renderInventory(); };
      return b;
    };
    const defOf = (c: InvCell) => this.itemDef(c.itemId);
    head.appendChild(mkSort('по типу', (a, b) => (defOf(a)?.type ?? '').localeCompare(defOf(b)?.type ?? '')));
    head.appendChild(mkSort('по редкости', (a, b) =>
      (RARITY_META[defOf(b)?.rarity ?? 'junk'].order) - (RARITY_META[defOf(a)?.rarity ?? 'junk'].order)));
    const close = document.createElement('div');
    close.textContent = '✕';
    close.style.cssText = 'cursor:pointer;opacity:0.6;padding:0 0.3em;';
    close.onclick = () => { this.invOpen = false; this.renderInventory(); };
    head.appendChild(close);
    right.appendChild(head);

    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(3.4em,1fr));
      gap:0.4em;overflow-y:auto;align-content:start;flex:1;`;
    for (let i = 0; i < cells; i++) {
      grid.appendChild(this.invCell(i));
    }
    right.appendChild(grid);
    const hint = document.createElement('div');
    hint.textContent = 'Перетащите предмет на слот, чтобы экипировать · клик — действия';
    hint.style.cssText = 'opacity:0.35;font-size:0.7em;';
    right.appendChild(hint);
    panel.appendChild(right);
  }

  private slotCell(slot: ItemSlot): HTMLElement {
    const cell = document.createElement('div');
    cell.dataset.slot = slot;
    cell.style.cssText = `height:3.6em;border:1px dashed rgba(255,255,255,0.18);border-radius:0.4em;
      display:flex;align-items:center;gap:0.5em;padding:0 0.5em;position:relative;`;
    const id = this.equipment[slot];
    const def = id ? this.itemDef(id) : null;
    if (def) {
      cell.style.border = `1px solid ${RARITY_META[def.rarity].color}66`;
      const img = document.createElement('img');
      img.src = itemIcon(def);
      img.style.cssText = 'width:2.6em;height:2.6em;border-radius:0.3em;';
      img.draggable = false;
      cell.appendChild(img);
      const name = document.createElement('div');
      name.textContent = def.name;
      name.style.cssText = `font-size:0.72em;color:${RARITY_META[def.rarity].color};
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;`;
      cell.appendChild(name);
      cell.title = this.itemTooltip(def) + '\nКлик — снять';
      cell.style.cursor = 'pointer';
      cell.onclick = () => this.unequipSlot(slot);
    } else {
      const lbl = document.createElement('div');
      lbl.textContent = ITEM_SLOT_LABELS[slot];
      lbl.style.cssText = 'font-size:0.7em;opacity:0.35;';
      cell.appendChild(lbl);
    }
    return cell;
  }

  private invCell(index: number): HTMLElement {
    const cell = document.createElement('div');
    cell.dataset.cell = String(index);
    cell.style.cssText = `aspect-ratio:1;border:1px solid rgba(255,255,255,0.1);border-radius:0.4em;
      position:relative;display:flex;align-items:center;justify-content:center;
      background:rgba(255,255,255,0.02);`;
    const item = this.inventory[index];
    const def = item ? this.itemDef(item.itemId) : null;
    if (!item || !def) return cell;

    cell.style.borderColor = `${RARITY_META[def.rarity].color}55`;
    cell.style.cursor = 'grab';
    cell.title = this.itemTooltip(def);
    const img = document.createElement('img');
    img.src = itemIcon(def);
    img.style.cssText = 'width:78%;height:78%;border-radius:0.3em;pointer-events:none;';
    img.draggable = false;
    cell.appendChild(img);
    if (item.qty > 1) {
      const q = document.createElement('div');
      q.textContent = String(item.qty);
      q.style.cssText = `position:absolute;right:0.15em;bottom:0.05em;font-size:0.7em;
        color:#fff;text-shadow:0 1px 2px #000;`;
      cell.appendChild(q);
    }
    if (def.questItem) {
      const q = document.createElement('div');
      q.textContent = '◈';
      q.title = 'Квестовый предмет';
      q.style.cssText = 'position:absolute;left:0.15em;top:0.05em;font-size:0.6em;color:#e5c07b;';
      cell.appendChild(q);
    }

    // drag-and-drop + клик-меню
    cell.addEventListener('pointerdown', (e) => this.startItemDrag(index, cell, e));
    return cell;
  }

  private itemTooltip(def: ItemDef): string {
    const lines = [`${def.name} · ${RARITY_META[def.rarity].label}`];
    if (def.slot) lines.push(`Слот: ${ITEM_SLOT_LABELS[def.slot]}`);
    if (def.stats) {
      for (const [k, val] of Object.entries(def.stats)) {
        if (val) lines.push(`${STAT_LABELS[k as keyof typeof STAT_LABELS]}: ${val > 0 ? '+' : ''}${val}`);
      }
    }
    if (def.cellsBonus) lines.push(`Ячейки: +${def.cellsBonus}`);
    if (def.description) lines.push(def.description);
    return lines.join('\n');
  }

  private startItemDrag(index: number, cellEl: HTMLElement, e: PointerEvent) {
    e.preventDefault();
    const item = this.inventory[index];
    const def = item ? this.itemDef(item.itemId) : null;
    if (!item || !def) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let ghost: HTMLImageElement | null = null;

    const move = (ev: PointerEvent) => {
      if (!ghost && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      if (!ghost) {
        ghost = document.createElement('img');
        ghost.src = itemIcon(def);
        ghost.style.cssText = `position:fixed;width:44px;height:44px;pointer-events:none;
          z-index:9999;opacity:0.85;transform:translate(-50%,-50%);`;
        document.body.appendChild(ghost);
        cellEl.style.opacity = '0.35';
      }
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top = `${ev.clientY}px`;
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      cellEl.style.opacity = '';
      if (!ghost) {
        // это был клик — меню действий
        this.itemActionMenu(index, cellEl);
        return;
      }
      ghost.remove();
      const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const slotEl = target?.closest('[data-slot]') as HTMLElement | null;
      const cellTo = target?.closest('[data-cell]') as HTMLElement | null;
      if (slotEl && def.slot === slotEl.dataset.slot) {
        this.equipItem(index);
      } else if (slotEl && def.slot !== slotEl.dataset.slot) {
        this.notify('Не тот слот', '#e06c75');
      } else if (cellTo) {
        const to = Number(cellTo.dataset.cell);
        if (to !== index) {
          const a = this.inventory[index];
          const b = this.inventory[to];
          if (b) { this.inventory[index] = b; this.inventory[to] = a; }
          else {
            this.inventory.splice(index, 1);
            this.inventory.splice(Math.min(to, this.inventory.length), 0, a);
          }
          this.scheduleSave();
          this.renderInventory();
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private itemActionMenu(index: number, anchor: HTMLElement) {
    const item = this.inventory[index];
    const def = item ? this.itemDef(item.itemId) : null;
    if (!item || !def) return;
    document.querySelectorAll('.tls-item-menu').forEach((m) => m.remove());
    const rect = anchor.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'tls-item-menu';
    menu.style.cssText = `position:absolute;left:${rect.left - rootRect.left}px;
      top:${rect.bottom - rootRect.top + 4}px;z-index:60;background:#101820;
      border:1px solid rgba(255,255,255,0.16);border-radius:0.4em;padding:0.3em;
      font-size:0.72em;min-width:9em;pointer-events:auto;`;
    const title = document.createElement('div');
    title.textContent = def.name;
    title.style.cssText = `padding:0.3em 0.6em;color:${RARITY_META[def.rarity].color};font-weight:600;`;
    menu.appendChild(title);
    const mk = (label: string, fn: () => void) => {
      const it = document.createElement('div');
      it.textContent = label;
      it.style.cssText = 'padding:0.35em 0.6em;cursor:pointer;border-radius:0.3em;';
      it.onmouseenter = () => { it.style.background = 'rgba(255,255,255,0.07)'; };
      it.onmouseleave = () => { it.style.background = ''; };
      it.onclick = () => { menu.remove(); fn(); };
      menu.appendChild(it);
    };
    if (def.slot) mk('Экипировать', () => this.equipItem(index));
    if (def.type === 'consumable') mk('Использовать', () => this.useItem(index));
    if (!def.questItem) {
      mk('Выбросить', () => {
        this.inventory.splice(index, 1);
        this.scheduleSave();
        this.renderInventory();
      });
    }
    mk('Закрыть', () => { /* просто закрыть */ });
    this.invLayer.appendChild(menu);
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
