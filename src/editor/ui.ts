// ============================================================
// Мелкие UI-утилиты: элементы, тосты, модальные окна
// ============================================================

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
}

export function toast(msg: string, isError = false) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h('div', { class: `toast${isError ? ' error' : ''}`, text: msg });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), isError ? 4200 : 2200);
}

/** Простое модальное окно подтверждения */
export function confirmModal(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = h('div', { class: 'modal-backdrop' });
    const modal = h('div', { class: 'modal' });
    modal.appendChild(h('h3', { text: title }));
    modal.appendChild(h('div', { class: 'hint', text: message }));
    const actions = h('div', { class: 'modal-actions' });
    const cancel = h('button', { class: 'btn', text: 'Отмена' });
    const ok = h('button', { class: 'btn accent', text: 'Да' });
    cancel.onclick = () => { backdrop.remove(); resolve(false); };
    ok.onclick = () => { backdrop.remove(); resolve(true); };
    backdrop.onclick = (e) => { if (e.target === backdrop) { backdrop.remove(); resolve(false); } };
    actions.append(cancel, ok);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    ok.focus();
  });
}

/** Модальное окно с текстовым полем */
export function promptModal(title: string, initial = '', placeholder = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const backdrop = h('div', { class: 'modal-backdrop' });
    const modal = h('div', { class: 'modal' });
    modal.appendChild(h('h3', { text: title }));
    const input = h('input', { class: 'ed', placeholder }) as HTMLInputElement;
    input.value = initial;
    modal.appendChild(input);
    const actions = h('div', { class: 'modal-actions' });
    const cancel = h('button', { class: 'btn', text: 'Отмена' });
    const ok = h('button', { class: 'btn accent', text: 'ОК' });
    const done = (v: string | null) => { backdrop.remove(); resolve(v); };
    cancel.onclick = () => done(null);
    ok.onclick = () => done(input.value.trim() || null);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') done(input.value.trim() || null);
      if (e.key === 'Escape') done(null);
    };
    backdrop.onclick = (e) => { if (e.target === backdrop) done(null); };
    actions.append(cancel, ok);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    input.focus();
    input.select();
  });
}

/** Поле ввода, коммитящее значение по blur/Enter */
export function textInput(
  value: string,
  onCommit: (v: string) => void,
  attrs: Record<string, string> = {},
): HTMLInputElement {
  const input = h('input', { class: 'ed', ...attrs }) as HTMLInputElement;
  input.value = value;
  let committed = value;
  const commit = () => {
    if (input.value !== committed) { committed = input.value; onCommit(input.value); }
  };
  input.onblur = commit;
  input.onkeydown = (e) => { if (e.key === 'Enter') { commit(); input.blur(); } };
  return input;
}

export function numberInput(
  value: number,
  onCommit: (v: number) => void,
  attrs: Record<string, string> = {},
): HTMLInputElement {
  const input = h('input', { class: 'ed', type: 'number', ...attrs }) as HTMLInputElement;
  input.value = String(Math.round(value * 100) / 100);
  let committed = input.value;
  const commit = () => {
    if (input.value === committed) return;
    const n = parseFloat(input.value);
    if (!Number.isNaN(n)) { committed = input.value; onCommit(n); }
  };
  input.onblur = commit;
  input.onkeydown = (e) => { if (e.key === 'Enter') { commit(); input.blur(); } };
  input.onchange = commit;
  return input;
}

export function rangeInput(
  value: number,
  min: number,
  max: number,
  step: number,
  onCommit: (v: number) => void,
): HTMLElement {
  const wrap = h('div', { class: 'range-row' });
  const input = h('input', {
    class: 'ed-range', type: 'range',
    min: String(min), max: String(max), step: String(step),
  }) as HTMLInputElement;
  input.value = String(value);
  const label = h('span', { class: 'range-val', text: String(value) });
  // label обновляем на каждый тик протяжки, но onCommit (снимок + полная перерисовка
  // инспектора) — только по отпусканию, иначе перерисовка пересоздаёт сам ползунок
  // прямо под курсором и драг «соскальзывает»
  input.oninput = () => { label.textContent = input.value; };
  input.onchange = () => onCommit(parseFloat(input.value));
  wrap.append(input, label);
  return wrap;
}

export function textArea(value: string, onCommit: (v: string) => void, rows = 4): HTMLTextAreaElement {
  const ta = h('textarea', { class: 'ed', rows: String(rows) }) as HTMLTextAreaElement;
  ta.value = value;
  let committed = value;
  const commit = () => {
    if (ta.value !== committed) { committed = ta.value; onCommit(ta.value); }
  };
  ta.onblur = commit;
  return ta;
}

export function selectInput(
  value: string,
  options: [string, string][],
  onChange: (v: string) => void,
): HTMLSelectElement {
  const sel = h('select', { class: 'ed' }) as HTMLSelectElement;
  for (const [val, label] of options) {
    const opt = h('option', { value: val, text: label }) as HTMLOptionElement;
    if (val === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.onchange = () => onChange(sel.value);
  return sel;
}

export function checkbox(value: boolean, onChange: (v: boolean) => void, label?: string): HTMLElement {
  const wrap = h('label', { style: 'display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--text-dim);font-size:12px;' });
  const cb = h('input', { type: 'checkbox', class: 'ed' }) as HTMLInputElement;
  cb.checked = value;
  cb.onchange = () => onChange(cb.checked);
  wrap.appendChild(cb);
  if (label) wrap.append(label);
  return wrap;
}

/** Выбор файла изображения → data-URI (для полной автономности экспорта) */
export function pickImageFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*' }) as HTMLInputElement;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      if (file.size > 2.5 * 1024 * 1024) {
        toast('Файл больше 2.5 МБ — проект может перестать автосохраняться. Сожмите изображение (WebP/JPEG).', true);
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => { toast('Не удалось прочитать файл', true); resolve(null); };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

/**
 * Выбор изображения с клиентским сжатием (даунскейл + перекодирование в WebP) — для
 * крупных картинок вроде полноростовых портретов, которые иначе сильно раздували бы
 * автосейв и экспорт игры (data-URI встраиваются напрямую в JSON/HTML).
 */
export function pickImageFileCompressed(maxHeight = 1000, quality = 0.85): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*' }) as HTMLInputElement;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxHeight / img.height);
          const w = Math.max(1, Math.round(img.width * scale));
          const hgt = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = hgt;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(String(reader.result)); return; }
          ctx.drawImage(img, 0, 0, w, hgt);
          resolve(canvas.toDataURL('image/webp', quality));
        };
        img.onerror = () => { toast('Не удалось прочитать изображение', true); resolve(null); };
        img.src = String(reader.result);
      };
      reader.onerror = () => { toast('Не удалось прочитать файл', true); resolve(null); };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

/** Строка инспектора: подпись + контрол */
export function row(label: string, control: HTMLElement): HTMLElement {
  const r = h('div', { class: 'insp-row' });
  r.appendChild(h('label', { text: label }));
  const grow = h('div', { class: 'grow' });
  grow.appendChild(control);
  r.appendChild(grow);
  return r;
}

/** Маленькое поле с подписью сверху (для сеток) */
export function field(label: string, control: HTMLElement): HTMLElement {
  const f = h('div', { class: 'insp-field' });
  f.appendChild(h('span', { text: label }));
  f.appendChild(control);
  return f;
}

export function section(title: string, ...children: HTMLElement[]): HTMLElement {
  const s = h('div', { class: 'insp-section' });
  s.appendChild(h('div', { class: 'insp-section-title', text: title }));
  for (const c of children) s.appendChild(c);
  return s;
}
