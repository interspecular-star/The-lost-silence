// ============================================================
// Блок J3: слой Осколка на карте аванпоста.
// Без Осколка карта — «бумага» (тусклые контуры, серые маркеры,
// ни одной связи); с Осколком и включённым Mesh — «пробуждение»
// (стекло, перелив рамок, живые маркеры, пунктиры-связи с бегущим
// потоком). Тумблер MESH off глушит всё обратно — тишина как
// материал. Плюс задел «секрета тишины»: пометка-помеха на
// «Выходе за периметр», видимая ТОЛЬКО при выключенном Mesh
// (черновик, развитие обсуждается с владельцем).
//
// Восстанавливает связи (прежние 6 + двор↔жилые) — владелец
// дальше рисует/удаляет их мышью на холсте.
//
// Читает local-save/project.json (резервную копию, НЕ трогает её),
// пишет local-save/project-map-oskolok.tls.json — владелец
// загружает его в редакторе («📂 Открыть»).
//
// Запуск: node scripts/migrate-map-oskolok.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'local-save', 'project.json');
const OUT = path.join(ROOT, 'local-save', 'project-map-oskolok.tls.json');

const p = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
const log = [];

let uidN = 0;
const uid = (prefix) => `${prefix}_osk${Date.now().toString(36)}${(uidN++).toString(36)}`;

const sMap = p.scenes.find((s) => s.name === 'Аванпост Flux Nomads');
if (!sMap?.campMap) throw new Error('сцена-карта «Аванпост Flux Nomads» не найдена');
const cfg = sMap.campMap;

const oskName = p.oskolokVarName || 'oskolok';
const vOsk = p.variables.find((v) => v.name === oskName);
const vMesh = p.variables.find((v) => v.name === 'mesh_on');
if (!vOsk || !vMesh) throw new Error(`переменные «${oskName}»/«mesh_on» не найдены`);

const awake = () => [
  { varId: vOsk.id, op: 'gte', value: 1 },
  { varId: vMesh.id, op: 'eq', value: true },
];

// ---------- вид: «бумага» → «пробуждение» (тот же пресет, что кнопка «⚡ Слой Осколка») ----------
cfg.nodeLook = {
  ...(cfg.nodeLook ?? {}),
  fillOpacity: 3, borderOpacity: 14, markerColor: '#8fa7b5', markerGlow: 0, scrim: 40,
};
const wakeLook = {
  fillOpacity: 6, borderOpacity: 30, markerColor: '#4fd1c5', markerGlow: 75, scrim: 55,
  fx: { surface: 'spatial', glass: 10, border: 'shimmer', tempo: 'slow', intensity: 'quiet' },
};
const wake = (cfg.nodeLookIf ?? []).find((li) => li.id === 'ml_oskolok_wake');
if (wake) {
  wake.name = wake.name ?? 'Пробуждение (Осколок)';
  wake.conditions = awake();
  wake.look = wakeLook;
  log.push('= слой «пробуждение» обновлён');
}
else {
  cfg.nodeLookIf = [...(cfg.nodeLookIf ?? []),
    { id: 'ml_oskolok_wake', name: 'Пробуждение (Осколок)', conditions: awake(), look: wakeLook }];
  log.push('+ вид карты: «бумага» → «пробуждение» (oskolok≥1 и mesh_on)');
}
cfg.linkLook = { ...(cfg.linkLook ?? {}), flow: 'run', opacity: 28, tempo: 'slow' };

// ---------- связи (по названиям узлов; дальше владелец рисует мышью) ----------
const byTitle = (t) => cfg.nodes.find((n) => n.title === t);
const PAIRS = [
  ['Двор', 'Ангар'],
  ['Двор', 'Мастерская'],
  ['Двор', 'Склад Кая'],
  ['Двор', 'Узел связи'],
  ['Узел связи', 'Выход за периметр'],
  ['Склад Кая', 'Медпункт'],
  ['Двор', 'Жилые помещения'],
];
cfg.links = cfg.links ?? [];
const linkKey = (a, b) => [a, b].sort().join('~');
const existing = new Set(cfg.links.map((l) => linkKey(l.a, l.b)));
let added = 0;
for (const [ta, tb] of PAIRS) {
  const a = byTitle(ta), b = byTitle(tb);
  if (!a || !b) { log.push(`! узел не найден: ${ta} ↔ ${tb} — связь пропущена`); continue; }
  if (existing.has(linkKey(a.id, b.id))) continue;
  cfg.links.push({ id: uid('ml'), a: a.id, b: b.id, visibleIf: awake() });
  existing.add(linkKey(a.id, b.id));
  added++;
}
// у всех связей карты — видимость по Осколку (бумага связей не знает)
for (const l of cfg.links) if (!l.visibleIf?.length) l.visibleIf = awake();
if (added) log.push(`+ связи: ${added} (видны при oskolok≥1 и mesh_on; поток «бегущий пунктир»)`);

// ---------- задел «секрета тишины» (черновик; развитие — с владельцем) ----------
const gate = byTitle('Выход за периметр');
if (gate) {
  gate.marks = gate.marks ?? [];
  if (!gate.marks.some((m) => m.id === 'mm_silence_gate')) {
    gate.marks.push({
      id: 'mm_silence_gate',
      text: '· помеха: сектор не отрисован',
      conditions: [
        { varId: vOsk.id, op: 'gte', value: 1 },
        { varId: vMesh.id, op: 'eq', value: false },
      ],
    });
    log.push('+ «секрет тишины»: пометка-помеха на «Выходе за периметр» видна только при mesh_off (черновик)');
  }
}

// ---------- чекпоинт предпросмотра: увидеть «пробуждение» одной кнопкой ----------
const vDone = p.variables.find((v) => v.name === 'pro_done');
if (!(p.playtests ?? []).some((c) => c.id === 'cp_oskolok_map')) {
  (p.playtests = p.playtests ?? []).push({
    id: 'cp_oskolok_map',
    name: 'Карта — Осколок ур.1 (пробуждение)',
    sceneId: sMap.id,
    vars: {
      [vOsk.id]: 1,
      [vMesh.id]: true,
      ...(vDone ? { [vDone.id]: true } : {}),
    },
    inv: [], equip: {}, claims: {}, ups: {}, qsteps: {},
  });
  log.push('+ чекпоинт предпросмотра «Карта — Осколок ур.1 (пробуждение)»');
}

// ---------- запись ----------
fs.writeFileSync(OUT, JSON.stringify(p));
console.log(log.map((l) => '  ' + l).join('\n'));
console.log(`\nГотово: ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} МБ)`);
console.log('Владелец загружает файл в редакторе: «📂 Открыть».');
