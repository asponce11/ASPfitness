'use strict';
/* Datos iniciales sacados de Rutina_Deporte_Adaptada_v2.xlsx.
   kg = peso total (suma de ambas manos en mancuernas o unilaterales). */

// [id, nombre, series, repsMín, repsMáx, incremento kg, nota, opciones]
const SEED_EXERCISES = [
  // Empuje
  ['rot-ext', 'Rotación externa con banda (manguito)', 2, 15, 15, 0, 'Banda ligera, codo pegado a 90°', { warmup: true, bodyweight: true }],
  ['press-incl', 'Press inclinado Smith / mancuernas', 4, 8, 12, 2.5, '1-2 RIR'],
  ['press-maq', 'Press máquina', 3, 10, 12, 5, '0-1 RIR'],
  ['pec-deck', 'Pec deck', 3, 12, 15, 5, 'Al fallo'],
  ['elev-lat', 'Elevaciones laterales polea', 3, 12, 15, 1.25, 'No subir por encima de 90°'],
  ['pajaro', 'Pájaro polea', 3, 12, 15, 1.25, '0-1 RIR. Deltoide posterior, protege el hombro'],
  ['ext-tri-barra', 'Extensión tríceps polea alta con barra', 3, 12, 12, 1.25, ''],
  ['katana', 'Extensión katana', 3, 12, 12, 1.25, ''],
  // Tirón
  ['dominadas', 'Dominadas (calentamiento final)', 3, null, null, 0, 'Peso corporal. Anota las reps de cada serie', { bodyweight: true }],
  ['jalon', 'Jalón al pecho agarre ancho prono', 4, 8, 10, 5, '1-2 RIR'],
  ['remo-sent', 'Remo sentado al ombligo', 3, 10, 12, 5, '1 RIR'],
  ['face-pull', 'Face pull polea con cuerda', 3, 15, 15, 1.25, '0-1 RIR. Espalda alta + manguito'],
  ['hiperext', 'Hiperextensión lumbar con peso', 3, 12, 15, 2.5, '1-2 RIR'],
  ['curl-scott', 'Curl Scott barra Z / curl mancuernas', 3, 8, 10, 2.5, '1 RIR'],
  ['curl-martillo', 'Curl martillo', 3, 10, 12, 2, '1 RIR'],
  ['muneca-arriba', 'Curl de muñeca palmas arriba', 3, 15, 15, 2, 'Antebrazos apoyados'],
  ['muneca-abajo', 'Curl de muñeca palmas abajo', 3, 15, 15, 2, 'Mejor apoyado en banco. Peso más ligero'],
  // Piernas
  ['sentadilla', 'Sentadilla Smith', 4, 8, 10, 2.5, '1-2 RIR. Si el talón se levanta, discos de 2,5 kg bajo los talones'],
  ['rdl', 'Peso muerto rumano Smith / mancuernas', 3, 10, 12, 2.5, '1-2 RIR'],
  ['hip-thrust', 'Hip thrust Smith', 3, 10, 12, 5, '1 RIR'],
  ['prensa', 'Prensa horizontal', 3, 10, 12, 10, '1 RIR'],
  ['femoral', 'Curl femoral máquina', 3, 12, 15, 5, '0-1 RIR'],
  ['cuadriceps', 'Extensión de cuádriceps', 3, 12, 15, 5, '0-1 RIR'],
  ['gemelos', 'Gemelos en prensa', 4, 15, 20, 10, '0-1 RIR'],
  ['abduccion', 'Abducción máquina', 3, 15, 15, 5, '0-1 RIR'],
  ['aduccion', 'Aducción máquina', 3, 15, 15, 5, '0-1 RIR. Pausada hasta valorar la cadera'],
  // 4ª sesión
  ['press-vert', 'Press vertical máquina', 3, 8, 10, 5, '1 RIR'],
  ['cruces', 'Cruces en polea', 3, 12, 15, 1.25, '0-1 RIR'],
  ['jalon-uni', 'Jalón unilateral', 3, 10, 12, 2.5, '1 RIR'],
  ['remo-mancuerna', 'Remo con mancuerna unilateral', 3, 10, 12, 2.5, '1 RIR'],
  ['curl-bayesian', 'Curl bayesian', 2, 12, 12, 1.25, '0-1 RIR'],
  ['ext-tri-polea', 'Extensión tríceps polea', 2, 12, 12, 1.25, '0-1 RIR'],
];

const SEED_TEMPLATES = [
  { id: 'empuje', name: 'Empuje', desc: 'Pecho · hombro · tríceps', ex: ['rot-ext', 'press-incl', 'press-maq', 'pec-deck', 'elev-lat', 'pajaro', 'ext-tri-barra', 'katana'] },
  { id: 'tiron', name: 'Tirón', desc: 'Espalda · bíceps · antebrazo', ex: ['dominadas', 'jalon', 'remo-sent', 'face-pull', 'hiperext', 'curl-scott', 'curl-martillo', 'muneca-arriba', 'muneca-abajo'] },
  { id: 'piernas', name: 'Piernas', desc: 'Cuádriceps · femoral · glúteo', ex: ['sentadilla', 'rdl', 'hip-thrust', 'prensa', 'femoral', 'cuadriceps', 'gemelos', 'abduccion', 'aduccion'] },
  { id: 'cuarta', name: '4ª sesión', desc: 'Opcional · ~40 min si hay energía', optional: true, ex: ['press-vert', 'cruces', 'jalon-uni', 'remo-mancuerna', 'curl-bayesian', 'ext-tri-polea'] },
];

// Tu historial personal NO va en el código (que es público): está en mis-datos-iniciales.json
// y se importa una vez desde Ajustes → Importar.
function historyToWorkouts(list, prefix) {
  const tplName = Object.fromEntries(SEED_TEMPLATES.map(t => [t.id, t.name]));
  return list.map(([date, tpl, items], i) => ({
    id: prefix + i, date, templateId: tpl, name: tplName[tpl] || tpl, minutes: null, imported: true, createdAt: i,
    entries: items.map(([exId, kg, reps]) => ({ exId, sets: String(reps).split('/').map(r => ({ kg, reps: parseInt(r, 10) })) })),
  }));
}
function historyToActivities(list, prefix) {
  return list.map(([date, type, min, km, notes], i) => ({ id: prefix + i, date, type, min, km, feel: null, notes: notes || '', imported: true }));
}

function buildSeed() {
  const exercises = {};
  for (const [id, name, sets, repMin, repMax, inc, note, opt] of SEED_EXERCISES) {
    exercises[id] = { id, name, sets, repMin, repMax, inc, note, warmup: !!(opt && opt.warmup), bodyweight: !!(opt && opt.bodyweight) };
  }
  const workouts = [], activities = [];
  return {
    version: 1,
    exercises,
    templates: SEED_TEMPLATES.map(t => ({ ...t, ex: [...t.ex] })),
    workouts,
    activities,
    body: [],
    habits: [{ id: 'lectura', name: 'Lectura', icon: '📖' }, { id: 'idiomas', name: 'Idiomas', icon: '🗣️' }],
    habitLog: {},
    active: null,
    settings: { restSec: 60, lastBackup: null },
  };
}
