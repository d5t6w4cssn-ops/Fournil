/* Fichier GÉNÉRÉ par tools/importer-grigne.mjs : ne pas le modifier à la main.
   Écrans de Grigne (recettes/src, copiés sans modification) + adaptation Fournil
   (recettes/adaptation). Pour le reconstruire : node tools/importer-grigne.mjs --construire */
(function () {
'use strict';
const __modules = {};
// ===== recettes/src/core/text.js (copie de Grigne) =====
__modules["core/text.js"] = (function () {
// Fonctions de texte pures (aucun accès au DOM).

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Échappe une valeur pour l'insérer dans du HTML ou dans un attribut entre guillemets. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

let counter = 0;
/** Identifiant court, unique pendant la session. */
function uid() {
  counter += 1;
  return Math.random().toString(36).slice(2, 8) + counter.toString(36);
}
return { esc, uid };
})();

// ===== recettes/adaptation/state.js =====
__modules["state.js"] = (function () {
// Adaptation Fournil de src/js/state.js de Grigne : même interface pour les écrans
// (state, saveRecipes, saveHistory), mais les données vivent dans le document Firestore
// boulangerie/recettes de Fournil, exactement au même format qu'avant :
//   recipes     : JSON texte d'une liste { id, name, ingredients: [{ id, name, qtyG }], notes, tb? }
//   calcHistory : JSON texte d'une liste { id, timestamp, recipeName, label, targetG, coefficient, basis, breakdown }
// Rien n'est nettoyé ni réécrit à la lecture : une donnée inattendue est gardée telle quelle.
const { uid } = __modules["core/text.js"];

const STORAGE_KEY = 'fournil-recettes-v1';
const HISTORY_KEY = 'fournil-recettes-calc-history-v1';

const state = {
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
function onSaveStatus(fn) {
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
function init() {
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

/** Enregistre les recettes (renvoie une promesse : true si Firestore a accepté). */
function saveRecipes() {
  return ecrire('recipes', state.recipes, STORAGE_KEY);
}
/** Enregistre l'historique des calculs. */
function saveHistory() {
  return ecrire('calcHistory', state.history, HISTORY_KEY);
}

/** Vrai quand l'utilisateur est en train de modifier une recette (on ne change pas la liste sous ses doigts). */
const isEditing = () => state.adding || state.editingId !== null;

/**
 * Données reçues de Firestore (écoute temps réel ou bouton Actualiser) : texte JSON des
 * champs recipes et calcHistory. Renvoie true si quelque chose a changé.
 */
function applyRemote(data) {
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
async function reloadFromServer() {
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
return { state, onSaveStatus, init, saveRecipes, saveHistory, isEditing, applyRemote, reloadFromServer };
})();

// ===== recettes/src/core/units.js (copie de Grigne) =====
__modules["core/units.js"] = (function () {
// Conversions et formats numériques purs.

const UNIT_TO_GRAMS = { g: 1, kg: 1000, ml: 1, l: 1000, cl: 10, '': 1 };

/** Convertit une quantité en grammes (1 ml = 1 g). Unité inconnue : traitée comme des grammes. */
function toGrams(qty, unit) {
  return qty * (UNIT_TO_GRAMS[unit] ?? 1);
}

/** Lit un nombre saisi (virgule ou point). Renvoie null si illisible. */
function numVal(value) {
  const n = parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

/** Quantité saisie convertie en grammes ; null si vide, illisible ou négative. */
function gramsOf(value, unit) {
  const n = numVal(value);
  return n !== null && n >= 0 ? toGrams(n, unit) : null;
}

/** Espace fine insécable, entre un nombre et son unité (typographie française). */
const NNBSP = '\u202F';

/** Virgule décimale française : « 7.89 » → « 7,89 ». Affichage seulement. */
const comma = (s) => s.replace('.', ',');

/** « 1250 » → « 1,25 kg », « 350 » → « 350 g » (espace fine insécable avant l'unité). */
function formatGrams(g) {
  if (g >= 1000) {
    const kg = g / 1000;
    const s = kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${comma(s)}${NNBSP}kg`;
  }
  return `${comma(String(Math.round(g * 10) / 10))}${NNBSP}g`;
}

/** Nombre à `dec` décimales fixes, avec virgule : fixed(7.894, 2) → « 7,89 ». */
function fixed(n, dec) {
  return comma(n.toFixed(dec));
}

/** Arrondi à `dec` décimales (1 par défaut), avec virgule ; « — » si le nombre est absent ou infini. */
function fmtNum(n, dec) {
  if (n === null || !Number.isFinite(n)) return '—';
  const d = dec === undefined ? 1 : dec;
  return comma(String(Math.round(n * 10 ** d) / 10 ** d));
}
return { toGrams, numVal, gramsOf, NNBSP, formatGrams, fixed, fmtNum };
})();

// ===== recettes/src/core/recipe-math.js (copie de Grigne) =====
__modules["core/recipe-math.js"] = (function () {
const { toGrams, numVal } = __modules["core/units.js"];

/** Un ingrédient est une farine si son nom contient « farine ». */
function isFlour(ing) {
  return ing.name.toLowerCase().includes('farine');
}

/** Poids total de farine : additionne tous les ingrédients dont le nom contient « farine ». */
function getFlourWeightG(recipe) {
  return recipe.ingredients
    .filter(isFlour)
    .reduce((s, ing) => s + ing.qtyG, 0);
}

/** Poids total de la recette de référence. */
function getTotalG(recipe) {
  return recipe.ingredients.reduce((s, i) => s + i.qtyG, 0);
}

/** Poids de pâte voulu en mode « poids total » ou « pièces × poids ». null si rien d'exploitable. */
function computeTargetG(calc) {
  if (calc.mode === 'total') {
    const q = numVal(calc.totalQty);
    return q !== null && q > 0 ? toGrams(q, calc.totalUnit) : null;
  }
  let sum = 0;
  let any = false;
  for (const pr of calc.pieceRows) {
    const c = numVal(pr.count);
    const w = numVal(pr.weight);
    if (c !== null && w !== null && c > 0 && w > 0) {
      sum += c * w;
      any = true;
    }
  }
  return any ? sum : null;
}

/**
 * Calcule le coefficient et le multiplicateur d'une recette.
 * Avec farine : base = recette ramenée à 1 kg de farine, coefficient = nombre de « recettes 1 kg farine ».
 * Sans farine : base = poids total de la recette.
 */
function computeScaling(recipe, calc) {
  const referenceTotalG = getTotalG(recipe);
  const flourG = getFlourWeightG(recipe);
  const usesFlourBasis = flourG > 0;
  const scale1kg = usesFlourBasis ? 1000 / flourG : 1;
  const referenceBasisG = referenceTotalG * scale1kg;

  let coefficient;
  let targetG;
  if (calc.mode === 'farine') {
    const q = numVal(calc.flourQty);
    const flourInputG = q !== null && q > 0 ? toGrams(q, calc.flourUnit) : null;
    coefficient = flourInputG && usesFlourBasis ? flourInputG / 1000 : null;
    targetG = coefficient ? coefficient * referenceBasisG : null;
  } else {
    targetG = computeTargetG(calc);
    coefficient = targetG && referenceBasisG ? targetG / referenceBasisG : null;
  }
  const factor = coefficient ? coefficient * scale1kg : null;
  return { referenceTotalG, flourG, usesFlourBasis, scale1kg, referenceBasisG, coefficient, targetG, factor };
}
return { isFlour, getFlourWeightG, getTotalG, computeTargetG, computeScaling };
})();

// ===== recettes/src/core/parse.js (copie de Grigne) =====
__modules["core/parse.js"] = (function () {
const { toGrams } = __modules["core/units.js"];
const { uid } = __modules["core/text.js"];

const LEADING_QTY = /^([\d]+(?:[.,]\d+)?)(?:\s*\/\s*([\d]+(?:[.,]\d+)?))?\s*(kg|gr|g|ml|cl|l)\b\.?\s*(.+)$/i;
const TRAILING_QTY = /^(.+?)\s+([\d]+(?:[.,]\d+)?)(?:\s*\/\s*([\d]+(?:[.,]\d+)?))?\s*(kg|gr|g|ml|cl|l)\b\.?$/i;

function toIngredient(name, qtyRaw, altRaw, unitRaw) {
  const qty = parseFloat(qtyRaw.replace(',', '.'));
  const unit = unitRaw.toLowerCase();
  const alt = altRaw ? altRaw.replace(',', '.') : null;
  let label = name.trim();
  if (alt) label += ` (ou ${alt}${unit})`;
  if (!label || Number.isNaN(qty)) return null;
  return { id: uid(), name: label, qtyG: toGrams(qty, unit) };
}

/**
 * Analyse un texte de recette collé ou extrait d'un PDF.
 * Les lignes « 500 g farine » ou « farine 500 g » deviennent des ingrédients,
 * les autres lignes sont gardées comme notes.
 */
function parseRecipeText(text) {
  const lines = String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const ingredients = [];
  const notesLines = [];
  for (const line of lines) {
    let ing = null;
    let m = line.match(LEADING_QTY);
    if (m) ing = toIngredient(m[4], m[1], m[2], m[3]);
    if (!ing) {
      m = line.match(TRAILING_QTY);
      if (m) ing = toIngredient(m[1], m[2], m[3], m[4]);
    }
    if (ing) ingredients.push(ing);
    else notesLines.push(line);
  }
  return { ingredients, notes: notesLines.join('\n') };
}
return { parseRecipeText };
})();

// ===== recettes/src/core/examples.js (copie de Grigne) =====
__modules["core/examples.js"] = (function () {
// Recettes d'exemple, proposées quand la bibliothèque est vide (jamais ajoutées toutes seules).
// Pourcentages de boulanger classiques, sur 1 kg de farine : faciles à relire et à adapter.
const { uid } = __modules["core/text.js"];

const EXAMPLES = [
  {
    name: 'Baguette de tradition (exemple)',
    tb: 56,
    // hydratation 70 %, sel 1,8 %, levure fraîche 0,4 % (pointage long)
    ingredients: [
      ['Farine de tradition T65', 1000],
      ['Eau', 700],
      ['Sel', 18],
      ['Levure fraîche', 4],
    ],
    notes: 'Autolyse 30 min (farine + eau).\nPétrissage lent, sel et levure en fin de frasage.\nPointage 2 h en bac, un rabat à 1 h.\nDivision à 350 g, détente 20 min, façonnage.\nApprêt 45 min à 1 h, cuisson 250 °C environ 22 min, avec buée.',
  },
  {
    name: 'Pain de campagne au levain (exemple)',
    tb: 56,
    // hydratation 70 %, levain liquide 20 %, sel 2 %, 20 % de seigle
    ingredients: [
      ['Farine T65', 800],
      ['Farine de seigle T170', 200],
      ['Eau', 700],
      ['Levain liquide', 200],
      ['Sel', 20],
    ],
    notes: 'Levain rafraîchi 4 à 6 h avant, bien actif.\nPétrissage lent, sel en fin.\nPointage 2 h 30 avec deux rabats.\nDivision, façonnage en boule ou en bâtard.\nApprêt 1 h 30 (ou une nuit au froid), cuisson 240 °C environ 40 min.',
  },
  {
    name: 'Brioche (exemple)',
    tb: 50,
    // œufs 60 %, beurre 50 %, sucre 12 %, levure 3 %, sel 2 %
    ingredients: [
      ['Farine T45', 1000],
      ['Œufs', 600],
      ['Beurre', 500],
      ['Sucre', 120],
      ['Levure fraîche', 30],
      ['Sel', 20],
    ],
    notes: "Pétrir farine, œufs, sucre, sel et levure jusqu'à décollement.\nIncorporer le beurre froid en morceaux, en fin de pétrissage.\nPointage 1 h, puis une nuit au froid.\nDivision, façonnage, apprêt 2 h à 26 °C.\nDorure, cuisson 170 °C environ 25 min (moule de 500 g).",
  },
];

/** Nouvelles recettes d'exemple, avec des identifiants neufs (au même format que les recettes saisies). */
function makeExampleRecipes() {
  return EXAMPLES.map((r) => ({
    id: uid(),
    name: r.name,
    ingredients: r.ingredients.map(([name, qtyG]) => ({ id: uid(), name, qtyG })),
    notes: r.notes,
    tb: r.tb,
  }));
}
return { makeExampleRecipes };
})();

// ===== recettes/adaptation/pdf.js =====
__modules["pdf.js"] = (function () {
// Adaptation Fournil de src/js/pdf.js de Grigne : même fonction extractPdfText, mais
// avec PDF.js 3.11.174 hébergé dans vendor/pdfjs (script classique, déjà utilisé par
// Fournil), chargé seulement au premier PDF, une seule fois.
let loading = null;

function ensurePdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/pdfjs/pdf.min.js';
      s.onload = () => {
        if (!window.pdfjsLib) {
          reject(new Error('PDF.js absent'));
          return;
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      s.onerror = () => {
        s.remove();
        reject(new Error('PDF.js introuvable'));
      };
      document.head.appendChild(s);
    });
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** Texte d'un PDF, une ligne par ligne visuelle (même découpage que Grigne). */
async function extractPdfText(file) {
  const pdfjs = await ensurePdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const allLines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lineMap = new Map();
    content.items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push(item);
    });
    const ys = Array.from(lineMap.keys()).sort((a, b) => b - a);
    ys.forEach((y) => {
      const line = lineMap
        .get(y)
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((i) => i.str)
        .join(' ')
        .trim();
      if (line) allLines.push(line);
    });
  }
  return allLines.join('\n');
}
return { extractPdfText };
})();

// ===== recettes/src/ui/dom.js (copie de Grigne) =====
__modules["ui/dom.js"] = (function () {
// Petits utilitaires d'interface partagés par les écrans.
const { esc } = __modules["core/text.js"];
const { NNBSP } = __modules["core/units.js"];

const svg = (size, sw, path) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" aria-hidden="true" focusable="false">${path}</svg>`;

const icons = {
  plus: (s = 16) => svg(s, 2, '<path d="M12 5v14M5 12h14"/>'),
  info: (s = 15) => svg(s, 1.8, '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  edit: (s = 15) => svg(s, 1.8, '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
  trash: (s = 15) =>
    svg(s, 1.8, '<path d="M3 6h18M8 6V4h8v2m-1 0v14a1 1 0 01-1 1H9a1 1 0 01-1-1V6h8z"/>'),
  check: (s = 15) => svg(s, 2, '<path d="M20 6L9 17l-5-5"/>'),
  file: (s = 18) =>
    svg(s, 1.6, '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
  chevron: (s = 18) => svg(s, 1.8, '<path d="M6 9l6 6 6-6"/>'),
  scale: (s = 18) =>
    svg(
      s,
      1.6,
      '<path d="M4 21h16l-1.4-9.2A2 2 0 0 0 16.6 10H7.4a2 2 0 0 0-2 1.8z"/><circle cx="12" cy="15.5" r="2.6"/><path d="M12 15.5l1.2-1.2"/><path d="M7 10V8.5A1.5 1.5 0 0 1 8.5 7h7A1.5 1.5 0 0 1 17 8.5V10M9 4h6"/>',
    ),
  wheat: (s = 24) =>
    svg(
      s,
      1.5,
      '<path d="M12 22V7"/><path d="M12 7c0-2 .8-3.6 2-4.6M12 7c0-2-.8-3.6-2-4.6"/><path d="M12 11.5c-2.6 0-4.2-1.6-4.6-4 2.6 0 4.2 1.5 4.6 4zM12 11.5c2.6 0 4.2-1.6 4.6-4-2.6 0-4.2 1.5-4.6 4z"/><path d="M12 15.5c-2.6 0-4.2-1.6-4.6-4 2.6 0 4.2 1.5 4.6 4zM12 15.5c2.6 0 4.2-1.6 4.6-4-2.6 0-4.2 1.5-4.6 4z"/><path d="M12 19.5c-2.6 0-4.2-1.6-4.6-4 2.6 0 4.2 1.5 4.6 4zM12 19.5c2.6 0 4.2-1.6 4.6-4-2.6 0-4.2 1.5-4.6 4z"/>',
    ),
  paste: (s = 14) =>
    svg(
      s,
      1.8,
      '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>',
    ),
};

let idCounter = 0;
/** Identifiant unique pour relier une étiquette à son champ. */
function nextId(prefix = 'f') {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function byId(id) {
  return document.getElementById(id);
}

/** Crée un élément avec une classe et un texte (texte inséré en tant que texte, jamais en HTML). */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Paragraphe d'introduction d'un onglet. */
function intro(parent, text) {
  parent.appendChild(el('p', 'intro', text));
}

/** « 7,89 kg » → nombre et unité séparés (unité en plus petit), texte échappé. */
function amount(text) {
  const i = text.lastIndexOf(NNBSP);
  if (i < 0) return esc(text);
  return `${esc(text.slice(0, i))}<small>${NNBSP}${esc(text.slice(i + 1))}</small>`;
}

/**
 * Le tampon : la signature de Grigne, pour le résultat principal d'un écran.
 * label : lu par les lecteurs d'écran avant la valeur ; top : texte en arc (majuscules) ;
 * value : texte affiché au centre, vide = en attente.
 */
function stamp(label, top, value) {
  // plus le nombre est long, plus il est petit, pour rester dans l'anneau intérieur
  const digits = value ? value.split(NNBSP)[0].length : 1;
  const size = digits <= 2 ? '' : digits === 3 ? ' tampon--3' : digits === 4 ? ' tampon--4' : ' tampon--5';
  return `
    <div class="tampon${value ? size : ' tampon--vide'}">
      <span class="sr-only">${esc(label)}</span>
      <span class="tampon-v"><span>${value ? amount(value) : '—'}</span></span>
      <span class="tampon-fond" aria-hidden="true"></span>
      <svg class="tampon-anneaux" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle class="anneau anneau--fort" cx="60" cy="60" r="57"/>
        <circle class="anneau" cx="60" cy="60" r="53.5"/>
        <circle class="anneau" cx="60" cy="60" r="38"/>
        <circle class="etoile" cx="13.5" cy="60" r="1.8"/><circle class="etoile" cx="106.5" cy="60" r="1.8"/>
      </svg>
      <svg class="tampon-texte" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <defs>
          <path id="tamponHaut" d="M16 60a44 44 0 0 1 88 0"/>
          <path id="tamponBas" d="M10 60a50 50 0 0 0 100 0"/>
        </defs>
        <text><textPath href="#tamponHaut" startOffset="50%" text-anchor="middle">${esc(top)}</textPath></text>
        <text><textPath href="#tamponBas" startOffset="50%" text-anchor="middle">FOURNIL</textPath></text>
      </svg>
    </div>`;
}

/** Carte résultat des outils : tampon sur le coin, petit titre, titre, puis le contenu (HTML déjà échappé). */
function resultCard({ stampLabel, stampTop, value, kicker, title, body = '' }) {
  return `
    <div class="result-card result-card--tool">
      ${stamp(stampLabel, stampTop, value)}
      <p class="result-k">${esc(kicker)}</p>
      <p class="result-title result-title--tool">${esc(title)}</p>
      ${body}
    </div>`;
}

/** Message d'attente ou d'erreur sous le titre d'une carte résultat. */
function waitLine(text, kind = 'wait') {
  return `<p class="result-wait result-wait--${kind}">${esc(text)}</p>`;
}

/**
 * Champ « quantité + unité kg/g » : un grand cadre avec l'étiquette en haut,
 * la valeur en grand et l'unité à droite.
 * onValue(v) et onUnit(u) sont appelés à chaque changement.
 */
function qtyField(parent, labelText, value, unit, onValue, onUnit, placeholder) {
  const id = nextId('qty');
  const box = el('div', 'field-box');
  box.innerHTML =
    `<label class="field-box-k" for="${id}">${esc(labelText)}</label>` +
    `<div class="field-box-row"><input id="${id}" type="number" inputmode="decimal" step="any" min="0" placeholder="${esc(placeholder || '')}" value="${esc(value)}">` +
    (unit
      ? `<select aria-label="Unité"><option value="kg" ${unit === 'kg' ? 'selected' : ''}>kg</option><option value="g" ${unit === 'g' ? 'selected' : ''}>g</option></select>`
      : '') +
    `</div>`;
  box.querySelector('input').oninput = (e) => onValue(e.target.value);
  if (unit) box.querySelector('select').onchange = (e) => onUnit(e.target.value);
  parent.appendChild(box);
}

/** Zone de résultat annoncée par les lecteurs d'écran à chaque mise à jour. */
function resultMount(id) {
  const node = el('div', 'result-mount');
  node.id = id;
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  return node;
}
return { icons, nextId, byId, el, intro, amount, stamp, resultCard, waitLine, qtyField, resultMount };
})();

// ===== recettes/src/ui/library.js (copie de Grigne) =====
__modules["ui/library.js"] = (function () {
const { state, saveRecipes } = __modules["state.js"];
const { esc, uid } = __modules["core/text.js"];
const { formatGrams, toGrams, numVal } = __modules["core/units.js"];
const { getFlourWeightG, getTotalG, isFlour } = __modules["core/recipe-math.js"];
const { parseRecipeText } = __modules["core/parse.js"];
const { makeExampleRecipes } = __modules["core/examples.js"];
const { extractPdfText } = __modules["pdf.js"];
const { byId, el, icons, nextId } = __modules["ui/dom.js"];

function renderLibrary() {
  const view = byId('rc-library-view');
  view.innerHTML = '';

  const openAdd = () => {
    state.adding = true;
    renderLibrary();
    view.querySelector('.name-input')?.focus();
  };

  if (state.recipes.length === 0 && !state.adding) {
    const empty = el('div', 'empty');
    empty.innerHTML = `
      <span class="empty-badge" aria-hidden="true">${icons.wheat(34)}</span>
      <p class="empty-title">Ton carnet de recettes t'attend</p>
      <p>Ta bibliothèque est vide. Ajoute une première recette pour commencer à convertir : à la main, en collant un texte ou depuis un PDF. Ou pars de nos exemples.</p>`;
    const btn = el('button', 'btn-dark');
    btn.type = 'button';
    btn.innerHTML = `${icons.plus(18)} Ajouter une recette`;
    btn.onclick = openAdd;
    const examplesBtn = el('button', 'btn-soft');
    examplesBtn.type = 'button';
    examplesBtn.innerHTML = `${icons.wheat(18)} Ajouter 3 recettes d'exemple`;
    examplesBtn.onclick = () => {
      state.recipes.push(...makeExampleRecipes());
      saveRecipes();
      renderLibrary();
      byId('rc-library-view').querySelector('.lib-add')?.focus();
    };
    const actions = el('div', 'empty-actions');
    actions.append(btn, examplesBtn);
    empty.appendChild(actions);
    empty.appendChild(el('p', 'empty-hint', 'Baguette de tradition, pain de campagne au levain et brioche : tu pourras les modifier ou les supprimer comme les autres.'));
    view.appendChild(empty);
    return;
  }

  const n = state.recipes.length;
  const head = el('div', 'lib-head');
  head.appendChild(el('p', 'lib-count', n ? `${n} recette${n > 1 ? 's' : ''}` : 'Ta première recette'));
  if (!state.adding) {
    const addBtn = el('button', 'btn-dark lib-add');
    addBtn.type = 'button';
    addBtn.innerHTML = `${icons.plus(18)} Ajouter une recette`;
    addBtn.onclick = openAdd;
    head.appendChild(addBtn);
  }
  view.appendChild(head);

  const list = el('div', 'recipe-list');
  state.recipes.forEach((r) => {
    list.appendChild(state.editingId === r.id ? buildRecipeForm(r) : buildRecipeRow(r));
  });
  view.appendChild(list);

  if (state.adding) view.appendChild(buildRecipeForm(null));
}

/** Ouvre le Calculateur sur cette recette. */
function openInCalculator(r) {
  state.calc.recipeId = r.id;
  state.calc.notesVisible = false;
  byId('tab-calculator').click();
}

function buildRecipeRow(r) {
  const total = getTotalG(r);
  const flourG = getFlourWeightG(r);
  const scale1kg = flourG > 0 ? 1000 / flourG : null;
  const totalFor1kg = scale1kg ? total * scale1kg : null;
  const detailId = nextId('ing');
  const notesId = nextId('notes');
  const hasTb = r.tb !== undefined && r.tb !== '' && r.tb !== null;
  const count = r.ingredients.length;

  const chips = [
    `${count} ingrédient${count > 1 ? 's' : ''}`,
    `Référence ${formatGrams(total)}`,
    totalFor1kg ? `Base 1\u202Fkg farine : ${formatGrams(totalFor1kg)}` : '',
    hasTb ? `TB ${String(r.tb).replace('.', ',')}\u202F°C` : '',
  ].filter(Boolean);

  const row = el('article', 'recipe-row recipe-card');
  const ingLines = (cols) =>
    r.ingredients
      .map(
        (ing) =>
          `<div class="line${isFlour(ing) ? ' line--flour' : ''}"><span class="line-name">${esc(ing.name)}</span>${cols(ing)}</div>`,
      )
      .join('');

  row.innerHTML = `
    <div class="recipe-head">
      <h3><button type="button" class="row-toggle" aria-expanded="false" aria-controls="${detailId}">${esc(r.name)}</button></h3>
      <div class="row-actions">
        ${r.notes ? `<button type="button" class="icon-btn notes-btn" aria-label="Étapes de ${esc(r.name)}" aria-expanded="false" aria-controls="${notesId}">${icons.info(18)}</button>` : ''}
        <button type="button" class="icon-btn edit-btn" aria-label="Modifier ${esc(r.name)}">${icons.edit(18)}</button>
        <button type="button" class="icon-btn del-btn" aria-label="Supprimer ${esc(r.name)}">${icons.trash(18)}</button>
      </div>
    </div>
    <ul class="meta chips">${chips.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    ${r.notes ? `<div class="notes-display" id="${notesId}" hidden>${esc(r.notes)}</div>` : ''}
    <div class="ing-display" id="${detailId}" hidden>
      ${
        scale1kg
          ? `<div class="line line--head"><span class="line-name">Ingrédient</span><span class="cols"><span class="col">Ta recette</span><span class="col">Base 1\u202Fkg farine</span></span></div>
             ${ingLines((ing) => `<span class="cols"><span class="col">${formatGrams(ing.qtyG)}</span><span class="col col--strong">${formatGrams(ing.qtyG * scale1kg)}</span></span>`)}
             <div class="line line--total"><span class="line-name">Total</span><span class="cols"><span class="col">${formatGrams(total)}</span><span class="col">${formatGrams(totalFor1kg)}</span></span></div>`
          : `${ingLines((ing) => `<span class="cols"><span class="col col--strong">${formatGrams(ing.qtyG)}</span></span>`)}
             <div class="line line--total"><span class="line-name">Total</span><span class="cols"><span class="col">${formatGrams(total)}</span></span></div>`
      }
    </div>
    <div class="recipe-foot">
      <span class="recipe-more" aria-hidden="true">${icons.chevron(18)}<span class="recipe-more-t">Ingrédients</span></span>
      <button type="button" class="btn-soft calc-btn" aria-label="Calculer ${esc(r.name)}">${icons.scale(18)} Calculer</button>
    </div>
  `;

  const toggleBtn = row.querySelector('.row-toggle');
  const detail = row.querySelector('.ing-display');
  const toggleDetail = () => {
    detail.hidden = !detail.hidden;
    toggleBtn.setAttribute('aria-expanded', String(!detail.hidden));
    row.classList.toggle('is-open', !detail.hidden);
  };
  toggleBtn.onclick = toggleDetail;
  row.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    toggleDetail();
  });

  if (r.notes) {
    const nb = row.querySelector('.notes-btn');
    const nd = row.querySelector('.notes-display');
    nb.onclick = () => {
      nd.hidden = !nd.hidden;
      nb.setAttribute('aria-expanded', String(!nd.hidden));
    };
  }
  row.querySelector('.calc-btn').onclick = () => openInCalculator(r);
  row.querySelector('.edit-btn').onclick = () => {
    state.editingId = r.id;
    renderLibrary();
    byId('rc-library-view').querySelector('.name-input')?.focus();
  };
  row.querySelector('.del-btn').onclick = () => {
    if (!window.confirm(`Supprimer la recette « ${r.name} » ?`)) return;
    state.recipes = state.recipes.filter((rec) => rec.id !== r.id);
    saveRecipes();
    renderLibrary();
  };
  return row;
}

function buildRecipeForm(initial) {
  const key = initial ? initial.id : 'new';
  const wrap = el('div', 'card card--spaced recipe-form');

  let ingredients =
    initial && initial.ingredients.length
      ? initial.ingredients.map((i) => ({ id: i.id, name: i.name, qty: i.qtyG, unit: 'g' }))
      : [{ id: uid(), name: '', qty: '', unit: 'g' }];
  let notes = initial?.notes || '';
  let tb = initial?.tb ?? '';

  const nameId = nextId('name');
  const statusId = `rc-dz-status-${key}`;
  const tbId = nextId('tb');
  const pasteId = nextId('paste');
  const notesTaId = nextId('notesta');
  const errId = nextId('err');

  const titleId = nextId('formtitle');
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-labelledby', titleId);
  wrap.innerHTML = `
    <h3 class="form-title" id="${titleId}">${initial ? 'Modifier la recette' : 'Nouvelle recette'}</h3>
    <input id="${nameId}" class="name-input" aria-label="Nom de la recette" aria-describedby="${errId}" placeholder="Nom de la recette" value="${initial ? esc(initial.name) : ''}" maxlength="200">

    <div class="import-tiles">
      <label class="dropzone tile">
        <span class="tile-icon" aria-hidden="true">${icons.file(22)}</span>
        <span class="tile-text">
          <span class="dz-title"><strong>Importer un PDF</strong></span>
          <span class="hint">Dépose-le ici ou touche pour le choisir. Il doit contenir du texte sélectionnable : pour un scan, saisis à la main.</span>
        </span>
        <input type="file" accept="application/pdf" class="dz-input" aria-label="Choisir un fichier PDF">
      </label>
      <button type="button" class="tile paste-toggle-btn" aria-expanded="false" aria-controls="${pasteId}">
        <span class="tile-icon" aria-hidden="true">${icons.paste(22)}</span>
        <span class="tile-text">
          <strong>Coller le texte d'une recette</strong>
          <span class="hint" aria-hidden="true">Une ligne par ingrédient : «\u202F500\u202Fg farine\u202F»</span>
        </span>
      </button>
    </div>
    <div id="${statusId}" role="status" aria-live="polite"></div>
    <div class="paste-area" id="${pasteId}" hidden>
      <textarea rows="6" aria-label="Texte de la recette à analyser" placeholder="500 g farine T65&#10;350 g eau&#10;10 g sel&#10;5 g levure"></textarea>
      <div class="paste-actions">
        <button type="button" class="btn-dark analyze-btn">Analyser le texte</button>
        <button type="button" class="btn-ghost cancel-paste-btn">Annuler</button>
      </div>
    </div>

    <h4 class="form-section">Ingrédients</h4>
    <p class="form-hint">La farine sert de base aux calculs : garde le mot «\u202Ffarine\u202F» dans son nom.</p>
    <div class="ing-list" role="group" aria-label="Ingrédients"></div>
    <button type="button" class="add-row add-ing-btn">${icons.plus(18)} Ajouter un ingrédient</button>

    <h4 class="form-section">Pour le fournil</h4>
    <div class="tb-row">
      <label for="${tbId}">Température de base (TB)</label>
      <span class="suffix-field">
        <input id="${tbId}" type="number" inputmode="decimal" step="any" class="tb-input" placeholder="ex. 54" value="${esc(tb)}">
        <span class="suffix" aria-hidden="true">°C</span>
      </span>
      <span class="tb-hint">facultatif</span>
    </div>
    <button type="button" class="btn-link notes-toggle-btn" aria-expanded="false">${icons.info(16)} <span class="notes-toggle-label">${notes ? 'Voir les étapes / temps' : 'Ajouter des étapes / temps (optionnel)'}</span></button>
    <div class="notes-area" hidden>
      <textarea id="${notesTaId}" class="notes-textarea" rows="4" aria-label="Étapes et temps" placeholder="Ex. 30 min de pointage, division, façonnage…"></textarea>
    </div>

    <p class="save-error" id="${errId}" role="alert" hidden></p>
    <div class="card-actions">
      <button type="button" class="btn-dark save-btn">${icons.check(18)} Enregistrer</button>
      <button type="button" class="btn-ghost cancel-btn">Annuler</button>
    </div>
  `;
  wrap.querySelector('.notes-textarea').value = notes;

  const nameInput = wrap.querySelector('.name-input');
  const errorEl = wrap.querySelector('.save-error');

  function renderIngList() {
    const list = wrap.querySelector('.ing-list');
    list.innerHTML = '';
    ingredients.forEach((ing, idx) => {
      const n = idx + 1;
      const row = el('div', 'ing-row');
      row.innerHTML = `
        <input type="text" aria-label="Ingrédient ${n}" placeholder="Ingrédient" value="${esc(ing.name)}" maxlength="200">
        <input type="number" inputmode="decimal" step="any" aria-label="Quantité de l'ingrédient ${n}" placeholder="Qté" value="${esc(ing.qty)}">
        <select aria-label="Unité de l'ingrédient ${n}">
          ${['g', 'kg', 'ml', 'cl', 'l'].map((u) => `<option value="${u}" ${ing.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
        <button type="button" class="icon-btn rm" aria-label="Retirer l'ingrédient ${n}">×</button>
      `;
      row.querySelector('input[type=text]').oninput = (e) => (ing.name = e.target.value);
      row.querySelector('input[type=number]').oninput = (e) => (ing.qty = e.target.value);
      row.querySelector('select').onchange = (e) => (ing.unit = e.target.value);
      row.querySelector('.rm').onclick = () => {
        ingredients = ingredients.filter((i) => i.id !== ing.id);
        renderIngList();
        (list.querySelector('input[type=text]') || wrap.querySelector('.add-ing-btn')).focus();
      };
      list.appendChild(row);
    });
  }
  renderIngList();

  wrap.querySelector('.add-ing-btn').onclick = () => {
    ingredients.push({ id: uid(), name: '', qty: '', unit: 'g' });
    renderIngList();
    const inputs = wrap.querySelectorAll('.ing-list input[type=text]');
    inputs[inputs.length - 1].focus();
  };

  const notesBtn = wrap.querySelector('.notes-toggle-btn');
  const notesArea = wrap.querySelector('.notes-area');
  const notesTextarea = wrap.querySelector('.notes-textarea');
  notesBtn.onclick = () => {
    notesArea.hidden = !notesArea.hidden;
    notesBtn.setAttribute('aria-expanded', String(!notesArea.hidden));
  };
  notesTextarea.oninput = (e) => (notes = e.target.value);
  wrap.querySelector('.tb-input').oninput = (e) => (tb = e.target.value);

  const pasteBtn = wrap.querySelector('.paste-toggle-btn');
  const pasteArea = wrap.querySelector('.paste-area');
  const pasteText = pasteArea.querySelector('textarea');
  const closePaste = () => {
    pasteArea.hidden = true;
    pasteBtn.hidden = false;
    pasteBtn.setAttribute('aria-expanded', 'false');
  };
  pasteBtn.onclick = () => {
    pasteArea.hidden = false;
    pasteBtn.hidden = true;
    pasteBtn.setAttribute('aria-expanded', 'true');
    pasteText.focus();
  };
  wrap.querySelector('.cancel-paste-btn').onclick = () => {
    closePaste();
    pasteBtn.focus();
  };

  function applyParsed(parsed) {
    if (parsed.ingredients.length) {
      ingredients = parsed.ingredients.map((p) => ({ id: p.id, name: p.name, qty: p.qtyG, unit: 'g' }));
      renderIngList();
    }
    if (parsed.notes) {
      notes = notes ? `${notes}\n${parsed.notes}` : parsed.notes;
      notesTextarea.value = notes;
      notesBtn.querySelector('.notes-toggle-label').textContent = 'Voir les étapes / temps';
    }
  }

  wrap.querySelector('.analyze-btn').onclick = () => {
    applyParsed(parseRecipeText(pasteText.value));
    closePaste();
    pasteText.value = '';
    pasteBtn.focus();
  };

  const dz = wrap.querySelector('.dropzone');
  const fileInput = wrap.querySelector('input[type=file]');
  const statusEl = wrap.querySelector(`#${CSS.escape(statusId)}`);
  const setStatus = (kind, text) => {
    statusEl.innerHTML = `<div class="dropzone-status ${kind}">${esc(text)}</div>`;
  };

  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('drag');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  async function handleFile(file) {
    if (file.type !== 'application/pdf') {
      setStatus('warn', "Ce fichier n'est pas un PDF.");
      return;
    }
    setStatus('ok', `Lecture de « ${file.name} »…`);
    if (!nameInput.value.trim()) {
      const guess = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
      if (guess) nameInput.value = guess.charAt(0).toUpperCase() + guess.slice(1);
    }
    try {
      const parsed = parseRecipeText(await extractPdfText(file));
      if (parsed.ingredients.length) {
        const n = parsed.ingredients.length;
        setStatus('ok', `${n} ingrédient${n > 1 ? 's' : ''} détecté${n > 1 ? 's' : ''} depuis « ${file.name} ». Vérifie les quantités ci-dessous.`);
      } else {
        setStatus('warn', 'Aucun texte exploitable trouvé dans ce PDF — probablement un scan ou une photo. Saisis les ingrédients à la main ci-dessous.');
      }
      applyParsed(parsed);
    } catch {
      setStatus('warn', 'Impossible de lire ce PDF. Saisis les ingrédients à la main ci-dessous.');
    }
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  wrap.querySelector('.save-btn').onclick = () => {
    const name = nameInput.value.trim();
    const cleaned = ingredients
      .filter((i) => i.name.trim() && i.qty !== '' && numVal(i.qty) !== null)
      .map((i) => ({ id: i.id, name: i.name.trim(), qtyG: toGrams(numVal(i.qty), i.unit) }));

    if (!name) {
      showError("Indique un nom pour la recette avant d'enregistrer.");
      nameInput.setAttribute('aria-invalid', 'true');
      nameInput.focus();
      return;
    }
    if (cleaned.length === 0) {
      showError("Aucun ingrédient valide — vérifie qu'un nom et une quantité sont bien renseignés pour chaque ligne.");
      return;
    }
    errorEl.hidden = true;
    nameInput.removeAttribute('aria-invalid');
    const tbParsed = numVal(tb);
    const tbValue = tbParsed === null ? '' : tbParsed;
    if (initial) {
      const idx = state.recipes.findIndex((r) => r.id === initial.id);
      state.recipes[idx] = { ...state.recipes[idx], name, ingredients: cleaned, notes, tb: tbValue };
      state.editingId = null;
    } else {
      state.recipes.push({ id: uid(), name, ingredients: cleaned, notes, tb: tbValue });
      state.adding = false;
    }
    saveRecipes();
    renderLibrary();
  };
  wrap.querySelector('.cancel-btn').onclick = () => {
    if (initial) state.editingId = null;
    else state.adding = false;
    renderLibrary();
  };

  return wrap;
}
return { renderLibrary };
})();

// ===== recettes/src/ui/calculator.js (copie de Grigne) =====
__modules["ui/calculator.js"] = (function () {
const { state, saveHistory } = __modules["state.js"];
const { esc, uid } = __modules["core/text.js"];
const { formatGrams, fixed, numVal, NNBSP } = __modules["core/units.js"];
const { getFlourWeightG, getTotalG, computeScaling, isFlour } = __modules["core/recipe-math.js"];
const { amount, byId, el, icons, nextId, resultMount, stamp } = __modules["ui/dom.js"];

/** Pas des boutons − / + selon l'unité. */
const STEP = { kg: 1, g: 100 };

/** Trait ondulé, dessiné à la main. */
const wave = (cls) =>
  `<svg class="wave ${cls}" viewBox="0 0 240 12" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M2 7c18-3 34 2 52-1s30-3 46 0 34 2 52-1 36-2 50 1 22 1 36-1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;

function renderCalculator() {
  const view = byId('rc-calculator-view');
  const calc = state.calc;
  view.innerHTML = '';

  if (state.recipes.length === 0) {
    view.appendChild(el('p', 'intro', "Ajoute d'abord une recette dans l'onglet Bibliothèque pour pouvoir la convertir."));
    return;
  }
  if (!calc.recipeId || !state.recipes.find((r) => r.id === calc.recipeId)) {
    calc.recipeId = state.recipes[0].id;
  }

  const layout = el('div', 'calc');
  const controls = el('div', 'calc-controls');
  const output = el('div', 'calc-output');
  layout.append(controls, output);
  view.appendChild(layout);

  // recette : un grand sélecteur, l'étiquette dans le cadre
  const picker = el('div', 'picker');
  const label1 = el('label', 'picker-k', 'Recette');
  label1.htmlFor = 'rc-calc-recipe';
  const select = el('select', 'picker-v');
  select.id = 'rc-calc-recipe';
  state.recipes.forEach((r) => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.name;
    if (r.id === calc.recipeId) opt.selected = true;
    select.appendChild(opt);
  });
  select.onchange = (e) => {
    calc.recipeId = e.target.value;
    calc.notesVisible = false;
    renderCalculator();
  };
  picker.append(label1, select);
  picker.insertAdjacentHTML(
    'beforeend',
    '<svg class="picker-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>',
  );
  controls.appendChild(picker);

  const recipe = state.recipes.find((r) => r.id === calc.recipeId);
  const usesFlour = getFlourWeightG(recipe) > 0;
  if (calc.mode === 'farine' && !usesFlour) calc.mode = 'total';

  if (recipe.notes) {
    const notesBtn = el('button', 'btn-link notes-btn');
    notesBtn.type = 'button';
    notesBtn.setAttribute('aria-expanded', String(calc.notesVisible));
    notesBtn.innerHTML = `${icons.info(16)} ${calc.notesVisible ? 'Masquer' : 'Voir'} les étapes / temps`;
    notesBtn.onclick = () => {
      calc.notesVisible = !calc.notesVisible;
      renderCalculator();
      byId('rc-calculator-view').querySelector('.btn-link')?.focus();
    };
    controls.appendChild(notesBtn);
    if (calc.notesVisible) controls.appendChild(el('div', 'notes-display notes-display--calc', recipe.notes));
  }

  const modeRow = el('div', 'modes');
  modeRow.setAttribute('role', 'radiogroup');
  modeRow.setAttribute('aria-label', 'Mode de calcul');
  const name = nextId('mode');
  modeRow.innerHTML = `
    <label><input type="radio" name="${name}" value="total" ${calc.mode === 'total' ? 'checked' : ''}><span>Poids total</span></label>
    <label><input type="radio" name="${name}" value="pieces" ${calc.mode === 'pieces' ? 'checked' : ''}><span>Pièces × poids</span></label>
    <label class="${usesFlour ? '' : 'disabled'}" ${usesFlour ? '' : 'title="Aucune farine identifiée dans cette recette"'}><input type="radio" name="${name}" value="farine" ${calc.mode === 'farine' ? 'checked' : ''} ${usesFlour ? '' : 'disabled'}><span>Poids de farine</span></label>
  `;
  modeRow.querySelectorAll('input').forEach((r) => {
    r.onchange = (e) => {
      calc.mode = e.target.value;
      renderCalculator();
      const again = byId('rc-calculator-view').querySelector(`input[type=radio][value="${calc.mode}"]`);
      if (again) again.focus();
    };
  });
  controls.appendChild(modeRow);

  if (calc.mode === 'total' || calc.mode === 'farine') {
    const isTotal = calc.mode === 'total';
    const qKey = isTotal ? 'totalQty' : 'flourQty';
    const uKey = isTotal ? 'totalUnit' : 'flourUnit';
    const id = nextId('calcqty');
    const stepper = el('div', 'stepper');
    const stepLabel = (sign) => `${sign} ${STEP[calc[uKey]]}${NNBSP}${calc[uKey]}`;
    stepper.innerHTML = `
      <button type="button" class="step" data-dir="-1" aria-label="${stepLabel('Moins')}"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/></svg></button>
      <div class="stepper-mid">
        <label class="stepper-k" for="${id}">${isTotal ? 'Poids de pâte voulu' : 'Poids de farine voulu'}</label>
        <div class="stepper-val">
          <input id="${id}" type="number" inputmode="decimal" step="any" min="0" placeholder="${isTotal ? 'Ex. 15' : 'Ex. 2'}" value="${esc(calc[qKey])}">
          <select aria-label="Unité"><option value="kg" ${calc[uKey] === 'kg' ? 'selected' : ''}>kg</option><option value="g" ${calc[uKey] === 'g' ? 'selected' : ''}>g</option></select>
        </div>
      </div>
      <button type="button" class="step" data-dir="1" aria-label="${stepLabel('Plus')}"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg></button>
    `;
    const input = stepper.querySelector('input');
    input.oninput = (e) => {
      calc[qKey] = e.target.value;
      renderResults();
    };
    stepper.querySelector('select').onchange = (e) => {
      calc[uKey] = e.target.value;
      stepper.querySelectorAll('.step').forEach((b) => {
        b.setAttribute('aria-label', stepLabel(b.dataset.dir === '1' ? 'Plus' : 'Moins'));
      });
      renderResults();
    };
    stepper.querySelectorAll('.step').forEach((b) => {
      b.onclick = () => {
        const next = Math.max(0, (numVal(calc[qKey]) ?? 0) + Number(b.dataset.dir) * STEP[calc[uKey]]);
        calc[qKey] = String(Math.round(next * 1000) / 1000);
        input.value = calc[qKey];
        renderResults();
      };
    });
    controls.appendChild(stepper);
  } else {
    const piecesWrap = el('div', 'pieces-wrap');
    piecesWrap.setAttribute('role', 'group');
    piecesWrap.setAttribute('aria-label', 'Pièces à tirer');
    controls.appendChild(piecesWrap);

    const renderPieceRows = () => {
      piecesWrap.innerHTML = '';
      calc.pieceRows.forEach((pr, idx) => {
        const n = idx + 1;
        const row = el('div', 'piece');
        row.innerHTML = `
          <input class="piece-type" type="text" aria-label="Type de pièce ${n}" placeholder="Type de pièce (ex. baguette)" value="${esc(pr.label)}" maxlength="100">
          <input class="piece-nb" type="number" inputmode="decimal" aria-label="Nombre de pièces ${n}" placeholder="Nb" value="${esc(pr.count)}">
          <span class="times" aria-hidden="true">×</span>
          <input class="piece-w" type="number" inputmode="decimal" aria-label="Poids par pièce ${n}, en grammes" placeholder="g / pièce" value="${esc(pr.weight)}">
          <button type="button" class="icon-btn rm" aria-label="Retirer le type de pièce ${n}">×</button>
        `;
        const inputs = row.querySelectorAll('input');
        inputs[0].oninput = (e) => (pr.label = e.target.value);
        inputs[1].oninput = (e) => {
          pr.count = e.target.value;
          renderResults();
        };
        inputs[2].oninput = (e) => {
          pr.weight = e.target.value;
          renderResults();
        };
        row.querySelector('.rm').onclick = () => {
          calc.pieceRows = calc.pieceRows.filter((x) => x.id !== pr.id);
          if (calc.pieceRows.length === 0) calc.pieceRows = [{ id: uid(), label: '', count: '', weight: '' }];
          renderPieceRows();
          renderResults();
          piecesWrap.querySelector('input')?.focus();
        };
        piecesWrap.appendChild(row);
      });
    };
    renderPieceRows();

    const addRowBtn = el('button', 'btn-link');
    addRowBtn.type = 'button';
    addRowBtn.innerHTML = `${icons.plus(16)} Ajouter un type de pièce`;
    addRowBtn.onclick = () => {
      calc.pieceRows.push({ id: uid(), label: '', count: '', weight: '' });
      renderPieceRows();
      renderResults();
      const inputs = piecesWrap.querySelectorAll('input[type=text]');
      inputs[inputs.length - 1].focus();
    };
    controls.appendChild(addRowBtn);
  }

  controls.insertAdjacentHTML('beforeend', wave('wave--sep'));
  output.appendChild(resultMount('rc-results-wrap'));
  const historyWrap = el('div', 'history-wrap');
  historyWrap.id = 'rc-history-wrap';
  output.appendChild(historyWrap);

  renderResults();
  renderHistory();
}

function renderResults() {
  const rroot = byId('rc-results-wrap');
  if (!rroot) return;
  const calc = state.calc;
  const recipe = state.recipes.find((r) => r.id === calc.recipeId);
  if (!recipe) return;

  const s = computeScaling(recipe, calc);
  const { referenceTotalG, usesFlourBasis, referenceBasisG, coefficient, targetG, factor } = s;

  const piecesSummary =
    calc.mode === 'pieces'
      ? calc.pieceRows
          .filter((pr) => parseFloat(pr.count) > 0 && parseFloat(pr.weight) > 0)
          .map((pr) => `${pr.count} ${pr.label || 'pièce(s)'}`)
          .join(' + ')
      : '';
  const flourSummary =
    calc.mode === 'farine' && coefficient
      ? `Farine visée : ${formatGrams(coefficient * 1000)} → ${formatGrams(targetG)} de pâte`
      : '';

  // la farine d'abord (c'est ce qu'on pèse en premier), puis le reste dans l'ordre de la recette
  const flours = recipe.ingredients.filter(isFlour);
  const others = recipe.ingredients.filter((ing) => !isFlour(ing));
  const line = (ing, lead, first) => `
        <li class="${lead ? 'lead' : ''}">
          <span class="n">${first ? '<span class="lead-k">En premier</span>' : ''}${esc(ing.name)}</span>
          <span class="q">${factor ? amount(formatGrams(ing.qtyG * factor)) : '—'}</span>
        </li>`;

  const n = recipe.ingredients.length;
  const hasTb = recipe.tb !== undefined && recipe.tb !== '' && recipe.tb !== null;
  const chips = [
    `${n} ingrédient${n > 1 ? 's' : ''}`,
    hasTb ? `TB ${String(recipe.tb).replace('.', ',')}${NNBSP}°C` : '',
    coefficient ? `×${fixed(coefficient, 2)}` : '',
  ].filter(Boolean);

  rroot.innerHTML = `
    <article class="result-card" aria-label="Résultat pour ${esc(recipe.name)}">
      ${stamp('Total pâte crue', 'TOTAL PÂTE', factor ? formatGrams(getTotalG(recipe) * factor) : '')}
      <p class="result-k">À peser</p>
      <h3 class="result-title">${esc(recipe.name)}</h3>
      <ul class="chips">${chips.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      <ol class="weigh">
        ${flours.map((ing, i) => line(ing, true, i === 0)).join('')}
        ${others.map((ing) => line(ing, false, false)).join('')}
      </ol>
      <div class="ref-line">
        ${usesFlourBasis ? `Base 1${NNBSP}kg de farine : ${formatGrams(referenceBasisG)} de pâte` : `Référence : ${formatGrams(referenceTotalG)} (poids total — aucune farine repérée)`} · ${coefficient ? `coefficient ×${fixed(coefficient, 2)}${usesFlourBasis ? ` (soit ${formatGrams(coefficient * 1000)} de farine)` : ''}` : "en attente d'un poids"}
      </div>
      ${piecesSummary ? `<div class="ref-line">Tirée : ${esc(piecesSummary)} = ${formatGrams(targetG)}</div>` : ''}
      ${flourSummary ? `<div class="ref-line">${esc(flourSummary)}</div>` : ''}
      ${
        coefficient
          ? `<div class="save-calc-row">
              <input type="text" class="calc-label-input" aria-label="Nom de cette tirée (optionnel)" placeholder="Nom du calcul (optionnel)" maxlength="100">
              <button type="button" class="btn-dark save-calc-btn">${icons.check(18)} Enregistrer ce calcul</button>
            </div>`
          : ''
      }
    </article>
  `;
  if (coefficient) {
    rroot.querySelector('.save-calc-btn').onclick = () => {
      const labelInput = rroot.querySelector('.calc-label-input');
      const label = labelInput.value.trim();
      state.history.unshift({
        id: uid(),
        timestamp: Date.now(),
        recipeName: recipe.name,
        label: label || null,
        targetG,
        coefficient,
        basis: usesFlourBasis ? 'farine' : 'total',
        breakdown: recipe.ingredients.map((ing) => ({ name: ing.name, grams: ing.qtyG * factor })),
      });
      state.history = state.history.slice(0, 20);
      saveHistory();
      labelInput.value = '';
      renderHistory();
    };
  }
}

function renderHistory() {
  const hroot = byId('rc-history-wrap');
  if (!hroot) return;
  hroot.innerHTML = '';
  if (state.history.length === 0) return;

  hroot.insertAdjacentHTML('beforeend', wave('wave--soft'));
  hroot.appendChild(el('h3', 'section-title', 'Calculs enregistrés'));
  const list = el('div', 'history-list');
  state.history.forEach((h) => {
    const d = new Date(h.timestamp);
    const dateStr = `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    const title = h.label || h.recipeName;
    const detailId = nextId('hist');
    const row = el('div', 'recipe-row recipe-row--stack history-item');
    row.innerHTML = `
      <div class="recipe-head">
        <div class="recipe-info">
          <h4 class="history-title"><button type="button" class="row-toggle row-toggle--small" aria-expanded="false" aria-controls="${detailId}">${esc(title)}</button></h4>
          <div class="meta">${esc(h.recipeName)} · ${formatGrams(h.targetG)}${h.coefficient ? ` · ×${fixed(h.coefficient, 2)}` : ''} · ${dateStr}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="icon-btn del-btn" aria-label="Supprimer le calcul ${esc(title)}">${icons.trash(14)}</button>
        </div>
      </div>
      <div class="calc-detail" id="${detailId}" hidden>
        ${h.coefficient ? `<div class="ref-line ref-line--bottom">Coefficient multiplicateur : ×${fixed(h.coefficient, 2)}</div>` : ''}
        ${(h.breakdown || []).map((b) => `<div class="line"><span>${esc(b.name)}</span><span class="strong">${formatGrams(b.grams)}</span></div>`).join('')}
        <div class="line line--total"><span>Total pâte crue</span><span>${formatGrams(h.targetG)}</span></div>
      </div>
    `;
    const toggle = row.querySelector('.row-toggle');
    const detail = row.querySelector('.calc-detail');
    const flip = () => {
      detail.hidden = !detail.hidden;
      toggle.setAttribute('aria-expanded', String(!detail.hidden));
    };
    toggle.onclick = flip;
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      flip();
    });
    row.querySelector('.del-btn').onclick = () => {
      state.history = state.history.filter((x) => x.id !== h.id);
      saveHistory();
      renderHistory();
    };
    list.appendChild(row);
  });
  hroot.appendChild(list);
}
return { renderCalculator };
})();

// ===== recettes/src/core/simple-calcs.js (copie de Grigne) =====
__modules["core/simple-calcs.js"] = (function () {
const { numVal, gramsOf } = __modules["core/units.js"];

/** Température de l'eau = base − (labo + farine). */
function computeWaterTemp(state) {
  const tb = numVal(state.tb);
  const labo = numVal(state.labo);
  const farine = numVal(state.farine);
  if (tb === null || labo === null || farine === null) return null;
  return tb - (labo + farine);
}

/** Hydratation = eau ÷ farine × 100. */
function computeHydration(state) {
  const f = gramsOf(state.farine, state.fUnit);
  const e = gramsOf(state.eau, state.eUnit);
  if (f !== null && f > 0 && e !== null) return { status: 'ok', totalG: f + e, percent: (e / f) * 100 };
  if (f !== null && f <= 0) return { status: 'flour-zero' };
  return { status: 'waiting' };
}

/** Produit en croix : si A correspond à B, C correspond à B × C ÷ A. */
function computeCross(state) {
  const a = numVal(state.a);
  const b = numVal(state.b);
  const c = numVal(state.c);
  if (a === null || b === null || c === null) return { status: 'waiting' };
  if (a === 0) return { status: 'a-zero' };
  return { status: 'ok', value: (b * c) / a };
}
return { computeWaterTemp, computeHydration, computeCross };
})();

// ===== recettes/src/ui/tb.js (copie de Grigne) =====
__modules["ui/tb.js"] = (function () {
const { state } = __modules["state.js"];
const { computeWaterTemp } = __modules["core/simple-calcs.js"];
const { byId, el, intro, nextId, resultCard, resultMount, waitLine } = __modules["ui/dom.js"];
const { esc } = __modules["core/text.js"];
const { fixed } = __modules["core/units.js"];

function renderTB() {
  const view = byId('rc-tb-view');
  view.innerHTML = '';
  intro(
    view,
    "Indique la température de base de la recette, la température du labo et celle de la farine : la température d'eau à utiliser se calcule automatiquement.",
  );

  const layout = el('div', 'tool');
  const eq = el('div', 'tool-controls tb-eq');
  eq.setAttribute('role', 'group');
  eq.setAttribute('aria-label', 'Base moins labo moins farine');
  layout.appendChild(eq);
  view.appendChild(layout);

  // l'étiquette visible est courte (« base »), le nom complet reste lu par les lecteurs d'écran
  function field(before, short, key, placeholder) {
    const id = nextId('tb');
    const box = el('div', 'field-box field-box--temp');
    box.innerHTML = `
      <label class="field-box-k" for="${id}"><span class="sr-only">${esc(before)}</span>${esc(short)}<span class="sr-only"> (°C)</span></label>
      <div class="field-box-row"><input id="${id}" type="number" inputmode="decimal" placeholder="${esc(placeholder)}" value="${esc(state.tb[key])}" step="0.1"><span class="suffix" aria-hidden="true">°C</span></div>`;
    box.querySelector('input').oninput = (e) => {
      state.tb[key] = e.target.value;
      renderTBResult();
    };
    eq.appendChild(box);
  }
  const minus = () => eq.insertAdjacentHTML('beforeend', '<span class="eq-op" aria-hidden="true">−</span>');
  field('Température de ', 'base', 'tb', '54');
  minus();
  field('Température du ', 'labo', 'labo', '22');
  minus();
  field('Température de la ', 'farine', 'farine', '20');

  layout.appendChild(resultMount('rc-tb-result'));
  renderTBResult();
}

function renderTBResult() {
  const wrap = byId('rc-tb-result');
  if (!wrap) return;
  const eau = computeWaterTemp(state.tb);
  wrap.innerHTML = resultCard({
    stampLabel: "Température de l'eau à utiliser",
    stampTop: 'EAU DE COULAGE',
    value: eau !== null ? `${fixed(eau, 1)}\u202F°C` : '',
    kicker: "Ton eau",
    title: 'Base − labo − farine',
    body: eau !== null ? '' : waitLine('en attente des 3 valeurs'),
  });
}
return { renderTB };
})();

// ===== recettes/src/core/levain.js (copie de Grigne) =====
__modules["core/levain.js"] = (function () {
const { numVal, gramsOf } = __modules["core/units.js"];

const LEVAIN_PRESETS = [
  { id: '1-1-1', lev: 1, eau: 1, far: 1 },
  { id: '1-2-2', lev: 1, eau: 2, far: 2 },
  { id: '1-3-3', lev: 1, eau: 3, far: 3 },
  { id: '1-5-5', lev: 1, eau: 5, far: 5 },
  { id: '1-10-10', lev: 1, eau: 10, far: 10 },
  { id: 'custom', lev: null, eau: null, far: null },
];

/** Ratio levain / eau / farine choisi, ou null s'il est invalide. */
function levainRatio(state) {
  if (state.preset === 'custom') {
    const l = numVal(state.cLev);
    const e = numVal(state.cEau);
    const f = numVal(state.cFar);
    if (l === null || e === null || f === null || l <= 0 || e < 0 || f < 0) return null;
    return { lev: l, eau: e, far: f };
  }
  const p = LEVAIN_PRESETS.find((x) => x.id === state.preset) ?? LEVAIN_PRESETS[0];
  return { lev: p.lev, eau: p.eau, far: p.far };
}

/**
 * Résultat d'un rafraîchi.
 * Renvoie { status: 'invalid' | 'waiting' } ou { status: 'ok', levG, eauG, farG, totG }.
 */
function computeLevain(state) {
  const r = levainRatio(state);
  if (!r) return { status: 'invalid' };
  const q = gramsOf(state.qty, state.unit);
  if (q === null || q <= 0) return { status: 'waiting' };
  const sum = r.lev + r.eau + r.far;
  const levG = state.mode === 'have' ? q : (q * r.lev) / sum;
  const eauG = (levG * r.eau) / r.lev;
  const farG = (levG * r.far) / r.lev;
  return { status: 'ok', levG, eauG, farG, totG: levG + eauG + farG };
}
return { LEVAIN_PRESETS, levainRatio, computeLevain };
})();

// ===== recettes/src/ui/levain.js (copie de Grigne) =====
__modules["ui/levain.js"] = (function () {
const { state } = __modules["state.js"];
const { LEVAIN_PRESETS, computeLevain } = __modules["core/levain.js"];
const { formatGrams } = __modules["core/units.js"];
const { amount, byId, el, intro, nextId, qtyField, resultCard, resultMount, waitLine } = __modules["ui/dom.js"];
const { esc } = __modules["core/text.js"];

const CHEVRON =
  '<svg class="picker-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>';

function renderLevain() {
  const view = byId('rc-levain-view');
  const s = state.levain;
  view.innerHTML = '';
  intro(
    view,
    'Choisis ton ratio de rafraîchi (levain / eau / farine), puis indique soit le levain que tu as, soit le poids total que tu veux obtenir.',
  );

  const layout = el('div', 'tool');
  const controls = el('div', 'tool-controls');
  layout.appendChild(controls);
  view.appendChild(layout);

  // ratio : grand sélecteur, l'étiquette dans le cadre
  const picker = el('div', 'picker');
  const lab = el('label', 'picker-k', 'Ratio levain / eau / farine');
  lab.htmlFor = 'rc-levain-preset';
  const sel = el('select', 'picker-v');
  sel.id = 'rc-levain-preset';
  LEVAIN_PRESETS.forEach((p) => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.id === 'custom' ? 'Personnalisé…' : `${p.lev} / ${p.eau} / ${p.far}`;
    if (p.id === s.preset) o.selected = true;
    sel.appendChild(o);
  });
  sel.onchange = (e) => {
    s.preset = e.target.value;
    renderLevain();
  };
  picker.append(lab, sel);
  picker.insertAdjacentHTML('beforeend', CHEVRON);
  controls.appendChild(picker);

  if (s.preset === 'custom') {
    const cr = el('div', 'ratio-row');
    const mk = (k, label, ph) =>
      `<span class="ratio-part"><span class="ratio-k" aria-hidden="true">${ph}</span><input type="number" inputmode="decimal" step="any" min="0" aria-label="${label}" placeholder="${ph[0]}" value="${esc(s[k])}" data-k="${k}"></span>`;
    cr.innerHTML = `${mk('cLev', 'Part de levain', 'Levain')}<span class="times" aria-hidden="true">/</span>${mk('cEau', "Part d'eau", 'Eau')}<span class="times" aria-hidden="true">/</span>${mk('cFar', 'Part de farine', 'Farine')}`;
    cr.setAttribute('role', 'group');
    cr.setAttribute('aria-label', 'Ratio personnalisé levain, eau, farine');
    cr.querySelectorAll('input').forEach((i) => {
      i.oninput = (e) => {
        s[e.target.dataset.k] = e.target.value;
        renderLevainResult();
      };
    });
    controls.appendChild(cr);
  }

  const modeRow = el('div', 'modes modes--2');
  modeRow.setAttribute('role', 'radiogroup');
  modeRow.setAttribute('aria-label', 'Ce que tu connais');
  const name = nextId('levain-mode');
  modeRow.innerHTML = `
    <label><input type="radio" name="${name}" value="have" ${s.mode === 'have' ? 'checked' : ''}><span>J'ai du levain</span></label>
    <label><input type="radio" name="${name}" value="total" ${s.mode === 'total' ? 'checked' : ''}><span>Je veux un poids total</span></label>`;
  modeRow.querySelectorAll('input').forEach((r) => {
    r.onchange = (e) => {
      s.mode = e.target.value;
      renderLevain();
      byId('rc-levain-view').querySelector(`input[type=radio][value="${s.mode}"]`)?.focus();
    };
  });
  controls.appendChild(modeRow);

  qtyField(
    controls,
    s.mode === 'have' ? "Poids de levain que j'ai" : 'Poids total de levain voulu',
    s.qty,
    s.unit,
    (v) => {
      s.qty = v;
      renderLevainResult();
    },
    (u) => {
      s.unit = u;
      renderLevainResult();
    },
    'Ex. 1',
  );

  layout.appendChild(resultMount('rc-levain-result'));
  renderLevainResult();
}

function ratioText() {
  const s = state.levain;
  if (s.preset !== 'custom') return s.preset.split('-').join(' / ');
  return [s.cLev, s.cEau, s.cFar].map((v) => String(v || '?').replace('.', ',')).join(' / ');
}

function renderLevainResult() {
  const wrap = byId('rc-levain-result');
  if (!wrap) return;
  const r = computeLevain(state.levain);
  const common = { stampLabel: 'Total de levain obtenu', stampTop: 'TOTAL LEVAIN', kicker: 'Ton rafraîchi', title: `Ratio ${ratioText()}` };
  if (r.status !== 'ok') {
    wrap.innerHTML = resultCard({
      ...common,
      value: '',
      body: waitLine(r.status === 'invalid' ? 'ratio invalide : chaque part doit être plus grande que 0' : 'en attente du poids', r.status === 'invalid' ? 'err' : 'wait'),
    });
    return;
  }
  const line = (n, g, cls = '') => `<li class="${cls}"><span class="n">${n}</span><span class="q">${amount(formatGrams(g))}</span></li>`;
  wrap.innerHTML = resultCard({
    ...common,
    value: formatGrams(r.totG),
    body: `<ol class="weigh">
        ${line('Levain (à garder)', r.levG)}
        ${line('Eau', r.eauG, 'lead lead--soft')}
        ${line('Farine', r.farG, 'lead lead--soft')}
      </ol>`,
  });
}
return { renderLevain };
})();

// ===== recettes/src/ui/hydra.js (copie de Grigne) =====
__modules["ui/hydra.js"] = (function () {
const { state } = __modules["state.js"];
const { computeHydration } = __modules["core/simple-calcs.js"];
const { formatGrams, fmtNum } = __modules["core/units.js"];
const { amount, byId, el, intro, qtyField, resultCard, resultMount, waitLine } = __modules["ui/dom.js"];

function renderHydra() {
  const view = byId('rc-hydra-view');
  const s = state.hydra;
  view.innerHTML = '';
  intro(
    view,
    "Indique la farine et l'eau utilisées : tu obtiens le total et le taux d'hydratation. Pour un produit en croix, utilise l'onglet Produit en croix.",
  );
  const layout = el('div', 'tool');
  const controls = el('div', 'tool-controls fields-2');
  layout.appendChild(controls);
  view.appendChild(layout);
  qtyField(
    controls,
    'Farine utilisée',
    s.farine,
    s.fUnit,
    (v) => {
      s.farine = v;
      renderHydraResult();
    },
    (u) => {
      s.fUnit = u;
      renderHydraResult();
    },
    'Ex. 1',
  );
  qtyField(
    controls,
    'Eau utilisée',
    s.eau,
    s.eUnit,
    (v) => {
      s.eau = v;
      renderHydraResult();
    },
    (u) => {
      s.eUnit = u;
      renderHydraResult();
    },
    'Ex. 0,7',
  );
  layout.appendChild(resultMount('rc-hydra-result'));
  renderHydraResult();
}

function renderHydraResult() {
  const wrap = byId('rc-hydra-result');
  if (!wrap) return;
  const r = computeHydration(state.hydra);
  const common = { stampLabel: 'Hydratation', stampTop: 'HYDRATATION', kicker: 'Ta pâte', title: 'Eau ÷ farine' };
  if (r.status === 'ok') {
    wrap.innerHTML = resultCard({
      ...common,
      value: `${fmtNum(r.percent, 1)}\u202F%`,
      body: `<ol class="weigh"><li><span class="n">Total (farine + eau)</span><span class="q">${amount(formatGrams(r.totalG))}</span></li></ol>`,
    });
  } else {
    wrap.innerHTML = resultCard({
      ...common,
      value: '',
      body: waitLine(r.status === 'flour-zero' ? 'farine à 0 : impossible de calculer' : 'en attente farine + eau', r.status === 'flour-zero' ? 'err' : 'wait'),
    });
  }
}
return { renderHydra };
})();

// ===== recettes/src/ui/cross.js (copie de Grigne) =====
__modules["ui/cross.js"] = (function () {
const { state } = __modules["state.js"];
const { computeCross } = __modules["core/simple-calcs.js"];
const { fmtNum } = __modules["core/units.js"];
const { byId, el, intro, nextId, resultCard, resultMount, waitLine } = __modules["ui/dom.js"];
const { esc } = __modules["core/text.js"];

const ARROW =
  '<span class="cross-arrow" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M14 7l5 5-5 5"/></svg></span>';

function renderCroix() {
  const view = byId('rc-croix-view');
  view.innerHTML = '';
  intro(
    view,
    "Produit en croix universel : si A correspond à B, alors C correspond à combien ? Marche pour n'importe quelle valeur, dans n'importe quelle unité (tant que A et C sont dans la même).",
  );

  const layout = el('div', 'tool');
  const grid = el('div', 'tool-controls cross-grid');
  layout.appendChild(grid);
  view.appendChild(layout);

  function box(prefix, key, placeholder) {
    const id = nextId('cross');
    const b = el('div', 'field-box field-box--cross');
    b.innerHTML = `<label class="field-box-k" for="${id}">${esc(prefix)}</label><div class="field-box-row"><input id="${id}" type="number" inputmode="decimal" step="any" aria-label="${esc(prefix)} ${esc(placeholder)}" placeholder="${esc(placeholder)}" value="${esc(state.cross[key])}"></div>`;
    b.querySelector('input').oninput = (e) => {
      state.cross[key] = e.target.value;
      renderCroixResult();
    };
    grid.appendChild(b);
  }
  box('Si', 'a', 'A');
  grid.insertAdjacentHTML('beforeend', ARROW);
  box('correspond à', 'b', 'B');
  box('alors', 'c', 'C');
  grid.insertAdjacentHTML('beforeend', `${ARROW}<div class="field-box field-box--cross field-box--ghost" aria-hidden="true"><span class="field-box-k">correspond à</span><span class="ghost-v">?</span></div>`);

  layout.appendChild(resultMount('rc-croix-result'));
  renderCroixResult();
}

function renderCroixResult() {
  const wrap = byId('rc-croix-result');
  if (!wrap) return;
  const r = computeCross(state.cross);
  const common = { stampLabel: 'Résultat', stampTop: 'RÉSULTAT', kicker: 'C correspond à', title: 'B × C ÷ A' };
  const ghost = byId('rc-croix-view').querySelector('.ghost-v');
  if (ghost) ghost.textContent = r.status === 'ok' ? fmtNum(r.value, 2) : '?';
  if (r.status === 'ok') wrap.innerHTML = resultCard({ ...common, value: fmtNum(r.value, 2) });
  else wrap.innerHTML = resultCard({ ...common, value: '', body: waitLine(r.status === 'a-zero' ? 'A ne peut pas être 0' : 'en attente des 3 valeurs', r.status === 'a-zero' ? 'err' : 'wait') });
}
return { renderCroix };
})();

// ===== recettes/adaptation/echange.js =====
__modules["echange.js"] = (function () {
// Mes recettes : exporter / importer, au format d'échange de Grigne (docs/format-export.md).
// Repris tel quel de l'ancienne version de Fournil (mêmes règles, mêmes messages),
// branché sur l'adaptation state.js. Les règles de lecture et de fusion suivent
// celles de Grigne (src/js/core/export.js et sanitize.js).
const { state, saveRecipes, reloadFromServer } = __modules["state.js"];
const { esc, uid } = __modules["core/text.js"];

// Format décrit dans docs/format-export.md (Grigne, version 2). Les règles de lecture
// et de fusion suivent celles de Grigne (src/js/core/export.js et sanitize.js),
// pour qu'un fichier passe de l'un à l'autre sans surprise.
const EX_APP = 'grigne';
const EX_VERSION = 2;
const EX_MAX_BYTES = 5 * 1024 * 1024;
const EX_MAX_NAME = 200, EX_MAX_NOTES = 10000, EX_MAX_ITEMS = 500;
// État affiché dans la carte : null, ou { kind: 'info'|'erreur'|'apercu'|'bilan', ... }
let echange = null;
let rerender = () => {};

const exNum = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;
const exStr = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
// TB : nombre, ou texte numérique (« 56 », « 56,5 ») ; sinon null.
function exTb(v){
  if(typeof v === 'string' && v.trim() !== '') v = Number(v.replace(',', '.'));
  return exNum(v);
}
const pl = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

function exportFileName(d){
  const p = n => String(n).padStart(2, '0');
  // jour à l'heure de Paris (assets/js/date.js), sinon jour de l'appareil
  if (window.FournilDate) return `fournil-recettes-${window.FournilDate.dateParis(d)}.json`;
  return `fournil-recettes-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

// Recettes de Fournil → objet au format Grigne v2. Une recette sans nom ou sans
// ingrédient valide n'est pas exportée (Grigne l'écarterait de toute façon).
function buildExport(list, date){
  const out = [];
  const ids = new Set();
  let skipped = 0;
  for(const r of list){
    const name = exStr(r && r.name, EX_MAX_NAME).trim();
    const ings = [];
    const ingIds = new Set();
    for(const i of (r && Array.isArray(r.ingredients) ? r.ingredients : []).slice(0, EX_MAX_ITEMS)){
      const iname = exStr(i && i.name, EX_MAX_NAME).trim();
      const q = exNum(typeof i?.qtyG === 'string' ? Number(i.qtyG.replace(',', '.')) : i?.qtyG);
      if(!iname || q === null || q < 0) continue;
      let iid = exStr(String(i.id ?? ''), 64);
      if(!iid || ingIds.has(iid)) iid = 'i' + ings.length + uid();
      ingIds.add(iid);
      ings.push({ id: iid, name: iname, qtyG: q, unit: 'g' });
    }
    if(!name || ings.length === 0){ skipped++; continue; }
    if(out.length >= EX_MAX_ITEMS){ skipped++; continue; }
    let id = exStr(String(r.id ?? ''), 64);
    if(!id || ids.has(id)) id = uid();
    ids.add(id);
    out.push({ id, name, ingredients: ings, notes: exStr(r.notes, EX_MAX_NOTES), tb: exTb(r.tb) });
  }
  return {
    data: {
      app: EX_APP,
      version: EX_VERSION,
      exportedAt: date.toISOString(),
      recipeCount: out.length,
      recipes: out,
      history: [],
    },
    skipped,
  };
}

// Texte d'un fichier Grigne → { recipes } nettoyées, ou { error }.
function parseImport(text){
  let json;
  try{ json = JSON.parse(text); }catch(e){ return { error: 'json' }; }
  if(!json || typeof json !== 'object' || json.app !== EX_APP || !Array.isArray(json.recipes)) return { error: 'format' };
  const version = json.version ?? 1;
  if(typeof version !== 'number' || version > EX_VERSION) return { error: 'version' };
  const out = [];
  const seen = new Set();
  for(const r of json.recipes.slice(0, EX_MAX_ITEMS)){
    if(!r || typeof r !== 'object') continue;
    const name = exStr(r.name, EX_MAX_NAME).trim();
    if(!name || !Array.isArray(r.ingredients)) continue;
    let id = exStr(r.id, 64);
    if(!id || seen.has(id)) id = uid();
    seen.add(id);
    const ingredients = [];
    for(const i of r.ingredients.slice(0, EX_MAX_ITEMS)){
      if(!i || typeof i !== 'object') continue;
      const iname = exStr(i.name, EX_MAX_NAME).trim();
      const qtyG = exNum(i.qtyG);
      if(!iname || qtyG === null || qtyG < 0) continue;
      ingredients.push({ id: exStr(i.id, 64) || ('i' + ingredients.length), name: iname, qtyG });
    }
    if(ingredients.length === 0) continue;
    const rec = { id, name, ingredients, notes: exStr(r.notes, EX_MAX_NOTES) };
    const tb = exNum(r.tb);
    if(tb !== null) rec.tb = tb;
    out.push(rec);
  }
  return { recipes: out };
}

// Empreinte du contenu (nom, ingrédients et quantités, étapes, TB), sans les identifiants.
function fingerprint(r, name){
  return JSON.stringify([
    String(name ?? r.name ?? '').trim().toLowerCase(),
    (r.ingredients || []).map(i => [String(i.name || '').trim().toLowerCase(), Number(i.qtyG)]),
    String(r.notes || '').trim(),
    exTb(r.tb),
  ]);
}

// Ce que l'import ajouterait, sans rien modifier : jamais d'écrasement.
// Doublon identique → ignoré ; id déjà pris → nouvel id ; nom pris → « Nom (importée) ».
// Une recette existante « Nom (importée) » compte aussi comme « Nom » : réimporter
// le même fichier n'ajoute pas « Nom (importée 2) ».
const SUFFIXE_IMPORT = /\s*\(importée(?: \d+)?\)$/;
function planImport(current, imported){
  const prints = new Set();
  for(const r of current){
    prints.add(fingerprint(r));
    const nom = String(r.name || '');
    if(SUFFIXE_IMPORT.test(nom)) prints.add(fingerprint(r, nom.replace(SUFFIXE_IMPORT, '')));
  }
  const ids = new Set(current.map(r => r.id));
  const names = new Set(current.map(r => String(r.name || '').trim().toLowerCase()));
  const toAdd = [];
  let skipped = 0;
  for(const r of imported){
    const print = fingerprint(r);
    if(prints.has(print)){ skipped++; continue; }
    prints.add(print);
    let id = r.id;
    while(ids.has(id)) id = uid();
    ids.add(id);
    let name = r.name;
    if(names.has(name.trim().toLowerCase())){
      const base = `${name} (importée)`;
      name = base;
      for(let n = 2; names.has(name.trim().toLowerCase()); n++) name = `${base.slice(0, -1)} ${n})`;
    }
    names.add(name.trim().toLowerCase());
    toAdd.push({ rec: { ...r, id, name }, renamedFrom: name !== r.name ? r.name : null });
  }
  return { toAdd, skipped };
}

function readFileText(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file, 'utf-8');
  });
}

function doExport(){
  const { data, skipped } = buildExport(state.recipes, new Date());
  if(data.recipeCount === 0){
    echange = { kind: 'erreur', text: "Aucune recette à exporter pour l'instant." };
    rerender();
    return;
  }
  const fileName = exportFileName(new Date());
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  echange = {
    kind: 'info',
    text: `${pl(data.recipeCount, 'recette exportée', 'recettes exportées')} dans « ${fileName} ».`
      + (skipped ? ` ${pl(skipped, 'recette sans nom ou sans ingrédient n’a pas été exportée', 'recettes sans nom ou sans ingrédient n’ont pas été exportées')}.` : '')
      + ' Tu peux l’ouvrir dans Grigne avec « Importer un fichier Grigne ».',
  };
  rerender();
}

async function onImportFile(file){
  if(!file) return;
  if(file.size > EX_MAX_BYTES){
    echange = { kind: 'erreur', text: 'Ce fichier est trop gros (5 Mo au plus).' };
    rerender(); return;
  }
  let text;
  try{ text = await readFileText(file); }
  catch(e){ echange = { kind: 'erreur', text: 'Impossible de lire ce fichier.' }; rerender(); return; }
  const parsed = parseImport(text);
  if(parsed.error){
    const msg = {
      json: 'Ce fichier n’est pas lisible : ce n’est pas un fichier d’export Grigne.',
      format: 'Ce fichier n’est pas un fichier d’export Grigne.',
      version: 'Ce fichier vient d’une version plus récente de Grigne : Fournil ne sait pas encore le lire.',
    }[parsed.error];
    echange = { kind: 'erreur', text: msg };
    rerender(); return;
  }
  if(parsed.recipes.length === 0){
    echange = { kind: 'erreur', text: 'Ce fichier ne contient aucune recette utilisable.' };
    rerender(); return;
  }
  const plan = planImport(state.recipes, parsed.recipes);
  if(plan.toAdd.length === 0){
    echange = { kind: 'info', text: `Rien à ajouter : ${pl(plan.skipped, 'recette déjà présente', 'recettes déjà présentes')} dans ta bibliothèque.` };
    rerender(); return;
  }
  echange = { kind: 'apercu', fileName: file.name, imported: parsed.recipes, plan };
  rerender();
}

async function confirmImport(){
  if(!echange || echange.kind !== 'apercu') return;
  const imported = echange.imported;
  echange = { kind: 'info', text: 'Import en cours…' };
  rerender();
  // Repartir de la version la plus récente sur le serveur, pour n'écraser
  // aucune recette ajoutée entre-temps sur un autre appareil.
  if(!(await reloadFromServer())){
    echange = { kind: 'erreur', text: 'Impossible de joindre le serveur : rien n’a été importé. Réessaie une fois connecté.' };
    rerender(); return;
  }
  const plan = planImport(state.recipes, imported);
  state.recipes = state.recipes.concat(plan.toAdd.map(a => a.rec));
  const ok = plan.toAdd.length ? await saveRecipes() : true;
  const renamed = plan.toAdd.filter(a => a.renamedFrom).length;
  echange = {
    kind: 'bilan',
    ok,
    text: `Import terminé : ${pl(plan.toAdd.length, 'recette ajoutée', 'recettes ajoutées')}`
      + (renamed ? ` (dont ${pl(renamed, 'renommée', 'renommées')} « (importée) »)` : '')
      + `, ${pl(plan.skipped, 'déjà présente (ignorée)', 'déjà présentes (ignorées)')}.`
      + (ok ? '' : ' Attention : l’envoi vers les autres appareils a échoué, elles ne sont enregistrées que sur celui-ci.'),
  };
  rerender();
}

function renderEchange(onChange){
  if(onChange) rerender = onChange;
  const mount = document.getElementById('rc-echange-view');
  if(!mount) return;
  mount.innerHTML = '';
  mount.appendChild(buildEchangeCard());
}

function buildEchangeCard(){
  const card = document.createElement('div');
  card.className = 'card rc-echange';
  card.innerHTML = `
    <h3>Mes recettes : exporter / importer</h3>
    <p class="sub">Échange tes recettes avec Grigne, ou garde-en une copie. L’import ajoute des recettes, il n’en remplace jamais.</p>
    <div class="rc-echange-actions">
      <button type="button" class="btn-dark rc-export-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
        Exporter mes recettes
      </button>
      <button type="button" class="btn-soft rc-import-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21V9M7 14l5-5 5 5M5 3h14"/></svg>
        Importer un fichier Grigne
      </button>
      <input type="file" class="rc-import-input" accept=".json,application/json" style="display:none">
    </div>
    <div class="rc-echange-zone" role="status" aria-live="polite"></div>`;
  const input = card.querySelector('.rc-import-input');
  card.querySelector('.rc-export-btn').onclick = doExport;
  card.querySelector('.rc-import-btn').onclick = () => { input.value = ''; input.click(); };
  input.onchange = () => onImportFile(input.files && input.files[0]);

  const zone = card.querySelector('.rc-echange-zone');
  if(echange){
    if(echange.kind === 'apercu'){
      const { plan, fileName } = echange;
      const n = plan.toAdd.length;
      zone.innerHTML = `
        <div class="dropzone-status ok">Fichier « ${esc(fileName)} » : <strong>${pl(n, 'recette à ajouter', 'recettes à ajouter')}</strong>, ${pl(plan.skipped, 'déjà présente', 'déjà présentes')}.</div>
        <ul>${plan.toAdd.map(a => `<li>${esc(a.rec.name)}${a.renamedFrom ? ` <span class="muet">(nom déjà pris)</span>` : ''}</li>`).join('')}</ul>
        <div class="rc-echange-actions">
          <button type="button" class="btn-dark rc-import-ok">Ajouter ${n > 1 ? 'les ' + n + ' recettes' : 'la recette'}</button>
          <button type="button" class="btn-ghost rc-import-cancel">Annuler</button>
        </div>`;
      zone.querySelector('.rc-import-ok').onclick = confirmImport;
      zone.querySelector('.rc-import-cancel').onclick = () => { echange = null; rerender(); };
    } else {
      const cls = echange.kind === 'erreur' || (echange.kind === 'bilan' && !echange.ok) ? 'warn' : 'ok';
      const div = document.createElement('div');
      div.className = 'dropzone-status ' + cls;
      div.textContent = echange.text;
      zone.appendChild(div);
    }
  }
  return card;
}
return { renderEchange };
})();

// ===== recettes/adaptation/app.js =====
__modules["app.js"] = (function () {
// Point d'entrée du module Recettes de Fournil : les écrans de Grigne (copiés sans
// modification dans recettes/src/ui) branchés sur boulangerie/recettes par state.js.
// Partagé par le Fournil et le Labo (même section #tab-recettes, mêmes données).
const { state, init, applyRemote, isEditing, onSaveStatus } = __modules["state.js"];
const { renderLibrary } = __modules["ui/library.js"];
const { renderCalculator } = __modules["ui/calculator.js"];
const { renderTB } = __modules["ui/tb.js"];
const { renderLevain } = __modules["ui/levain.js"];
const { renderHydra } = __modules["ui/hydra.js"];
const { renderCroix } = __modules["ui/cross.js"];
const { renderEchange } = __modules["echange.js"];

const TABS = ['library', 'calculator', 'tb', 'levain', 'hydra', 'croix'];
const RENDERERS = {
  library: renderLibrary,
  calculator: renderCalculator,
  tb: renderTB,
  levain: renderLevain,
  hydra: renderHydra,
  croix: renderCroix,
};

const root = document.getElementById('tab-recettes');

function render() {
  if (!root) return;
  root.querySelectorAll('.tabs [role=tab]').forEach((b) => {
    const active = b.dataset.tab === state.tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
  });
  TABS.forEach((t) => {
    const panel = document.getElementById(`panel-${t}`);
    if (panel) panel.hidden = t !== state.tab;
  });
  RENDERERS[state.tab]();
  if (state.tab === 'library') renderEchange(render);
}

function setupTabs() {
  const buttons = [...root.querySelectorAll('.tabs [role=tab]')];
  buttons.forEach((b, i) => {
    b.addEventListener('click', () => {
      state.tab = b.dataset.tab;
      render();
    });
    b.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      let next = null;
      if (e.key in keys) next = (i + keys[e.key] + buttons.length) % buttons.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = buttons.length - 1;
      if (next === null) return;
      e.preventDefault();
      buttons[next].focus();
      buttons[next].click();
    });
  });
}

if (root) {
  onSaveStatus((ok) => {
    const w = document.getElementById('rc-save-warn');
    if (w) w.hidden = ok;
  });
  setupTabs();
  init();
  render();
  // Appelé par le script principal de Fournil à chaque nouvelle version de
  // boulangerie/recettes (écoute temps réel, bouton Actualiser). Pendant la saisie
  // d'une recette, on met les données à jour sans redessiner le formulaire.
  window.rcApplyRemote = (data) => {
    applyRemote(data);
    if (!isEditing()) render();
  };
  // Pour les autres modules (ex. ouverture de l'onglet) : redessine l'écran en cours.
  window.rcRender = render;
}
return {  };
})();
})();
