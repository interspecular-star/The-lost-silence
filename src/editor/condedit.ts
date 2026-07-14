// ============================================================
// Редакторы условий и эффектов — фабрика, привязанная к Store.
// Жили внутри инспектора; вынесены, чтобы теми же компонентами
// пользовались модалки карты (mapmodal.ts) и будущие окна.
// ============================================================

import { Store } from '../core/store';
import { Condition, Effect, VarValue, VarType } from '../core/types';
import { h, textInput, numberInput, selectInput, toast } from './ui';

export interface CondEffectEditors {
  conditionsEditor: (list: Condition[], commit: (list: Condition[]) => void) => HTMLElement;
  effectsEditor: (list: Effect[], commit: (list: Effect[]) => void) => HTMLElement;
  valueEditor: (varId: string, value: VarValue, onChange: (v: VarValue) => void) => HTMLElement;
}

// допустимые операции зависят от типа переменной — «+»/«−» для булевых значений
// молча превращают true/false в число (0/1), и такое значение потом не match'ится
// ни с одним условием «=true»/«=false»; для строк осмысленно только «=»
export function opsForType(type: VarType | undefined): [string, string][] {
  if (type === 'boolean') return [['set', '='], ['toggle', '⇄']];
  if (type === 'string') return [['set', '=']];
  return [['set', '='], ['add', '+'], ['sub', '−'], ['random', '🎲 1..N']];
}

export function makeCondEffectEditors(store: Store): CondEffectEditors {
  const varOptions = (forEffects = false): [string, string][] =>
    store.project.variables
      .filter((v) => !(forEffects && v.category === 'computed')) // вычисляемые менять нельзя
      .map((v) => [v.id, v.title]);

  function valueEditor(varId: string, value: VarValue, onChange: (v: VarValue) => void): HTMLElement {
    const def = store.getVariable(varId);
    if (def?.type === 'boolean') {
      return selectInput(String(value === true), [['true', 'да'], ['false', 'нет']], (v) => onChange(v === 'true'));
    }
    if (def?.type === 'number') {
      return numberInput(Number(value) || 0, (v) => onChange(v));
    }
    return textInput(String(value ?? ''), (v) => onChange(v));
  }

  function conditionsEditor(list: Condition[], commit: (list: Condition[]) => void): HTMLElement {
    const wrap = h('div');
    list.forEach((c, i) => {
      const card = h('div', { class: 'cond-card' });
      const r = h('div', { class: 'row' });
      r.appendChild(selectInput(c.varId, varOptions(), (v) => {
        const copy = [...list];
        const def = store.getVariable(v);
        copy[i] = { ...c, varId: v, value: def?.type === 'boolean' ? true : def?.type === 'number' ? 0 : '' };
        commit(copy);
      }));
      r.appendChild(selectInput(c.op, [['eq', '='], ['ne', '≠'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤']], (v) => {
        const copy = [...list];
        copy[i] = { ...c, op: v as Condition['op'] };
        commit(copy);
      }));
      r.appendChild(valueEditor(c.varId, c.value, (v) => {
        const copy = [...list];
        copy[i] = { ...c, value: v };
        commit(copy);
      }));
      const del = h('button', { class: 'del', text: '✕' });
      del.onclick = () => commit(list.filter((_, j) => j !== i));
      r.appendChild(del);
      card.appendChild(r);
      wrap.appendChild(card);
    });
    const add = h('button', { class: 'btn small', text: '+ условие' });
    add.onclick = () => {
      const first = store.project.variables[0];
      if (!first) { toast('Сначала создайте переменную (режим «Переменные»)', true); return; }
      commit([...list, { varId: first.id, op: 'eq', value: first.type === 'boolean' ? true : first.type === 'number' ? 0 : '' }]);
    };
    wrap.appendChild(add);
    return wrap;
  }

  function effectsEditor(list: Effect[], commit: (list: Effect[]) => void): HTMLElement {
    const wrap = h('div');
    list.forEach((e, i) => {
      const card = h('div', { class: 'cond-card' });
      const r = h('div', { class: 'row' });
      const type = store.getVariable(e.varId)?.type;
      r.appendChild(selectInput(e.varId, varOptions(true), (v) => {
        const copy = [...list];
        const def = store.getVariable(v);
        const validOps = opsForType(def?.type).map(([op]) => op);
        copy[i] = {
          ...e, varId: v,
          op: validOps.includes(e.op) ? e.op : 'set',
          value: def?.type === 'boolean' ? true : def?.type === 'number' ? 0 : '',
        };
        commit(copy);
      }));
      r.appendChild(selectInput(e.op, opsForType(type), (v) => {
        const copy = [...list];
        copy[i] = { ...e, op: v as Effect['op'] };
        commit(copy);
      }));
      if (e.op !== 'toggle') {
        r.appendChild(valueEditor(e.varId, e.value, (v) => {
          const copy = [...list];
          copy[i] = { ...e, value: v };
          commit(copy);
        }));
      }
      const del = h('button', { class: 'del', text: '✕' });
      del.onclick = () => commit(list.filter((_, j) => j !== i));
      r.appendChild(del);
      card.appendChild(r);
      wrap.appendChild(card);
    });
    const add = h('button', { class: 'btn small', text: '+ эффект' });
    add.onclick = () => {
      const first = store.project.variables.find((v) => v.category !== 'computed');
      if (!first) { toast('Сначала создайте переменную (режим «Переменные»)', true); return; }
      commit([...list, { varId: first.id, op: first.type === 'number' ? 'add' : 'set', value: first.type === 'boolean' ? true : first.type === 'number' ? 1 : '' }]);
    };
    wrap.appendChild(add);
    return wrap;
  }

  return { conditionsEditor, effectsEditor, valueEditor };
}
