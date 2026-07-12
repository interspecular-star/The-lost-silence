// ============================================================
// Нодовый редактор диалогов: ноды, связи, порты, панорама/масштаб
// ============================================================

import { Store } from '../core/store';
import {
  Dialogue, DialogueNode, NodeType, uid, deepClone,
  NODE_TYPE_LABELS, COND_OP_LABELS, EFFECT_OP_LABELS,
} from '../core/types';
import { h, toast } from './ui';
import { isTyping } from './stage';

type LinkRef =
  | { kind: 'next' }
  | { kind: 'true' }
  | { kind: 'false' }
  | { kind: 'choice'; choiceId: string };

export class GraphView {
  root: HTMLElement;
  private store: Store;
  private viewport!: HTMLElement;
  private canvas!: HTMLElement;
  private svg!: SVGSVGElement;
  private zoomLabel!: HTMLElement;

  zoom = 1;
  panX = 40;
  panY = 40;
  private didInit = false;

  constructor(store: Store) {
    this.store = store;
    this.root = h('div', { style: 'display:flex;flex-direction:column;flex:1;min-height:0;height:100%;' });
    this.buildToolbar();
    this.buildGraph();

    store.on('change', () => this.render());
    // выделение НЕ пересобирает граф: пересборка в момент pointerdown отрывала
    // таскаемую ноду от DOM — перетаскивание шло «рывками» с телепортом в конце
    store.on('selection', () => this.applySelection());
    store.on('view', () => this.render());
  }

  /** Лёгкое обновление выделения: только CSS-классы, без пересборки DOM */
  private applySelection() {
    if (this.store.mode !== 'dialogue') return;
    const sel = this.store.selectedNodeId;
    this.canvas.querySelectorAll('.gnode').forEach((n) => {
      n.classList.toggle('selected', (n as HTMLElement).dataset.id === sel);
    });
  }

  onShow() {
    requestAnimationFrame(() => {
      if (!this.didInit) { this.didInit = true; }
      this.applyTransform();
      this.render();
    });
  }

  private buildToolbar() {
    const bar = h('div', {
      style: `height:38px;flex:0 0 auto;display:flex;align-items:center;gap:4px;padding:0 10px;
        background:var(--bg-panel);border-bottom:1px solid var(--border);`,
    });
    bar.appendChild(h('span', { style: 'color:var(--text-faint);font-size:11px;margin-right:4px;', text: 'Добавить ноду:' }));
    const types: [NodeType, string][] = [
      ['line', '💬 Реплика'], ['choice', '⑃ Выбор'], ['branch', '⧨ Условие'],
      ['set', '≔ Действие'], ['jump', '➜ Переход'], ['end', '◼ Конец'],
    ];
    for (const [type, label] of types) {
      const b = h('button', { class: 'tb-btn', text: label, title: `Добавить ноду: ${NODE_TYPE_LABELS[type]}` });
      b.onclick = () => this.addNode(type);
      bar.appendChild(b);
    }
    bar.appendChild(h('div', { class: 'tb-spacer' }));
    bar.appendChild(h('span', {
      class: 'hint', style: 'margin-right:10px;',
      text: 'Тяните за порт ● чтобы связать · клик по линии — удалить связь',
    }));

    const zoomOut = h('button', { class: 'tb-btn', text: '−' });
    this.zoomLabel = h('span', { class: 'tb-zoom-label', text: '100%' });
    const zoomIn = h('button', { class: 'tb-btn', text: '+' });
    zoomOut.onclick = () => this.zoomAt(this.viewport.clientWidth / 2, this.viewport.clientHeight / 2, 1 / 1.2);
    zoomIn.onclick = () => this.zoomAt(this.viewport.clientWidth / 2, this.viewport.clientHeight / 2, 1.2);
    bar.append(zoomOut, this.zoomLabel, zoomIn);
    this.root.appendChild(bar);
  }

  private buildGraph() {
    const wrap = h('div', { id: 'graph-wrap' });
    this.viewport = h('div', { id: 'graph-viewport' });
    this.canvas = h('div', { id: 'graph-canvas' });
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.canvas.appendChild(this.svg);
    this.viewport.appendChild(this.canvas);
    wrap.appendChild(this.viewport);
    this.root.appendChild(wrap);

    this.viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.viewport.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        this.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
      } else {
        this.panX -= e.shiftKey ? e.deltaY : e.deltaX;
        this.panY -= e.shiftKey ? 0 : e.deltaY;
        this.applyTransform();
      }
    }, { passive: false });

    // панорама по пустому месту, снятие выделения
    this.viewport.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      const onNode = (e.target as HTMLElement).closest('.gnode');
      const onPath = (e.target as Element).tagName === 'path';
      if (onNode || onPath) return;
      if (e.button === 0) this.store.selectNode(null);
      const startX = e.clientX; const startY = e.clientY;
      const px = this.panX; const py = this.panY;
      const move = (ev: PointerEvent) => {
        this.panX = px + (ev.clientX - startX);
        this.panY = py + (ev.clientY - startY);
        this.applyTransform();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

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

  private zoomAt(vx: number, vy: number, factor: number) {
    const nz = Math.min(2, Math.max(0.2, this.zoom * factor));
    const lx = (vx - this.panX) / this.zoom;
    const ly = (vy - this.panY) / this.zoom;
    this.zoom = nz;
    this.panX = vx - lx * nz;
    this.panY = vy - ly * nz;
    this.applyTransform();
  }

  // ---------- рендер ----------
  render() {
    if (this.store.mode !== 'dialogue') return;
    const dlg = this.store.currentDialogue;
    this.canvas.querySelectorAll('.gnode').forEach((n) => n.remove());
    this.svg.innerHTML = '';
    if (!dlg) return;

    for (const node of dlg.nodes) {
      this.canvas.appendChild(this.renderNode(dlg, node));
    }
    this.drawEdges(dlg);
  }

  private renderNode(dlg: Dialogue, node: DialogueNode): HTMLElement {
    const store = this.store;
    const d = h('div', { class: `gnode${store.selectedNodeId === node.id ? ' selected' : ''}${dlg.startNodeId === node.id ? ' start' : ''}` });
    d.dataset.id = node.id;
    d.dataset.type = node.type;
    d.style.left = `${node.x}px`;
    d.style.top = `${node.y}px`;

    const head = h('div', { class: 'gnode-head' });
    head.appendChild(h('span', { text: NODE_TYPE_LABELS[node.type] }));
    d.appendChild(head);

    const body = h('div', { class: 'gnode-body' });
    const varName = (id: string) => store.getVariable(id)?.title ?? '?';

    switch (node.type) {
      case 'line': {
        const npc = node.speakerNpcId ? store.project.npcs?.find((x) => x.id === node.speakerNpcId) : undefined;
        const speakerName = npc?.name ?? node.speaker;
        if (speakerName) {
          const sp = h('div', { class: 'speaker', text: (npc ? '👤 ' : '') + speakerName });
          if (npc) {
            const fac = store.project.factions?.find((f) => f.id === npc.factionId);
            if (fac) sp.style.color = fac.color;
          }
          body.appendChild(sp);
        }
        body.appendChild(h('div', { class: 'txt', text: node.text || '(пустая реплика)' }));
        break;
      }
      case 'choice': {
        for (const c of node.choices ?? []) {
          const row = h('div', { class: 'gnode-choice' });
          if (c.conditions.length > 0) row.appendChild(h('span', { class: 'cond-mark', text: '◈', title: 'Есть условия показа' }));
          row.append(c.text || '(пустой вариант)');
          const port = this.makePort('out', { kind: 'choice', choiceId: c.id }, node, !!c.next);
          port.style.top = '50%';
          port.style.marginTop = '-6px';
          row.appendChild(port);
          body.appendChild(row);
        }
        if ((node.choices ?? []).length === 0) {
          body.appendChild(h('div', { class: 'txt', text: 'Добавьте варианты в инспекторе →' }));
        }
        break;
      }
      case 'set':
        body.appendChild(h('div', {
          class: 'txt',
          text: (node.effects ?? []).map((e) => `${varName(e.varId)} ${EFFECT_OP_LABELS[e.op]} ${e.op === 'toggle' ? '' : e.value}`).join('\n') || '(нет действий)',
        }));
        break;
      case 'branch': {
        body.appendChild(h('div', {
          class: 'txt',
          text: (node.conditions ?? []).map((c) => `${varName(c.varId)} ${COND_OP_LABELS[c.op]} ${c.value}`).join(' И\n') || '(нет условий)',
        }));
        const tRow = h('div', { class: 'gnode-choice', style: 'color:#98c379;', text: '✓ верно' });
        const tPort = this.makePort('out', { kind: 'true' }, node, !!node.nextTrue);
        tPort.style.top = '50%'; tPort.style.marginTop = '-6px';
        tRow.appendChild(tPort);
        const fRow = h('div', { class: 'gnode-choice', style: 'color:var(--danger);', text: '✗ неверно' });
        const fPort = this.makePort('out', { kind: 'false' }, node, !!node.nextFalse);
        fPort.style.top = '50%'; fPort.style.marginTop = '-6px';
        fRow.appendChild(fPort);
        body.append(tRow, fRow);
        break;
      }
      case 'jump': {
        const scene = node.gotoSceneId ? store.getScene(node.gotoSceneId) : null;
        body.appendChild(h('div', { class: 'txt', text: scene ? `Сцена: ${scene.name}` : '(сцена не выбрана)' }));
        break;
      }
      case 'end':
        body.appendChild(h('div', { class: 'txt', text: 'Диалог завершается' }));
        break;
    }
    d.appendChild(body);

    // входной порт (кроме недостижимого случая — вход есть у всех)
    d.appendChild(this.makePort('in', null, node, false));

    // выходной порт у линейных нод
    if (node.type === 'line' || node.type === 'set' || node.type === 'jump') {
      const port = this.makePort('out', { kind: 'next' }, node, !!node.next);
      port.style.top = '14px';
      d.appendChild(port);
    }

    // перетаскивание ноды
    d.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).classList.contains('port')) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      store.selectNode(node.id);
      const startP = this.toLogical(e.clientX, e.clientY);
      const ox = node.x; const oy = node.y;
      let moved = false;
      let raf = 0;
      const move = (ev: PointerEvent) => {
        const p = this.toLogical(ev.clientX, ev.clientY);
        if (!moved && Math.abs(p.x - startP.x) < 3 && Math.abs(p.y - startP.y) < 3) return;
        if (!moved) { store.snapshot(); moved = true; }
        node.x = Math.round(ox + (p.x - startP.x));
        node.y = Math.round(oy + (p.y - startP.y));
        d.style.left = `${node.x}px`;
        d.style.top = `${node.y}px`;
        // связи — не чаще кадра: полная перерисовка SVG на каждый mousemove дёргала граф
        if (!raf) {
          raf = requestAnimationFrame(() => {
            raf = 0;
            if (this.store.currentDialogue) this.drawEdges(this.store.currentDialogue);
          });
        }
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (moved) store.emit('change');
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    return d;
  }

  private makePort(kind: 'in' | 'out', link: LinkRef | null, node: DialogueNode, linked: boolean): HTMLElement {
    const p = h('div', { class: `port ${kind}${linked ? ' linked' : ''}` });
    if (kind === 'out' && link) {
      p.title = 'Перетащите на другую ноду, чтобы связать';
      p.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.startLinkDrag(node, link, e);
      });
    } else {
      p.title = 'Вход';
    }
    return p;
  }

  private startLinkDrag(from: DialogueNode, link: LinkRef, e: PointerEvent) {
    const temp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    temp.setAttribute('stroke', 'var(--accent)');
    temp.setAttribute('stroke-width', '2');
    temp.setAttribute('fill', 'none');
    temp.setAttribute('stroke-dasharray', '6 4');
    this.svg.appendChild(temp);

    const start = this.portPos(e.target as HTMLElement);

    const move = (ev: PointerEvent) => {
      const p = this.toLogical(ev.clientX, ev.clientY);
      temp.setAttribute('d', bezier(start.x, start.y, p.x, p.y));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      temp.remove();
      const targetEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.gnode') as HTMLElement | null;
      if (!targetEl) return;
      const targetId = targetEl.dataset.id!;
      if (targetId === from.id) { toast('Нельзя связать ноду саму с собой', true); return; }
      this.store.snapshot();
      this.setLink(from, link, targetId);
      this.store.emit('change');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private setLink(from: DialogueNode, link: LinkRef, targetId: string | null) {
    switch (link.kind) {
      case 'next': from.next = targetId; break;
      case 'true': from.nextTrue = targetId; break;
      case 'false': from.nextFalse = targetId; break;
      case 'choice': {
        const c = from.choices?.find((x) => x.id === link.choiceId);
        if (c) c.next = targetId;
        break;
      }
    }
  }

  // ---------- рёбра ----------
  private portPos(portEl: HTMLElement): { x: number; y: number } {
    const rect = portEl.getBoundingClientRect();
    const cRect = this.canvas.getBoundingClientRect();
    return {
      x: (rect.left + rect.width / 2 - cRect.left) / this.zoom,
      y: (rect.top + rect.height / 2 - cRect.top) / this.zoom,
    };
  }

  private drawEdges(dlg: Dialogue) {
    this.svg.innerHTML = '';
    const nodeEl = (id: string) => this.canvas.querySelector(`.gnode[data-id="${id}"]`) as HTMLElement | null;

    const addEdge = (from: DialogueNode, link: LinkRef, targetId: string | null | undefined, color: string) => {
      if (!targetId) return;
      const fromEl = nodeEl(from.id);
      const toEl = nodeEl(targetId);
      if (!fromEl || !toEl) return;

      // ищем порт-источник
      let portEl: HTMLElement | null = null;
      const ports = fromEl.querySelectorAll('.port.out');
      if (link.kind === 'next') portEl = ports[0] as HTMLElement;
      else if (link.kind === 'true') portEl = ports[0] as HTMLElement;
      else if (link.kind === 'false') portEl = ports[1] as HTMLElement;
      else if (link.kind === 'choice') {
        const idx = (from.choices ?? []).findIndex((c) => c.id === link.choiceId);
        portEl = ports[idx] as HTMLElement;
      }
      if (!portEl) return;

      const p1 = this.portPos(portEl);
      const inPort = toEl.querySelector('.port.in') as HTMLElement | null;
      const p2 = inPort ? this.portPos(inPort) : { x: toEl.offsetLeft, y: toEl.offsetTop + 20 };

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', bezier(p1.x, p1.y, p2.x, p2.y));
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'none');
      path.style.cursor = 'pointer';
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = 'Клик — удалить связь';
      path.appendChild(title);
      path.addEventListener('click', () => {
        this.store.snapshot();
        this.setLink(from, link, null);
        this.store.emit('change');
        toast('Связь удалена (Ctrl+Z — отменить)');
      });
      path.addEventListener('mouseenter', () => path.setAttribute('stroke-width', '3.5'));
      path.addEventListener('mouseleave', () => path.setAttribute('stroke-width', '2'));
      this.svg.appendChild(path);
    };

    for (const n of dlg.nodes) {
      if (n.type === 'line' || n.type === 'set' || n.type === 'jump') {
        addEdge(n, { kind: 'next' }, n.next, 'rgba(125, 184, 240, 0.7)');
      }
      if (n.type === 'branch') {
        addEdge(n, { kind: 'true' }, n.nextTrue, 'rgba(152, 195, 121, 0.75)');
        addEdge(n, { kind: 'false' }, n.nextFalse, 'rgba(224, 108, 117, 0.75)');
      }
      if (n.type === 'choice') {
        for (const c of n.choices ?? []) {
          addEdge(n, { kind: 'choice', choiceId: c.id }, c.next, 'rgba(229, 192, 123, 0.7)');
        }
      }
    }
  }

  // ---------- операции ----------
  addNode(type: NodeType) {
    const dlg = this.store.currentDialogue;
    if (!dlg) { toast('Сначала создайте диалог (кнопка «+» слева)', true); return; }
    this.store.snapshot();
    const center = this.toLogical(
      this.viewport.getBoundingClientRect().left + this.viewport.clientWidth / 2,
      this.viewport.getBoundingClientRect().top + this.viewport.clientHeight / 2,
    );
    const node: DialogueNode = {
      id: uid('nd'), type,
      x: Math.round(center.x - 110 + (Math.random() * 60 - 30)),
      y: Math.round(center.y - 40 + (Math.random() * 60 - 30)),
    };
    if (type === 'line') { node.speaker = ''; node.text = ''; node.next = null; }
    if (type === 'choice') node.choices = [{ id: uid('ch'), text: 'Вариант 1', conditions: [], effects: [], next: null }];
    if (type === 'set') { node.effects = []; node.next = null; }
    if (type === 'branch') { node.conditions = []; node.nextTrue = null; node.nextFalse = null; }
    if (type === 'jump') { node.next = null; }
    dlg.nodes.push(node);
    if (!dlg.startNodeId) dlg.startNodeId = node.id;
    this.store.emit('change');
    this.store.selectNode(node.id);
  }

  duplicateSelectedNode() {
    const dlg = this.store.currentDialogue;
    const node = this.store.selectedNode;
    if (!dlg || !node) return;
    this.store.snapshot();
    const copy: DialogueNode = deepClone(node);
    copy.id = uid('nd');
    copy.x = node.x + 32;
    copy.y = node.y + 32;
    copy.choices = copy.choices?.map((c) => ({ ...c, id: uid('ch') }));
    dlg.nodes.push(copy);
    this.store.emit('change');
    this.store.selectNode(copy.id);
  }

  deleteSelectedNode() {
    const dlg = this.store.currentDialogue;
    const node = this.store.selectedNode;
    if (!dlg || !node) return;
    this.store.snapshot();
    dlg.nodes = dlg.nodes.filter((n) => n.id !== node.id);
    if (dlg.startNodeId === node.id) dlg.startNodeId = dlg.nodes[0]?.id ?? null;
    // подчистить ссылки
    for (const n of dlg.nodes) {
      if (n.next === node.id) n.next = null;
      if (n.nextTrue === node.id) n.nextTrue = null;
      if (n.nextFalse === node.id) n.nextFalse = null;
      n.choices?.forEach((c) => { if (c.next === node.id) c.next = null; });
    }
    this.store.selectNode(null);
    this.store.emit('change');
  }
}

function bezier(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export { isTyping };
