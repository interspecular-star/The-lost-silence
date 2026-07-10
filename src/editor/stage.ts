// ============================================================
// Холст сцены 16:9: масштаб, панорама, линейки, направляющие,
// перетаскивание с прилипанием, изменение размеров, выделение
// ============================================================

import { Store } from '../core/store';
import {
  Scene, SceneElement, ElementType, Guide, uid,
  CANVAS_W, CANVAS_H, ELEMENT_TYPE_LABELS,
} from '../core/types';
import { h } from './ui';
import { renderRichInto, splitRichParagraphs } from '../runtime/textfx';
import { applyBoxFx, glassBg } from '../runtime/boxfx';
import { applyTextGuard } from '../runtime/elementfx';

const RULER = 24;
const SNAP_SCREEN_PX = 7;

interface SnapTargets { xs: number[]; ys: number[]; }

export class StageView {
  root: HTMLElement;
  private store: Store;
  private viewport!: HTMLElement;
  private canvas!: HTMLElement;
  private rulerH!: HTMLCanvasElement;
  private rulerV!: HTMLCanvasElement;
  private zoomLabel!: HTMLElement;

  zoom = 0.5;
  panX = 40;
  panY = 40;
  private spaceDown = false;
  private didFit = false;

  constructor(store: Store) {
    this.store = store;
    this.root = h('div', { style: 'display:flex;flex-direction:column;flex:1;min-height:0;height:100%;' });
    this.buildToolbar();
    this.buildStage();

    store.on('change', () => this.renderCanvas());
    store.on('selection', () => this.renderCanvas());
    store.on('view', () => { this.renderCanvas(); this.drawRulers(); });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !isTyping()) {
        this.spaceDown = true;
        this.viewport?.classList.add('panning');
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        this.viewport?.classList.remove('panning');
      }
    });
  }

  onShow() {
    // первый показ — вписать холст
    requestAnimationFrame(() => {
      if (!this.didFit) { this.zoomToFit(); this.didFit = true; }
      this.applyTransform();
      this.drawRulers();
      this.renderCanvas();
    });
  }

  // ---------- панель инструментов ----------
  private buildToolbar() {
    const bar = h('div', {
      style: `height:38px;flex:0 0 auto;display:flex;align-items:center;gap:4px;padding:0 10px;
        background:var(--bg-panel);border-bottom:1px solid var(--border);`,
    });
    bar.appendChild(h('span', { style: 'color:var(--text-faint);font-size:11px;margin-right:4px;', text: 'Добавить:' }));

    const types: [ElementType, string][] = [
      ['text', 'T Текст'], ['rect', '▭ Панель'], ['image', '🖼 Изображение'],
      ['button', '⬚ Кнопка'], ['hotspot', '◎ Зона клика'],
    ];
    for (const [type, label] of types) {
      const b = h('button', { class: 'tb-btn', text: label, title: `Добавить: ${ELEMENT_TYPE_LABELS[type]}` });
      b.onclick = () => this.addElement(type);
      bar.appendChild(b);
    }

    bar.appendChild(h('div', { class: 'tb-spacer' }));

    const zoomOut = h('button', { class: 'tb-btn', text: '−', title: 'Уменьшить масштаб' });
    this.zoomLabel = h('span', { class: 'tb-zoom-label', text: '50%' });
    const zoomIn = h('button', { class: 'tb-btn', text: '+', title: 'Увеличить масштаб' });
    const fit = h('button', { class: 'tb-btn', text: '⛶ Вписать', title: 'Вписать холст в окно' });
    zoomOut.onclick = () => this.zoomAt(this.viewport.clientWidth / 2, this.viewport.clientHeight / 2, 1 / 1.25);
    zoomIn.onclick = () => this.zoomAt(this.viewport.clientWidth / 2, this.viewport.clientHeight / 2, 1.25);
    fit.onclick = () => { this.zoomToFit(); };
    bar.append(zoomOut, this.zoomLabel, zoomIn, fit);
    this.root.appendChild(bar);
  }

  // ---------- построение сцены ----------
  private buildStage() {
    const wrap = h('div', { id: 'stage-wrap' });
    const corner = h('div', { id: 'ruler-corner', text: '16:9', title: 'Сбросить вид (вписать)' });
    corner.onclick = () => this.zoomToFit();
    this.rulerH = h('canvas', { id: 'ruler-h' }) as HTMLCanvasElement;
    this.rulerV = h('canvas', { id: 'ruler-v' }) as HTMLCanvasElement;
    this.viewport = h('div', { id: 'viewport' });
    this.canvas = h('div', { id: 'canvas' });
    this.viewport.appendChild(this.canvas);
    wrap.append(corner, this.rulerH, this.rulerV, this.viewport);
    this.root.appendChild(wrap);

    // масштабирование колесом
    this.viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.viewport.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        this.zoomAt(mx, my, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      } else {
        this.panX -= e.shiftKey ? e.deltaY : e.deltaX;
        this.panY -= e.shiftKey ? 0 : e.deltaY;
        this.applyTransform();
        this.drawRulers();
      }
    }, { passive: false });

    // панорама и выделение
    this.viewport.addEventListener('pointerdown', (e) => this.onPointerDown(e));

    // создание направляющих с линеек
    this.rulerH.addEventListener('pointerdown', (e) => this.startGuideDrag(e, 'y'));
    this.rulerV.addEventListener('pointerdown', (e) => this.startGuideDrag(e, 'x'));

    new ResizeObserver(() => { this.drawRulers(); }).observe(this.viewport);
  }

  // ---------- координаты ----------
  private toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.panX) / this.zoom,
      y: (clientY - rect.top - this.panY) / this.zoom,
    };
  }

  private applyTransform() {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  zoomAt(vx: number, vy: number, factor: number) {
    const newZoom = Math.min(4, Math.max(0.08, this.zoom * factor));
    const lx = (vx - this.panX) / this.zoom;
    const ly = (vy - this.panY) / this.zoom;
    this.zoom = newZoom;
    this.panX = vx - lx * newZoom;
    this.panY = vy - ly * newZoom;
    this.applyTransform();
    this.drawRulers();
  }

  zoomToFit() {
    const w = this.viewport.clientWidth;
    const hgt = this.viewport.clientHeight;
    if (w < 50 || hgt < 50) return;
    const margin = 40;
    this.zoom = Math.min((w - margin * 2) / CANVAS_W, (hgt - margin * 2) / CANVAS_H);
    this.panX = (w - CANVAS_W * this.zoom) / 2;
    this.panY = (hgt - CANVAS_H * this.zoom) / 2;
    this.applyTransform();
    this.drawRulers();
  }

  // ---------- линейки ----------
  private drawRulers() {
    const drawScale = window.devicePixelRatio || 1;
    const wrapW = this.viewport.clientWidth;
    const wrapH = this.viewport.clientHeight;
    if (wrapW === 0) return;

    // подбор шага делений: хотим ~70-140 экранных px между подписями
    const steps = [10, 25, 50, 100, 200, 250, 500, 1000];
    let step = steps[steps.length - 1];
    for (const s of steps) { if (s * this.zoom >= 60) { step = s; break; } }

    const setup = (cv: HTMLCanvasElement, w: number, hh: number) => {
      cv.width = w * drawScale; cv.height = hh * drawScale;
      cv.style.width = `${w}px`; cv.style.height = `${hh}px`;
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(drawScale, 0, 0, drawScale, 0, 0);
      ctx.clearRect(0, 0, w, hh);
      ctx.fillStyle = '#191e25';
      ctx.fillRect(0, 0, w, hh);
      ctx.font = '9px Consolas, monospace';
      return ctx;
    };

    // горизонтальная
    {
      const ctx = setup(this.rulerH, wrapW, RULER);
      const from = Math.floor(((0 - this.panX) / this.zoom) / step) * step;
      const to = (wrapW - this.panX) / this.zoom;
      // зона холста подсвечена
      ctx.fillStyle = '#20262e';
      ctx.fillRect(this.panX, 0, CANVAS_W * this.zoom, RULER);
      for (let v = from; v <= to; v += step) {
        const x = this.panX + v * this.zoom;
        const isMajor = true;
        ctx.strokeStyle = '#3a4552';
        ctx.beginPath();
        ctx.moveTo(x + 0.5, isMajor ? 12 : 17);
        ctx.lineTo(x + 0.5, RULER);
        ctx.stroke();
        ctx.fillStyle = v >= 0 && v <= CANVAS_W ? '#8896a5' : '#4a5563';
        ctx.fillText(String(v), x + 3, 10);
        // промежуточные деления
        const sub = step / 5;
        for (let i = 1; i < 5; i++) {
          const sx = this.panX + (v + sub * i) * this.zoom;
          ctx.beginPath();
          ctx.moveTo(sx + 0.5, 19);
          ctx.lineTo(sx + 0.5, RULER);
          ctx.stroke();
        }
      }
    }

    // вертикальная
    {
      const ctx = setup(this.rulerV, RULER, wrapH);
      const from = Math.floor(((0 - this.panY) / this.zoom) / step) * step;
      const to = (wrapH - this.panY) / this.zoom;
      ctx.fillStyle = '#20262e';
      ctx.fillRect(0, this.panY, RULER, CANVAS_H * this.zoom);
      for (let v = from; v <= to; v += step) {
        const y = this.panY + v * this.zoom;
        ctx.strokeStyle = '#3a4552';
        ctx.beginPath();
        ctx.moveTo(12, y + 0.5);
        ctx.lineTo(RULER, y + 0.5);
        ctx.stroke();
        ctx.save();
        ctx.translate(9, y + 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = v >= 0 && v <= CANVAS_H ? '#8896a5' : '#4a5563';
        ctx.textAlign = 'right';
        ctx.fillText(String(v), 0, 0);
        ctx.restore();
        const sub = step / 5;
        for (let i = 1; i < 5; i++) {
          const sy = this.panY + (v + sub * i) * this.zoom;
          ctx.beginPath();
          ctx.moveTo(19, sy + 0.5);
          ctx.lineTo(RULER, sy + 0.5);
          ctx.stroke();
        }
      }
    }
  }

  /** Живой предпросмотр базовых настроек фона (без условных эффектов — те видны только в F5) */
  private renderBgPreview(scene: Scene): HTMLElement {
    const cfg = scene.bg ?? {};
    const opacity = (cfg.opacity ?? 100) / 100;
    const brightness = cfg.brightness ?? 100;
    const contrast = cfg.contrast ?? 100;
    const blur = cfg.blur ?? 0;
    const posX = cfg.posX ?? 50;
    const posY = cfg.posY ?? 50;
    const scale = (cfg.scale ?? 100) / 100;

    const wrap = h('div', { style: 'position:absolute;inset:0;overflow:hidden;' });
    const img = h('div', { style: 'position:absolute;inset:-10%;' });
    // фон (цвет/градиент) — шорткат, поэтому задаём ДО остальных свойств background-*
    img.style.background = scene.background;
    if (scene.bgImage) img.style.backgroundImage = `url(${scene.bgImage})`;
    img.style.backgroundSize = 'cover';
    img.style.backgroundPosition = `${posX}% ${posY}%`;
    img.style.transform = `scale(${scale})`;
    img.style.opacity = String(opacity);
    img.style.filter = `brightness(${brightness}%) contrast(${contrast}%)${blur ? ` blur(${blur}px)` : ''}`;
    wrap.appendChild(img);
    return wrap;
  }

  // ---------- рендер холста ----------
  renderCanvas() {
    const scene = this.store.currentScene;
    this.canvas.innerHTML = '';
    if (!scene) {
      this.canvas.style.background = '#000';
      return;
    }
    this.canvas.style.background = '#000';
    this.canvas.appendChild(this.renderBgPreview(scene));

    const sorted = [...scene.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    for (const el of sorted) {
      this.canvas.appendChild(this.renderElement(el));
    }

    if (this.store.gridEnabled) {
      this.canvas.appendChild(h('div', { class: 'grid-overlay' }));
    }

    if (this.store.guidesVisible) {
      for (const guide of scene.guides) this.canvas.appendChild(this.renderGuide(guide));
    }

    // выделение
    for (const el of this.store.selectedElements) {
      this.renderSelection(el);
    }
  }

  private renderElement(el: SceneElement): HTMLElement {
    const d = h('div', { class: `el${el.locked ? ' locked' : ''}` });
    d.dataset.id = el.id;
    const s = el.style;
    d.style.left = `${el.x}px`;
    d.style.top = `${el.y}px`;
    d.style.width = `${el.w}px`;
    d.style.height = `${el.h}px`;
    d.style.zIndex = String(el.zIndex ?? 0);
    if (el.rotation) d.style.transform = `rotate(${el.rotation}deg)`;
    if (el.visible === false) d.style.opacity = '0.25';
    else if (s.opacity !== undefined) d.style.opacity = String(s.opacity);

    if (s.fill) d.style.background = s.fill;
    if (s.radius) d.style.borderRadius = `${s.radius}px`;
    if (s.borderWidth) d.style.border = `${s.borderWidth}px solid ${s.borderColor ?? '#fff'}`;
    if (s.shadow) d.style.boxShadow = '0 8px 32px rgba(0,0,0,0.55)';
    d.style.color = s.textColor ?? '#fff';
    d.style.fontSize = `${s.fontSize ?? 24}px`;
    if (s.fontFamily) d.style.fontFamily = s.fontFamily;
    if (s.fontWeight) d.style.fontWeight = s.fontWeight;
    if (s.fontStyle) d.style.fontStyle = s.fontStyle;
    if (s.letterSpacing) d.style.letterSpacing = `${s.letterSpacing}px`;
    d.style.lineHeight = String(s.lineHeight ?? 1.4);
    d.style.textAlign = s.textAlign ?? 'left';
    d.style.whiteSpace = 'pre-wrap';
    d.style.overflow = 'hidden';

    switch (el.type) {
      case 'text': {
        applyTextGuard(d, s.guard, s.guardPower); // читаемость — видна и на холсте
        // абзацы рисуем КАК ДВИЖОК: пустая строка = компактный отступ 0.55em,
        // а не целая пустая строка — иначе высота блока на холсте и в игре расходилась
        d.textContent = '';
        splitRichParagraphs(el.text ?? '').forEach((para, i) => {
          const p = document.createElement('div');
          p.style.whiteSpace = 'pre-wrap';
          if (i > 0) p.style.marginTop = '0.55em';
          // разметка [b]/[c=…]/… видна статично (анимации — только в F5/игре)
          renderRichInto(p, para, { animate: false });
          d.appendChild(p);
        });
        break;
      }
      case 'button':
        applyTextGuard(d, s.guard, s.guardPower);
        d.style.display = 'flex';
        d.style.alignItems = 'center';
        d.style.justifyContent = s.textAlign === 'left' ? 'flex-start' : s.textAlign === 'right' ? 'flex-end' : 'center';
        // материал кнопки: на холсте показываем поверхность статично, без анимаций рамки
        if (el.boxStyle && (el.boxStyle.surface ?? 'default') === 'spatial') {
          const bst = { ...el.boxStyle, border: 'none' as const, radius: el.boxStyle.radius ?? s.radius ?? 10 };
          if (s.fill) d.style.background = glassBg(s.fill, bst);
          applyBoxFx(d, bst, this.store.project.theme.accent, { kind: 'button' });
        }
        renderRichInto(d, el.text ?? '', { animate: false });
        break;
      case 'image':
        if (el.src) {
          const img = h('img') as HTMLImageElement;
          img.src = el.src;
          img.draggable = false;
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;';
          if (s.radius) img.style.borderRadius = `${s.radius}px`;
          d.appendChild(img);
        } else {
          d.style.background = s.fill ?? 'rgba(255,255,255,0.06)';
          d.style.display = 'flex';
          d.style.alignItems = 'center';
          d.style.justifyContent = 'center';
          d.style.color = 'var(--text-faint)';
          d.textContent = '🖼 нет изображения';
        }
        break;
      case 'hotspot':
        d.style.background = 'rgba(79, 158, 232, 0.10)';
        d.style.border = '1px dashed rgba(79, 158, 232, 0.6)';
        break;
      case 'rect':
        break;
    }
    return d;
  }

  private renderGuide(guide: Guide): HTMLElement {
    const g = h('div', { class: `guide ${guide.axis === 'x' ? 'gx' : 'gy'}` });
    if (guide.axis === 'x') g.style.left = `${guide.pos}px`;
    else g.style.top = `${guide.pos}px`;
    g.title = `Направляющая ${guide.axis === 'x' ? 'X' : 'Y'}: ${Math.round(guide.pos)}. Перетащите на линейку, чтобы удалить.`;

    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.dragExistingGuide(guide, e);
    });
    return g;
  }

  // ---------- направляющие: перетаскивание ----------
  private startGuideDrag(e: PointerEvent, axis: 'x' | 'y') {
    const scene = this.store.currentScene;
    if (!scene) return;
    e.preventDefault();
    this.store.snapshot();
    const guide: Guide = { axis, pos: -10000 };
    scene.guides.push(guide);
    this.dragExistingGuide(guide, e, true);
  }

  private dragExistingGuide(guide: Guide, startEv: PointerEvent, isNew = false) {
    const scene = this.store.currentScene;
    if (!scene) return;
    if (!isNew) this.store.snapshot();

    const move = (e: PointerEvent) => {
      const p = this.toLogical(e.clientX, e.clientY);
      guide.pos = Math.round(guide.axis === 'x' ? p.x : p.y);
      this.renderCanvas();
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const p = this.toLogical(e.clientX, e.clientY);
      const pos = guide.axis === 'x' ? p.x : p.y;
      const limit = guide.axis === 'x' ? CANVAS_W : CANVAS_H;
      // за пределами холста — удаляем направляющую
      if (pos < -4 || pos > limit + 4) {
        scene.guides = scene.guides.filter((g) => g !== guide);
      }
      this.store.emit('change');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ---------- выделение и манипуляции ----------
  private renderSelection(el: SceneElement) {
    const box = h('div', { class: 'sel-box' });
    box.style.left = `${el.x}px`;
    box.style.top = `${el.y}px`;
    box.style.width = `${el.w}px`;
    box.style.height = `${el.h}px`;
    box.style.borderWidth = `${Math.max(1, 1 / this.zoom)}px`;
    this.canvas.appendChild(box);

    if (this.store.selectedElements.length === 1 && !el.locked) {
      const hs = Math.max(8, 9 / this.zoom);
      const positions: [string, number, number][] = [
        ['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0],
        ['w', 0, 0.5], ['e', 1, 0.5],
        ['sw', 0, 1], ['s', 0.5, 1], ['se', 1, 1],
      ];
      for (const [dir, fx, fy] of positions) {
        const hd = h('div', { class: 'sel-handle' });
        hd.style.width = `${hs}px`;
        hd.style.height = `${hs}px`;
        hd.style.left = `${el.x + el.w * fx - hs / 2}px`;
        hd.style.top = `${el.y + el.h * fy - hs / 2}px`;
        hd.style.cursor = `${dir}-resize`;
        hd.dataset.dir = dir;
        hd.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.startResize(el, dir, e);
        });
        this.canvas.appendChild(hd);
      }

      const label = h('div', { class: 'sel-size-label', text: `${Math.round(el.x)}, ${Math.round(el.y)} · ${Math.round(el.w)}×${Math.round(el.h)}` });
      label.style.left = `${el.x}px`;
      label.style.top = `${el.y + el.h + 6 / this.zoom}px`;
      label.style.transform = `scale(${1 / this.zoom})`;
      label.style.transformOrigin = '0 0';
      this.canvas.appendChild(label);
    }
  }

  private onPointerDown(e: PointerEvent) {
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      // панорама
      e.preventDefault();
      const startX = e.clientX; const startY = e.clientY;
      const startPanX = this.panX; const startPanY = this.panY;
      const move = (ev: PointerEvent) => {
        this.panX = startPanX + (ev.clientX - startX);
        this.panY = startPanY + (ev.clientY - startY);
        this.applyTransform();
        this.drawRulers();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    if (e.button !== 0) return;

    const target = (e.target as HTMLElement).closest('.el') as HTMLElement | null;
    const scene = this.store.currentScene;
    if (!scene) return;

    if (!target) {
      this.store.selectElements([]);
      return;
    }

    const id = target.dataset.id!;
    const el = scene.elements.find((x) => x.id === id);
    if (!el) return;

    // выделение
    if (e.shiftKey) {
      const ids = new Set(this.store.selectedElementIds);
      ids.has(id) ? ids.delete(id) : ids.add(id);
      this.store.selectElements([...ids]);
      return;
    }
    if (!this.store.selectedElementIds.includes(id)) {
      this.store.selectElements([id]);
    }
    if (el.locked) return;

    this.startDrag(e);
  }

  private startDrag(e: PointerEvent) {
    const scene = this.store.currentScene!;
    const els = this.store.selectedElements.filter((x) => !x.locked);
    if (els.length === 0) return;
    const startP = this.toLogical(e.clientX, e.clientY);
    const origins = els.map((el) => ({ el, x: el.x, y: el.y }));
    let snapped = false;
    let moved = false;

    const move = (ev: PointerEvent) => {
      const p = this.toLogical(ev.clientX, ev.clientY);
      let dx = p.x - startP.x;
      let dy = p.y - startP.y;
      if (!moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      if (!moved) { this.store.snapshot(); moved = true; }

      this.clearSnaplines();
      if (this.store.snapEnabled && !ev.altKey) {
        const res = this.applySnap(origins, dx, dy, els.map((x) => x.id));
        dx = res.dx; dy = res.dy;
      }
      for (const o of origins) {
        o.el.x = Math.round(o.x + dx);
        o.el.y = Math.round(o.y + dy);
      }
      this.renderCanvas();
      snapped = true;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.clearSnaplines();
      if (snapped) this.store.emit('change');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private startResize(el: SceneElement, dir: string, e: PointerEvent) {
    const startP = this.toLogical(e.clientX, e.clientY);
    const orig = { x: el.x, y: el.y, w: el.w, h: el.h };
    let moved = false;

    const move = (ev: PointerEvent) => {
      const p = this.toLogical(ev.clientX, ev.clientY);
      let dx = p.x - startP.x;
      let dy = p.y - startP.y;
      if (!moved) { this.store.snapshot(); moved = true; }

      let { x, y, w, h: hh } = orig;
      if (dir.includes('e')) w = orig.w + dx;
      if (dir.includes('s')) hh = orig.h + dy;
      if (dir.includes('w')) { x = orig.x + dx; w = orig.w - dx; }
      if (dir.includes('n')) { y = orig.y + dy; hh = orig.h - dy; }

      // прилипание краёв при изменении размера
      if (this.store.snapEnabled && !ev.altKey) {
        const targets = this.collectSnapTargets([el.id]);
        const t = SNAP_SCREEN_PX / this.zoom;
        this.clearSnaplines();
        if (dir.includes('e')) {
          const sx = nearest(x + w, targets.xs, t);
          if (sx !== null) { w = sx - x; this.showSnapline('x', sx); }
        }
        if (dir.includes('w')) {
          const sx = nearest(x, targets.xs, t);
          if (sx !== null) { w += x - sx; x = sx; this.showSnapline('x', sx); }
        }
        if (dir.includes('s')) {
          const sy = nearest(y + hh, targets.ys, t);
          if (sy !== null) { hh = sy - y; this.showSnapline('y', sy); }
        }
        if (dir.includes('n')) {
          const sy = nearest(y, targets.ys, t);
          if (sy !== null) { hh += y - sy; y = sy; this.showSnapline('y', sy); }
        }
      }

      el.x = Math.round(Math.min(x, x + w));
      el.y = Math.round(Math.min(y, y + hh));
      el.w = Math.round(Math.max(8, Math.abs(w)));
      el.h = Math.round(Math.max(8, Math.abs(hh)));
      this.renderCanvas();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.clearSnaplines();
      if (moved) this.store.emit('change');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ---------- прилипание ----------
  private collectSnapTargets(excludeIds: string[]): SnapTargets {
    const scene = this.store.currentScene!;
    const xs: number[] = [0, CANVAS_W / 2, CANVAS_W];
    const ys: number[] = [0, CANVAS_H / 2, CANVAS_H];
    for (const g of scene.guides) {
      if (g.axis === 'x') xs.push(g.pos);
      else ys.push(g.pos);
    }
    for (const el of scene.elements) {
      if (excludeIds.includes(el.id)) continue;
      xs.push(el.x, el.x + el.w / 2, el.x + el.w);
      ys.push(el.y, el.y + el.h / 2, el.y + el.h);
    }
    return { xs, ys };
  }

  private applySnap(
    origins: { el: SceneElement; x: number; y: number }[],
    dx: number, dy: number,
    excludeIds: string[],
  ): { dx: number; dy: number } {
    const targets = this.collectSnapTargets(excludeIds);
    const t = SNAP_SCREEN_PX / this.zoom;

    // общий bounding box перетаскиваемых элементов
    const minX = Math.min(...origins.map((o) => o.x)) + dx;
    const maxX = Math.max(...origins.map((o) => o.x + o.el.w)) + dx;
    const minY = Math.min(...origins.map((o) => o.y)) + dy;
    const maxY = Math.max(...origins.map((o) => o.y + o.el.h)) + dy;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    let bestDX: { delta: number; line: number } | null = null;
    for (const edge of [minX, cx, maxX]) {
      const s = nearest(edge, targets.xs, t);
      if (s !== null) {
        const delta = s - edge;
        if (!bestDX || Math.abs(delta) < Math.abs(bestDX.delta)) bestDX = { delta, line: s };
      }
    }
    let bestDY: { delta: number; line: number } | null = null;
    for (const edge of [minY, cy, maxY]) {
      const s = nearest(edge, targets.ys, t);
      if (s !== null) {
        const delta = s - edge;
        if (!bestDY || Math.abs(delta) < Math.abs(bestDY.delta)) bestDY = { delta, line: s };
      }
    }

    if (bestDX) { dx += bestDX.delta; this.showSnapline('x', bestDX.line); }
    if (bestDY) { dy += bestDY.delta; this.showSnapline('y', bestDY.line); }
    return { dx, dy };
  }

  private showSnapline(axis: 'x' | 'y', pos: number) {
    const line = h('div', { class: `snapline ${axis === 'x' ? 'sx' : 'sy'}` });
    if (axis === 'x') line.style.left = `${pos}px`;
    else line.style.top = `${pos}px`;
    this.canvas.appendChild(line);
  }

  private clearSnaplines() {
    this.canvas.querySelectorAll('.snapline').forEach((el) => el.remove());
  }

  // ---------- операции с элементами ----------
  addElement(type: ElementType) {
    const scene = this.store.currentScene;
    if (!scene) return;
    this.store.snapshot();
    const defaults: Record<ElementType, Partial<SceneElement>> = {
      text: { w: 600, h: 80, text: 'Новый текст', style: { textColor: '#e6edf3', fontSize: 32, textAlign: 'left' } },
      rect: { w: 400, h: 240, style: { fill: 'rgba(27, 36, 46, 0.85)', radius: 8 } },
      image: { w: 480, h: 320, style: {} },
      button: { w: 320, h: 70, text: 'Кнопка', style: { fill: 'rgba(79,209,197,0.10)', textColor: '#4fd1c5', fontSize: 24, radius: 6, borderColor: '#2a6f68', borderWidth: 1, textAlign: 'center' } },
      hotspot: { w: 260, h: 200, style: {} },
    };
    const def = defaults[type];
    const maxZ = Math.max(0, ...scene.elements.map((x) => x.zIndex ?? 0));
    const el: SceneElement = {
      id: uid('el'),
      name: `${ELEMENT_TYPE_LABELS[type]} ${scene.elements.length + 1}`,
      type,
      x: Math.round(CANVAS_W / 2 - (def.w ?? 200) / 2),
      y: Math.round(CANVAS_H / 2 - (def.h ?? 100) / 2),
      w: def.w ?? 200,
      h: def.h ?? 100,
      zIndex: maxZ + 1,
      text: def.text,
      style: def.style ?? {},
      action: type === 'button' || type === 'hotspot' ? { type: 'none' } : undefined,
    };
    scene.elements.push(el);
    this.store.emit('change');
    this.store.selectElements([el.id]);
  }
}

function nearest(value: number, targets: number[], threshold: number): number | null {
  let best: number | null = null;
  let bestDist = threshold;
  for (const t of targets) {
    const d = Math.abs(value - t);
    if (d <= bestDist) { bestDist = d; best = t; }
  }
  return best;
}

export function isTyping(): boolean {
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a as HTMLElement).isContentEditable);
}
