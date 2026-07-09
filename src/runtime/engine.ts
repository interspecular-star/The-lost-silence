// ============================================================
// Runtime-движок The Lost Silence.
// Рендерит сцены, играет диалоги, считает переменные/репутацию.
// Используется предпросмотром редактора и экспортированной игрой.
// ============================================================

import {
  Project, Scene, SceneElement, Dialogue, DialogueNode,
  Condition, Effect, VarValue, CANVAS_W, CANVAS_H,
  ItemDef, ItemGrant, ItemSlot, ITEM_SLOT_LABELS, RARITY_META, Rarity, STAT_LABELS,
  PlaytestCheckpoint, uid, deepClone, BgEffectType, BgEffectRule, Faction, MaterialDef,
} from '../core/types';
import { ensureBgFxStyles } from './bgfx';
import { ensureDialogueFxStyles } from './dialoguefx';
import { ensureUiFxStyles } from './uifx';
import { ensureTextFxStyles, renderRichInto } from './textfx';
import { applyBoxFx, glassBg } from './boxfx';
import { materializeFactionReps, computeFactionRep, npcPortrait, npcFullPortrait, placeholderFullPortrait } from '../core/npc';
import {
  materializeHeroStats, computeCells, heroVarId, expNeed, itemIcon, STAT_KEYS,
} from '../core/hero';
import { runCombat } from './combat';
import { renderJournal } from './journal';

interface InvCell { itemId: string; qty: number; }

export interface EngineOptions {
  onVarsChanged?: (state: Record<string, VarValue>) => void;
  onSceneChanged?: (scene: Scene) => void;
  /** Сохранять прогресс игрока (localStorage) и считать оффлайн-прогресс. Для предпросмотра — false. */
  persist?: boolean;
  /** Плейтест: начать игру с этого чекпоинта (переменные, инвентарь, сцена) */
  checkpoint?: PlaytestCheckpoint | null;
  /** Плейтест: начать с этой сцены (приоритетнее сцены чекпоинта) */
  startSceneId?: string | null;
}

interface SaveData {
  vars: Record<string, VarValue>;
  sceneId: string | null;
  savedAt: number;
  inv?: InvCell[];
  equip?: Partial<Record<ItemSlot, string>>;
  claims?: Record<string, string>;          // задания: id → ключ сброса
  ups?: Record<string, number>;             // улучшения: id → уровень
  qsteps?: Record<string, number>;          // цепочки заданий: id → пройдено этапов
  decode?: { defId: string; startedAt: number } | null;
  achievements?: Record<string, boolean>;   // достижения: id → разблокировано (навсегда)
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

  // фон: постоянные слои (не пересоздаются при рендере сцены — иначе дёргались бы анимации)
  private bgLayer!: HTMLElement;
  private bgZoomEl!: HTMLElement;
  private bgParallaxEl!: HTMLElement;
  private bgKbEl!: HTMLElement;
  private bgDriftEl!: HTMLElement;
  private bgShakeEl!: HTMLElement;
  private bgGlitchEl!: HTMLElement;
  private bgImgEl!: HTMLElement;
  private bgFxEl!: HTMLElement;
  private bgOverlayEls: Partial<Record<BgEffectType, HTMLElement>> = {};
  private bgBaseFilter = '';
  private bgParallaxStrength = 0;
  private onBgPointerMove = (e: PointerEvent) => {
    if (!this.bgParallaxEl) return;
    if (!this.bgParallaxStrength) { this.bgParallaxEl.style.transform = ''; return; }
    const rect = this.root.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dx = (e.clientX - rect.left) / rect.width - 0.5;
    const dy = (e.clientY - rect.top) / rect.height - 0.5;
    const maxShift = 3; // % — в пределах 10% запаса на bgImgEl
    const k = this.bgParallaxStrength / 100;
    this.bgParallaxEl.style.transform = `translate(${(-dx * k * maxShift).toFixed(2)}%, ${(-dy * k * maxShift).toFixed(2)}%)`;
  };

  // инвентарь и экипировка
  inventory: InvCell[] = [];
  equipment: Partial<Record<ItemSlot, string>> = {};
  private invOpen = false;
  private notices: HTMLElement[] = [];
  private achievementPopups: HTMLElement[] = [];
  /** true во время боя — реген приостановлен */
  inCombat = false;
  private dialogueActive = false;

  // журнал: задания / улучшения / расшифровка
  questClaims: Record<string, string> = {};
  questSteps: Record<string, number> = {};   // id задания → пройдено этапов цепочки
  upgradeLevels: Record<string, number> = {};
  activeDecode: { defId: string; startedAt: number } | null = null;
  achievements: Record<string, boolean> = {}; // id достижения → разблокировано (навсегда)
  private currentScene: Scene | null = null;
  private currentDialogue: Dialogue | null = null;
  /** NPC последней показанной реплики — определяет фракционный скин диалогового блока */
  private currentSpeakerNpcId: string | null = null;
  private tickTimer: number | undefined;
  private saveTimer: number | undefined;
  private sceneTransitionTimer: number | undefined;
  private destroyed = false;

  constructor(project: Project, root: HTMLElement, opts: EngineOptions = {}) {
    this.project = project;
    this.root = root;
    this.opts = opts;

    root.innerHTML = '';
    root.style.position = 'relative';
    root.style.overflow = 'hidden';
    root.style.fontFamily = project.theme.font;

    ensureBgFxStyles();
    ensureDialogueFxStyles();
    ensureUiFxStyles();
    ensureTextFxStyles();
    this.bgLayer = document.createElement('div');
    this.bgLayer.style.cssText = 'position:absolute;inset:0;';
    this.buildBgChain();

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
    root.appendChild(this.bgLayer);
    root.appendChild(this.sceneLayer);
    root.appendChild(this.hudLayer);
    root.appendChild(this.dialogueLayer);
    root.appendChild(this.invLayer);
    root.addEventListener('pointermove', this.onBgPointerMove);

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
        this.questClaims = save.claims ?? {};
        this.questSteps = save.qsteps ?? {};
        this.upgradeLevels = save.ups ?? {};
        this.activeDecode = save.decode ?? null;
        this.achievements = save.achievements ?? {};
        if (save.sceneId && this.project.scenes.some((s) => s.id === save.sceneId)) {
          startId = save.sceneId;
        }
        const offlineMin = Math.max(0, (Date.now() - save.savedAt) / 60000);
        this.applyIdle(offlineMin, true);
      }
    }
    // плейтест-чекпоинт (только предпросмотр): применяем поверх начальных значений
    const cp = this.opts.checkpoint;
    if (cp) {
      restored = true;
      for (const v of this.project.variables) {
        if (v.category !== 'computed' && cp.vars[v.id] !== undefined) this.state[v.id] = cp.vars[v.id];
      }
      this.inventory = deepClone(cp.inv ?? []);
      this.equipment = { ...(cp.equip ?? {}) };
      this.questClaims = { ...(cp.claims ?? {}) };
      this.questSteps = { ...(cp.qsteps ?? {}) };
      this.upgradeLevels = { ...(cp.ups ?? {}) };
      this.achievements = { ...(cp.achievements ?? {}) };
      if (cp.sceneId && this.project.scenes.some((s) => s.id === cp.sceneId)) startId = cp.sceneId;
    }
    if (this.opts.startSceneId && this.project.scenes.some((s) => s.id === this.opts.startSceneId)) {
      startId = this.opts.startSceneId;
    }
    // стартовый инвентарь — только для новой игры
    if (!restored && this.project.hero?.startItems?.length) {
      this.giveItems(this.project.hero.startItems, true);
    }
    this.recomputeDerived();

    if (startId) this.gotoScene(startId);
    this.checkQuestSteps(true); // тривиально выполненные этапы фиксируем без уведомлений
    this.checkAchievements(true);
    this.opts.onVarsChanged?.(this.state);
    this.startIdleTicks();
  }

  /** Снимок текущего состояния игры как чекпоинт плейтеста */
  capturePlaytest(name: string): PlaytestCheckpoint {
    const vars: Record<string, VarValue> = {};
    for (const v of this.project.variables) {
      if (v.category !== 'computed') vars[v.id] = this.state[v.id];
    }
    return {
      id: uid('cp'),
      name,
      sceneId: this.currentScene?.id ?? null,
      vars,
      inv: deepClone(this.inventory),
      equip: { ...this.equipment },
      claims: { ...this.questClaims },
      ups: { ...this.upgradeLevels },
      qsteps: { ...this.questSteps },
      achievements: { ...this.achievements },
    };
  }

  /** Останавливает таймеры (вызывать при закрытии предпросмотра) */
  destroy() {
    this.destroyed = true;
    clearInterval(this.tickTimer);
    clearTimeout(this.saveTimer);
    clearTimeout(this.sceneTransitionTimer);
    this.root.removeEventListener('pointermove', this.onBgPointerMove);
  }

  // ---------- фон: постоянные слои + условные эффекты ----------
  /** Создаёт цепочку слоёв фона один раз. Пересоздавать нельзя — иначе анимации будут дёргаться. */
  private buildBgChain() {
    const mk = (css: string, cls = '') => {
      const d = document.createElement('div');
      d.style.cssText = css;
      if (cls) d.className = cls;
      return d;
    };
    const bgRoot = mk('position:absolute;inset:0;overflow:hidden;');
    const zoom = mk('position:absolute;inset:0;transition:transform .4s ease;');
    const parallax = mk('position:absolute;inset:0;transition:transform .12s linear;');
    const kb = mk('position:absolute;inset:0;', 'tls-bgw-kb');
    const drift = mk('position:absolute;inset:0;', 'tls-bgw-drift');
    const shake = mk('position:absolute;inset:0;', 'tls-bgw-shake');
    const glitch = mk('position:absolute;inset:0;', 'tls-bgw-glitch');
    const img = mk('position:absolute;inset:-10%;background-size:cover;transition:filter .5s ease, opacity .5s ease;');

    glitch.appendChild(img);
    shake.appendChild(glitch);
    drift.appendChild(shake);
    kb.appendChild(drift);
    parallax.appendChild(kb);
    zoom.appendChild(parallax);
    bgRoot.appendChild(zoom);

    const fx = mk('position:absolute;inset:0;pointer-events:none;');

    this.bgLayer.appendChild(bgRoot);
    this.bgLayer.appendChild(fx);

    this.bgZoomEl = zoom;
    this.bgParallaxEl = parallax;
    this.bgKbEl = kb;
    this.bgDriftEl = drift;
    this.bgShakeEl = shake;
    this.bgGlitchEl = glitch;
    this.bgImgEl = img;
    this.bgFxEl = fx;
  }

  /** Базовые настройки картинки (прозрачность/яркость/контраст/blur/положение/масштаб/параллакс) */
  private applyBackgroundConfig(scene: Scene) {
    const cfg = scene.bg ?? {};
    const opacity = (cfg.opacity ?? 100) / 100;
    const brightness = cfg.brightness ?? 100;
    const contrast = cfg.contrast ?? 100;
    const blur = cfg.blur ?? 0;
    const posX = cfg.posX ?? 50;
    const posY = cfg.posY ?? 50;
    const scale = (cfg.scale ?? 100) / 100;
    this.bgParallaxStrength = cfg.parallax ?? 0;

    this.bgImgEl.style.background = scene.background;
    if (scene.bgImage) this.bgImgEl.style.backgroundImage = `url(${scene.bgImage})`;
    this.bgImgEl.style.backgroundSize = 'cover';
    this.bgImgEl.style.backgroundPosition = `${posX}% ${posY}%`;
    this.bgImgEl.style.opacity = String(opacity);
    this.bgZoomEl.style.transform = scale !== 1 ? `scale(${scale})` : '';

    this.bgBaseFilter = `brightness(${brightness}%) contrast(${contrast}%)${blur ? ` blur(${blur}px)` : ''}`;
    this.bgImgEl.style.filter = this.bgBaseFilter;
    if (!this.bgParallaxStrength) this.bgParallaxEl.style.transform = '';
  }

  /** Пересчитывает условные эффекты (зависят от переменных) без пересоздания анимированных слоёв */
  private refreshBgEffects(scene: Scene) {
    const rules = (scene.bgEffects ?? []).filter((r) => this.checkConditions(r.conditions));
    const active = new Map<BgEffectType, BgEffectRule>();
    for (const r of rules) active.set(r.type, r); // при дублях побеждает последнее правило в списке

    const setWrap = (el: HTMLElement, type: BgEffectType) => {
      const rule = active.get(type);
      el.classList.toggle('tls-fx-on', !!rule);
      if (rule) el.style.setProperty('--fx-i', String(rule.intensity / 100));
    };
    setWrap(this.bgKbEl, 'kenBurns');
    setWrap(this.bgDriftEl, 'drift');
    setWrap(this.bgShakeEl, 'shake');
    setWrap(this.bgGlitchEl, 'glitch');

    let filter = this.bgBaseFilter;
    const desat = active.get('desaturate');
    if (desat) filter += ` grayscale(${desat.intensity}%)`;
    const hb = active.get('heavyBlur');
    if (hb) filter += ` blur(${((hb.intensity / 100) * 14).toFixed(1)}px)`;
    this.bgImgEl.style.filter = filter;

    const overlayTypes: BgEffectType[] = ['vignette', 'tint', 'scanlines', 'staticNoise', 'grain', 'pulse', 'flicker', 'redPulse', 'chromaShift'];
    for (const type of overlayTypes) {
      const rule = active.get(type);
      let el = this.bgOverlayEls[type];
      if (!rule) {
        if (el) { el.remove(); delete this.bgOverlayEls[type]; }
        continue;
      }
      if (!el) {
        el = this.buildOverlayEl(type);
        this.bgOverlayEls[type] = el;
        this.bgFxEl.appendChild(el);
      }
      el.style.setProperty('--fx-i', String(rule.intensity / 100));
      if (rule.color) el.style.setProperty('--fx-color', rule.color);
      if (type === 'chromaShift') this.updateChromaLayers(el);
    }
  }

  private buildOverlayEl(type: BgEffectType): HTMLElement {
    if (type === 'chromaShift') {
      const wrap = document.createElement('div');
      wrap.className = 'tls-bgfx-chroma';
      const red = document.createElement('div');
      red.className = 'tls-bgfx-chroma-layer tls-bgfx-chroma-r';
      const cyan = document.createElement('div');
      cyan.className = 'tls-bgfx-chroma-layer tls-bgfx-chroma-c';
      wrap.append(red, cyan);
      return wrap;
    }
    const d = document.createElement('div');
    d.className = `tls-bgfx-${type === 'staticNoise' ? 'noise' : type}`;
    return d;
  }

  private updateChromaLayers(wrap: HTMLElement) {
    const bgImage = this.bgImgEl.style.backgroundImage;
    const bgPos = this.bgImgEl.style.backgroundPosition;
    wrap.querySelectorAll<HTMLElement>('.tls-bgfx-chroma-layer').forEach((l) => {
      l.style.backgroundImage = bgImage;
      l.style.backgroundPosition = bgPos;
    });
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
    const hasChains = (this.project.quests ?? []).some((q) => q.enabled && q.steps?.length);
    const hasBgEffects = this.project.scenes.some((s) => s.bgEffects?.length);
    const hasAchievements = (this.project.achievements?.length ?? 0) > 0;
    if (rules.length === 0 && !this.heroEnabled && !hasChains && !hasBgEffects && !hasAchievements) return;
    this.tickTimer = window.setInterval(() => {
      if (this.destroyed) return;
      this.applyIdle(1 / 60, false); // тик раз в секунду
      this.regenTick();
      this.checkQuestSteps();
      this.checkAchievements();
      if (this.currentScene) this.refreshBgEffects(this.currentScene);
    }, 1000);
  }

  /** Реген hp/foc вне боя (1 секунда) */
  private regenTick() {
    if (!this.heroEnabled || !this.project.hero || this.inCombat) return;
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

  /** Эффективная скорость idle-правила с учётом купленных улучшений */
  effectiveRate(ruleId: string, base: number): number {
    let rate = base;
    for (const up of this.project.upgrades ?? []) {
      if (!up.enabled || up.targetIdleRuleId !== ruleId) continue;
      rate += (this.upgradeLevels[up.id] ?? 0) * up.ratePerLevel;
    }
    return rate;
  }

  /** Немедленно запланировать сохранение (для журнала) */
  saveNow() {
    this.scheduleSave();
  }

  /** Начисляет idle-прирост за minutes минут. offlineOnly=true — только правила с offline. */
  private applyIdle(minutes: number, offlineOnly: boolean) {
    const rules = this.project.idleRules?.filter((r) => r.enabled) ?? [];
    let changed = false;
    for (const r of rules) {
      if (offlineOnly && !r.offline) continue;
      if (!this.checkConditions(r.conditions)) continue;
      const cur = Number(this.state[r.varId] ?? 0);
      let next = cur + this.effectiveRate(r.id, r.ratePerMin) * minutes;
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
          claims: this.questClaims,
          ups: this.upgradeLevels,
          qsteps: this.questSteps,
          achievements: this.achievements,
          decode: this.activeDecode,
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

  /** Текст с абзацами: двойной перенос строки даёт компактный отступ вместо целой пустой строки */
  private setParagraphs(target: HTMLElement, text: string, cls?: string) {
    target.textContent = '';
    text.split(/\n{2,}/).forEach((para, i) => {
      const p = document.createElement('div');
      if (cls) p.className = cls;
      p.style.whiteSpace = 'pre-wrap';
      if (i > 0) p.style.marginTop = '0.55em';
      renderRichInto(p, para); // разметка [b]/[c=…]/[glitch]… — см. textfx.ts
      target.appendChild(p);
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
    this.checkQuestSteps();
    this.checkAchievements();
    this.opts.onVarsChanged?.(this.state);
    this.renderScene(); // условная видимость элементов могла измениться
    this.scheduleSave();
  }

  /** Продвигает цепочки заданий: выполненный этап фиксируется навсегда.
   *  silent — без уведомлений (первичная инициализация при старте). */
  checkQuestSteps(silent = false) {
    for (const q of this.project.quests ?? []) {
      const steps = q.steps;
      if (!q.enabled || !steps?.length) continue;
      if (this.questClaims[q.id]) continue; // награда уже забрана
      let done = this.questSteps[q.id] ?? 0;
      let advanced = false;
      while (done < steps.length && this.checkConditions(steps[done].conditions)) {
        done++;
        advanced = true;
        if (!silent) {
          if (done < steps.length) {
            this.notify(`📋 ${q.title}: ${steps[done - 1].text} ✓`, '#7db8f0');
          } else {
            this.notify(`📋 «${q.title}» выполнено — награда в журнале`, '#e5c07b');
          }
        }
      }
      if (advanced) {
        this.questSteps[q.id] = done;
        this.scheduleSave();
      }
    }
  }

  /** Разблокирует достижения навсегда, когда их условия истинны. Не отменяется, даже
   *  если условия потом перестанут выполняться. silent — без уведомлений (при старте). */
  checkAchievements(silent = false) {
    let unlocked = false;
    for (const a of this.project.achievements ?? []) {
      if (!a.enabled || this.achievements[a.id]) continue;
      if (!this.checkConditions(a.conditions)) continue;
      this.achievements[a.id] = true;
      unlocked = true;
      if (a.rewardEffects?.length) this.applyEffects(a.rewardEffects);
      if (a.rewardItems?.length) this.giveItems(a.rewardItems);
      if (!silent) this.notifyAchievement(a.title, a.icon || '🏆');
    }
    if (unlocked) this.scheduleSave();
  }

  // ---------- сцены ----------
  gotoScene(id: string, suppressEnter = false) {
    const scene = this.project.scenes.find((s) => s.id === id);
    if (!scene) return;
    const apply = () => {
      this.currentScene = scene;
      this.renderScene();
      this.opts.onSceneChanged?.(scene);
      this.scheduleSave();
      if (scene.onEnterDialogueId && !suppressEnter) this.startDialogue(scene.onEnterDialogueId);
    };
    if (!this.currentScene || this.currentScene.id === scene.id) { apply(); return; }
    this.transitionScene(apply);
  }

  /** Мягкий кросс-фейд между сценами: гасим фон+слои сцены, меняем содержимое, проявляем обратно */
  private transitionScene(swap: () => void) {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const ms = reduced ? 0 : 220;
    clearTimeout(this.sceneTransitionTimer);
    this.bgLayer.style.transition = `opacity ${ms}ms ease`;
    this.sceneLayer.style.transition = `opacity ${ms}ms ease`;
    this.bgLayer.style.opacity = '0';
    this.sceneLayer.style.opacity = '0';
    this.sceneTransitionTimer = window.setTimeout(() => {
      swap();
      requestAnimationFrame(() => {
        this.bgLayer.style.opacity = '1';
        this.sceneLayer.style.opacity = '1';
      });
    }, ms);
  }

  /** Подпись видимого состояния сцены (см. renderScene) */
  private sceneSig = '';

  private renderScene() {
    const scene = this.currentScene;
    if (!scene) return;
    this.applyBackgroundConfig(scene);
    this.refreshBgEffects(scene);

    const sorted = [...scene.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    const visible = sorted.filter((el) => el.visible !== false && this.checkConditions(el.visibleIf));
    // Пересобираем DOM элементов только если видимый результат изменился:
    // тик idle/регена зовёт renderScene каждую секунду, и без этой проверки
    // анимации текста (textfx) перезапускались бы на каждом тике.
    const sig = scene.id + '|' + visible
      .map((el) => `${el.id}:${el.type === 'image' ? (el.src?.length ?? 0) : this.interpolate(el.text ?? '')}`)
      .join('|');
    if (sig !== this.sceneSig) {
      this.sceneSig = sig;
      this.sceneLayer.innerHTML = '';
      for (const el of visible) this.sceneLayer.appendChild(this.renderElement(el));
    }
    this.renderHUD();
  }

  // ---------- HUD ----------
  private renderHUD() {
    // не трогаем всплывающие уведомления и баннеры ачивок
    [...this.hudLayer.children].forEach((c) => {
      if (!this.notices.includes(c as HTMLElement) && !this.achievementPopups.includes(c as HTMLElement)) c.remove();
    });
    this.renderHeroHUD();
    this.renderOskolokHUD();
  }

  /** HUD включён/выключен для текущей сцены: явный выбор в инспекторе или авто (скрыт на страницах) */
  private hudVisible(): boolean {
    const mode = this.currentScene?.hudMode ?? 'auto';
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return this.currentScene?.kind !== 'page';
  }

  /** Единый HUD-бар: слева уровень/hp/foc + инвентарь, справа кредиты (не на страницах-меню) */
  private renderHeroHUD() {
    if (!this.heroEnabled) return;
    if (!this.hudVisible()) return;
    const v = (name: string) => Number(this.state[heroVarId(this.project, name) ?? ''] ?? 0);
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:absolute;top:2.5%;left:calc(2% + 2.1em);display:flex;align-items:center;
      gap:0.5em;pointer-events:none;`;

    const accent = this.project.theme.accent;

    const lvl = document.createElement('div');
    lvl.textContent = String(v('lvl'));
    lvl.title = `Уровень ${v('lvl')} · опыт ${Math.floor(v('exp'))}/${v('exp_need')}`;
    lvl.style.cssText = `width:1.8em;height:1.8em;border-radius:50%;display:flex;align-items:center;
      justify-content:center;border:1px solid rgba(255,255,255,0.22);
      color:#cfd9e2;font-size:0.75em;font-weight:300;`;
    wrap.appendChild(lvl);

    const bars = document.createElement('div');
    bars.style.cssText = 'display:flex;flex-direction:column;gap:0.45em;';
    const mkBar = (cur: number, max: number, color: string, label: string) => {
      const row = document.createElement('div');
      row.title = `${label === 'HP' ? 'Здоровье' : 'Фокус'}: ${Math.floor(cur)}/${Math.floor(max)}`;
      row.style.cssText = 'display:flex;align-items:center;gap:0.5em;';
      const l = document.createElement('span');
      l.textContent = label;
      l.style.cssText = `font-size:0.5em;letter-spacing:2px;color:#5f7a8a;width:2.2em;`;
      row.appendChild(l);
      const b = document.createElement('div');
      b.style.cssText = `width:8.5em;height:3px;background:rgba(255,255,255,0.09);overflow:hidden;`;
      const f = document.createElement('div');
      f.style.cssText = `height:100%;width:${max > 0 ? (cur / max) * 100 : 0}%;background:${color};
        transition:width .3s;`;
      b.appendChild(f);
      row.appendChild(b);
      return row;
    };
    bars.appendChild(mkBar(v('hp'), v('hp_max'), '#e06c75', 'HP'));
    bars.appendChild(mkBar(v('foc'), v('foc_max'), '#7db8f0', 'FOC'));
    wrap.appendChild(bars);

    const quietBtn = (glyph: string, title: string) => {
      const b = document.createElement('div');
      b.textContent = glyph;
      b.title = title;
      b.style.cssText = `width:1.7em;height:1.7em;display:flex;align-items:center;justify-content:center;
        cursor:pointer;pointer-events:auto;user-select:none;opacity:0.6;transition:opacity .15s;`;
      b.onmouseenter = () => { b.style.opacity = '1'; };
      b.onmouseleave = () => { b.style.opacity = '0.6'; };
      return b;
    };
    const inv = quietBtn('🎒', 'Инвентарь');
    inv.onclick = () => { this.invOpen = !this.invOpen; this.renderInventory(); };
    wrap.appendChild(inv);

    // журнал (задания/улучшения/OldNet/персонажи/достижения) — если в проекте есть содержимое
    const hasJournal = (this.project.quests?.length ?? 0) + (this.project.upgrades?.length ?? 0)
      + (this.project.decodes?.length ?? 0) + (this.project.npcs?.length ?? 0)
      + (this.project.achievements?.length ?? 0) > 0;
    if (hasJournal) {
      const j = quietBtn('📋', 'Журнал: задания, улучшения, OldNet, персонажи, достижения');
      j.onclick = () => this.openJournal();
      wrap.appendChild(j);
    }

    this.hudLayer.appendChild(wrap);

    // валюта — правый край HUD, тихая строка
    const curName = this.project.currencyVarName ?? 'credits';
    const curId = heroVarId(this.project, curName);
    if (curId) {
      const cred = document.createElement('div');
      cred.textContent = `⌬ ${Math.floor(Number(this.state[curId] ?? 0))}`;
      cred.title = this.project.variables.find((x) => x.id === curId)?.title ?? 'Кредиты';
      cred.style.cssText = `position:absolute;top:2.5%;right:2%;height:1.8em;display:flex;
        align-items:center;color:${accent};opacity:0.85;
        font-size:0.8em;letter-spacing:2px;`;
      this.hudLayer.appendChild(cred);
    }
  }

  private renderOskolokHUD() {
    if (!this.hudVisible()) return;
    const factions = this.project.factions ?? [];
    // панель фракций доступна с ур.2 Осколка
    if (this.oskolokLevel < 2 || factions.length === 0) return;

    const btn = document.createElement('div');
    btn.textContent = '◈';
    btn.title = 'Осколок: репутация фракций';
    btn.style.cssText = `position:absolute;top:2.5%;left:2%;width:1.8em;height:1.8em;
      display:flex;align-items:center;justify-content:center;
      color:${this.project.theme.accent};cursor:pointer;pointer-events:auto;user-select:none;
      opacity:${this.factionPanelOpen ? '1' : '0.7'};transition:opacity .15s;`;
    btn.onmouseenter = () => { btn.style.opacity = '1'; };
    btn.onmouseleave = () => { btn.style.opacity = this.factionPanelOpen ? '1' : '0.7'; };
    btn.onclick = () => { this.factionPanelOpen = !this.factionPanelOpen; this.renderHUD(); };
    this.hudLayer.appendChild(btn);

    if (!this.factionPanelOpen) return;
    const panel = document.createElement('div');
    panel.style.cssText = `position:absolute;top:calc(2.5% + 2.4em);left:2%;min-width:12em;
      background:rgba(5,9,13,0.94);border:1px solid rgba(255,255,255,0.08);
      border-top:1px solid ${this.project.theme.accent}33;
      padding:0.9em 1.1em;pointer-events:auto;
      font-size:0.72em;color:#cfd9e2;backdrop-filter:blur(8px);`;
    const title = document.createElement('div');
    title.textContent = 'РЕПУТАЦИЯ ФРАКЦИЙ';
    title.style.cssText = `letter-spacing:3px;font-size:0.7em;color:#5f7a8a;margin-bottom:0.9em;`;
    panel.appendChild(title);
    for (const f of factions) {
      const info = computeFactionRep(this.project, f, (id) => this.state[id]);
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:0.7em;';
      const top = document.createElement('div');
      top.style.cssText = 'display:flex;justify-content:space-between;gap:1.5em;align-items:baseline;';
      const nm = document.createElement('span');
      nm.textContent = f.name;
      nm.style.cssText = `color:${f.color};letter-spacing:1px;`;
      const val = document.createElement('span');
      val.textContent = info.met > 0 ? `${info.rep}%` : '—';
      val.style.opacity = '0.8';
      top.append(nm, val);
      row.appendChild(top);
      const meta = document.createElement('div');
      meta.textContent = `связей: ${info.met} из ${info.total}`;
      meta.style.cssText = 'opacity:0.4;font-size:0.82em;margin-top:0.1em;';
      row.appendChild(meta);
      const bar = document.createElement('div');
      bar.style.cssText = `margin-top:0.35em;height:2px;
        background:rgba(255,255,255,0.08);overflow:hidden;`;
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;width:${info.rep}%;background:${f.color};`;
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
        this.setParagraphs(d, this.interpolate(el.text ?? ''));
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
        renderRichInto(d, this.interpolate(el.text ?? ''), { hoverRoot: d });
        // материал кнопки — ПОСЛЕ renderRichInto (тот очищает содержимое и стёр бы кольцо)
        if (el.boxStyle) {
          const bst = { ...el.boxStyle, radius: el.boxStyle.radius ?? s.radius ?? 10 };
          if ((bst.surface ?? 'default') === 'spatial' && s.fill) d.style.background = glassBg(s.fill, bst);
          applyBoxFx(d, bst, this.project.theme.accent, { kind: 'button' });
        }
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
      d.dataset.action = '1';
      d.addEventListener('click', () => this.runAction(el));
      if (this.dialogueActive) {
        d.style.opacity = '0.12';
        d.style.pointerEvents = 'none';
      }
    }
    return d;
  }

  private runAction(el: SceneElement) {
    const a = el.action!;
    if (a.giveItems?.length) this.giveItems(a.giveItems);
    if (a.effects) this.applyEffects(a.effects);
    if (a.type === 'gotoScene' && a.sceneId) this.gotoScene(a.sceneId);
    if (a.type === 'startDialogue' && a.dialogueId) this.startDialogue(a.dialogueId);
    if (a.type === 'startCombat' && a.mobId) {
      const mob = this.project.mobs?.find((m) => m.id === a.mobId);
      if (!mob || this.inCombat) return;
      runCombat(this, mob, (winRes) => {
        this.renderScene();
        const dlgId = winRes ? a.winDialogueId : a.loseDialogueId;
        if (dlgId) this.startDialogue(dlgId);
      });
    }
    if (a.type === 'openInventory') this.openInventory();
  }

  /** Открывает экран инвентаря напрямую — для кнопок на сцене там, где HUD скрыт (Scene.hudMode:'off') */
  openInventory() {
    this.invOpen = true;
    this.renderInventory();
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

  /** Всплывающее уведомление — тихая строка сверху справа, под HUD */
  notify(text: string, color = '#cfd9e2') {
    const n = document.createElement('div');
    n.textContent = text;
    n.style.cssText = `position:absolute;right:2%;
      background:rgba(5,9,13,0.88);border-left:2px solid ${color};color:${color};
      padding:0.45em 1em 0.45em 0.9em;font-size:calc(22 * 100cqw / ${CANVAS_W});
      letter-spacing:1px;pointer-events:none;z-index:50;backdrop-filter:blur(4px);
      opacity:0;transform:translateX(0.8em);
      transition:opacity .3s ease,transform .3s ease,top .3s ease;`;
    this.hudLayer.appendChild(n);
    this.notices.push(n);
    this.layoutNotices();
    requestAnimationFrame(() => {
      n.style.opacity = '1';
      n.style.transform = 'translateX(0)';
    });
    setTimeout(() => {
      n.style.opacity = '0';
      n.style.transform = 'translateX(0.8em)';
    }, 2400);
    setTimeout(() => {
      n.remove();
      this.notices = this.notices.filter((x) => x !== n);
      this.layoutNotices();
    }, 2800);
  }

  private layoutNotices() {
    this.notices.forEach((n, i) => {
      n.style.top = `calc(2.5% + 2.6em + ${i * 2.4}em)`;
    });
  }

  /** Праздничный баннер разблокировки ачивки — заметнее обычного notify() */
  private notifyAchievement(title: string, icon: string) {
    const n = document.createElement('div');
    n.className = 'tls-ach-popup';
    n.style.fontSize = `calc(24 * 100cqw / ${CANVAS_W})`;
    const ic = document.createElement('div');
    ic.className = 'tls-ach-icon';
    ic.textContent = icon;
    n.appendChild(ic);
    const txt = document.createElement('div');
    const kicker = document.createElement('div');
    kicker.className = 'tls-ach-kicker';
    kicker.textContent = 'ДОСТИЖЕНИЕ';
    txt.appendChild(kicker);
    const t = document.createElement('div');
    t.className = 'tls-ach-title';
    t.textContent = title;
    txt.appendChild(t);
    n.appendChild(txt);
    this.hudLayer.appendChild(n);
    // renderHUD() подчищает hudLayer от всего, что не отслежено — регистрируем отдельно
    // от notices (у баннера своя, статичная позиция — layoutNotices() её не должен трогать)
    this.achievementPopups.push(n);
    setTimeout(() => {
      n.remove();
      this.achievementPopups = this.achievementPopups.filter((x) => x !== n);
    }, 3600);
  }

  // ---------- диалоги ----------
  startDialogue(id: string) {
    const dlg = this.project.dialogues.find((d) => d.id === id);
    if (!dlg || !dlg.startNodeId) return;
    this.currentDialogue = dlg;
    this.currentSpeakerNpcId = null;
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
      case 'jump': {
        // если после перехода диалог продолжается — подавляем onEnter новой сцены;
        // иначе закрываем текущий бокс ДО перехода, чтобы не стереть onEnter-диалог
        const nextNode = this.node(n.next);
        const continues = !!nextNode && nextNode.type !== 'end';
        if (!continues) this.endDialogue();
        if (n.gotoSceneId) this.gotoScene(n.gotoSceneId, continues);
        if (continues) this.showNode(nextNode!.id);
        return;
      }
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
    this.currentSpeakerNpcId = null;
    this.dialogueLayer.innerHTML = '';
    this.dialogueActive = false;
    this.applySceneDim();
  }

  /** Скин диалогового блока для текущего собеседника (фракция NPC последней реплики) */
  private resolveSkin(): { cls: string; accent: string | null; faction?: Faction } {
    const npc = this.currentSpeakerNpcId
      ? this.project.npcs?.find((x) => x.id === this.currentSpeakerNpcId)
      : undefined;
    const faction = npc?.factionId
      ? this.project.factions?.find((f) => f.id === npc.factionId)
      : undefined;
    if (faction?.skinId) return { cls: `dskin-${faction.skinId}`, accent: faction.color, faction };
    return { cls: '', accent: null, faction };
  }

  /**
   * Материал из библиотеки для текущей реплики.
   * Приоритет: нода > правила диалога (первое истинное) > диалог > NPC.
   * Ниже (если материал не найден) действует цепочка G4: сцена > фракция > тема.
   */
  private resolveMaterial(node?: DialogueNode): MaterialDef | undefined {
    const mats = this.project.materials ?? [];
    if (mats.length === 0) return undefined;
    const byId = (id?: string) => (id ? mats.find((m) => m.id === id) : undefined);
    const fromNode = byId(node?.materialId);
    if (fromNode) return fromNode;
    const dlg = this.currentDialogue;
    for (const r of dlg?.materialRules ?? []) {
      if (r.materialId && this.checkConditions(r.conditions)) {
        const m = byId(r.materialId);
        if (m) return m;
      }
    }
    const fromDlg = byId(dlg?.materialId);
    if (fromDlg) return fromDlg;
    const npc = this.currentSpeakerNpcId
      ? this.project.npcs?.find((x) => x.id === this.currentSpeakerNpcId)
      : undefined;
    return byId(npc?.materialId);
  }

  private makeBox(node?: DialogueNode): HTMLElement {
    const t = this.project.theme;
    this.dialogueLayer.innerHTML = '';
    const { cls, accent } = this.resolveSkin();
    const box = document.createElement('div');
    box.className = `dbox ${cls}`;
    box.style.setProperty('--dbox-bg', t.dialogueBox);
    box.style.setProperty('--dbox-border-accent', accent ?? t.accent);
    box.style.setProperty('--dbox-name-accent', accent ?? t.speakerColor);
    box.style.cssText += `position:absolute;left:8%;right:8%;bottom:5%;
      color:${t.dialogueText};
      border-left:1px solid rgba(255,255,255,0.07);border-right:1px solid rgba(255,255,255,0.07);
      border-bottom:1px solid rgba(255,255,255,0.07);
      padding:1.8% 3.2%;pointer-events:auto;
      font-size:calc(30 * 100cqw / ${CANVAS_W});line-height:1.42;`;
    // материал блока: библиотека (нода/правила/диалог/NPC) > сцена > фракция > тема
    const boxStyle = this.resolveMaterial(node)?.box
      ?? this.currentScene?.dialogueBoxStyle
      ?? this.resolveSkin().faction?.boxStyle
      ?? t.dialogueBoxStyle;
    applyBoxFx(box, boxStyle, accent ?? t.accent);
    this.dialogueLayer.appendChild(box);
    // форс-reflow, чтобы анимация входа проигрывалась заново на каждой реплике
    void box.offsetWidth;
    box.classList.add('enter');
    // пока открыт диалог — действия сцены гаснут (конфликт слоёв снят)
    this.dialogueActive = true;
    this.applySceneDim();
    return box;
  }

  /** Затухание интерактивных элементов сцены во время диалога */
  private applySceneDim() {
    this.sceneLayer.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
      el.style.opacity = this.dialogueActive ? '0.12' : '';
      el.style.pointerEvents = this.dialogueActive ? 'none' : '';
      el.style.transition = 'opacity .3s';
    });
  }

  private renderLine(n: DialogueNode) {
    const t = this.project.theme;
    const npc = n.speakerNpcId ? this.project.npcs?.find((x) => x.id === n.speakerNpcId) : undefined;
    this.currentSpeakerNpcId = npc?.id ?? null;
    const box = this.makeBox(n);

    if (npc) {
      // первое знакомство
      if (this.state[npc.metVarId] !== true) {
        this.state[npc.metVarId] = true;
        materializeFactionReps(this.project, this.state);
        this.checkQuestSteps();
        this.checkAchievements();
        this.opts.onVarsChanged?.(this.state);
        this.scheduleSave();
      }
      const head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;gap:0.8em;margin-bottom:0.7em;';
      const img = document.createElement('img');
      img.className = 'dportrait';
      img.src = npcPortrait(this.project, npc);
      img.style.cssText = `width:2.6em;height:2.6em;border-radius:50%;flex:0 0 auto;cursor:pointer;
        border:1px solid color-mix(in srgb, var(--dbox-name-accent) 55%, transparent);padding:2px;box-sizing:border-box;
        transition:transform .15s;`;
      img.title = 'Открыть профиль персонажа';
      img.onmouseenter = () => { img.style.transform = 'scale(1.08)'; };
      img.onmouseleave = () => { img.style.transform = ''; };
      img.onclick = (e) => { e.stopPropagation(); this.openCharacterProfile(npc.id); };
      head.appendChild(img);
      const nameWrap = document.createElement('div');
      const sp = document.createElement('div');
      sp.className = 'dname';
      sp.style.color = 'var(--dbox-name-accent)';
      sp.textContent = npc.name;
      nameWrap.appendChild(sp);
      // Осколок ур.1+: видно отношение собеседника (тонкая hairline-шкала)
      if (this.oskolokLevel >= 1) {
        const rel = Number(this.state[npc.relationVarId] ?? 0);
        const bar = document.createElement('div');
        bar.className = 'drel';
        bar.style.cssText = `margin-top:0.4em;width:10em;height:2px;
          background:rgba(255,255,255,0.09);overflow:hidden;`;
        const fill = document.createElement('div');
        fill.className = 'drel-fill';
        fill.style.cssText = `height:100%;width:${rel}%;
          background:${relColor(rel)};transition:width .3s;`;
        bar.appendChild(fill);
        bar.title = `Отношение: ${rel}/100`;
        nameWrap.appendChild(bar);
      }
      head.appendChild(nameWrap);
      box.appendChild(head);
    } else if (n.speaker) {
      const sp = document.createElement('div');
      sp.className = 'dname';
      sp.style.cssText = 'color:var(--dbox-name-accent);margin-bottom:0.6em;';
      sp.textContent = n.speaker;
      box.appendChild(sp);
    }
    const txt = document.createElement('div');
    txt.style.cssText = 'line-height:1.42;';
    this.setParagraphs(txt, this.interpolate(n.text ?? ''), 'dline');
    box.appendChild(txt);

    const hint = document.createElement('div');
    hint.className = 'dhint';
    hint.style.cssText = `margin-top:1em;text-align:right;font-size:0.6em;
      letter-spacing:3px;text-transform:uppercase;`;
    hint.textContent = 'дальше ▸';
    box.appendChild(hint);

    box.style.cursor = 'pointer';
    box.onclick = () => this.advance(n.next);
  }

  private renderChoice(n: DialogueNode) {
    const t = this.project.theme;
    const box = this.makeBox(n);
    const list = document.createElement('div');
    list.className = 'dchoices';
    list.style.cssText = 'display:flex;flex-direction:column;gap:0.5em;';
    box.appendChild(list);

    // материал вариантов: библиотека > сцена > тема; акцент — фракция собеседника
    const cStyle = this.resolveMaterial(n)?.choice ?? this.currentScene?.choiceStyle ?? t.choiceStyle;
    const choiceAccent = this.resolveSkin().accent ?? t.accent;
    const choiceBg = glassBg(t.choiceBg, cStyle);
    const choiceHoverBg = glassBg(t.choiceHover, cStyle);
    // цвет левой границы в покое: у классики маркер невидим (transparent),
    // у spatial-пилюли слева та же hairline-рамка, что и по периметру —
    // иначе после первого наведения левая часть обводки «пропадала»
    const spatialChoice = (cStyle?.surface ?? 'default') === 'spatial';
    const idleLeftBorder = spatialChoice
      ? 'color-mix(in srgb, var(--bfx-accent) 18%, rgba(255,255,255,0.05))'
      : 'transparent';

    const available = (n.choices ?? []).filter((c) => this.checkConditions(c.conditions));
    const relIds = new Set((this.project.npcs ?? []).map((x) => x.relationVarId));
    for (const c of available) {
      // Осколок ур.3+: маркер слева — как вариант повлияет на отношения
      let delta = 0;
      if (this.oskolokLevel >= 3) {
        for (const e of c.effects) {
          if (!relIds.has(e.varId)) continue;
          if (e.op === 'add') delta += Number(e.value);
          if (e.op === 'sub') delta -= Number(e.value);
        }
      }
      const btn = document.createElement('div');
      btn.className = 'dchoice';
      btn.style.cssText = `background:${choiceBg};color:${t.choiceText};
        padding:0.5em 1em 0.5em 0.9em;cursor:pointer;display:flex;gap:0.8em;
        align-items:baseline;border-left:2px solid transparent;position:relative;overflow:hidden;
        transition:background .15s,border-color .15s;`;
      applyBoxFx(btn, cStyle, choiceAccent, { kind: 'button' });
      const sheen = document.createElement('div');
      sheen.className = 'dchoice-sheen';
      btn.appendChild(sheen);
      const mark = document.createElement('span');
      mark.style.cssText = 'flex:0 0 1em;font-size:0.7em;';
      if (delta > 0) { mark.textContent = '▲'; mark.style.color = '#98c379'; }
      else if (delta < 0) { mark.textContent = '▼'; mark.style.color = '#e06c75'; }
      else { mark.textContent = '◊'; mark.style.color = 'color-mix(in srgb, var(--dbox-border-accent) 66%, transparent)'; }
      btn.appendChild(mark);
      const txt = document.createElement('span');
      renderRichInto(txt, this.interpolate(c.text), { hoverRoot: btn });
      btn.appendChild(txt);
      btn.onmouseenter = () => {
        btn.style.background = choiceHoverBg;
        btn.style.borderLeftColor = 'var(--dbox-border-accent)';
        sheen.classList.remove('play');
        void sheen.offsetWidth; // форс-reflow — блик переигрывается при каждом наведении
        sheen.classList.add('play');
      };
      btn.onmouseleave = () => {
        btn.style.background = choiceBg;
        btn.style.borderLeftColor = idleLeftBorder;
      };
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

  /** Открыть журнал (закрывает инвентарь) */
  openJournal() {
    this.invOpen = false;
    this.invLayer.innerHTML = '';
    renderJournal(this, this.invLayer, () => { this.invLayer.innerHTML = ''; this.renderHUD(); });
  }

  // ---------- профиль персонажа (экран) ----------
  /** Открыть профиль NPC — из клика по портрету в диалоге или из вкладки «Персонажи» журнала */
  openCharacterProfile(npcId: string) {
    this.invOpen = false;
    this.invLayer.innerHTML = '';
    this.renderCharacterProfile(npcId);
  }

  private renderCharacterProfile(npcId: string) {
    const npc = this.project.npcs?.find((n) => n.id === npcId);
    this.invLayer.innerHTML = '';
    if (!npc) return;
    const met = this.state[npc.metVarId] === true;
    const faction = npc.factionId ? this.project.factions?.find((f) => f.id === npc.factionId) : undefined;
    const accent = faction?.color ?? this.project.theme.accent;

    const backdrop = document.createElement('div');
    backdrop.style.cssText = `position:absolute;inset:0;background:rgba(2,4,6,0.72);
      pointer-events:auto;backdrop-filter:blur(3px);`;
    backdrop.onclick = (e) => { if (e.target === backdrop) { this.invLayer.innerHTML = ''; this.renderHUD(); } };
    this.invLayer.appendChild(backdrop);

    const panel = document.createElement('div');
    panel.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      width:76%;max-width:52em;height:86%;background:rgba(6,10,14,0.97);
      border:1px solid rgba(255,255,255,0.08);border-top:1px solid color-mix(in srgb, ${accent} 20%, transparent);
      display:flex;font-size:0.85em;color:#cfd9e2;overflow:hidden;`;
    backdrop.appendChild(panel);

    const close = document.createElement('div');
    close.textContent = '✕';
    close.style.cssText = 'position:absolute;top:0.8em;right:1em;cursor:pointer;opacity:0.5;font-size:1.1em;z-index:1;';
    close.onclick = () => { this.invLayer.innerHTML = ''; this.renderHUD(); };
    panel.appendChild(close);

    // ---- левая колонка: портрет ----
    const left = document.createElement('div');
    left.style.cssText = 'flex:0 0 38%;position:relative;background:#05070a;';
    const img = document.createElement('img');
    img.src = met ? npcFullPortrait(this.project, npc) : placeholderFullPortrait('?', '#5f7a8a');
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    left.appendChild(img);
    panel.appendChild(left);

    // ---- правая колонка: досье ----
    const right = document.createElement('div');
    right.style.cssText = 'flex:1;padding:1.6em 1.8em;overflow-y:auto;min-width:0;';
    panel.appendChild(right);

    if (!met) {
      right.innerHTML = '';
      const kicker = document.createElement('div');
      kicker.textContent = 'НЕИЗВЕСТНАЯ ЛИЧНОСТЬ';
      kicker.style.cssText = 'font-size:0.7em;letter-spacing:3px;color:#5f7a8a;margin-bottom:0.6em;';
      right.appendChild(kicker);
      const hint = document.createElement('div');
      hint.style.cssText = 'opacity:0.6;line-height:1.5;';
      hint.textContent = 'Вы ещё не встречали этого человека.';
      right.appendChild(hint);
      return;
    }

    const nameEl = document.createElement('div');
    nameEl.textContent = npc.name;
    nameEl.style.cssText = `font-size:1.6em;font-weight:200;letter-spacing:2px;color:#e6edf3;margin-bottom:0.2em;`;
    right.appendChild(nameEl);

    if (npc.age || npc.role) {
      const sub = document.createElement('div');
      sub.textContent = [npc.role, npc.age ? `возраст: ${npc.age}` : ''].filter(Boolean).join(' · ');
      sub.style.cssText = 'font-size:0.78em;opacity:0.6;margin-bottom:0.6em;';
      right.appendChild(sub);
    }

    if (faction) {
      const badge = document.createElement('div');
      badge.textContent = faction.name;
      badge.style.cssText = `display:inline-block;color:${accent};font-size:0.68em;letter-spacing:3px;
        text-transform:uppercase;border-bottom:1px solid color-mix(in srgb, ${accent} 40%, transparent);
        padding-bottom:0.3em;margin-bottom:0.9em;`;
      right.appendChild(badge);
    }

    if (npc.quote) {
      const quote = document.createElement('div');
      quote.textContent = `«${npc.quote}»`;
      quote.style.cssText = 'font-style:italic;opacity:0.75;line-height:1.5;margin-bottom:1.1em;';
      right.appendChild(quote);
    }

    // отношение — та же hairline-полоса, что и в диалоге (Осколок ур.1+)
    if (this.oskolokLevel >= 1) {
      const rel = Number(this.state[npc.relationVarId] ?? 0);
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:1.2em;';
      const label = document.createElement('div');
      label.textContent = `ОТНОШЕНИЕ · ${rel}/100`;
      label.style.cssText = 'font-size:0.65em;letter-spacing:2px;color:#5f7a8a;margin-bottom:0.4em;';
      row.appendChild(label);
      const bar = document.createElement('div');
      bar.style.cssText = 'width:100%;max-width:16em;height:2px;background:rgba(255,255,255,0.09);overflow:hidden;';
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;width:${rel}%;background:${relColor(rel)};transition:width .3s;`;
      bar.appendChild(fill);
      row.appendChild(bar);
      right.appendChild(row);
    }

    const section = (title: string, text?: string) => {
      if (!text) return;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin-bottom:1.1em;';
      const h = document.createElement('div');
      h.textContent = title;
      h.style.cssText = 'font-size:0.65em;letter-spacing:2px;color:#5f7a8a;margin-bottom:0.3em;text-transform:uppercase;';
      wrap.appendChild(h);
      const body = document.createElement('div');
      body.style.cssText = 'line-height:1.5;';
      this.setParagraphs(body, text);
      wrap.appendChild(body);
      right.appendChild(wrap);
    };
    section('Досье', npc.description);
    section('Характер', npc.personality);
    section('Сильные стороны', npc.strengths);
    section('Слабые стороны', npc.weaknesses);
    section('Страхи', npc.fears);
    section('Желания', npc.wants);
    section('Отношение к Archon', npc.archonView);
    section('Отношение к OldNet', npc.oldnetView);

    if (npc.relationships?.length) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin-bottom:1.1em;';
      const h = document.createElement('div');
      h.textContent = 'Связи';
      h.style.cssText = 'font-size:0.65em;letter-spacing:2px;color:#5f7a8a;margin-bottom:0.5em;text-transform:uppercase;';
      wrap.appendChild(h);
      for (const rel of npc.relationships) {
        const other = this.project.npcs?.find((n) => n.id === rel.npcId);
        if (!other) continue;
        const row = document.createElement('div');
        row.style.cssText = `display:flex;justify-content:space-between;gap:1em;padding:0.4em 0;
          border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;`;
        const otherFaction = other.factionId ? this.project.factions?.find((f) => f.id === other.factionId) : undefined;
        const nm = document.createElement('span');
        nm.textContent = other.name;
        nm.style.color = otherFaction?.color ?? '#cfd9e2';
        const lb = document.createElement('span');
        lb.textContent = rel.label;
        lb.style.cssText = 'opacity:0.6;';
        row.append(nm, lb);
        row.onclick = () => this.renderCharacterProfile(other.id);
        wrap.appendChild(row);
      }
      right.appendChild(wrap);
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

    const accent = this.project.theme.accent;
    const panel = document.createElement('div');
    panel.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      width:84%;height:88%;background:rgba(6,10,14,0.97);border:1px solid rgba(255,255,255,0.08);
      border-top:1px solid ${accent}33;padding:1.2em 1.6em;display:flex;flex-direction:column;
      gap:0.8em;font-size:0.75em;color:#cfd9e2;overflow:hidden;`;
    backdrop.appendChild(panel);

    const v = (name: string) => Number(this.state[heroVarId(this.project, name) ?? ''] ?? 0);
    const cells = computeCells(this.project, v('endur'), this.equippedItems());

    // ---- шапка ----
    const headRow = document.createElement('div');
    headRow.style.cssText = 'display:flex;align-items:baseline;gap:1.2em;';
    const title = document.createElement('div');
    title.textContent = 'ИНВЕНТАРЬ';
    title.style.cssText = 'font-size:1.5em;font-weight:200;letter-spacing:8px;color:#e6edf3;';
    headRow.appendChild(title);
    const kicker = document.createElement('div');
    kicker.textContent = `РЮКЗАК · ${this.inventory.length} ИЗ ${cells}`;
    kicker.style.cssText = 'font-size:0.72em;letter-spacing:3px;color:#5f7a8a;flex:1;';
    headRow.appendChild(kicker);
    const mkSort = (label: string, fn: (a: InvCell, b: InvCell) => number) => {
      const b = document.createElement('div');
      b.textContent = label;
      b.style.cssText = `cursor:pointer;font-size:0.7em;letter-spacing:2px;color:#5f7a8a;
        border-bottom:1px solid transparent;transition:color .15s;text-transform:uppercase;`;
      b.onmouseenter = () => { b.style.color = '#cfd9e2'; };
      b.onmouseleave = () => { b.style.color = '#5f7a8a'; };
      b.onclick = () => { this.inventory.sort(fn); this.scheduleSave(); this.renderInventory(); };
      return b;
    };
    const defOf = (c: InvCell) => this.itemDef(c.itemId);
    headRow.appendChild(mkSort('по типу', (a, b) => (defOf(a)?.type ?? '').localeCompare(defOf(b)?.type ?? '')));
    headRow.appendChild(mkSort('по редкости', (a, b) =>
      (RARITY_META[defOf(b)?.rarity ?? 'junk'].order) - (RARITY_META[defOf(a)?.rarity ?? 'junk'].order)));
    const close = document.createElement('div');
    close.textContent = '✕';
    close.style.cssText = 'cursor:pointer;opacity:0.5;padding:0 0.3em;';
    close.onclick = () => { this.invOpen = false; this.renderInventory(); };
    headRow.appendChild(close);
    panel.appendChild(headRow);

    const body = document.createElement('div');
    body.style.cssText = 'flex:1;display:flex;gap:1.6em;min-height:0;';
    panel.appendChild(body);

    // ---- манекен: слоты вокруг силуэта ----
    const left = document.createElement('div');
    left.style.cssText = 'flex:0 0 40%;display:flex;flex-direction:column;gap:0.6em;min-height:0;';
    const manWrap = document.createElement('div');
    manWrap.style.cssText = 'flex:1;display:flex;gap:0.7em;min-height:0;align-items:stretch;';
    const colL = document.createElement('div');
    colL.style.cssText = 'display:flex;flex-direction:column;justify-content:space-between;gap:0.5em;flex:0 0 34%;';
    const colR = document.createElement('div');
    colR.style.cssText = colL.style.cssText;
    // силуэт героя по центру
    const sil = document.createElement('div');
    sil.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;opacity:0.5;';
    const silSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 130" width="100%" height="100%">
<g fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="1.4">
<circle cx="30" cy="14" r="9"/>
<path d="M30 23 L30 78 M30 34 L12 58 M30 34 L48 58 M30 78 L18 122 M30 78 L42 122"/>
<path d="M14 30 Q30 24 46 30" stroke-opacity="0.2"/>
</g></svg>`;
    const silImg = document.createElement('img');
    silImg.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(silSvg);
    silImg.style.cssText = 'max-height:100%;max-width:100%;';
    silImg.draggable = false;
    sil.appendChild(silImg);

    for (const slot of ['head', 'weapon', 'hands', 'legs'] as ItemSlot[]) colL.appendChild(this.slotCell(slot));
    for (const slot of ['body', 'accessory', 'gadget', 'feet'] as ItemSlot[]) colR.appendChild(this.slotCell(slot));
    manWrap.append(colL, sil, colR);
    left.appendChild(manWrap);

    // сводка ключевых характеристик — тихая капс-строка
    const stats = document.createElement('div');
    stats.style.cssText = `display:flex;flex-wrap:wrap;gap:0.4em 1.3em;font-size:0.72em;
      letter-spacing:2px;color:#5f7a8a;border-top:1px solid rgba(255,255,255,0.07);padding-top:0.8em;`;
    const addStat = (label: string, val: string | number, titleFull?: string) => {
      const s = document.createElement('span');
      s.innerHTML = `${label} <span style="color:#cfd9e2">${val}</span>`;
      if (titleFull) s.title = titleFull;
      stats.appendChild(s);
    };
    addStat('УР', `${v('lvl')}`, `Опыт: ${Math.floor(v('exp'))}/${v('exp_need')}`);
    addStat('АТК', v('atk'), STAT_LABELS['atk']);
    addStat('ЗАЩ', v('def'), STAT_LABELS['def']);
    addStat('ЛОВ', v('agi'), STAT_LABELS['agi']);
    addStat('ВЫН', v('endur'), STAT_LABELS['endur']);
    addStat('КРИТ', `${v('crit_chance')}%`, `${STAT_LABELS['crit_chance']} · сила ${v('crit_pow')}%`);
    left.appendChild(stats);
    body.appendChild(left);

    // ---- ячейки рюкзака ----
    const right = document.createElement('div');
    right.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:0.6em;min-width:0;min-height:0;';
    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(3.6em,1fr));
      gap:0.45em;overflow-y:auto;align-content:start;flex:1;`;
    for (let i = 0; i < cells; i++) {
      grid.appendChild(this.invCell(i));
    }
    right.appendChild(grid);

    // легенда редкостей + подсказка
    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;align-items:center;gap:1.1em;flex-wrap:wrap;';
    for (const meta of Object.values(RARITY_META)) {
      const l = document.createElement('span');
      l.innerHTML = `<span style="color:${meta.color}">●</span> ${meta.label}`;
      l.style.cssText = 'font-size:0.62em;letter-spacing:1.5px;color:#5f7a8a;text-transform:uppercase;';
      foot.appendChild(l);
    }
    right.appendChild(foot);
    const hint = document.createElement('div');
    hint.textContent = 'ПЕРЕТАЩИТЬ НА СЛОТ — ЭКИПИРОВАТЬ · КЛИК — ДЕЙСТВИЯ';
    hint.style.cssText = 'opacity:0.3;font-size:0.6em;letter-spacing:2px;';
    right.appendChild(hint);
    body.appendChild(right);
  }

  /** Диагональный переливающийся блик поверх редких предметов (legendary/archon) */
  private addRarityShine(cell: HTMLElement, rarity: Rarity) {
    if (rarity !== 'legendary' && rarity !== 'archon') return;
    const shine = document.createElement('div');
    shine.className = 'tls-item-shine';
    cell.appendChild(shine);
  }

  private slotCell(slot: ItemSlot): HTMLElement {
    const cell = document.createElement('div');
    cell.dataset.slot = slot;
    cell.style.cssText = `flex:1;min-height:3.2em;border:1px dashed rgba(255,255,255,0.14);
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.25em;
      padding:0.3em;position:relative;`;
    const id = this.equipment[slot];
    const def = id ? this.itemDef(id) : null;
    if (def) {
      const color = RARITY_META[def.rarity].color;
      cell.style.border = `1px solid ${color}77`;
      cell.style.boxShadow = `0 0 12px ${color}22 inset`;
      const img = document.createElement('img');
      img.src = itemIcon(def);
      img.style.cssText = 'width:2em;height:2em;';
      img.draggable = false;
      cell.appendChild(img);
      const name = document.createElement('div');
      name.textContent = def.name;
      name.style.cssText = `font-size:0.58em;letter-spacing:1px;color:${color};text-align:center;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;text-transform:uppercase;`;
      cell.appendChild(name);
      cell.title = this.itemTooltip(def) + '\nКлик — снять';
      cell.style.cursor = 'pointer';
      cell.onclick = () => this.unequipSlot(slot);
      this.addRarityShine(cell, def.rarity);
    } else {
      const lbl = document.createElement('div');
      lbl.textContent = ITEM_SLOT_LABELS[slot];
      lbl.style.cssText = 'font-size:0.6em;letter-spacing:2px;color:#3d4a56;text-transform:uppercase;';
      cell.appendChild(lbl);
    }
    return cell;
  }

  private invCell(index: number): HTMLElement {
    const cell = document.createElement('div');
    cell.dataset.cell = String(index);
    cell.style.cssText = `aspect-ratio:1;border:1px dashed rgba(255,255,255,0.09);
      position:relative;display:flex;align-items:center;justify-content:center;
      background:rgba(255,255,255,0.015);`;
    const item = this.inventory[index];
    const def = item ? this.itemDef(item.itemId) : null;
    if (!item || !def) return cell;

    cell.style.border = `1px solid ${RARITY_META[def.rarity].color}55`;
    cell.style.cursor = 'grab';
    cell.title = this.itemTooltip(def);
    const img = document.createElement('img');
    img.src = itemIcon(def);
    img.style.cssText = 'width:78%;height:78%;border-radius:0.3em;pointer-events:none;';
    img.draggable = false;
    cell.appendChild(img);
    this.addRarityShine(cell, def.rarity);
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
