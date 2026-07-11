// ============================================================
// Карта лагеря (блок I) — spatial-навигация аванпоста.
// План-аксонометрия: ромбы-локации, пунктирные дорожки, живые
// пометки по условиям; сайдбар «кто здесь» + ВОЙТИ.
// Дизайн: docs/design/Аванпост Флакс-Номадов - прототип.html,
// решения владельца: гибрид — «Войти» ведёт в обычную сцену.
// ============================================================

import { Scene, CampMapNode, CANVAS_W, CANVAS_H } from '../core/types';
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

/** Подпись видимого состояния карты — движок включает её в sig сцены,
 *  чтобы пересborка происходила только когда карта реально изменилась. */
export function campMapSig(eng: Engine, scene: Scene): string {
  const cfg = scene.campMap;
  if (!cfg) return '';
  const cur = eng.mapLoc[scene.id] ?? cfg.homeNodeId ?? '';
  return cur + '|' + cfg.nodes.map((n) => {
    const vis = eng.checkConditions(n.visibleIf);
    return `${n.id}:${vis ? 1 : 0}${isLocked(eng, n) ? 'L' : ''}:${activeMark(eng, n)}`;
  }).join('|');
}

/** Высота ромба в % (ширина хранится в % ширины холста; 1.6 ≈ квадратный ромб в 16:9) */
function nodeH(size: number): number { return size * 1.6; }

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

    // ---------- план ----------
    const plane = document.createElement('div');
    plane.className = 'cmap-plane';
    plane.style.cssText = `position:absolute;inset:0;transition:transform .55s cubic-bezier(.2,.7,.2,1);
      transform:${selected ? 'translateX(-16%)' : 'none'};`;
    plane.onclick = () => { if (eng.mapSelection) { eng.mapSelection = null; rebuild(); } };
    root.appendChild(plane);

    // дорожки
    if (cfg.links.length) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
      for (const link of cfg.links) {
        const a = nodeById.get(link.a), b = nodeById.get(link.b);
        if (!a || !b) continue;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String((a.x / 100) * CANVAS_W));
        line.setAttribute('y1', String((a.y / 100) * CANVAS_H));
        line.setAttribute('x2', String((b.x / 100) * CANVAS_W));
        line.setAttribute('y2', String((b.y / 100) * CANVAS_H));
        line.setAttribute('stroke', 'rgba(255,255,255,0.12)');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('stroke-dasharray', '4 9');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(line);
      }
      plane.appendChild(svg);
    }

    // узлы
    for (const node of visibleNodes) {
      const size = node.size ?? 14;
      const h = nodeH(size);
      const locked = isLocked(eng, node);
      const isCurrent = node.id === currentId;
      const isSel = node.id === selected;
      const dimK = Math.max(0.25, 1 - (node.dim ?? 0) / 100);

      const dia = document.createElement('div');
      dia.className = 'cmap-node' + (isCurrent ? ' cmap-cur' : '');
      const ring = isSel ? 'rgba(79,209,197,0.75)'
        : isCurrent ? 'rgba(79,209,197,0.4)'
        : `rgba(255,255,255,${(0.14 * dimK).toFixed(3)})`;
      const bg = isCurrent
        ? 'radial-gradient(circle at 50% 50%, rgba(79,209,197,0.16), rgba(79,209,197,0.02) 70%)'
        : `rgba(255,255,255,${(0.035 * dimK).toFixed(3)})`;
      dia.style.cssText = `position:absolute;left:${node.x - size / 2}%;top:${node.y - h / 2}%;
        width:${size}%;height:${h}%;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);
        background:${bg};border:1px solid ${ring};cursor:pointer;opacity:${dimK};`;
      dia.onclick = (e) => {
        e.stopPropagation();
        if (eng.mapSelection === node.id) { enter(node); return; } // повторный клик = войти
        eng.mapSelection = node.id;
        rebuild();
      };
      plane.appendChild(dia);

      // подпись (не перехватывает клики)
      const label = document.createElement('div');
      const titlePx = Math.round(6 + size * 0.95);
      label.style.cssText = `position:absolute;left:${node.x - size / 2}%;top:${node.y}%;
        width:${size}%;transform:translateY(-50%);text-align:center;pointer-events:none;opacity:${dimK};`;
      const t = document.createElement('div');
      t.textContent = node.title;
      t.style.cssText = `font-size:${(titlePx / 26).toFixed(3)}em;font-weight:300;
        letter-spacing:0.11em;color:#e6edf3;text-transform:uppercase;`;
      label.appendChild(t);
      const markText = locked ? '···заперто' : activeMark(eng, node);
      if (markText) {
        const m = document.createElement('div');
        m.textContent = markText;
        const quiet = locked || !markText.startsWith('◊');
        m.style.cssText = `font-size:${((titlePx - 6) / 26).toFixed(3)}em;margin-top:0.3em;
          letter-spacing:0.05em;color:${quiet ? '#5f7a8a' : ACCENT};`;
        label.appendChild(m);
      }
      plane.appendChild(label);
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

    // ---------- сайдбар ----------
    const sb = document.createElement('div');
    sb.className = 'cmap-sb';
    sb.style.cssText = `position:absolute;top:0;right:0;bottom:0;width:34%;box-sizing:border-box;
      background:color-mix(in srgb, #08131a 90%, transparent);backdrop-filter:blur(12px);
      border-left:1px solid rgba(255,255,255,0.10);padding:1em 1em;display:flex;flex-direction:column;
      transition:transform .5s cubic-bezier(.2,.7,.2,1), opacity .3s ease;
      transform:${selected ? 'translateX(0)' : 'translateX(100%)'};opacity:${selected ? 1 : 0};
      pointer-events:${selected ? 'auto' : 'none'};`;
    root.appendChild(sb);

    const selNode = selected ? nodeById.get(selected) : null;
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
function ensureCampMapStyles() {
  if (stylesDone) return;
  stylesDone = true;
  const st = document.createElement('style');
  st.textContent = `
.cmap-node { transition: filter .2s ease, border-color .25s ease; }
.cmap-node:hover { filter: brightness(1.18); }
.cmap-row { border-radius: 6px; }
.cmap-enter:hover { background: rgba(79,209,197,0.16) !important; }
@keyframes cmap-breathe {
  0%, 100% { filter: drop-shadow(0 0 4px rgba(79,209,197,0.22)); }
  50% { filter: drop-shadow(0 0 15px rgba(79,209,197,0.5)); }
}
.cmap-cur { animation: cmap-breathe 3.6s ease-in-out infinite; }
.cmap-cur:hover { filter: brightness(1.18) drop-shadow(0 0 8px rgba(79,209,197,0.35)); }
@media (prefers-reduced-motion: reduce) {
  .cmap-cur { animation: none; }
  .cmap-plane, .cmap-sb { transition: none !important; }
}
`;
  document.head.appendChild(st);
}
