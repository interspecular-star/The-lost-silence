// ============================================================
// Карта лагеря (блоки I, J) — spatial-навигация аванпоста.
// План-аксонометрия: ромбы-узлы как настраиваемый UI-компонент
// (вид nodeLook/look/lookIf по условиям — «слой Осколка»),
// пунктиры-связи с потоком (linkLook/visibleIf), живые пометки,
// сайдбар «кто здесь» + ВОЙТИ (сторона — настройка узла).
// Рамка ромба — SVG-полигон: CSS-border на clip-path срезается
// клипом (тонкий контур виден только у SVG), анимации рамки
// бегут честно по контуру ромба (pathLength=100).
// renderDiamond переиспользуем: холст редактора сейчас,
// ромбы-элементы обычных сцен — потом (roadmap 💡).
// ============================================================

import {
  Scene, CampMapConfig, CampMapNode, CampMapLink, CampNodeLook, CampLinkLook,
  CampMapMarkerStyle, Condition, CANVAS_W, CANVAS_H,
} from '../core/types';
import type { Engine } from './engine';
import { npcPortrait } from '../core/npc';

const ACCENT = '#4fd1c5';

/** Первая активная пометка узла (для карты) */
function activeMark(eng: Engine, node: CampMapNode): string {
  for (const m of node.marks ?? []) {
    if (eng.checkConditions(m.conditions)) return eng.interpolate(m.text);
  }
  return '';
}

function isLocked(eng: Engine, node: CampMapNode): boolean {
  if (!node.lockedIf?.length) return false;
  return eng.checkConditions(node.lockedIf);
}

// ---------- вид узла: дефолт карты → узел → lookIf по условиям ----------
function mergeLook(base: CampNodeLook, over?: CampNodeLook): CampNodeLook {
  if (!over) return { ...base };
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) if (v !== undefined) out[k] = v;
  return out as CampNodeLook;
}

/** Слитый вид узла БЕЗ условий (дефолт карты + узел) — им пользуется и холст редактора */
export function baseNodeLook(cfg: CampMapConfig, node: CampMapNode): CampNodeLook {
  // устаревший marker.ringOpacity — самый слабый дефолт заметности рамки
  const legacy: CampNodeLook = cfg.marker?.ringOpacity !== undefined
    ? { borderOpacity: cfg.marker.ringOpacity } : {};
  return mergeLook(mergeLook(legacy, cfg.nodeLook), node.look);
}

/** Индекс первого активного lookIf в списке (-1 — нет) */
function activeLookIdx(eng: Engine, list?: { conditions: Condition[] }[]): number {
  for (let i = 0; i < (list?.length ?? 0); i++) {
    if (eng.checkConditions(list![i].conditions)) return i;
  }
  return -1;
}

/** Полный вид узла: устаревший ringOpacity → дефолт карты → lookIf карты → узел → lookIf узла */
function resolveNodeLook(eng: Engine, cfg: CampMapConfig, node: CampMapNode): CampNodeLook {
  const legacy: CampNodeLook = cfg.marker?.ringOpacity !== undefined
    ? { borderOpacity: cfg.marker.ringOpacity } : {};
  let look = mergeLook(legacy, cfg.nodeLook);
  const mapIdx = activeLookIdx(eng, cfg.nodeLookIf);
  if (mapIdx >= 0) look = mergeLook(look, cfg.nodeLookIf![mapIdx].look);
  look = mergeLook(look, node.look);
  const idx = activeLookIdx(eng, node.lookIf);
  if (idx >= 0) look = mergeLook(look, node.lookIf![idx].look);
  return look;
}

/** Слитый вид связи (дефолт карты + связь), с дефолтами полей */
export function linkLookOf(cfg: CampMapConfig, link: CampMapLink): Required<CampLinkLook> {
  const merged: Record<string, unknown> = { ...(cfg.linkLook ?? {}) };
  for (const [k, v] of Object.entries(link.look ?? {})) if (v !== undefined) merged[k] = v;
  const l = merged as CampLinkLook;
  return {
    color: l.color ?? '#ffffff',
    opacity: l.opacity ?? 14,
    width: l.width ?? 1.5,
    dash: l.dash ?? 4,
    flow: l.flow ?? 'none',
    tempo: l.tempo ?? 'normal',
  };
}

/** Подпись видимого состояния карты — движок включает её в sig сцены,
 *  чтобы пересборка происходила только когда карта реально изменилась. */
export function campMapSig(eng: Engine, scene: Scene): string {
  const cfg = scene.campMap;
  if (!cfg) return '';
  const cur = eng.mapLoc[scene.id] ?? cfg.homeNodeId ?? '';
  const nodes = cfg.nodes.map((n) => {
    const vis = eng.checkConditions(n.visibleIf);
    return `${n.id}:${vis ? 1 : 0}${isLocked(eng, n) ? 'L' : ''}:${activeLookIdx(eng, n.lookIf)}:${activeMark(eng, n)}`;
  }).join('|');
  const links = (cfg.links ?? []).map((l) => (eng.checkConditions(l.visibleIf) ? 1 : 0)).join('');
  return `${cur}|g${activeLookIdx(eng, cfg.nodeLookIf)}|${nodes}|L:${links}`;
}

/** Высота ромба в % (ширина хранится в % ширины холста; 1.6 ≈ квадратный ромб в 16:9) */
function nodeH(size: number): number { return size * 1.6; }

const clampPct = (v: number | undefined, def: number) => Math.max(0, Math.min(100, v ?? def));

const FX_DUR: Record<string, number> = {
  shimmer: 6, star: 5, scan: 7, pulse: 3.6, heartbeat: 2.6,
  morse: 4, noise: 5, ember: 7, halo: 4.5, spectrum: 12,
};
const TEMPO_K = { slow: 1.8, normal: 1, fast: 0.55 } as const;

// ---------- переиспользуемый рендер ромба ----------
export interface DiamondSpec {
  look: CampNodeLook;              // уже слитый (baseNodeLook / resolveNodeLook)
  marker?: CampMapMarkerStyle;     // настройки маркеров карты
  state?: 'normal' | 'selected' | 'current';
  locked?: boolean;
  pulsing?: boolean;               // пульс маркера
  dimK?: number;                   // приглушение «дали» 0.25–1
  title: string;
  markText?: string;               // активная пометка ('' — нет)
  titlePx: number;                 // размер подписи в px логического холста (em = /26)
  accent?: string;                 // цвет акцента (по умолчанию цвет маркера)
  animate?: boolean;               // false — статичный холст редактора
}

/** Ромб-узел: заливка (хит-зона), SVG-рамка (+анимация), подпись с маркером.
 *  Возвращает обёртку position:absolute — геометрию (left/top/width/height) ставит вызывающий.
 *  Хит-зона — `.cmap-hit` внутри (клипована по ромбу, ловит клики). */
export function renderDiamond(spec: DiamondSpec): HTMLElement {
  const look = spec.look;
  const dimK = spec.dimK ?? 1;
  const state = spec.state ?? 'normal';
  const mk = spec.marker ?? {};
  const accent = spec.accent ?? look.markerColor ?? mk.color ?? ACCENT;
  const animate = spec.animate !== false;

  const wrap = document.createElement('div');
  wrap.className = 'cmap-nodewrap';
  wrap.style.cssText = `position:absolute;pointer-events:none;opacity:${dimK};`;

  // заливка + хит-зона (clip-path ловит клики только внутри ромба)
  const fillA = clampPct(look.fillOpacity, 5) / 100;
  const fill = look.fill ?? '#ffffff';
  const hit = document.createElement('div');
  hit.className = 'cmap-hit cmap-node';
  const bg = state === 'current'
    ? `radial-gradient(circle at 50% 50%, color-mix(in srgb, ${accent} 16%, transparent), transparent 70%),
       color-mix(in srgb, ${fill} ${(fillA * 100).toFixed(1)}%, transparent)`
    : `color-mix(in srgb, ${fill} ${(fillA * 100).toFixed(1)}%, transparent)`;
  hit.style.cssText = `position:absolute;inset:0;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);
    background:${bg};cursor:pointer;pointer-events:auto;`;
  if (look.fx?.surface === 'spatial') {
    const glass = Math.max(0, Math.min(40, look.fx.glass ?? 14));
    hit.style.backdropFilter = `blur(${(4 + glass * 0.3).toFixed(1)}px) saturate(1.15)`;
  }
  wrap.appendChild(hit);

  // рамка — SVG-полигон (CSS-border клипуется в ромбе, SVG — нет)
  const borderA = clampPct(look.borderOpacity, 22) / 100;
  const bw = look.borderWidth ?? 1;
  const ringColor = state === 'selected' ? `color-mix(in srgb, ${accent} 75%, transparent)`
    : state === 'current' ? `color-mix(in srgb, ${accent} 45%, transparent)`
    : `color-mix(in srgb, ${look.border ?? '#ffffff'} ${(borderA * 100).toFixed(1)}%, transparent)`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;';
  const mkPoly = () => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    p.setAttribute('points', '50,0 100,50 50,100 0,50');
    p.setAttribute('pathLength', '100');
    p.setAttribute('fill', 'none');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    return p;
  };
  if (bw > 0 && borderA > 0 || state !== 'normal') {
    const base = mkPoly();
    base.setAttribute('stroke', ringColor);
    base.setAttribute('stroke-width', String(Math.max(bw, state !== 'normal' ? 1 : bw)));
    svg.appendChild(base);
  }
  // анимированная рамка (материал): бежит по контуру ромба
  let fxName = look.fx?.border && look.fx.border !== 'none' ? look.fx.border : '';
  if (fxName === 'electric') fxName = 'pulse'; // SVG-разряд ромбу не даём — тихая замена (как в boxfx)
  if (fxName) {
    const fxPoly = mkPoly();
    const fxColor = look.fx?.accent || accent;
    const intensity = look.fx?.intensity ?? 'normal';
    const intK = intensity === 'quiet' ? 0.55 : intensity === 'loud' ? 1 : 0.8;
    fxPoly.setAttribute('stroke', fxColor);
    fxPoly.setAttribute('stroke-width', String(bw + 0.6));
    fxPoly.setAttribute('stroke-linecap', 'round');
    fxPoly.style.color = fxColor; // «Ореол» светится через currentColor
    fxPoly.style.opacity = String(intK);
    if (animate) {
      fxPoly.classList.add(`cmapfx-${fxName}`);
      const dur = (FX_DUR[fxName] ?? 4) * TEMPO_K[look.fx?.tempo ?? 'normal'];
      fxPoly.style.setProperty('--fxdur', `${dur.toFixed(2)}s`);
    } else {
      fxPoly.style.opacity = String(intK * 0.45); // холст: намёк без анимации
    }
    svg.appendChild(fxPoly);
  }
  wrap.appendChild(svg);

  // подпись: маркер-точка + название + пометка (клики не ловит)
  const scrimA = clampPct(look.scrim, 50) / 100;
  const label = document.createElement('div');
  label.style.cssText = `position:absolute;left:0;top:50%;width:100%;transform:translateY(-50%);
    text-align:center;pointer-events:none;padding:0.5em 0.3em;box-sizing:border-box;
    ${scrimA > 0 ? `background:radial-gradient(ellipse 110% 100% at 50% 50%, rgba(4,10,15,${scrimA.toFixed(2)}), rgba(4,10,15,0) 72%);` : ''}`;
  if (look.showMarker !== false) {
    const mkSize = mk.size ?? 11;
    const mkColor = look.markerColor ?? mk.color ?? ACCENT; // look может гасить/зажигать маркер (слой Осколка)
    const mkGlow = clampPct(look.markerGlow ?? mk.glow, 60);
    const dot = document.createElement('div');
    dot.className = 'cmap-dot' + (spec.pulsing && animate ? ' cmap-dot-cur' : '');
    const dotColor = spec.locked ? 'rgba(150,170,180,0.55)' : mkColor;
    dot.style.cssText = `width:${(mkSize / 26).toFixed(3)}em;height:${(mkSize / 26).toFixed(3)}em;
      margin:0 auto 0.35em;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);background:${dotColor};`;
    if (!spec.locked && mkGlow > 0) {
      dot.style.filter = `drop-shadow(0 0 ${(mkGlow / 260).toFixed(3)}em color-mix(in srgb, ${mkColor} ${Math.min(100, mkGlow + 25)}%, transparent))`;
    }
    label.appendChild(dot);
  }
  if (look.showTitle !== false) {
    const t = document.createElement('div');
    t.textContent = spec.title;
    t.style.cssText = `font-size:${(spec.titlePx / 26).toFixed(3)}em;font-weight:300;
      letter-spacing:0.11em;color:#eef4f8;text-transform:uppercase;
      text-shadow:0 1px 2px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.75);`;
    label.appendChild(t);
  }
  if (spec.markText && look.showMark !== false) {
    const m = document.createElement('div');
    m.textContent = spec.markText;
    const quiet = spec.locked || !spec.markText.startsWith('◊');
    m.style.cssText = `font-size:${((spec.titlePx - 6) / 26).toFixed(3)}em;margin-top:0.3em;
      letter-spacing:0.05em;color:${quiet ? '#8fa7b5' : accent};
      text-shadow:0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.75);`;
    label.appendChild(m);
  }
  wrap.appendChild(label);
  return wrap;
}

// ---------- слой связей (SVG) ----------
export interface LinkDrawOpts {
  animate?: boolean;                       // false — холст редактора
  interactive?: boolean;                   // true — линии ловят клики (редактор)
  onLineClick?: (link: CampMapLink) => void;
}

/** SVG-слой пунктиров между центрами узлов; координаты — % → логические px холста */
export function renderLinksSvg(
  cfg: CampMapConfig,
  nodePos: Map<string, { x: number; y: number }>,
  links: CampMapLink[],
  opts: LinkDrawOpts = {},
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;`;
  const seen = new Set<string>();
  for (const link of links) {
    const a = nodePos.get(link.a), b = nodePos.get(link.b);
    if (!a || !b || link.a === link.b) continue;
    const key = [link.a, link.b].sort().join('~');
    if (seen.has(key)) continue; // (a,b) == (b,a) — не рисуем дважды
    seen.add(key);
    const l = linkLookOf(cfg, link);
    const x1 = (a.x / 100) * CANVAS_W, y1 = (a.y / 100) * CANVAS_H;
    const x2 = (b.x / 100) * CANVAS_W, y2 = (b.y / 100) * CANVAS_H;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1)); line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2)); line.setAttribute('y2', String(y2));
    line.setAttribute('stroke', `color-mix(in srgb, ${l.color} ${Math.max(0, Math.min(100, l.opacity))}%, transparent)`);
    line.setAttribute('stroke-width', String(l.width));
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    const gap = l.dash > 0 ? l.dash * 2.25 : 0;
    if (l.dash > 0) line.setAttribute('stroke-dasharray', `${l.dash} ${gap}`);
    if (opts.animate !== false && l.flow === 'run' && l.dash > 0) {
      line.classList.add('cmap-linkrun');
      line.style.setProperty('--cyc', `${-(l.dash + gap)}`);
      line.style.setProperty('--fxdur', `${(3.5 * TEMPO_K[l.tempo]).toFixed(2)}s`);
    }
    if (opts.interactive && opts.onLineClick) {
      // невидимая широкая линия-хит поверх, чтобы попадать мышью
      // (pointerdown, не click: холст редактора на click успевает пересобрать DOM)
      const hitLine = line.cloneNode() as SVGLineElement;
      hitLine.classList.remove('cmap-linkrun');
      hitLine.setAttribute('stroke', 'transparent');
      hitLine.setAttribute('stroke-width', '12');
      hitLine.removeAttribute('stroke-dasharray');
      hitLine.style.cssText = 'pointer-events:stroke;cursor:pointer;';
      hitLine.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        opts.onLineClick!(link);
      });
      svg.appendChild(line);
      svg.appendChild(hitLine);
      continue;
    }
    svg.appendChild(line);
    if (opts.animate !== false && l.flow === 'dot') {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.classList.add('cmap-flowdot');
      dot.setAttribute('r', String(Math.max(2.5, l.width * 2.2)));
      dot.setAttribute('fill', l.color);
      dot.style.filter = `drop-shadow(0 0 5px ${l.color})`;
      const mo = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
      mo.setAttribute('dur', `${(4.5 * TEMPO_K[l.tempo]).toFixed(2)}s`);
      mo.setAttribute('repeatCount', 'indefinite');
      mo.setAttribute('path', `M ${x1} ${y1} L ${x2} ${y2}`);
      dot.appendChild(mo);
      svg.appendChild(dot);
    }
  }
  return svg;
}

export function renderCampMap(eng: Engine, scene: Scene, host: HTMLElement) {
  const cfg = scene.campMap;
  if (!cfg?.nodes.length) return;
  ensureCampMapStyles();

  const root = document.createElement('div');
  root.className = 'cmap';
  root.style.cssText = `position:absolute;inset:0;font-size:calc(26 * 100cqw / ${CANVAS_W});`;
  host.appendChild(root);

  const visibleNodes = cfg.nodes.filter((n) => eng.checkConditions(n.visibleIf));
  const nodeById = new Map(visibleNodes.map((n) => [n.id, n]));
  const currentId = eng.mapLoc[scene.id] ?? cfg.homeNodeId ?? '';

  const rebuild = () => {
    root.innerHTML = '';
    const selected = eng.mapSelection && nodeById.has(eng.mapSelection) ? eng.mapSelection : null;

    // ---------- план (статичен: сайдбар накрывает его, не сдвигая) ----------
    const plane = document.createElement('div');
    plane.className = 'cmap-plane';
    plane.style.cssText = 'position:absolute;inset:0;';
    plane.onclick = () => { if (eng.mapSelection) { eng.mapSelection = null; rebuild(); } };
    root.appendChild(plane);

    // связи (под узлами): видимость по условиям — слой Осколка
    const liveLinks = (cfg.links ?? []).filter((l) =>
      eng.checkConditions(l.visibleIf) && nodeById.has(l.a) && nodeById.has(l.b));
    if (liveLinks.length) {
      const pos = new Map(visibleNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
      plane.appendChild(renderLinksSvg(cfg, pos, liveLinks));
    }

    const mk = cfg.marker ?? {};
    const mkPulse = mk.pulse ?? 'current';

    // узлы
    for (const node of visibleNodes) {
      const size = node.size ?? 14;
      const h = nodeH(size);
      const locked = isLocked(eng, node);
      const isCurrent = node.id === currentId;
      const isSel = node.id === selected;
      const dimK = Math.max(0.25, 1 - (node.dim ?? 0) / 100);
      const markText = locked ? '···заперто' : activeMark(eng, node);

      const wrap = renderDiamond({
        look: resolveNodeLook(eng, cfg, node),
        marker: mk,
        state: isSel ? 'selected' : isCurrent ? 'current' : 'normal',
        locked,
        pulsing: !locked && (mkPulse === 'all' || (mkPulse === 'current' && isCurrent)),
        dimK,
        title: node.title,
        markText,
        titlePx: Math.round(6 + size * 0.95),
      });
      wrap.style.left = `${node.x - size / 2}%`;
      wrap.style.top = `${node.y - h / 2}%`;
      wrap.style.width = `${size}%`;
      wrap.style.height = `${h}%`;
      const hit = wrap.querySelector<HTMLElement>('.cmap-hit')!;
      hit.onclick = (e) => {
        e.stopPropagation();
        if (eng.mapSelection === node.id) { enter(node); return; } // повторный клик = войти
        eng.mapSelection = node.id;
        rebuild();
      };
      plane.appendChild(wrap);
    }

    // «текущее положение»
    const curNode = nodeById.get(currentId);
    if (curNode) {
      const foot = document.createElement('div');
      foot.textContent = `ТЕКУЩЕЕ ПОЛОЖЕНИЕ — ${curNode.title.toUpperCase()}`;
      foot.style.cssText = `position:absolute;bottom:3.7%;left:2%;font-size:0.54em;
        letter-spacing:2px;color:#5f7a8a;pointer-events:none;`;
      root.appendChild(foot);
    }

    // ---------- сайдбар (сторона выезда — настройка узла) ----------
    const selNode = selected ? nodeById.get(selected) : null;
    const sbSide = selNode?.side === 'left' ? 'left' : 'right';
    const sb = document.createElement('div');
    sb.className = 'cmap-sb';
    sb.style.cssText = `position:absolute;top:0;${sbSide}:0;bottom:0;width:34%;box-sizing:border-box;
      background:color-mix(in srgb, #08131a 90%, transparent);backdrop-filter:blur(12px);
      border-${sbSide === 'left' ? 'right' : 'left'}:1px solid rgba(255,255,255,0.10);
      padding:1em 1em;display:flex;flex-direction:column;
      transition:transform .5s cubic-bezier(.2,.7,.2,1), opacity .3s ease;
      transform:${selected ? 'translateX(0)' : `translateX(${sbSide === 'left' ? '-100%' : '100%'})`};
      opacity:${selected ? 1 : 0};pointer-events:${selected ? 'auto' : 'none'};`;
    root.appendChild(sb);

    if (selNode) {
      const locked = isLocked(eng, selNode);

      // хлебные крошки
      const crumbs = document.createElement('div');
      crumbs.style.cssText = 'display:flex;align-items:center;gap:0.4em;flex:none;';
      const back = document.createElement('span');
      back.textContent = '‹';
      back.style.cssText = 'font-size:0.55em;color:#5f7a8a;cursor:pointer;padding:0.2em 0.4em;';
      back.onclick = () => { eng.mapSelection = null; rebuild(); };
      const c1 = document.createElement('span');
      c1.textContent = scene.name.toUpperCase();
      c1.style.cssText = 'font-size:0.4em;letter-spacing:1.5px;color:#5f7a8a;cursor:pointer;';
      c1.onclick = () => { eng.mapSelection = null; rebuild(); };
      const c2 = document.createElement('span');
      c2.textContent = `›  ${selNode.title.toUpperCase()}`;
      c2.style.cssText = 'font-size:0.4em;letter-spacing:1.5px;color:#e6edf3;';
      crumbs.append(back, c1, c2);
      sb.appendChild(crumbs);

      const body = document.createElement('div');
      body.style.cssText = 'flex:1 1 auto;min-height:0;overflow-y:auto;margin-top:0.7em;';
      sb.appendChild(body);

      const title = document.createElement('div');
      title.textContent = selNode.title.toUpperCase();
      title.style.cssText = 'font-size:0.68em;font-weight:300;letter-spacing:2.5px;color:#e6edf3;';
      body.appendChild(title);

      if (selNode.tagline) {
        const tag = document.createElement('div');
        tag.textContent = eng.interpolate(selNode.tagline);
        tag.style.cssText = 'margin-top:0.35em;font-size:0.46em;color:#aebfca;font-weight:300;';
        body.appendChild(tag);
      }
      for (const m of selNode.marks ?? []) {
        if (!eng.checkConditions(m.conditions)) continue;
        const text = eng.interpolate(m.text);
        const quiet = !text.startsWith('◊');
        const row = document.createElement('div');
        row.textContent = text;
        row.style.cssText = `margin-top:0.35em;font-size:0.42em;letter-spacing:1px;
          color:${quiet ? '#5f7a8a' : ACCENT};`;
        body.appendChild(row);
      }

      const npcs = (selNode.npcIds ?? [])
        .map((id) => eng.project.npcs?.find((n) => n.id === id))
        .filter((n): n is NonNullable<typeof n> => !!n);
      if (npcs.length) {
        const hdr = document.createElement('div');
        hdr.textContent = 'КТО ЗДЕСЬ';
        hdr.style.cssText = `margin-top:0.8em;padding-top:0.55em;border-top:1px solid rgba(255,255,255,0.08);
          font-size:0.36em;letter-spacing:2px;color:#5f7a8a;`;
        body.appendChild(hdr);
        for (const npc of npcs) {
          const row = document.createElement('div');
          row.className = 'cmap-row';
          row.style.cssText = `display:flex;align-items:center;gap:0.5em;padding:0.35em 0.3em;
            border-bottom:1px solid rgba(255,255,255,0.06);`;
          const img = document.createElement('img');
          img.src = npcPortrait(eng.project, npc);
          img.style.cssText = 'width:1.5em;height:1.5em;border-radius:50%;border:1px solid rgba(255,255,255,0.16);flex:none;';
          const txt = document.createElement('div');
          const nm = document.createElement('div');
          nm.textContent = npc.name;
          nm.style.cssText = 'font-size:0.46em;color:#e6edf3;font-weight:300;';
          const role = document.createElement('div');
          role.textContent = npc.role ?? '';
          role.style.cssText = 'font-size:0.38em;color:#5f7a8a;margin-top:0.15em;';
          txt.append(nm, role);
          row.append(img, txt);
          body.appendChild(row);
        }
      }

      // низ: ВОЙТИ или «заперто»
      if (locked) {
        const lockRow = document.createElement('div');
        lockRow.textContent = eng.interpolate(selNode.lockedText || 'Пока недоступно.');
        lockRow.style.cssText = `flex:none;margin-top:0.6em;padding:0.6em 0.2em;text-align:center;
          border-top:1px solid rgba(255,255,255,0.08);font-size:0.44em;color:#5f7a8a;font-weight:300;`;
        sb.appendChild(lockRow);
      } else if (selNode.sceneId) {
        const enterBtn = document.createElement('div');
        enterBtn.textContent = 'ВОЙТИ';
        enterBtn.className = 'cmap-enter';
        enterBtn.style.cssText = `flex:none;margin-top:0.6em;text-align:center;padding:0.55em 0;
          border:1px solid rgba(79,209,197,0.35);border-radius:10px;background:rgba(79,209,197,0.08);
          color:${ACCENT};font-size:0.42em;letter-spacing:3px;cursor:pointer;transition:background .15s ease;`;
        enterBtn.onclick = () => enter(selNode);
        sb.appendChild(enterBtn);
      }
    }
  };

  const enter = (node: CampMapNode) => {
    if (!node.sceneId || isLocked(eng, node)) return;
    if (!eng.project.scenes.some((s) => s.id === node.sceneId)) return;
    eng.mapLoc[scene.id] = node.id;
    eng.mapSelection = null;
    eng.requestSave();
    eng.gotoScene(node.sceneId);
  };

  rebuild();
}

// ---------- стили ----------
let stylesDone = false;
export function ensureCampMapStyles() {
  if (stylesDone) return;
  stylesDone = true;
  const st = document.createElement('style');
  st.textContent = `
.cmap-node { transition: filter .2s ease, background .25s ease; }
.cmap-node:hover { filter: brightness(1.3); }
.cmap-row { border-radius: 6px; }
.cmap-enter:hover { background: rgba(79,209,197,0.16) !important; }
@keyframes cmap-dot-breathe {
  0%, 100% { transform: scale(1); opacity: 0.75; }
  50% { transform: scale(1.3); opacity: 1; }
}
.cmap-dot-cur { animation: cmap-dot-breathe 3.6s ease-in-out infinite; }

/* --- анимации рамки ромба (pathLength=100: дэши в % контура) --- */
@keyframes cmapfx-run100 { to { stroke-dashoffset: -100; } }
.cmapfx-star { stroke-dasharray: 10 90; animation: cmapfx-run100 var(--fxdur, 5s) linear infinite; }
.cmapfx-shimmer { stroke-dasharray: 42 58; filter: blur(1px);
  animation: cmapfx-run100 var(--fxdur, 6s) linear infinite; }
.cmapfx-morse { stroke-dasharray: 3 2 1 2; animation: cmapfx-run100 var(--fxdur, 4s) linear infinite; }
@keyframes cmapfx-scan-k {
  0% { stroke-dashoffset: 0; opacity: 0.9; } 28% { stroke-dashoffset: -100; opacity: 0.9; }
  30%, 100% { stroke-dashoffset: -100; opacity: 0; }
}
.cmapfx-scan { stroke-dasharray: 14 86; animation: cmapfx-scan-k var(--fxdur, 7s) linear infinite; }
@keyframes cmapfx-pulse-k { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.9; } }
.cmapfx-pulse { animation: cmapfx-pulse-k var(--fxdur, 3.6s) ease-in-out infinite; }
@keyframes cmapfx-heartbeat-k {
  0%, 100% { opacity: 0.15; } 12% { opacity: 0.95; } 24% { opacity: 0.25; }
  36% { opacity: 0.8; } 48% { opacity: 0.15; }
}
.cmapfx-heartbeat { animation: cmapfx-heartbeat-k var(--fxdur, 2.6s) linear infinite; }
@keyframes cmapfx-noise-k {
  0%, 7%, 100% { opacity: 0.5; } 8%, 11% { opacity: 0.1; } 12%, 40% { opacity: 0.55; }
  41%, 43% { opacity: 0.05; } 44%, 70% { opacity: 0.45; } 71%, 74% { opacity: 0.15; } 75% { opacity: 0.5; }
}
.cmapfx-noise { animation: cmapfx-noise-k var(--fxdur, 5s) steps(1) infinite; }
@keyframes cmapfx-ember-k { 0%, 100% { opacity: 0.15; } 40% { opacity: 0.55; } 60% { opacity: 0.7; } }
.cmapfx-ember { animation: cmapfx-ember-k var(--fxdur, 7s) ease-in-out infinite; }
@keyframes cmapfx-halo-k {
  0%, 100% { filter: drop-shadow(0 0 2px currentColor); opacity: 0.4; }
  50% { filter: drop-shadow(0 0 9px currentColor); opacity: 0.85; }
}
.cmapfx-halo { animation: cmapfx-halo-k var(--fxdur, 4.5s) ease-in-out infinite; }
@keyframes cmapfx-spectrum-k { to { filter: hue-rotate(360deg); } }
.cmapfx-spectrum { animation: cmapfx-spectrum-k var(--fxdur, 12s) linear infinite; }

/* --- поток по связи --- */
@keyframes cmap-linkrun-k { to { stroke-dashoffset: var(--cyc, -13); } }
.cmap-linkrun { animation: cmap-linkrun-k var(--fxdur, 3.5s) linear infinite; }

@media (prefers-reduced-motion: reduce) {
  .cmap-dot-cur, .cmap-linkrun,
  [class*="cmapfx-"] { animation: none !important; }
  .cmap-flowdot { display: none; }
  .cmap-sb { transition: none !important; }
}
`;
  document.head.appendChild(st);
}
