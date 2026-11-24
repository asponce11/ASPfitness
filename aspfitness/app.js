'use strict';
/* ASPfitness — registro personal de entreno. Parte 1: Gym, plantillas, sugerencias, descanso y copias. */

const KEY = 'pulso-v1';
const APP_VERSION = '1.0';

/* ================= Utilidades ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => parseDate(s).toLocaleDateString('es-ES', o);
const daysAgo = s => Math.round((parseDate(today()) - parseDate(s)) / 864e5);
const agoText = s => { const n = daysAgo(s); return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`; };
const num = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
const round2 = n => Math.round(n * 100) / 100;
const fmtKg = n => n == null ? '–' : String(round2(n)).replace('.', ',');
const sum = a => a.reduce((x, y) => x + (y || 0), 0);
const weekStart = s => { const d = parseDate(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return isoDate(d); };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const clone = o =>JSON.parse(JSON.stringify(o));

/* ================= Estado ================= */
let state = load();
const ui = { tab: 'hoy', openEx: 0, showHist: {}, sheet: null };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.error(e); }
  const s = buildSeed();
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}
function migrate(s) {
  const base = buildSeed();
  for (const k of ['exercises', 'templates', 'workouts', 'activities', 'body', 'habits', 'habitLog', 'settings']) if (s[k] == null) s[k] = base[k];
  if (s.active === undefined) s.active = null;
  s.settings = { ...base.settings, ...s.settings };
  s.version = 1;
  return s;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { alert('No se pudo guardar. Exporta una copia de seguridad cuanto antes.'); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ================= Lógica de entreno ================= */
const ex = id => state.exercises[id] || { id, name: '(ejercicio borrado)', sets: 3, repMin: 8, repMax: 12, inc: 2.5, note: '' };
const tpl = id => state.templates.find(t => t.id === id);
const sortWorkouts = () => state.workouts.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0));
const maxKg = sets => Math.max(0, ...sets.map(s => s.kg || 0));
const volume = sets => sum(sets.map(s => (s.kg || 0) * (s.reps || 0)));
const rangeTxt = e => e.repMin == null ? 'máx' : e.repMin === e.repMax ? `${e.repMin}` : `${e.repMin}-${e.repMax}`;
const targetTxt = e => `${e.sets}×${rangeTxt(e)}`;
const setsTxt = sets => {
  const kgs = [...new Set(sets.map(s => s.kg || 0))];
  const reps = sets.map(s => s.reps ?? '–').join('/');
  if (kgs.length === 1) return kgs[0] ? `${fmtKg(kgs[0])} kg · ${reps}` : `${reps} reps`;
  return sets.map(s => `${fmtKg(s.kg)}×${s.reps}`).join(', ');
};

function exHistory(exId) {
  const out = [];
  for (const w of state.workouts) {
    const e = w.entries.find(x => x.exId === exId);
    if (e && e.sets.length) out.push({ date: w.date, sets: e.sets, wid: w.id });
  }
  return out;
}

/* Regla de doble progresión: primero reps dentro del rango; al llegar al máximo en todas las series, sube peso. */
function suggest(e) {
  const h = exHistory(e.id);
  const n = e.sets || 3;
  const min = e.repMin, max = e.repMax;
  const inc = e.inc || 2.5;
  const last = h[h.length - 1];

  if (!last) {
    return {
      type: 'new', title: 'Primera vez',
      text: e.bodyweight ? 'Haz el máximo de repeticiones con buena técnica.' : `Elige un peso con el que llegues a ${rangeTxt(e)} reps con buena técnica${e.note && /RIR/.test(e.note) ? ' (' + esc(e.note.match(/[\d-]+ RIR/)[0]) + ')' : ''}.`,
      sets: Array.from({ length: n }, () => ({ kg: null, reps: min ?? null })),
    };
  }
  const kg = maxKg(last.sets);
  const reps = last.sets.map(s => s.reps || 0);
  const kgOut = e.bodyweight && !kg ? null : kg;

  if (e.warmup) {
    return { type: 'keep', title: 'Calentamiento', text: 'Sin progresión: hazlo suave y con control.', sets: Array.from({ length: n }, (_, i) => ({ kg: kgOut, reps: reps[i] ?? min })) };
  }
  if (min == null || max == null) {
    const total = sum(reps);
    const t = Array.from({ length: Math.max(n, reps.length) }, (_, i) => reps[i] ?? reps[reps.length - 1]);
    t[0] = (t[0] || 0) + 1;
    return { type: 'reps', title: 'Supera tu marca', text: `La última vez hiciste ${total} reps en total. Intenta llegar a ${total + 1} o más.`, sets: t.map(r => ({ kg: kgOut, reps: r })) };
  }

  const top = Array.from({ length: n }, (_, i) => reps[i] ?? reps[reps.length - 1] ?? 0);
  let res;
  if (reps.length >= n && top.every(r => r >= max)) {
    const nk = round2(kg + inc);
    const over = top.every(r => r >= max + 2);
    res = {
      type: 'weight', title: `Sube peso → ${fmtKg(nk)} kg`,
      text: over
        ? `Hiciste ${reps.join('/')} con ${fmtKg(kg)} kg, por encima del rango (${min}-${max}). Te sobra fuerza: sube y vuelve a ${min} reps.`
        : `Completaste ${max} reps en todas las series. Sube a ${fmtKg(nk)} kg y vuelve a ${min} reps.`,
      sets: Array.from({ length: n }, () => ({ kg: nk, reps: min })),
    };
  } else {
    const target = top.map(r => Math.min(max, r + 1));
    const gain = sum(target) - sum(reps.slice(0, n));
    const below = reps.some(r => r < min);
    res = {
      type: 'reps', title: `Mantén ${fmtKg(kg)} kg y suma reps`,
      text: `Objetivo: <b>${target.join('/')}</b> (+${gain} reps). Cuando hagas ${max} en todas las series, toca subir peso.` +
        (reps.length < n ? ` La última vez hiciste ${reps.length} de ${n} series: completa todas.` : '') +
        (below ? ` Alguna serie quedó por debajo de ${min}: si vuelve a pasar, baja un poco el peso.` : ''),
      sets: target.map(r => ({ kg: kgOut, reps: r })),
    };
  }
  if (h.length >= 3) {
    const a = h.slice(-3);
    const kgs = a.map(x => maxKg(x.sets));
    const tot = a.map(x => sum(x.sets.map(s => s.reps)));
    if (kgs.every(k => k === kgs[0]) && tot[2] <= tot[0]) {
      res.stall = `Llevas 3 sesiones con ${fmtKg(kgs[0])} kg sin sumar reps. Busca ganar solo 1 rep en una serie, o baja un 10 % y reconstruye. En fase de pérdida de grasa, mantener ya es buen resultado.`;
    }
  }
  return res;
}

function newEntry(exId) {
  const s = suggest(ex(exId));
  return { exId, sets: s.sets.map(x => ({ kg: x.kg, reps: x.reps, done: false })) };
}

function startSession(tplId) {
  const t = tpl(tplId);
  state.active = { id: uid(), templateId: t.id, name: t.name, date: today(), startedAt: Date.now(), entries: t.ex.map(newEntry) };
  ui.openEx = 0; ui.tab = 'gym'; ui.showHist = {};
  save(); render(); window.scrollTo(0, 0);
}

function finishSession() {
  const a = state.active;
  const done = sum(a.entries.map(e => e.sets.filter(s => s.done).length));
  if (!done) {
    if (confirm('No has marcado ninguna serie. ¿Descartar la sesión?')) { state.active = null; stopTimer(); save(); render(); }
    return;
  }
  if (!confirm(`¿Terminar ${a.name}? Se guardarán ${done} series marcadas.`)) return;
  const prs = [];
  const entries = a.entries.map(e => ({ exId: e.exId, sets: e.sets.filter(s => s.done).map(s => ({ kg: s.kg, reps: s.reps })) })).filter(e => e.sets.length);
  for (const e of entries) {
    const prev = exHistory(e.exId);
    if (!prev.length) continue;
    const best = Math.max(...prev.map(p => maxKg(p.sets)));
    const now = maxKg(e.sets);
    if (now > best) prs.push(`${ex(e.exId).name}: ${fmtKg(now)} kg`);
  }
  const w = { id: a.id, date: a.date, templateId: a.templateId, name: a.name, minutes: Math.round((Date.now() - a.startedAt) / 60000), createdAt: Date.now(), entries };
  state.workouts.push(w); sortWorkouts();
  state.active = null; stopTimer(); save();
  ui.sheet = { type: 'summary', id: w.id, prs };
  render();
}

/* ================= Cardio, deporte y prehab ================= */
const ACT_TYPES = {
  caminata: { name: 'Caminata', icon: '🚶', km: true, pace: true, prehab: true, def: 90, how: '8-10 km a 5,5-6,5 km/h, a un ritmo en el que puedas hablar. Con cuestas si puedes. Progresa en ritmo o desnivel, no en km. Nunca el día antes de Piernas.' },
  bici: { name: 'Bici suave', icon: '🚴', km: true, def: 20, how: '15-25 min suaves después del gym.' },
  'bici-int': { name: 'Bici intervalos', icon: '⚡', km: true, def: 18, how: '8-10 intervalos de 30" fuerte / 60" suave (15-20 min). 1 día por semana.' },
  futbol: { name: 'Fútbol 7', icon: '⚽', def: 60, how: 'Calentamiento: 2 rectas progresivas + 1 serie de shuffle (2 min). Evita piernas pesadas al día siguiente.' },
  padel: { name: 'Pádel', icon: '🎾', def: 60, how: 'Calentamiento: 2 rectas progresivas + 1 serie de shuffle. Si juegas 2 partidos en la semana, quita la bici de un día.' },
  correr: { name: 'Correr', icon: '🏃', km: true, pace: true, prehab: true, def: 25, how: '' },
  casa: { name: 'Core y cuello', icon: '🧘', home: true, def: 10, how: 'En casa, ~8-10 min, 1-2 días por semana.' },
  otro: { name: 'Otro', icon: '✨', km: true, def: null, how: '' },
};
const actT = t => ACT_TYPES[t] || ACT_TYPES.otro;
const FEELS = [[1, '😫', 'Muy mal'], [2, '😕', 'Mal'], [3, '😐', 'Normal'], [4, '🙂', 'Bien'], [5, '🔥', 'Genial']];
const PREHAB_WALK = [
  ['Clamshell con banda ligera', '2×15 cada lado'], ['Monster walk lateral, banda media', '2×20 pasos cada dirección'],
  ['Dorsiflexión contra pared', '2×10 por pie (2 s al final)'], ['Sóleo contra pared', '2×30 s por pie'],
  ['Calf raise excéntrico unipodal (fase 2)', '3×12 cada pierna, bajada 3 s'], ['Equilibrio unipodal con perturbación (fase 2)', '2×30 s cada pierna'],
];
const HOME_BLOCKS = {
  core: { name: 'Core', items: [['Plancha frontal', '3×30-40 s'], ['Plancha lateral', '2×30 s cada lado'], ['Dead bug', '3×8 cada lado, lento'], ['Hollow body', '2×20 s']] },
  cuello: { name: 'Cuello', items: [['Isométricos: flexión, extensión, lateral', '3×10 s por dirección, al 50-60 %, sin dolor']] },
  foam: { name: 'Foam roller', items: [['IT band + glúteo/piriforme', '90 s / 60 s cada lado'], ['Cuádriceps + gemelos', '60 s por zona (tras piernas)']] },
};
const fmtNum = n => n == null ? '–' : String(Math.round(n * 100) / 100).replace('.', ',');
const fmtMin = m => m == null ? '–' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${pad(Math.round(m % 60))} min`;
function paceTxt(min, km) {
  if (!min || !km) return null;
  const p = min / km; let mm = Math.floor(p), ss = Math.round((p - mm) * 60);
  if (ss === 60) { mm++; ss = 0; }
  return `${mm}:${pad(ss)} /km`;
}
const speedTxt = (min, km) => min && km ? `${fmtNum(Math.round(km / (min / 60) * 10) / 10)} km/h` : null;
const sortedActs = () => [...state.activities].sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0));

function newActDraft(type) {
  const prev = sortedActs().find(a => a.type === type);
  return { type, date: today(), min: prev && prev.min ? Math.round(prev.min) : actT(type).def, km: prev && type === 'caminata' ? prev.km : null, feel: null, notes: '', prehab: false, blocks: type === 'casa' ? ['core', 'cuello'] : [] };
}

/* ================= Temporizador de descanso ================= */
const timer = { end: 0, total: 60, int: null, goUntil: 0 };
let audioCtx = null;
function unlockAudio() {
  try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}
}
function beep() {
  if (!audioCtx) return;
  [0, .22, .44].forEach((t, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = i === 2 ? 1320 : 880; o.connect(g); g.connect(audioCtx.destination);
    const s = audioCtx.currentTime + t;
    g.gain.setValueAtTime(.0001, s); g.gain.exponentialRampToValueAtTime(.35, s + .02); g.gain.exponentialRampToValueAtTime(.0001, s + .18);
    o.start(s); o.stop(s + .2);
  });
}
function startTimer(sec) {
  unlockAudio();
  timer.total = sec; timer.end = Date.now() + sec * 1000; timer.goUntil = 0;
  clearInterval(timer.int); timer.int = setInterval(tickTimer, 250); tickTimer();
}
function stopTimer() { clearInterval(timer.int); timer.int = null; timer.end = 0; $('#timer').classList.add('hidden'); }
function tickTimer() {
  const el = $('#timer');
  const left = Math.ceil((timer.end - Date.now()) / 1000);
  if (left > 0) {
    el.className = 'timer';
    el.innerHTML = `<div class="grow"><div class="tl">Descanso</div><div class="tv">${Math.floor(left / 60)}:${pad(left % 60)}</div></div>
      <button class="btn sm" data-act="timerAdd">+15 s</button><button class="btn sm" data-act="timerStop">Saltar</button>
      <div class="bar" style="width:${(1 - left / timer.total) * 100}%"></div>`;
  } else if (!timer.goUntil) {
    timer.goUntil = Date.now() + 4000;
    beep(); if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    el.className = 'timer go';
    el.innerHTML = `<div class="grow"><div class="tl">Descanso terminado</div><div class="tv">¡Siguiente serie!</div></div><button class="btn sm" data-act="timerStop">OK</button>`;
  } else if (Date.now() > timer.goUntil) stopTimer();
}

/* ================= Render ================= */
const ICON_GEAR = '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3.3h-4L10.6 6a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1c.5.4 1.1.7 1.7 1l.4 2.7h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function render() {
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === (ui.tab === 'ajustes' ? 'hoy' : ui.tab)));
  const views = { hoy: viewHoy, gym: viewGym, actividad: viewActividad, progreso: viewProgreso, semana: viewSemana, ajustes: viewAjustes };
  $('#app').innerHTML = views[ui.tab]();
  renderSheet();
}

function viewSoon(ic, t, d) {
  return `<div class="top"><h1>${t}</h1></div><div class="card soon"><div class="ic">${ic}</div><b>Próximamente</b>${d}</div>`;
}

function weekGym() {
  const ws = weekStart(today());
  return state.workouts.filter(w => w.date >= ws);
}
function nextTemplate() {
  const main = state.templates.filter(t => !t.optional);
  const doneWeek = new Set(weekGym().map(w => w.templateId));
  const lastDate = id => { const w = [...state.workouts].reverse().find(x => x.templateId === id); return w ? w.date : '0000'; };
  const pending = main.filter(t => !doneWeek.has(t.id));
  const pool = pending.length ? pending : main;
  const blocked = piernasBlocked();
  return pool.sort((a, b) => {
    const ba = blocked && a.id === 'piernas', bb = blocked && b.id === 'piernas';
    if (ba !== bb) return ba ? 1 : -1;
    return lastDate(a.id) < lastDate(b.id) ? -1 : 1;
  })[0];
}

function viewHoy() {
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches';
  const week = weekGym();
  const doneIds = new Set(week.map(w => w.templateId));
  const main = state.templates.filter(t => !t.optional);
  const a = state.active;
  let hero;
  if (a) {
    const done = sum(a.entries.map(e => e.sets.filter(s => s.done).length));
    hero = `<div class="hero"><div class="label">Sesión en curso</div><div class="big">${esc(a.name)}</div>
      <div class="muted"><span data-elapsed>${elapsed(a.startedAt)}</span> · ${done} series hechas</div>
      <button class="btn primary" data-act="tab" data-tab="gym">Continuar →</button></div>`;
  } else {
    const nt = nextTemplate();
    const doneToday = state.workouts.some(w => w.date === today());
    const blockedNote = nt.id === 'piernas' && piernasBlocked() ? '<div class="small" style="color:var(--warn);margin-top:6px">Ayer hiciste fútbol o caminata: si puedes, deja Piernas para mañana.</div>' : '';
    hero = `<div class="hero"><div class="label">${doneToday ? 'Hoy ya entrenaste 💪' : 'Te toca'}</div><div class="big">${esc(nt.name)}</div>
      <div class="muted">${esc(nt.desc || '')}</div>${blockedNote}
      <button class="btn primary" data-act="start" data-tpl="${nt.id}">Empezar ${esc(nt.name)}</button></div>`;
  }
  const dots = main.map(t => `<div class="week-dot ${doneIds.has(t.id) ? 'done' : ''}"><span class="ck">${doneIds.has(t.id) ? '✓' : '○'}</span>${esc(t.name)}</div>`).join('');
  const extra = week.filter(w => !main.some(t => t.id === w.templateId)).length;
  const lb = state.settings.lastBackup;
  const needBackup = !lb || daysAgo(lb) >= 7;
  const recent = [...state.workouts].reverse().slice(0, 3);
  const todayActs = state.activities.filter(x => x.date === today());
  const wd = weekData(weekStart(today()));
  const wpct = Math.round(wd.score / wd.total * 100);
  const warns = fitWarnings();
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const showInstall = isIOS && !standalone && !state.settings.hideInstall;
  const welcome = !state.settings.welcomed && !state.workouts.length;
  return `
    <div class="top"><div><div class="sub">${esc(cap(fmtDate(today(), { weekday: 'long', day: 'numeric', month: 'long' })))}</div><h1>${greet}</h1></div>
      <button class="icon-btn" data-act="tab" data-tab="ajustes" aria-label="Ajustes">${ICON_GEAR}</button></div>
    ${showInstall ? `<div class="banner info"><div class="grow">📲 <b>Instálala:</b> toca <b>Compartir</b> <span class="share-ic">⬆︎</span> y luego <b>Añadir a pantalla de inicio</b>. Así funciona sin conexión y tus datos quedan a salvo.</div><button class="btn sm" data-act="hideInstall">OK</button></div>` : ''}
    ${welcome ? `<div class="card welcome"><div class="bold" style="font-size:18px">👋 Bienvenido a ASPfitness</div><div class="muted small" style="margin:6px 0 12px">Tus plantillas de Empuje, Tirón, Piernas y 4ª sesión ya están listas. Si tienes el archivo <b>mis-datos-iniciales.json</b> (tu historial del Excel) o una copia de seguridad, impórtalo para ver tu progreso desde el primer día.</div>
      <div class="btns"><button class="btn primary sm" data-act="import">Importar archivo</button><button class="btn sm" data-act="dismissWelcome">Empezar de cero</button></div></div>` : ''}
    ${needBackup && !welcome ? `<div class="banner"><div class="grow">💾 ${lb ? `Tu última copia fue ${agoText(lb)}.` : 'Aún no has hecho ninguna copia de seguridad.'}</div><button class="btn sm" data-act="export">Copiar</button></div>` : ''}
    ${hero}
    <div class="btns quick" style="margin-bottom:10px"><button class="btn" data-act="newAct" data-type="caminata">🚶 Caminata</button><button class="btn" data-act="newBody">⚖️ Peso</button><button class="btn" data-act="tab" data-tab="actividad">＋ Más</button></div>
    ${warns.length ? `<div class="card tight">${warns.map(w => `<div class="warn-row">${esc(w)}</div>`).join('')}</div>` : ''}
    ${habitsCard()}
    ${todayActs.length ? `<h2 class="sec">Hoy también</h2><div class="card tight">${todayActs.map(actItem).join('')}</div>` : ''}
    <h2 class="sec">Tu semana</h2>
    <button class="card press" style="display:block;width:100%;text-align:left" data-act="tab" data-tab="semana"><div class="row between"><div class="bold">Semana tipo · ${wpct}%</div><div class="muted small">Ver semana ›</div></div>
      <div class="progress"><i style="width:${wpct}%"></i></div>
      <div class="week-dots">${dots}</div>
      <div class="small" style="margin-top:10px">${wd.missing.length ? `<span class="muted">Te falta:</span> ${esc(wd.missing.join(', '))}` : '✓ ¡Semana completa!'}${extra ? ` <span class="muted">· +${extra} sesión extra</span>` : ''}</div></button>
    <h2 class="sec">Últimas sesiones</h2>
    <div class="card tight">${recent.length ? recent.map(histItem).join('') : '<div class="muted small">Aún no hay sesiones.</div>'}</div>`;
}

function histItem(w) {
  const d = parseDate(w.date);
  const nSets = sum(w.entries.map(e => e.sets.length));
  const vol = sum(w.entries.map(e => volume(e.sets)));
  return `<button class="hist-item" data-act="openWorkout" data-id="${w.id}">
    <div class="date-chip"><div class="d">${d.getDate()}</div><div class="m">${d.toLocaleDateString('es-ES', { month: 'short' })}</div></div>
    <div class="grow"><div class="bold">${esc(w.name)}</div><div class="muted small">${w.entries.length} ejercicios · ${nSets} series · ${Math.round(vol).toLocaleString('es-ES')} kg${w.minutes ? ` · ${w.minutes} min` : ''}</div></div>
    <div class="muted">›</div></button>`;
}

function elapsed(t) { const m = Math.floor((Date.now() - t) / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`; }

function viewGym() {
  if (state.active) return viewSession();
  const lastOf = id => [...state.workouts].reverse().find(w => w.templateId === id);
  const tpls = state.templates.map(t => {
    const l = lastOf(t.id);
    return `<button class="tpl" data-act="start" data-tpl="${t.id}"><div class="badge">${esc(t.name.slice(0, 1))}</div>
      <div class="grow"><div class="name">${esc(t.name)}</div><div class="muted small">${t.ex.length} ejercicios · ${l ? 'última ' + agoText(l.date) : 'sin registros'}${t.optional ? ' · opcional' : ''}</div></div><div class="go">›</div></button>`;
  }).join('');
  const hist = [...state.workouts].reverse();
  return `<div class="top"><h1>Gym</h1></div>
    <h2 class="sec" style="margin-top:4px">Empezar sesión</h2>${tpls}
    <h2 class="sec">Historial</h2>
    <div class="card tight">${hist.length ? hist.map(histItem).join('') : '<div class="muted small">Aún no hay sesiones.</div>'}</div>`;
}

function viewSession() {
  const a = state.active;
  const total = sum(a.entries.map(e => e.sets.length));
  const done = sum(a.entries.map(e => e.sets.filter(s => s.done).length));
  const cards = a.entries.map((en, i) => exCard(en, i)).join('');
  return `<div class="session-head"><div class="row between"><div class="grow"><div class="title">${esc(a.name)}</div>
      <div class="meta"><b data-elapsed>${elapsed(a.startedAt)}</b> · ${done}/${total} series</div></div>
      <button class="btn sm primary" data-act="finish">Terminar</button></div>
      <div class="progress"><i style="width:${total ? done / total * 100 : 0}%"></i></div></div>
    <div class="muted small" style="margin:0 4px 10px">kg = peso total (suma de ambas manos en mancuernas o unilaterales)</div>
    ${cards}
    <div class="btns" style="margin-top:6px"><button class="btn" data-act="pickEx" data-mode="session">＋ Añadir ejercicio</button></div>
    <button class="btn danger" style="margin-top:6px" data-act="discard">Descartar sesión</button>
    <div style="height:90px"></div>`;
}

function exCard(en, i) {
  const e = ex(en.exId);
  const open = ui.openEx === i;
  const doneN = en.sets.filter(s => s.done).length;
  const complete = en.sets.length && doneN === en.sets.length;
  let body = '';
  if (open) {
    const h = exHistory(e.id);
    const last = h[h.length - 1];
    const s = suggest(e);
    const histRows = ui.showHist[i] ? `<table class="hist-mini">${h.slice(-6).reverse().map(x => `<tr><td class="muted">${esc(fmtDate(x.date, { day: 'numeric', month: 'short' }))}</td><td class="num">${esc(setsTxt(x.sets))}</td></tr>`).join('')}</table>` : '';
    body = `<div class="ex-body">
      ${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}
      ${last ? `<div class="last"><span class="lbl">Última vez · ${esc(agoText(last.date))}</span><span class="bold num">${esc(setsTxt(last.sets))}</span></div>` : ''}
      ${histRows}
      <div class="sug ${s.type}"><div class="t">${esc(s.title)}</div><div>${s.text}</div>${s.stall ? `<div class="stall">⚠️ ${esc(s.stall)}</div>` : ''}</div>
      <div class="sets-head"><span>#</span><span>${e.bodyweight ? 'kg extra' : 'kg'}</span><span>reps</span><span></span></div>
      ${en.sets.map((st, j) => `<div class="set ${st.done ? 'done' : ''}"><div class="n">${j + 1}</div>
        <div class="stepper"><button data-act="step" data-i="${i}" data-s="${j}" data-f="kg" data-d="-1">−</button><input class="num" inputmode="decimal" data-field="kg" data-i="${i}" data-s="${j}" value="${st.kg == null ? '' : fmtKg(st.kg)}" placeholder="–"><button data-act="step" data-i="${i}" data-s="${j}" data-f="kg" data-d="1">+</button></div>
        <div class="stepper"><button data-act="step" data-i="${i}" data-s="${j}" data-f="reps" data-d="-1">−</button><input class="num" inputmode="numeric" data-field="reps" data-i="${i}" data-s="${j}" value="${st.reps ?? ''}" placeholder="–"><button data-act="step" data-i="${i}" data-s="${j}" data-f="reps" data-d="1">+</button></div>
        <button class="check" data-act="check" data-i="${i}" data-s="${j}" aria-label="Serie hecha">${ICON_CHECK}</button></div>`).join('')}
      <div class="ex-actions"><button class="btn sm" data-act="addSet" data-i="${i}">＋ Serie</button><button class="btn sm" data-act="delSet" data-i="${i}">− Serie</button><button class="btn sm" data-act="applySug" data-i="${i}">Usar sugerencia</button></div>
      <div class="row between" style="margin-top:6px">${h.length ? `<button class="link" data-act="toggleHist" data-i="${i}">${ui.showHist[i] ? 'Ocultar historial' : 'Ver historial'}</button>` : '<span></span>'}<button class="link danger" data-act="removeEx" data-i="${i}">Quitar</button></div>
    </div>`;
  }
  return `<div class="ex ${open ? 'open' : ''} ${complete ? 'complete' : ''}" id="ex-${i}">
    <button class="ex-head" data-act="toggleEx" data-i="${i}"><div class="idx">${complete ? '✓' : i + 1}</div>
      <div class="grow"><div class="name">${esc(e.name)}</div><div class="tgt">${targetTxt(e)}${e.warmup ? ' · calentamiento' : ''}</div></div>
      <div class="cnt num">${doneN}/${en.sets.length}</div></button>${body}</div>`;
}

function viewActividad() {
  const ws = weekStart(today());
  const wk = state.activities.filter(a => a.date >= ws);
  const c = t => wk.filter(a => a.type === t).length;
  const walks = wk.filter(a => a.type === 'caminata');
  const walkKm = sum(walks.map(a => a.km));
  const bikes = c('bici') + c('bici-int');
  const stats = [
    ['Caminatas', `${walks.length}/2`, walkKm ? `${fmtNum(walkKm)} km` : '8-10 km', walks.length >= 2],
    ['Fútbol 7', `${c('futbol')}/1`, 'semanal', c('futbol') >= 1],
    ['Pádel', `${c('padel')}`, '0-2 · bonus', c('padel') >= 1],
    ['Bici', `${bikes}`, c('bici-int') ? `${c('bici-int')} con intervalos` : 'falta intervalos', c('bici-int') >= 1],
    ['Core y cuello', `${c('casa')}/1-2`, 'en casa', c('casa') >= 1],
    ['Cadera/tobillo', `${walks.filter(a => a.prehab).length}/${walks.length}`, 'antes de caminar', walks.length > 0 && walks.every(a => a.prehab)],
  ];
  const tiles = Object.keys(ACT_TYPES).map(t => `<button class="tile press" data-act="newAct" data-type="${t}"><span class="ti">${ACT_TYPES[t].icon}</span><span>${ACT_TYPES[t].name}</span></button>`).join('');
  const all = sortedActs();
  const limit = ui.actLimit || 20;
  return `<div class="top"><h1>Actividad</h1></div>
    <h2 class="sec" style="margin-top:4px">Registrar</h2>
    <div class="tiles">${tiles}</div>
    <h2 class="sec">Esta semana</h2>
    <div class="wk-grid">${stats.map(([k, v, x, ok]) => `<div class="wk ${ok ? 'ok' : ''}"><div class="k">${k}</div><div class="v num">${v}</div><div class="x">${x}</div></div>`).join('')}</div>
    <h2 class="sec">Historial</h2>
    <div class="card tight">${all.length ? all.slice(0, limit).map(actItem).join('') : '<div class="muted small">Aún no hay actividades.</div>'}
      ${all.length > limit ? `<button class="link" style="width:100%" data-act="moreActs">Ver más (${all.length - limit})</button>` : ''}</div>`;
}

function actItem(a) {
  const T = actT(a.type);
  const bits = [a.min != null ? fmtMin(a.min) : null, a.km ? `${fmtNum(a.km)} km` : null, T.pace ? paceTxt(a.min, a.km) : null].filter(Boolean);
  if (T.home && a.blocks && a.blocks.length) bits.push(a.blocks.map(b => HOME_BLOCKS[b] ? HOME_BLOCKS[b].name : b).join(' + '));
  return `<button class="hist-item" data-act="editAct" data-id="${a.id}"><div class="act-ic">${T.icon}</div>
    <div class="grow"><div class="bold">${esc(T.name)}${a.prehab ? '<span class="tag">+ cadera/tobillo</span>' : ''}</div>
      <div class="muted small">${esc(cap(fmtDate(a.date)))}${bits.length ? ' · ' + esc(bits.join(' · ')) : ''}</div>
      ${a.notes ? `<div class="muted small ellipsis">${esc(a.notes)}</div>` : ''}</div>
    ${a.feel ? `<div class="feel-badge" title="${FEELS[a.feel - 1][2]}">${FEELS[a.feel - 1][1]}</div>` : ''}</button>`;
}

function paceLine(d) {
  const T = actT(d.type);
  if (!d.min || !d.km) return T.km ? 'Pon minutos y km para calcular el ritmo.' : '';
  return [T.pace ? `Ritmo <b>${paceTxt(d.min, d.km)}</b>` : null, `Velocidad <b>${speedTxt(d.min, d.km)}</b>`].filter(Boolean).join(' · ');
}

function sheetAct(s) {
  const d = s.draft, T = actT(d.type);
  const chips = Object.keys(ACT_TYPES).map(t => `<button class="chip ${t === d.type ? 'on' : ''}" data-act="actType" data-t="${t}">${ACT_TYPES[t].icon} ${ACT_TYPES[t].name}</button>`).join('');
  const routine = items => items.map(([n, r]) => `<div class="rt"><span>${esc(n)}</span><span class="muted">${esc(r)}</span></div>`).join('');
  return `<h3>${s.id ? 'Editar actividad' : 'Nueva actividad'}</h3>
    <div class="chips">${chips}</div>
    ${T.how ? `<div class="howto">💡 ${esc(T.how)}</div>` : ''}
    <div class="field"><span>Fecha</span><input class="input" type="date" data-afield="date" value="${d.date}"></div>
    <div class="${T.km ? 'grid2' : ''}">
      <div class="field"><span>Minutos</span><div class="stepper big"><button data-act="actStep" data-f="min" data-d="-5">−</button><input class="num" inputmode="decimal" data-afield="min" value="${d.min == null ? '' : Math.round(d.min * 10) / 10}" placeholder="0"><button data-act="actStep" data-f="min" data-d="5">+</button></div></div>
      ${T.km ? `<div class="field"><span>Km</span><div class="stepper big"><button data-act="actStep" data-f="km" data-d="-0.5">−</button><input class="num" inputmode="decimal" data-afield="km" value="${d.km == null ? '' : fmtNum(d.km)}" placeholder="0"><button data-act="actStep" data-f="km" data-d="0.5">+</button></div></div>` : ''}
    </div>
    ${T.km ? `<div class="pace muted small" id="paceOut">${paceLine(d)}</div>` : ''}
    ${T.prehab ? `<label class="toggle"><input type="checkbox" data-achk="prehab" ${d.prehab ? 'checked' : ''}> Hice cadera y tobillo antes (~10 min)</label>
      <details class="routine"><summary>Ver rutina de cadera y tobillo</summary>${routine(PREHAB_WALK)}</details>` : ''}
    ${T.home ? `<div class="field"><span>Qué hiciste</span>${Object.entries(HOME_BLOCKS).map(([k, b]) => `<label class="toggle"><input type="checkbox" data-ablock="${k}" ${d.blocks.includes(k) ? 'checked' : ''}> ${b.name}</label><details class="routine"><summary>Ver ejercicios de ${b.name.toLowerCase()}</summary>${routine(b.items)}</details>`).join('')}</div>` : ''}
    <div class="field"><span>Sensaciones</span><div class="feels">${FEELS.map(([v, e, l]) => `<button class="feel ${d.feel === v ? 'on' : ''}" data-act="actFeel" data-v="${v}"><span class="fe">${e}</span><span>${l}</span></button>`).join('')}</div></div>
    <div class="field"><span>Notas</span><textarea class="input" data-afield="notes" placeholder="Ruta, molestias, cómo te has sentido…">${esc(d.notes || '')}</textarea></div>
    <button class="btn primary" data-act="saveAct">Guardar</button>
    ${s.id ? `<button class="btn danger" style="margin-top:6px" data-act="delAct">Borrar actividad</button>` : ''}`;
}

/* ================= Gráficas (SVG propio, sin librerías) ================= */
const DAY = 864e5;
const C_BLUE = '#5aa8ff', C_RAW = '#8794a6';
const charts = {};
const tsOf = s => parseDate(s).getTime();
function niceStep(span, n = 3) {
  if (span <= 0) return 1;
  const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
const fmtTick = v => Math.abs(v) >= 10000 ? fmtNum(Math.round(v / 100) / 10) + 'k' : fmtNum(Math.round(v * 100) / 100);

function chart(id, cfg) {
  const W = 330, H = cfg.h || 170, L = 38, R = 10, T = 14, B = 24;
  const pts = cfg.series.flatMap(s => s.pts);
  if (!pts.length) return '';
  const bars = cfg.series.some(s => s.kind === 'bars');
  let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
  const dx0 = x0, dx1 = x1;
  if (x1 - x0 < DAY) { x0 -= 3 * DAY; x1 += 3 * DAY; }
  if (bars) { const padX = (x1 - x0) * 0.06 + DAY; x0 -= padX; x1 += padX; }
  let y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
  if (bars) y0 = 0;
  if (y1 === y0) { y1 += 1; if (!bars) y0 -= 1; }
  const st = niceStep(y1 - y0);
  y0 = bars ? 0 : Math.floor(y0 / st) * st; y1 = Math.ceil(y1 / st) * st;
  if (y1 === y0) y1 += st;
  const sx = x => L + (x - x0) / (x1 - x0) * (W - L - R);
  const sy = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  let g = '';
  for (let v = y0; v <= y1 + st / 1e6; v += st) g += `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" class="grid"/><text x="${L - 6}" y="${sy(v) + 3.5}" class="ax" text-anchor="end">${fmtTick(v)}</text>`;
  const dl = x => esc(fmtDate(isoDate(new Date(x)), { day: 'numeric', month: 'short' }));
  g += `<text x="${sx(dx0)}" y="${H - 6}" class="ax" text-anchor="${dx0 === dx1 ? 'middle' : 'start'}">${dl(dx0)}</text>`;
  if (dx1 !== dx0) g += `<text x="${sx(dx1)}" y="${H - 6}" class="ax" text-anchor="end">${dl(dx1)}</text>`;
  let m = '';
  for (const s of cfg.series) {
    const p = [...s.pts].sort((a, b) => a.x - b.x);
    if (s.kind === 'bars') {
      const n = Math.max(p.length, 1);
      const bw = Math.max(4, Math.min(16, (W - L - R) / n * 0.55));
      for (const q of p) {
        const x = sx(q.x) - bw / 2, y = sy(q.y), base = sy(0), r = Math.min(4, bw / 2, base - y);
        m += `<path d="M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${base}Z" fill="${s.color}"/>`;
      }
    } else if (s.kind === 'dots') {
      m += p.map(q => `<circle cx="${sx(q.x)}" cy="${sy(q.y)}" r="3.5" fill="${s.color}" fill-opacity=".55"/>`).join('');
    } else {
      if (p.length > 1) m += `<path d="${p.map((q, i) => (i ? 'L' : 'M') + sx(q.x) + ',' + sy(q.y)).join('')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (s.dots || p.length === 1) m += p.map(q => `<circle cx="${sx(q.x)}" cy="${sy(q.y)}" r="4" fill="${s.color}" stroke="#0d1117" stroke-width="2"/>`).join('');
    }
  }
  charts[id] = { cfg, sx, sy, W, H, T, B };
  const legend = cfg.series.length > 1 ? `<div class="legend">${cfg.series.map(s => `<span><i class="${s.kind === 'dots' ? 'dot' : ''}" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<div class="chart" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.label || '')}">${g}${m}
    <line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/><circle class="hd" r="5.5" fill="${C_BLUE}" stroke="#fff" stroke-width="2" visibility="hidden"/></svg><div class="tip"></div></div>${legend}`;
}

function chartHover(ev) {
  const wrap = ev.target.closest && ev.target.closest('.chart');
  if (!wrap) return;
  const c = charts[wrap.dataset.chart]; if (!c) return;
  const svg = wrap.querySelector('svg'), r = svg.getBoundingClientRect();
  const vx = (ev.clientX - r.left) / r.width * c.W;
  const main = c.cfg.series[c.cfg.series.length - 1].pts;
  let best = main[0];
  for (const p of main) if (Math.abs(c.sx(p.x) - vx) < Math.abs(c.sx(best.x) - vx)) best = p;
  const X = c.sx(best.x), Y = c.sy(best.y);
  const xh = svg.querySelector('.xh'), hd = svg.querySelector('.hd');
  xh.setAttribute('x1', X); xh.setAttribute('x2', X); xh.setAttribute('visibility', 'visible');
  hd.setAttribute('cx', X); hd.setAttribute('cy', Y); hd.setAttribute('visibility', 'visible');
  const tip = wrap.querySelector('.tip');
  tip.innerHTML = `<div class="tt-d">${esc(cap(fmtDate(isoDate(new Date(best.x)))))}</div>` + c.cfg.series.map(s => {
    const q = s.pts.find(p => p.x === best.x);
    return q ? `<div>${c.cfg.series.length > 1 ? `<i class="${s.kind === 'dots' ? 'dot' : ''}" style="background:${s.color}"></i>` : ''}${esc(s.name)}: <b>${esc(c.cfg.fmt(q.y))}</b></div>` : '';
  }).join('') + (best.note ? `<div class="muted">${esc(best.note)}</div>` : '');
  const pct = X / c.W * 100;
  tip.style.display = 'block';
  tip.style.left = pct + '%';
  tip.style.transform = `translateX(${pct < 25 ? '-10%' : pct > 75 ? '-90%' : '-50%'})`;
}
function chartLeave(ev) {
  const wrap = ev.target.closest && ev.target.closest('.chart'); if (!wrap) return;
  wrap.querySelector('.tip').style.display = 'none';
  wrap.querySelectorAll('.xh,.hd').forEach(e => e.setAttribute('visibility', 'hidden'));
}

function spark(vals) {
  if (vals.length < 2) return '<svg class="spark" viewBox="0 0 60 22"></svg>';
  const mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * 56 + 2).toFixed(1)},${(19 - (v - mn) / sp * 16).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 60 22"><polyline points="${pts}" fill="none" stroke="${C_BLUE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

/* ================= Progreso ================= */
function viewProgreso() {
  const body = ui.prog === 'body';
  const seg = `<div class="seg"><button class="${body ? '' : 'on'}" data-act="progTab" data-v="ex">Ejercicios</button><button class="${body ? 'on' : ''}" data-act="progTab" data-v="body">Cuerpo</button></div>`;
  return `<div class="top"><h1>Progreso</h1>${body ? '<button class="btn sm primary" data-act="newBody">＋ Peso</button>' : ''}</div>${seg}${body ? viewBody() : ui.progEx ? viewExDetail(ui.progEx) : viewExList()}`;
}

const exIsBw = (e, h) => e.bodyweight && h.every(x => !maxKg(x.sets));
const exMetric = (bw, sets) => bw ? sum(sets.map(s => s.reps)) : maxKg(sets);

function viewExList() {
  const seen = new Set();
  const groups = state.templates.map(t => ({ name: t.name, ids: t.ex.filter(id => !seen.has(id) && seen.add(id)) }));
  const rest = Object.keys(state.exercises).filter(id => !seen.has(id));
  if (rest.length) groups.push({ name: 'Otros', ids: rest });
  let html = '';
  for (const gr of groups) {
    const rows = gr.ids.map(id => ({ id, h: exHistory(id) })).filter(x => x.h.length);
    if (!rows.length) continue;
    html += `<h2 class="sec">${esc(gr.name)}</h2><div class="card tight">` + rows.map(({ id, h }) => {
      const e = ex(id), bw = exIsBw(e, h), unit = bw ? 'reps' : 'kg';
      const vals = h.map(x => exMetric(bw, x.sets));
      const diff = vals[vals.length - 1] - vals[0];
      const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
      return `<button class="list-btn" data-act="progEx" data-id="${id}"><div class="grow"><div class="ellipsis bold">${esc(e.name)}</div>
        <div class="muted small">${fmtKg(vals[vals.length - 1])} ${unit} · ${h.length} ${h.length === 1 ? 'sesión' : 'sesiones'}</div></div>
        ${spark(vals)}<div class="delta ${cls}">${diff > 0 ? '▲ +' : diff < 0 ? '▼ −' : '= '}${diff ? fmtKg(Math.abs(diff)) : ''}</div></button>`;
    }).join('') + '</div>';
  }
  return html || '<div class="card soon"><div class="ic">📈</div><b>Sin datos todavía</b>Registra tu primera sesión en Gym.</div>';
}

function viewExDetail(id) {
  const e = ex(id), h = exHistory(id);
  const bw = exIsBw(e, h), unit = bw ? 'reps' : 'kg';
  const vals = h.map(x => exMetric(bw, x.sets));
  const best = Math.max(...vals), last = vals[vals.length - 1], diff = last - vals[0];
  const s = suggest(e);
  const maxCfg = { label: `${bw ? 'Reps totales' : 'Peso máximo'} de ${e.name}`, fmt: v => `${fmtKg(v)} ${unit}`, series: [{ name: bw ? 'Reps totales' : 'Peso máximo', kind: 'line', dots: true, color: C_BLUE, pts: h.map((x, i) => ({ x: tsOf(x.date) + i, y: vals[i], note: setsTxt(x.sets) })) }] };
  const volCfg = { label: `Volumen de ${e.name}`, fmt: v => `${Math.round(v).toLocaleString('es-ES')} kg`, series: [{ name: 'Volumen', kind: 'bars', color: C_BLUE, pts: h.map((x, i) => ({ x: tsOf(x.date) + i, y: volume(x.sets), note: setsTxt(x.sets) })) }] };
  return `<button class="link" data-act="progBack" style="margin:8px 0 2px">‹ Todos los ejercicios</button>
    <h2 style="margin:4px 2px 0;font-size:22px">${esc(e.name)}</h2><div class="muted small" style="margin:2px 2px 0">${targetTxt(e)} · ${h.length} ${h.length === 1 ? 'sesión' : 'sesiones'}</div>
    <div class="stat-grid"><div class="stat"><div class="v num">${fmtKg(best)}</div><div class="k">mejor (${unit})</div></div><div class="stat"><div class="v num">${fmtKg(last)}</div><div class="k">último (${unit})</div></div><div class="stat"><div class="v num delta ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '+' : diff < 0 ? '−' : ''}${fmtKg(Math.abs(diff))}</div><div class="k">desde el inicio</div></div></div>
    <div class="sug ${s.type}"><div class="t">Próxima vez: ${esc(s.title)}</div><div>${s.text}</div>${s.stall ? `<div class="stall">⚠️ ${esc(s.stall)}</div>` : ''}</div>
    <div class="card"><div class="bold">${bw ? 'Reps totales' : 'Peso máximo'} <span class="muted small">(${unit})</span></div>${chart('exmax', maxCfg)}</div>
    ${bw ? '' : `<div class="card"><div class="bold">Volumen por sesión <span class="muted small">(kg × reps)</span></div>${chart('exvol', volCfg)}</div>`}
    <h2 class="sec">Sesiones</h2>
    <div class="card tight"><table class="hist-mini">${[...h].reverse().map(x => `<tr><td class="muted">${esc(fmtDate(x.date, { day: 'numeric', month: 'short' }))}</td><td class="num">${esc(setsTxt(x.sets))}</td>${bw ? '' : `<td class="num muted">${Math.round(volume(x.sets)).toLocaleString('es-ES')}</td>`}</tr>`).join('')}</table></div>`;
}

/* --- Peso corporal y medidas --- */
const sortedBody = () => [...state.body].sort((a, b) => a.date < b.date ? -1 : 1);
function bodyWeeks(list) {
  const map = new Map();
  for (const b of list) {
    const ws = weekStart(b.date);
    if (!map.has(ws)) map.set(ws, { ws, kgs: [], waist: null });
    const w = map.get(ws);
    if (b.kg) w.kgs.push(b.kg);
    if (b.waist) w.waist = b.waist;
  }
  const out = [...map.values()].sort((a, b) => a.ws < b.ws ? -1 : 1);
  out.forEach((w, i) => { w.avg = w.kgs.length ? sum(w.kgs) / w.kgs.length : null; const p = out.slice(0, i).reverse().find(x => x.avg != null); w.change = w.avg != null && p ? w.avg - p.avg : null; });
  return out;
}
function changeStatus(c) {
  if (c == null) return '';
  if (c <= -0.55) return '<span class="st warn">⚡ Rápido</span>';
  if (c <= -0.2) return '<span class="st ok">✓ En objetivo</span>';
  if (c < 0.2) return '<span class="st neutral">= Estable</span>';
  return '<span class="st warn">▲ Subiendo</span>';
}
const signed = (n, d = 2) => n == null ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '') + fmtNum(Math.round(Math.abs(n) * 10 ** d) / 10 ** d);

function viewBody() {
  const all = sortedBody();
  if (!all.length) return `<div class="card soon"><div class="ic">⚖️</div><b>Aún no hay pesajes</b>Pésate 3-4 veces por semana, en ayunas. La app calcula la media semanal y el cambio. Objetivo: −0,25 a −0,5 kg/semana.<button class="btn primary" style="margin-top:16px" data-act="newBody">Registrar peso</button></div>`;
  const range = ui.bodyRange || '3M';
  const days = { '1M': 31, '3M': 92, '6M': 183, 'Todo': 1e5 }[range];
  const from = isoDate(new Date(Date.now() - days * DAY));
  const list = all.filter(b => b.date >= from);
  const kgList = list.filter(b => b.kg);
  const weeks = bodyWeeks(all);
  const cur = weeks[weeks.length - 1];
  const lastKg = [...all].reverse().find(b => b.kg);
  const lastWaist = [...all].reverse().find(b => b.waist);
  const firstWaist = all.find(b => b.waist);
  const avg7 = d => { const lo = isoDate(new Date(tsOf(d) - 6 * DAY)); const v = all.filter(b => b.kg && b.date >= lo && b.date <= d).map(b => b.kg); return sum(v) / v.length; };
  const wCfg = { label: 'Peso corporal', fmt: v => `${fmtNum(Math.round(v * 10) / 10)} kg`, series: [
    { name: 'Pesaje', kind: 'dots', color: C_RAW, pts: kgList.map(b => ({ x: tsOf(b.date), y: b.kg })) },
    { name: 'Media 7 días', kind: 'line', color: C_BLUE, pts: kgList.map(b => ({ x: tsOf(b.date), y: avg7(b.date) })) },
  ] };
  const waistList = list.filter(b => b.waist);
  const waistCfg = { label: 'Cintura', fmt: v => `${fmtNum(v)} cm`, series: [{ name: 'Cintura', kind: 'line', dots: true, color: C_BLUE, pts: waistList.map(b => ({ x: tsOf(b.date), y: b.waist })) }] };
  return `
    <div class="stat-grid">
      <div class="stat"><div class="v num">${lastKg ? fmtNum(lastKg.kg) : '–'}</div><div class="k">último · ${lastKg ? esc(agoText(lastKg.date)) : ''}</div></div>
      <div class="stat"><div class="v num">${cur.avg != null ? fmtNum(Math.round(cur.avg * 10) / 10) : '–'}</div><div class="k">media semana (${cur.kgs.length})</div></div>
      <div class="stat"><div class="v num">${signed(cur.change)}</div><div class="k">vs semana ant.</div></div>
    </div>
    ${cur.change != null ? `<div class="row" style="margin:-4px 2px 12px;gap:8px">${changeStatus(cur.change)}<span class="muted small">Objetivo: −0,25 a −0,5 kg/semana</span></div>` : ''}
    <div class="chips" style="margin:0 0 10px;padding:0">${['1M', '3M', '6M', 'Todo'].map(r => `<button class="chip ${r === range ? 'on' : ''}" data-act="bodyRange" data-v="${r}">${r}</button>`).join('')}</div>
    <div class="card"><div class="bold">Peso corporal <span class="muted small">(kg)</span></div>${kgList.length ? chart('bw', wCfg) : '<div class="muted small" style="padding:12px 0">Sin pesajes en este periodo.</div>'}</div>
    ${waistList.length ? `<div class="card"><div class="row between"><div class="bold">Cintura <span class="muted small">(cm, a la altura del ombligo)</span></div>${firstWaist && lastWaist && firstWaist !== lastWaist ? `<div class="small bold">${signed(lastWaist.waist - firstWaist.waist, 1)} cm</div>` : ''}</div>${chart('waist', waistCfg)}</div>` : ''}
    <h2 class="sec">Por semanas</h2>
    <div class="card tight"><table class="hist-mini wk-table"><tr class="muted small"><td>Semana</td><td>Media</td><td>Cambio</td><td>Cintura</td></tr>
      ${[...weeks].reverse().slice(0, 12).map(w => `<tr><td class="muted">${esc(fmtDate(w.ws, { day: 'numeric', month: 'short' }))}</td><td class="num bold">${w.avg != null ? fmtNum(Math.round(w.avg * 10) / 10) : '–'}</td><td class="num">${signed(w.change)}</td><td class="num">${w.waist ? fmtNum(w.waist) : '–'}</td></tr>`).join('')}</table></div>
    <h2 class="sec">Registros</h2>
    <div class="card tight">${[...all].reverse().slice(0, ui.bodyLimit || 15).map(b => `<button class="hist-item" data-act="editBody" data-id="${b.id}"><div class="grow"><div class="bold">${esc(cap(fmtDate(b.date)))}</div><div class="muted small">${[b.kg ? fmtNum(b.kg) + ' kg' : null, b.waist ? 'cintura ' + fmtNum(b.waist) + ' cm' : null, b.dfL || b.dfR ? `dorsiflexión ${fmtNum(b.dfL)} / ${fmtNum(b.dfR)} cm` : null].filter(Boolean).join(' · ')}</div></div><span class="muted">›</span></button>`).join('')}
      ${all.length > (ui.bodyLimit || 15) ? `<button class="link" style="width:100%" data-act="moreBody">Ver más</button>` : ''}</div>`;
}

function sheetBody(s) {
  const d = s.draft;
  const step = (f, st, ph) => `<div class="stepper big"><button data-act="bodyStep" data-f="${f}" data-d="-${st}">−</button><input class="num" inputmode="decimal" data-bfield="${f}" value="${d[f] == null ? '' : fmtNum(d[f])}" placeholder="${ph}"><button data-act="bodyStep" data-f="${f}" data-d="${st}">+</button></div>`;
  return `<h3>${s.id ? 'Editar registro' : 'Registrar peso'}</h3>
    <div class="howto">💡 Pésate en ayunas, después del baño. La cintura, siempre a la altura del ombligo.</div>
    <div class="field"><span>Fecha</span><input class="input" type="date" data-bfield="date" value="${d.date}"></div>
    <div class="field"><span>Peso (kg)</span>${step('kg', 0.1, 'kg')}</div>
    <div class="field"><span>Cintura (cm) · opcional</span>${step('waist', 0.5, 'cm')}</div>
    <details class="routine" ${d.dfL || d.dfR ? 'open' : ''}><summary>Dorsiflexión de tobillo (opcional)</summary>
      <div class="grid2" style="margin-top:8px"><div class="field" style="margin:6px 0"><span>Izquierdo (cm)</span>${step('dfL', 0.5, 'cm')}</div><div class="field" style="margin:6px 0"><span>Derecho (cm)</span>${step('dfR', 0.5, 'cm')}</div></div></details>
    <button class="btn primary" style="margin-top:8px" data-act="saveBody">Guardar</button>
    ${s.id ? `<button class="btn danger" style="margin-top:6px" data-act="delBody">Borrar registro</button>` : ''}`;
}

/* ================= Hábitos ================= */
const addDays = (d, n) => isoDate(new Date(parseDate(d).getFullYear(), parseDate(d).getMonth(), parseDate(d).getDate() + n));
const habitDone = (id, d) => (state.habitLog[d] || []).includes(id);
function streak(id) {
  let d = today(); if (!habitDone(id, d)) d = addDays(d, -1);
  let n = 0; while (habitDone(id, d)) { n++; d = addDays(d, -1); }
  return n;
}
function bestStreak(id) {
  const days = Object.keys(state.habitLog).filter(d => habitDone(id, d)).sort();
  let best = 0, cur = 0, prev = null;
  for (const d of days) { cur = prev && addDays(prev, 1) === d ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
  return best;
}
function habitsCard() {
  if (!state.habits.length) return '';
  const t = today();
  const doneN = state.habits.filter(h => habitDone(h.id, t)).length;
  return `<h2 class="sec">Hábitos de hoy <span style="float:right">${doneN}/${state.habits.length}</span></h2>
    <div class="habits">${state.habits.map(h => {
      const on = habitDone(h.id, t), s = streak(h.id);
      return `<button class="habit ${on ? 'on' : ''}" data-act="toggleHabit" data-id="${h.id}" data-date="${t}"><span class="hi">${esc(h.icon || '✅')}</span>
        <span class="grow bold">${esc(h.name)}</span>${s ? `<span class="streak">🔥 ${s} ${s === 1 ? 'día' : 'días'}</span>` : ''}<span class="hck">${ICON_CHECK}</span></button>`;
    }).join('')}</div>`;
}

/* ================= Semana ================= */
function weekData(ws) {
  const we = addDays(ws, 6);
  const inW = d => d >= ws && d <= we;
  const W = state.workouts.filter(w => inW(w.date));
  const A = state.activities.filter(a => inW(a.date));
  const c = t => A.filter(a => a.type === t);
  const walks = c('caminata'), bikes = [...c('bici'), ...c('bici-int')], ints = c('bici-int'), casa = c('casa'), fut = c('futbol'), pad = c('padel');
  const items = [];
  for (const t of state.templates) {
    const w = W.find(x => x.templateId === t.id);
    items.push({ icon: esc(t.name.slice(0, 1)), letter: true, name: t.name, detail: w ? 'Hecho el ' + fmtDate(w.date, { weekday: 'long' }) : t.optional ? 'Opcional, si hay energía' : 'Pendiente', have: w ? 1 : 0, need: 1, req: !t.optional, missing: t.name });
  }
  items.push({ icon: '🚴', name: 'Bici post-gym', detail: `${bikes.length} ${bikes.length === 1 ? 'sesión' : 'sesiones'} · ${ints.length ? 'intervalos hechos' : 'falta 1 día con intervalos'}`, have: ints.length ? 1 : 0, need: 1, req: true, missing: 'bici con intervalos', count: `${bikes.length}` });
  const walkKm = sum(walks.map(a => a.km));
  items.push({ icon: '🚶', name: 'Caminatas 8-10 km', detail: walks.length ? `${fmtNum(walkKm)} km en total` : '2 por semana', have: walks.length, need: 2, req: true, missing: walks.length === 1 ? '1 caminata' : '2 caminatas' });
  if (walks.length) {
    const pre = walks.filter(a => a.prehab).length;
    items.push({ icon: '🦵', name: 'Cadera y tobillo', detail: 'Antes de cada caminata', have: pre, need: walks.length, req: true, missing: 'cadera y tobillo antes de caminar' });
  }
  items.push({ icon: '🧘', name: 'Core y cuello', detail: 'En casa, 1-2 días', have: casa.length, need: 1, req: true, missing: 'core y cuello', count: `${casa.length}/1-2` });
  items.push({ icon: '⚽', name: 'Fútbol 7', detail: 'Semanal', have: fut.length, need: 1, req: true, missing: 'fútbol' });
  items.push({ icon: '🎾', name: 'Pádel', detail: '0-2 · bonus', have: pad.length, need: 0, req: false, count: `${pad.length}` });
  const req = items.filter(i => i.req);
  const score = sum(req.map(i => Math.min(1, i.have / i.need)));
  return { ws, we, W, A, items, score, total: req.length, missing: req.filter(i => i.have < i.need).map(i => i.missing) };
}

// Reglas de encaje del Excel
function fitWarnings() {
  const t = today(), y = addDays(t, -1);
  const actOn = (d, type) => state.activities.some(a => a.date === d && a.type === type);
  const out = [];
  if (actOn(y, 'futbol')) out.push('⚽ Ayer jugaste fútbol: hoy evita piernas pesadas.');
  if (actOn(y, 'caminata')) out.push('🚶 Ayer caminaste: hoy mejor no hagas Piernas.');
  if (actOn(t, 'futbol')) out.push('⚽ Hoy has jugado fútbol: mañana evita piernas pesadas.');
  if (actOn(t, 'caminata')) out.push('🚶 Hoy has caminado: mañana no toca Piernas.');
  const ws = weekStart(t);
  const pad = state.activities.filter(a => a.date >= ws && a.type === 'padel').length;
  if (pad >= 2) out.push('🎾 Llevas 2 partidos de pádel esta semana: quita la bici de un día.');
  return out;
}
function weekViolations(wd) {
  const out = [];
  const legs = wd.W.filter(w => w.templateId === 'piernas');
  for (const w of legs) {
    const prev = addDays(w.date, -1);
    const all = [...state.activities];
    if (all.some(a => a.date === prev && a.type === 'caminata')) out.push(`Caminaste el ${fmtDate(prev, { weekday: 'long' })} y al día siguiente hiciste Piernas.`);
    if (all.some(a => a.date === prev && a.type === 'futbol')) out.push(`Jugaste fútbol el ${fmtDate(prev, { weekday: 'long' })} y al día siguiente hiciste Piernas.`);
  }
  const pad = wd.A.filter(a => a.type === 'padel').length, bikes = wd.A.filter(a => a.type === 'bici' || a.type === 'bici-int').length;
  if (pad >= 2 && bikes >= 3) out.push('Con 2 partidos de pádel, la idea era quitar la bici de un día.');
  return out;
}
const piernasBlocked = () => { const y = addDays(today(), -1); return state.activities.some(a => a.date === y && (a.type === 'futbol' || a.type === 'caminata')); };

function viewSemana() {
  const off = ui.weekOff || 0;
  const ws = addDays(weekStart(today()), off * 7);
  const wd = weekData(ws);
  const isCur = off === 0;
  const range = `${fmtDate(ws, { day: 'numeric', month: 'short' })} – ${fmtDate(wd.we, { day: 'numeric', month: 'short' })}`;
  const pct = Math.round(wd.score / wd.total * 100);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const strip = days.map(d => {
    const g = wd.W.filter(w => w.date === d).map(w => `<span class="gl">${esc(w.name.slice(0, 1))}</span>`).join('');
    const a = wd.A.filter(x => x.date === d).map(x => `<span>${actT(x.type).icon}</span>`).join('');
    return `<div class="day ${d === today() ? 'today' : ''} ${d > today() ? 'future' : ''}"><div class="dn">${fmtDate(d, { weekday: 'narrow' })}</div><div class="dd">${parseDate(d).getDate()}</div><div class="di">${g}${a}</div></div>`;
  }).join('');
  const goals = wd.items.map(i => {
    const ok = i.need ? i.have >= i.need : i.have > 0;
    const part = !ok && i.have > 0;
    return `<div class="goal ${ok ? 'ok' : part ? 'part' : ''} ${i.req ? '' : 'opt'}"><div class="gi ${i.letter ? 'letter' : ''}">${i.icon}</div>
      <div class="grow"><div class="bold">${esc(i.name)}${i.req ? '' : ' <span class="muted small">· opcional</span>'}</div><div class="muted small">${esc(cap(i.detail))}</div></div>
      <div class="gc num">${i.count != null ? i.count : `${i.have}/${i.need}`}</div><div class="gk">${ok ? '✓' : ''}</div></div>`;
  }).join('');
  const warns = isCur ? fitWarnings() : [];
  const viol = weekViolations(wd);
  const habitGrid = state.habits.length ? `<h2 class="sec">Hábitos</h2><div class="card tight"><table class="hgrid"><tr><td></td>${days.map(d => `<td class="muted small">${fmtDate(d, { weekday: 'narrow' })}</td>`).join('')}<td></td></tr>
    ${state.habits.map(h => `<tr><td class="hn">${esc(h.icon || '✅')} ${esc(h.name)}</td>${days.map(d => `<td><button class="hc ${habitDone(h.id, d) ? 'on' : ''}" ${d > today() ? 'disabled' : ''} data-act="toggleHabit" data-id="${h.id}" data-date="${d}" aria-label="${esc(h.name)} ${d}"></button></td>`).join('')}<td class="num bold small">${days.filter(d => habitDone(h.id, d)).length}</td></tr>`).join('')}</table></div>` : '';
  return `<div class="top"><h1>Semana</h1></div>
    <div class="weeknav"><button class="icon-btn" data-act="weekNav" data-d="-1" aria-label="Semana anterior">‹</button>
      <div class="grow" style="text-align:center"><div class="bold">${isCur ? 'Esta semana' : off === -1 ? 'Semana pasada' : `Hace ${-off} semanas`}</div><div class="muted small">${esc(range)}</div></div>
      <button class="icon-btn" data-act="weekNav" data-d="1" ${isCur ? 'disabled style="opacity:.3"' : ''} aria-label="Semana siguiente">›</button></div>
    <div class="hero" style="margin-top:12px"><div class="row between"><div><div class="label">Semana tipo</div><div class="big num">${pct}%</div></div><div class="muted small" style="text-align:right">${fmtNum(Math.round(wd.score * 10) / 10)} de ${wd.total}<br>objetivos</div></div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="small" style="margin-top:10px">${wd.missing.length ? `<span class="muted">${isCur ? 'Te falta' : 'Faltó'}:</span> ${esc(wd.missing.join(', '))}` : '✓ ¡Semana completa!'}</div></div>
    <div class="days">${strip}</div>
    ${warns.length || viol.length ? `<h2 class="sec">Avisos de encaje</h2><div class="card tight">${warns.map(w => `<div class="warn-row">${esc(w)}</div>`).join('')}${viol.map(w => `<div class="warn-row">⚠️ ${esc(w)}</div>`).join('')}</div>` : ''}
    <h2 class="sec">Objetivos</h2><div class="card tight">${goals}</div>
    ${habitGrid}`;
}

function viewAjustes() {
  const lb = state.settings.lastBackup;
  const exList = Object.values(state.exercises).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return `<div class="top"><div class="row"><button class="icon-btn" data-act="tab" data-tab="hoy" aria-label="Volver" style="font-size:22px">‹</button><h1>Ajustes</h1></div></div>
    <h2 class="sec">Copia de seguridad</h2>
    <div class="card"><div class="muted small" style="margin-bottom:12px">Tus datos viven solo en este iPhone. Exporta una copia cada semana y guárdala en Archivos o iCloud.<br>Última copia: <b style="color:var(--text)">${lb ? esc(fmtDate(lb)) + ' (' + agoText(lb) + ')' : 'nunca'}</b></div>
      <div class="btns"><button class="btn primary" data-act="export">Exportar</button><button class="btn" data-act="import">Importar</button></div></div>
    <h2 class="sec">Plantillas</h2>
    <div class="card tight">${state.templates.map(t => `<button class="list-btn" data-act="editTpl" data-id="${t.id}"><div class="grow"><div class="bold">${esc(t.name)}</div><div class="muted small">${t.ex.length} ejercicios</div></div><span class="muted">›</span></button>`).join('')}
      <button class="list-btn" data-act="newTpl"><span class="plus">＋</span><span class="bold">Nueva plantilla</span></button></div>
    <h2 class="sec">Hábitos</h2>
    <div class="card tight">${state.habits.map((h, i) => `<div class="tpl-ex"><button class="grow row" style="text-align:left" data-act="editHabit" data-id="${h.id}"><span style="font-size:22px">${esc(h.icon || '✅')}</span><div><div class="bold">${esc(h.name)}</div><div class="muted small">Racha ${streak(h.id)} · mejor ${bestStreak(h.id)}</div></div></button>
      <button class="mini" data-act="habitMove" data-i="${i}" data-d="-1">↑</button><button class="mini" data-act="habitMove" data-i="${i}" data-d="1">↓</button><button class="mini" style="color:var(--danger)" data-act="delHabit" data-id="${h.id}">✕</button></div>`).join('')}
      <button class="list-btn" data-act="newHabit"><span class="plus">＋</span><span class="bold">Nuevo hábito</span></button></div>
    <h2 class="sec">Descanso entre series</h2>
    <div class="card"><div class="row between"><div class="bold">Temporizador</div><div class="row">
      <button class="btn sm" data-act="rest" data-d="-15">−15</button><div class="bold num" style="min-width:56px;text-align:center">${state.settings.restSec} s</div><button class="btn sm" data-act="rest" data-d="15">+15</button></div></div></div>
    <h2 class="sec">Ejercicios (${exList.length})</h2>
    <div class="card tight">${exList.map(e => `<button class="list-btn" data-act="editEx" data-id="${e.id}"><div class="grow"><div class="ellipsis">${esc(e.name)}</div><div class="muted small">${targetTxt(e)} · +${fmtKg(e.inc || 2.5)} kg</div></div><span class="muted">›</span></button>`).join('')}</div>
    <div class="muted small" style="text-align:center;margin:24px 0">ASPfitness ${APP_VERSION} · datos guardados en este dispositivo</div>`;
}

/* ================= Hojas ================= */
function renderSheet() {
  const s = ui.sheet;
  const el = $('#sheet');
  if (!s) { el.innerHTML = ''; return; }
  const sheets = { summary: sheetSummary, workout: sheetWorkout, pick: sheetPick, tpl: sheetTpl, exEdit: sheetExEdit, act: sheetAct, body: sheetBody };
  el.innerHTML = `<div class="backdrop" data-act="closeSheet"></div><div class="panel"><div class="grab"></div>${sheets[s.type](s)}</div>`;
}

function sheetSummary(s) {
  const w = state.workouts.find(x => x.id === s.id);
  if (!w) return '';
  const nSets = sum(w.entries.map(e => e.sets.length));
  const vol = sum(w.entries.map(e => volume(e.sets)));
  return `<h3>¡Sesión guardada! 💪</h3><div class="muted">${esc(w.name)} · ${esc(fmtDate(w.date))}</div>
    <div class="stat-grid"><div class="stat"><div class="v num">${w.minutes ?? '–'}</div><div class="k">minutos</div></div><div class="stat"><div class="v num">${nSets}</div><div class="k">series</div></div><div class="stat"><div class="v num">${Math.round(vol).toLocaleString('es-ES')}</div><div class="k">kg volumen</div></div></div>
    ${s.prs.length ? `<div class="card"><div class="bold" style="margin-bottom:6px">🏆 Nuevos máximos</div>${s.prs.map(p => `<div class="pr">${esc(p)}</div>`).join('')}</div>` : ''}
    <div class="muted small" style="margin:4px 2px 8px">¿Bici después del gym?</div>
    <div class="btns" style="margin-bottom:8px"><button class="btn" data-act="newAct" data-type="bici">🚴 Suave</button><button class="btn" data-act="newAct" data-type="bici-int">⚡ Intervalos</button></div>
    <button class="btn primary" data-act="closeSheet">Hecho</button>`;
}

function sheetWorkout(s) {
  const w = state.workouts.find(x => x.id === s.id);
  if (!w) return '';
  return `<h3>${esc(w.name)}</h3><div class="muted small">${w.imported ? 'Importado del Excel · fecha aproximada' : (w.minutes ? w.minutes + ' min' : '')}</div>
    <label class="field"><span>Fecha</span><input class="input" type="date" data-field="wdate" data-id="${w.id}" value="${w.date}"></label>
    <table class="hist-mini">${w.entries.map(e => `<tr><td>${esc(ex(e.exId).name)}</td><td class="num bold">${esc(setsTxt(e.sets))}</td></tr>`).join('')}</table>
    <button class="btn danger" data-act="delWorkout" data-id="${w.id}">Borrar sesión</button>`;
}

function sheetPick(s) {
  const used = new Set(s.mode === 'session' ? state.active.entries.map(e => e.exId) : tpl(s.tplId).ex);
  const list = Object.values(state.exercises).filter(e => !used.has(e.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return `<h3>Añadir ejercicio</h3>
    <label class="field"><input class="input" id="pickSearch" placeholder="Buscar…" autocomplete="off"></label>
    <button class="list-btn" data-act="newEx"><span class="plus">＋</span><span class="bold">Crear ejercicio nuevo</span></button>
    <div id="pickList">${list.map(e => `<button class="list-btn" data-act="pickOne" data-id="${e.id}" data-name="${esc(e.name.toLowerCase())}"><div class="grow"><div>${esc(e.name)}</div><div class="muted small">${targetTxt(e)}</div></div></button>`).join('')}</div>`;
}

function sheetTpl(s) {
  const t = tpl(s.id);
  return `<h3>Plantilla</h3>
    <label class="field"><span>Nombre</span><input class="input" data-field="tplName" data-id="${t.id}" value="${esc(t.name)}"></label>
    <label class="field"><span>Descripción</span><input class="input" data-field="tplDesc" data-id="${t.id}" value="${esc(t.desc || '')}"></label>
    <div>${t.ex.map((id, i) => `<div class="tpl-ex"><button class="grow" style="text-align:left" data-act="editEx" data-id="${id}"><div class="ellipsis">${esc(ex(id).name)}</div><div class="muted small">${targetTxt(ex(id))}</div></button>
      <button class="mini" data-act="tplMove" data-i="${i}" data-d="-1">↑</button><button class="mini" data-act="tplMove" data-i="${i}" data-d="1">↓</button><button class="mini" style="color:var(--danger)" data-act="tplDel" data-i="${i}">✕</button></div>`).join('')}</div>
    <button class="list-btn" data-act="pickEx" data-mode="tpl" data-tpl="${t.id}"><span class="plus">＋</span><span class="bold">Añadir ejercicio</span></button>
    <button class="btn danger" style="margin-top:12px" data-act="delTpl" data-id="${t.id}">Borrar plantilla</button>`;
}

function sheetExEdit(s) {
  const e = ex(s.id);
  return `<h3>Ejercicio</h3>
    <label class="field"><span>Nombre</span><input class="input" id="exName" value="${esc(e.name)}"></label>
    <div class="grid3">
      <label class="field"><span>Series</span><input class="input num" id="exSets" inputmode="numeric" value="${e.sets}"></label>
      <label class="field"><span>Reps mín.</span><input class="input num" id="exMin" inputmode="numeric" value="${e.repMin ?? ''}" placeholder="máx"></label>
      <label class="field"><span>Reps máx.</span><input class="input num" id="exMax" inputmode="numeric" value="${e.repMax ?? ''}" placeholder="máx"></label>
    </div>
    <label class="field"><span>Subida de peso (kg)</span><input class="input num" id="exInc" inputmode="decimal" value="${fmtKg(e.inc || 2.5)}"></label>
    <label class="field"><span>Nota (RIR, técnica…)</span><textarea class="input" id="exNote">${esc(e.note || '')}</textarea></label>
    <label class="toggle"><input type="checkbox" id="exBw" ${e.bodyweight ? 'checked' : ''}> Peso corporal (kg = lastre)</label>
    <label class="toggle"><input type="checkbox" id="exWu" ${e.warmup ? 'checked' : ''}> Calentamiento (sin sugerencia de progresión)</label>
    <div class="muted small" style="margin:6px 2px 14px">Deja vacías las reps para series “al máximo”.</div>
    <button class="btn primary" data-act="saveEx" data-id="${e.id}" data-back="${s.back || ''}">Guardar</button>`;
}

/* ================= Acciones ================= */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

const actions = {
  tab(d) { ui.tab = d.tab; ui.sheet = null; render(); window.scrollTo(0, 0); },
  start(d) {
    if (state.active) { if (state.active.templateId !== d.tpl && !confirm(`Tienes ${state.active.name} en curso. ¿Descartarla y empezar otra?`)) { ui.tab = 'gym'; render(); return; } if (state.active.templateId === d.tpl) { ui.tab = 'gym'; render(); return; } }
    startSession(d.tpl);
  },
  toggleEx(d) {
    const i = +d.i; ui.openEx = ui.openEx === i ? null : i; render();
    if (ui.openEx != null) requestAnimationFrame(() => { const el = document.getElementById('ex-' + i); if (el) { const y = el.getBoundingClientRect().top + window.scrollY - 120; window.scrollTo({ top: y, behavior: 'smooth' }); } });
  },
  toggleHist(d) { ui.showHist[d.i] = !ui.showHist[d.i]; render(); },
  step(d) {
    const en = state.active.entries[+d.i], st = en.sets[+d.s], e = ex(en.exId);
    if (d.f === 'kg') { const inc = e.inc || 2.5; st.kg = Math.max(0, round2((st.kg || 0) + (+d.d) * inc)); }
    else st.reps = Math.max(0, (st.reps || 0) + (+d.d));
    save(); render();
  },
  check(d) {
    const en = state.active.entries[+d.i], st = en.sets[+d.s];
    st.done = !st.done;
    if (st.done && st.reps == null) { st.done = false; toast('Pon las repeticiones'); return; }
    save();
    if (st.done) {
      startTimer(state.settings.restSec);
      if (en.sets.every(x => x.done)) {
        const nextI = state.active.entries.findIndex((x, k) => k > +d.i && !x.sets.every(y => y.done));
        if (nextI >= 0) { ui.openEx = nextI; render(); requestAnimationFrame(() => { const el = document.getElementById('ex-' + nextI); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' }); }); toast('Ejercicio completado ✓'); return; }
      }
    }
    render();
  },
  addSet(d) { const en = state.active.entries[+d.i]; const l = en.sets[en.sets.length - 1] || { kg: null, reps: null }; en.sets.push({ kg: l.kg, reps: l.reps, done: false }); save(); render(); },
  delSet(d) { const en = state.active.entries[+d.i]; if (en.sets.length) en.sets.pop(); save(); render(); },
  applySug(d) { const en = state.active.entries[+d.i]; const s = suggest(ex(en.exId)); en.sets = s.sets.map((x, k) => ({ kg: x.kg, reps: x.reps, done: en.sets[k] ? en.sets[k].done : false })); save(); render(); },
  removeEx(d) { if (!confirm('¿Quitar este ejercicio de la sesión de hoy?')) return; state.active.entries.splice(+d.i, 1); ui.openEx = null; save(); render(); },
  finish() { finishSession(); },
  discard() { if (confirm('¿Descartar la sesión? Se perderán las series de hoy.')) { state.active = null; stopTimer(); save(); render(); } },
  timerAdd() { timer.end += 15000; timer.total += 15; tickTimer(); },
  timerStop() { stopTimer(); },
  openWorkout(d) { ui.sheet = { type: 'workout', id: d.id }; renderSheet(); },
  delWorkout(d) { if (!confirm('¿Borrar esta sesión? No se puede deshacer.')) return; state.workouts = state.workouts.filter(w => w.id !== d.id); ui.sheet = null; save(); render(); },
  closeSheet() { const back = ui.sheet && ui.sheet.back; ui.sheet = back || null; render(); },
  pickEx(d) { ui.sheet = { type: 'pick', mode: d.mode, tplId: d.tpl, back: d.mode === 'tpl' ? { type: 'tpl', id: d.tpl } : null }; renderSheet(); },
  pickOne(d) { addPicked(d.id); },
  newEx() {
    const name = prompt('Nombre del ejercicio');
    if (!name || !name.trim()) return;
    const id = 'ex-' + uid();
    state.exercises[id] = { id, name: name.trim(), sets: 3, repMin: 10, repMax: 12, inc: 2.5, note: '', warmup: false, bodyweight: false };
    addPicked(id);
    toast('Creado con 3×10-12. Puedes cambiarlo en Ajustes.');
  },
  editTpl(d) { ui.sheet = { type: 'tpl', id: d.id }; renderSheet(); },
  newTpl() {
    const name = prompt('Nombre de la plantilla');
    if (!name || !name.trim()) return;
    const t = { id: 'tpl-' + uid(), name: name.trim(), desc: '', ex: [] };
    state.templates.push(t); save(); ui.sheet = { type: 'tpl', id: t.id }; render();
  },
  delTpl(d) { if (!confirm('¿Borrar esta plantilla? El historial se mantiene.')) return; state.templates = state.templates.filter(t => t.id !== d.id); ui.sheet = null; save(); render(); },
  tplMove(d) { const t = tpl(ui.sheet.id), i = +d.i, j = i + (+d.d); if (j < 0 || j >= t.ex.length) return; [t.ex[i], t.ex[j]] = [t.ex[j], t.ex[i]]; save(); renderSheet(); },
  tplDel(d) { const t = tpl(ui.sheet.id); t.ex.splice(+d.i, 1); save(); renderSheet(); },
  editEx(d) { ui.sheet = { type: 'exEdit', id: d.id, back: ui.sheet ? { ...ui.sheet } : null }; renderSheet(); },
  saveEx(d) {
    const e = state.exercises[d.id];
    const name = $('#exName').value.trim();
    if (!name) { toast('Pon un nombre'); return; }
    let mn = parseInt($('#exMin').value, 10), mx = parseInt($('#exMax').value, 10);
    if (isNaN(mn) && !isNaN(mx)) mn = mx; if (isNaN(mx) && !isNaN(mn)) mx = mn;
    if (!isNaN(mn) && mn > mx) [mn, mx] = [mx, mn];
    Object.assign(e, { name, sets: Math.max(1, parseInt($('#exSets').value, 10) || 3), repMin: isNaN(mn) ? null : mn, repMax: isNaN(mx) ? null : mx, inc: num($('#exInc').value) || 2.5, note: $('#exNote').value.trim(), bodyweight: $('#exBw').checked, warmup: $('#exWu').checked });
    save(); ui.sheet = ui.sheet.back || null; toast('Guardado'); render();
  },
  rest(d) { state.settings.restSec = Math.min(300, Math.max(15, state.settings.restSec + (+d.d))); save(); render(); },
  newAct(d) { ui.sheet = { type: 'act', draft: newActDraft(d.type || 'caminata') }; renderSheet(); },
  editAct(d) {
    const a = state.activities.find(x => x.id === d.id); if (!a) return;
    ui.sheet = { type: 'act', id: a.id, draft: { ...a, blocks: [...(a.blocks || [])], prehab: !!a.prehab } }; renderSheet();
  },
  moreActs() { ui.actLimit = (ui.actLimit || 20) + 30; render(); },
  actType(d) { const dr = ui.sheet.draft; dr.type = d.t; if (d.t === 'casa' && !dr.blocks.length) dr.blocks = ['core', 'cuello']; renderSheetKeepScroll(); },
  actFeel(d) { const dr = ui.sheet.draft; dr.feel = dr.feel === +d.v ? null : +d.v; renderSheetKeepScroll(); },
  actStep(d) { const dr = ui.sheet.draft; dr[d.f] = Math.max(0, round2((dr[d.f] || 0) + (+d.d))); renderSheetKeepScroll(); },
  saveAct() {
    const s = ui.sheet, dr = s.draft;
    if (!dr.date) { toast('Pon una fecha'); return; }
    const T = actT(dr.type);
    const rec = { type: dr.type, date: dr.date, min: dr.min || null, km: T.km ? (dr.km || null) : null, feel: dr.feel || null, notes: (dr.notes || '').trim(), prehab: T.prehab ? !!dr.prehab : false, blocks: T.home ? dr.blocks : [] };
    if (T.home && !rec.blocks.length) { toast('Marca qué hiciste'); return; }
    if (s.id) Object.assign(state.activities.find(x => x.id === s.id), rec);
    else state.activities.push({ id: uid(), createdAt: Date.now(), ...rec });
    ui.sheet = null; save(); render(); toast(`${T.icon} ${T.name} guardado`);
  },
  delAct() { if (!confirm('¿Borrar esta actividad?')) return; state.activities = state.activities.filter(a => a.id !== ui.sheet.id); ui.sheet = null; save(); render(); },
  hideInstall() { state.settings.hideInstall = true; save(); render(); },
  dismissWelcome() { state.settings.welcomed = true; save(); render(); },
  toggleHabit(d) {
    if (d.date > today()) return;
    const log = state.habitLog[d.date] || [];
    state.habitLog[d.date] = log.includes(d.id) ? log.filter(x => x !== d.id) : [...log, d.id];
    if (!state.habitLog[d.date].length) delete state.habitLog[d.date];
    save(); render();
    if (habitDone(d.id, d.date) && d.date === today()) { const s = streak(d.id); if (s > 1) toast(`🔥 ¡${s} días seguidos!`); }
  },
  weekNav(d) { ui.weekOff = Math.min(0, (ui.weekOff || 0) + (+d.d)); render(); },
  newHabit() {
    const name = prompt('Nombre del hábito (ej. Estirar, Meditar, Agua)');
    if (!name || !name.trim()) return;
    const icon = (prompt('Emoji para el hábito (opcional)', '✅') || '✅').trim().slice(0, 4);
    state.habits.push({ id: 'h-' + uid(), name: name.trim(), icon }); save(); render();
  },
  editHabit(d) {
    const h = state.habits.find(x => x.id === d.id); if (!h) return;
    const name = prompt('Nombre del hábito', h.name); if (name === null) return;
    if (name.trim()) h.name = name.trim();
    const icon = prompt('Emoji', h.icon || '✅'); if (icon !== null && icon.trim()) h.icon = icon.trim().slice(0, 4);
    save(); render();
  },
  delHabit(d) {
    const h = state.habits.find(x => x.id === d.id);
    if (!h || !confirm(`¿Quitar el hábito "${h.name}"? Su historial se conserva por si lo vuelves a añadir.`)) return;
    state.habits = state.habits.filter(x => x.id !== d.id); save(); render();
  },
  habitMove(d) { const i = +d.i, j = i + (+d.d), a = state.habits; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save(); render(); },
  progTab(d) { ui.prog = d.v; ui.progEx = null; render(); },
  progEx(d) { ui.progEx = d.id; render(); window.scrollTo(0, 0); },
  progBack() { ui.progEx = null; render(); },
  bodyRange(d) { ui.bodyRange = d.v; render(); },
  moreBody() { ui.bodyLimit = (ui.bodyLimit || 15) + 30; render(); },
  newBody() {
    const all = sortedBody();
    const lastKg = [...all].reverse().find(b => b.kg), lastW = [...all].reverse().find(b => b.waist);
    const todays = all.find(b => b.date === today());
    ui.sheet = todays ? { type: 'body', id: todays.id, draft: { ...todays } } : { type: 'body', draft: { date: today(), kg: lastKg ? lastKg.kg : null, waist: null, dfL: null, dfR: null, _lastWaist: lastW ? lastW.waist : null } };
    renderSheet();
  },
  editBody(d) { const b = state.body.find(x => x.id === d.id); if (b) { ui.sheet = { type: 'body', id: b.id, draft: { ...b } }; renderSheet(); } },
  bodyStep(d) {
    const dr = ui.sheet.draft, f = d.f;
    const startVal = dr[f] != null ? dr[f] : f === 'waist' ? (dr._lastWaist || 85) : f === 'kg' ? 75 : 10;
    dr[f] = Math.max(0, Math.round((dr[f] != null ? startVal + (+d.d) : startVal) * 10) / 10);
    renderSheetKeepScroll();
  },
  saveBody() {
    const s = ui.sheet, dr = s.draft;
    if (!dr.date) { toast('Pon una fecha'); return; }
    if (!dr.kg && !dr.waist && !dr.dfL && !dr.dfR) { toast('Pon al menos el peso o la cintura'); return; }
    const rec = { date: dr.date, kg: dr.kg || null, waist: dr.waist || null, dfL: dr.dfL || null, dfR: dr.dfR || null };
    const same = state.body.find(b => b.date === rec.date && b.id !== s.id);
    if (same && !confirm('Ya hay un registro ese día. ¿Reemplazarlo?')) return;
    if (same) state.body = state.body.filter(b => b !== same);
    if (s.id) Object.assign(state.body.find(b => b.id === s.id), rec);
    else state.body.push({ id: uid(), ...rec });
    ui.sheet = null; ui.prog = 'body'; save(); render(); toast('⚖️ Guardado');
  },
  delBody() { if (!confirm('¿Borrar este registro?')) return; state.body = state.body.filter(b => b.id !== ui.sheet.id); ui.sheet = null; save(); render(); },
  export() { exportBackup(); },
  import() { $('#importFile').click(); },
};

function renderSheetKeepScroll() {
  const p = document.querySelector('#sheet .panel'); const y = p ? p.scrollTop : 0;
  renderSheet();
  const n = document.querySelector('#sheet .panel'); if (n) { n.scrollTop = y; n.style.animation = 'none'; }
}

function addPicked(id) {
  const s = ui.sheet;
  if (s.mode === 'session') {
    state.active.entries.push(newEntry(id));
    ui.openEx = state.active.entries.length - 1;
    const t = tpl(state.active.templateId);
    if (t && !t.ex.includes(id) && confirm(`¿Añadirlo también a la plantilla ${t.name} para las próximas veces?`)) t.ex.push(id);
    ui.sheet = null;
  } else {
    tpl(s.tplId).ex.push(id);
    ui.sheet = s.back;
  }
  save(); render();
}

/* ================= Copia de seguridad ================= */
async function exportBackup() {
  const name = `aspfitness-copia-${today()}.json`;
  const data = JSON.stringify({ app: 'pulso', exportedAt: new Date().toISOString(), ...state, active: null }, null, 1);
  const file = new File([data], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Copia de ASPfitness' });
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    state.settings.lastBackup = today(); save(); render(); toast('Copia exportada ✓');
  } catch (e) { if (e.name !== 'AbortError') alert('No se pudo exportar: ' + e.message); }
}

$('#importFile').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    if (obj && obj.app === 'pulso-historial') {
      const ws = historyToWorkouts(obj.workouts || [], 'xl'), as = historyToActivities(obj.activities || [], 'xa');
      const newW = ws.filter(w => !state.workouts.some(x => x.id === w.id));
      const newA = as.filter(a => !state.activities.some(x => x.id === a.id));
      const moved = [...ws.map(w => [w, state.workouts]), ...as.map(a => [a, state.activities])]
        .map(([n, list]) => [n, list.find(x => x.id === n.id && x.imported && x.date !== n.date)]).filter(([, old]) => old);
      if (!newW.length && !newA.length && !moved.length) { alert('Ese historial ya estaba importado.'); return; }
      const parts = [];
      if (newW.length || newA.length) parts.push(`añadir ${newW.length} sesiones de gym y ${newA.length} actividades`);
      if (moved.length) parts.push(`corregir la fecha de ${moved.length} registros del Excel`);
      if (!confirm(`¿${cap(parts.join(' y '))}? Lo que has registrado tú se mantiene.`)) return;
      moved.forEach(([n, old]) => { old.date = n.date; });
      state.workouts.push(...newW); sortWorkouts(); state.activities.push(...newA);
      state.settings.welcomed = true; save(); ui.sheet = null; render(); toast('Historial importado ✓');
      return;
    }
    if (!obj || typeof obj !== 'object' || !obj.exercises || !Array.isArray(obj.workouts) || !Array.isArray(obj.templates)) throw new Error('El archivo no es una copia de ASPfitness.');
    if (!confirm(`Copia del ${obj.exportedAt ? new Date(obj.exportedAt).toLocaleDateString('es-ES') : '?'} con ${obj.workouts.length} sesiones.\n\nEsto REEMPLAZA todos los datos actuales. ¿Continuar?`)) return;
    delete obj.app; delete obj.exportedAt;
    state = migrate(obj); state.active = null; save(); ui.sheet = null; render(); toast('Copia importada ✓');
  } catch (e) { alert('No se pudo importar: ' + e.message); }
});

/* ================= Eventos ================= */
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) { ev.preventDefault(); fn(el.dataset, el); }
});

document.addEventListener('change', ev => {
  const el = ev.target, f = el.dataset.field;
  if (!f) return;
  if (f === 'kg' || f === 'reps') {
    const st = state.active.entries[+el.dataset.i].sets[+el.dataset.s];
    const v = num(el.value);
    st[f] = v == null ? null : f === 'reps' ? Math.max(0, Math.round(v)) : Math.max(0, round2(v));
    save();
  } else if (f === 'wdate') {
    const w = state.workouts.find(x => x.id === el.dataset.id);
    if (w && el.value) { w.date = el.value; sortWorkouts(); save(); render(); }
  } else if (f === 'tplName' || f === 'tplDesc') {
    const t = tpl(el.dataset.id);
    if (f === 'tplName' && el.value.trim()) t.name = el.value.trim();
    if (f === 'tplDesc') t.desc = el.value.trim();
    save(); render();
  }
});

document.addEventListener('focusin', ev => { if (ev.target.matches('.stepper input')) setTimeout(() => ev.target.select(), 0); });

function syncActField(el) {
  if (ui.sheet && ui.sheet.type === 'body' && el.dataset.bfield) {
    const f = el.dataset.bfield;
    ui.sheet.draft[f] = f === 'date' ? el.value : num(el.value);
    return true;
  }
  if (!ui.sheet || ui.sheet.type !== 'act') return false;
  const dr = ui.sheet.draft;
  if (el.dataset.afield) {
    const f = el.dataset.afield;
    dr[f] = f === 'min' || f === 'km' ? num(el.value) : el.value;
    const p = $('#paceOut'); if (p) p.innerHTML = paceLine(dr);
    return true;
  }
  if (el.dataset.achk) { dr[el.dataset.achk] = el.checked; return true; }
  if (el.dataset.ablock) {
    const k = el.dataset.ablock;
    dr.blocks = el.checked ? [...new Set([...dr.blocks, k])] : dr.blocks.filter(b => b !== k);
    return true;
  }
  return false;
}
document.addEventListener('change', ev => syncActField(ev.target));
document.addEventListener('pointerdown', chartHover);
document.addEventListener('pointermove', chartHover);
document.addEventListener('pointerleave', chartLeave, true);
document.addEventListener('pointerdown', ev => { if (!ev.target.closest('.chart')) document.querySelectorAll('.chart').forEach(c => chartLeave({ target: c })); });

document.addEventListener('input', ev => {
  if (syncActField(ev.target)) return;
  if (ev.target.id !== 'pickSearch') return;
  const q = ev.target.value.trim().toLowerCase();
  document.querySelectorAll('#pickList [data-name]').forEach(b => { b.style.display = b.dataset.name.includes(q) ? '' : 'none'; });
});

setInterval(() => { if (state.active) document.querySelectorAll('[data-elapsed]').forEach(e => { e.textContent = elapsed(state.active.startedAt); }); }, 15000);

/* ================= Arranque ================= */
if (state.active) ui.tab = 'gym';
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
