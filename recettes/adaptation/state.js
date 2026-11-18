// Adaptation Fournil de src/js/state.js de Grigne : même interface pour les écrans
// (state, saveRecipes, saveHistory), mais les données vivent dans le document Firestore
// boulangerie/recettes de Fournil, exactement au même format qu'avant :
//   recipes     : JSON texte d'une liste { id, name, ingredients: [{ id, name, qtyG }], notes, tb? }
//   calcHistory : JSON texte d'une liste { id, timestamp, recipeName, label, targetG, coefficient, basis, breakdown }
// Rien n'est nettoyé ni réécrit à la lecture : une donnée inattendue est gardée telle quelle.
import { uid } from './core/text.js';

const STORAGE_KEY = 'fournil-recettes-v1';
const HISTORY_KEY = 'fournil-recettes-calc-history-v1';

export const state = {
  recipes: [],
  history: [],
  loaded: false,
  tab: 'library',
  editingId: null,
  adding: false,
  calc: {
    recipeId: null,
    mode: 'total',
    totalQty: '',
    totalUnit: 'kg',
    pieceRows: [{ id: uid(), label: '', count: '', weight: '' }],
    flourQty: '',
    flourUnit: 'kg',
    notesVisible: false,
  },
  tb: { tb: '', labo: '', farine: '' },
  levain: { preset: '1-1-1', cLev: '1', cEau: '1', cFar: '1', mode: 'have', qty: '', unit: 'kg' },
  hydra: { farine: '', fUnit: 'kg', eau: '', eUnit: 'kg' },
  cross: { a: '', b: '', c: '' },
};

const listeners = new Set();
/** Appelé quand l'enregistrement réussit (true) ou échoue (false). */
export function onSaveStatus(fn) {
  listeners.add(fn);
}
const notify = (ok) => listeners.forEach((fn) => fn(ok));

// Base Firestore de Fournil (variable globale `db` du script principal), ou null hors ligne.
function fournilDb() {
  // eslint-disable-next-line no-undef
  return typeof db !== 'undefined' && db ? db : null;
}
function docRecettes() {
  const base = fournilDb();
  return base ? base.collection('boulangerie').doc('recettes') : null;
}
const lireCache = (key) => {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};
const ecrireCache = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // le cache n'est qu'un confort d'affichage
  }
};

/** Premier affichage depuis le cache de l'appareil ; Firestore prend le relais dès qu'il répond. */
export function init() {
  state.recipes = lireCache(STORAGE_KEY) || [];
  state.history = lireCache(HISTORY_KEY) || [];
  state.loaded = true;
}

async function ecrire(champ, valeur, cacheKey) {
  if (!state.loaded) return false;
  ecrireCache(cacheKey, valeur);
  const doc = docRecettes();
  if (!doc) {
    notify(false);
    return false;
  }
  try {
    await doc.set({ [champ]: JSON.stringify(valeur) }, { merge: true });
    notify(true);
    return true;
  } catch {
    notify(false);
    return false;
  }
}

/** Enregistre les recettes (renvoie une promesse : true si Firestore a accepté). */
export function saveRecipes() {
  return ecrire('recipes', state.recipes, STORAGE_KEY);
}
/** Enregistre l'historique des calculs. */
export function saveHistory() {
  return ecrire('calcHistory', state.history, HISTORY_KEY);
}

/** Vrai quand l'utilisateur est en train de modifier une recette (on ne change pas la liste sous ses doigts). */
export const isEditing = () => state.adding || state.editingId !== null;

/**
 * Données reçues de Firestore (écoute temps réel ou bouton Actualiser) : texte JSON des
 * champs recipes et calcHistory. Renvoie true si quelque chose a changé.
 */
export function applyRemote(data) {
  let change = false;
  try {
    if (data && typeof data.recipes === 'string') {
      const r = JSON.parse(data.recipes);
      if (Array.isArray(r)) {
        state.recipes = r;
        change = true;
      }
    }
  } catch {
    // texte illisible : on garde ce qu'on a
  }
  try {
    if (data && typeof data.calcHistory === 'string') {
      const h = JSON.parse(data.calcHistory);
      if (Array.isArray(h)) {
        state.history = h;
        change = true;
      }
    }
  } catch {
    // idem
  }
  state.loaded = true;
  if (state.calc.recipeId && !state.recipes.some((r) => r.id === state.calc.recipeId)) state.calc.recipeId = null;
  ecrireCache(STORAGE_KEY, state.recipes);
  ecrireCache(HISTORY_KEY, state.history);
  return change;
}

/** Relit la version du serveur (avant un import, pour n'écraser rien de ce qui a été ajouté ailleurs). */
export async function reloadFromServer() {
  const doc = docRecettes();
  if (!doc) return true; // hors ligne : on travaille sur ce qu'on a
  try {
    const snap = await doc.get({ source: 'server' });
    if (snap.exists) applyRemote(snap.data());
    return true;
  } catch {
    return false;
  }
}
