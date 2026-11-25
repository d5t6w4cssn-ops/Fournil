// Adaptation Fournil de src/js/state.js de Grigne : même interface pour les écrans
// (state, saveRecipes, saveHistory), mais les données vivent dans le document Firestore
// boulangerie/recettes de Fournil, exactement au même format qu'avant :
//   recipes     : JSON texte d'une liste { id, name, ingredients: [{ id, name, qtyG }], notes, tb? }
//   calcHistory : JSON texte d'une liste { id, timestamp, recipeName, label, targetG, coefficient, basis, breakdown }
// Rien n'est nettoyé ni réécrit à la lecture : une donnée inattendue est gardée telle quelle.
// Rôle « équipe » (assets/js/acces.js) : après la migration, les calculs enregistrés sont
// partagés, un document par calcul dans la collection calculs/ (auteur et prénom) ; le champ
// calcHistory n'est plus utilisé. L'équipe ne peut pas modifier les recettes.
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
  // Avec la persistance hors ligne, set() n'aboutit qu'une fois la donnée arrivée au serveur
  // (parfois bien plus tard) : la saisie est déjà gardée sur l'appareil, on ne l'attend pas.
  // L'état réel est affiché par assets/js/synchro.js (Fournil), qui suit l'envoi.
  const donnees = { [champ]: JSON.stringify(valeur) };
  const renvoyer = () => doc.set(donnees, { merge: true });
  try {
    const envoi = renvoyer();
    if (window.fournilSynchro) window.fournilSynchro.suivre(envoi, 'recettes', renvoyer);
    envoi.then(() => notify(true), () => notify(false));
    return true;
  } catch {
    notify(false);
    return false;
  }
}

const acces = () => window.fournilAcces || null;
const message = (t) => { if (typeof toast === 'function') toast(t); };
let dernieresRecettes = null; // dernière version reçue du serveur
let partage = null; // calculs partagés (collection calculs/) ; null : ancien format
let historiqueAncien = []; // champ calcHistory (ancien format)
const envoyes = new Map(); // calculs déjà envoyés, pas encore revenus du serveur (id → calcul)

/** Enregistre les recettes (renvoie une promesse : true si Firestore a accepté). */
export function saveRecipes() {
  const a = acces();
  if (a && !a.peutModifierRecettes()) {
    if (dernieresRecettes) state.recipes = JSON.parse(JSON.stringify(dernieresRecettes));
    message('Les recettes sont en consultation seulement : demande au responsable pour les modifier.');
    return Promise.resolve(false);
  }
  return ecrire('recipes', state.recipes, STORAGE_KEY);
}
/** Enregistre l'historique des calculs. */
export function saveHistory() {
  const a = acces();
  if (!partage || !a) return ecrire('calcHistory', state.history, HISTORY_KEY);
  // calculs partagés : on compare avec la dernière liste reçue
  const connus = new Set(partage.map((c) => c.id));
  const ajoutes = state.history.filter((c) => !connus.has(c.id) && !envoyes.has(c.id));
  if (ajoutes.length) {
    // Un calcul ajouté (Grigne garde 20 lignes : celles qui tombent ne sont pas supprimées)
    ajoutes.forEach((c) => {
      a.creerCalcul(c);
      envoyes.set(c.id, c);
    });
    state.history = [...state.history.filter((c) => !connus.has(c.id)), ...partage];
    return Promise.resolve(true);
  }
  const gardes = new Set(state.history.map((c) => c.id));
  const retires = [...partage, ...envoyes.values()].filter((c) => !gardes.has(c.id));
  retires.forEach((c) => envoyes.delete(c.id));
  let refuse = false;
  retires.forEach((c) => {
    if (!a.supprimerCalcul(c)) refuse = true;
  });
  if (refuse) {
    message('Tu ne peux supprimer que tes propres calculs.');
    state.history = partage.filter((c) => gardes.has(c.id) || !a.peutSupprimerCalcul(c));
  }
  return Promise.resolve(!refuse);
}

/**
 * Calculs partagés reçus (assets/js/acces.js) : liste triée du plus récent au plus ancien,
 * ou null pour revenir à l'ancien format (champ calcHistory).
 */
export function appliquerCalculs(liste) {
  partage = Array.isArray(liste) ? liste : null;
  if (partage) partage.forEach((c) => envoyes.delete(c.id));
  state.history = partage ? partage.slice() : historiqueAncien.slice();
  ecrireCache(HISTORY_KEY, state.history);
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
        dernieresRecettes = JSON.parse(JSON.stringify(r));
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
        historiqueAncien = h;
        if (!partage) {
          state.history = h;
          change = true;
        }
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
