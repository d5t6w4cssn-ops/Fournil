// Saisie rapide des calculs : reconnaissance d'un texte écrit ou dicté, par exemple
// « 30 pains sportifs à 400 g, 20 campagnes à 500 g ».
// Fonctions pures (aucun accès à la page) : utilisées par l'écran Calcul des Recettes
// (recettes/adaptation/saisie-calculs.js, via window.FournilSaisieCalculs) et testées par
// tests/test_saisie_calculs.js.
// Règles : une feuille de calcul par recette (pas de total global) ; un nom de recette
// ambigu ou inconnu n'est JAMAIS deviné : l'utilisateur choisit ; aucun arrondi des poids.
(function (racine, fabrique) {
  const api = fabrique(racine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (racine && racine.document) racine.FournilSaisieCalculs = api;
})(typeof self !== 'undefined' ? self : this, function (racine) {
  'use strict';

  // nombres en lettres : fonction de la saisie rapide du Stock (navigateur), ou passée par les tests
  let saisieStockTests = null;
  const saisieStock = () => (racine && racine.FournilSaisie) || saisieStockTests;

  const UNITES = { g: 1, gr: 1, grs: 1, gramme: 1, grammes: 1, kg: 1000, kgs: 1000, kilo: 1000, kilos: 1000, kilogramme: 1000, kilogrammes: 1000 };
  const RE_UNITE = '(kilogrammes?|kilos?|kgs?|grammes?|grs?|g)';
  const RE_POIDS = `(\\d+(?:[.,]\\d+)?)\\s*${RE_UNITE}(?![\\p{L}])`;
  // A : « 30 pains sportifs à 400 g » ; B : « 30 × 400 g de pain sportif »
  const RE_A = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(?:x|×|fois)?\\s+(.+?)\\s+(?:à|a|de|d’|d'|@|x|×|:|en)\\s*${RE_POIDS}\\s*(?:pièces?|pieces?|chacun(?:e|s|es)?|l[’']unité|la pièce|par pièce)?\\s*$`, 'iu');
  const RE_B = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(?:x|×|fois|de|à)?\\s*${RE_POIDS}\\s*(?:de |d[’']|du |des )?(.+?)\\s*$`, 'iu');
  const RE_SANS_UNITE = /^(\d+(?:[.,]\d+)?)\s*(?:x|×)?\s+(.+?)\s+(?:à|a|de|@|x|×|:)\s*(\d+(?:[.,]\d+)?)\s*$/iu;
  const RE_SANS_POIDS = /^(\d+(?:[.,]\d+)?)\s+(.+?)\s*$/u;

  const MESSAGES = {
    'sans-poids': 'Poids par pièce manquant : écris par exemple « à 400 g ».',
    'sans-unite': 'Unité manquante : précise « g » ou « kg ».',
    'sans-nombre': 'Nombre de pièces manquant : écris par exemple « 30 pains à 400 g ».',
    'nombre-invalide': 'Le nombre de pièces doit être un nombre entier supérieur à 0.',
    'poids-invalide': 'Le poids par pièce doit être supérieur à 0.',
  };

  const nombre = (s) => Number(String(s).replace(',', '.'));

  /** Découpe le texte en lignes : virgule (pas celle d'un nombre décimal), point-virgule, retour à la ligne, « et » / « puis » devant un nombre, ou unité suivie d'un nombre (dictée sans ponctuation). */
  function decouper(texte) {
    return String(texte || '')
      .split(/(?<!\d),|,(?!\d)|;|\n|\s+(?:et|puis|plus)\s+(?=\d)|(?<=\b(?:kilogrammes?|kilos?|kgs?|grammes?|grs?|g))\s+(?=\d)/iu)
      .map((s) => s.replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, ''))
      .filter(Boolean);
  }

  /**
   * Analyse le texte. Renvoie une liste de lignes :
   * { texte, nombre, nom, poidsG, erreur } (erreur : clé de MESSAGES ou null).
   */
  function analyser(texte) {
    const F = saisieStock();
    const net = F && F.lettresEnChiffres ? F.lettresEnChiffres(String(texte || '')) : String(texte || '');
    return decouper(net).map((seg) => {
      const l = { texte: seg, nombre: null, nom: '', poidsG: null, erreur: null };
      let m = seg.match(RE_A);
      if (m) {
        l.nombre = nombre(m[1]);
        l.nom = m[2].trim();
        l.poidsG = nombre(m[3]) * UNITES[m[4].toLowerCase()];
      } else if ((m = seg.match(RE_B))) {
        l.nombre = nombre(m[1]);
        l.poidsG = nombre(m[2]) * UNITES[m[3].toLowerCase()];
        l.nom = m[4].trim();
      } else if ((m = seg.match(RE_SANS_UNITE))) {
        l.nombre = nombre(m[1]);
        l.nom = m[2].trim();
        l.erreur = 'sans-unite';
      } else if ((m = seg.match(RE_SANS_POIDS))) {
        l.nombre = nombre(m[1]);
        l.nom = m[2].trim();
        l.erreur = 'sans-poids';
      } else {
        l.nom = seg.replace(/\s+(?:à|de)\s+\d.*$/iu, '').trim();
        l.erreur = 'sans-nombre';
      }
      if (!l.erreur && (!Number.isInteger(l.nombre) || l.nombre <= 0)) l.erreur = 'nombre-invalide';
      if (!l.erreur && !(l.poidsG > 0)) l.erreur = 'poids-invalide';
      if (!l.nom && !l.erreur) l.erreur = 'sans-nombre';
      return l;
    });
  }

  // ---------- rapprochement avec les recettes ----------
  const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'au', 'aux', 'a', 'en', 'et', 'un', 'une']);
  const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  /** Mots significatifs, au singulier, sans accents ni mots vides. */
  function mots(s) {
    return sansAccents(s).toLowerCase()
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !MOTS_VIDES.has(w))
      .map((w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w));
  }
  const cle = (s) => mots(s).join(' ');

  /**
   * Cherche la recette d'un nom saisi.
   * - 'trouve' : un seul nom identique (accents, majuscules, pluriel et petits mots ignorés) ;
   * - 'ambigu' : pas de nom identique, mais des recettes proches (candidats) : à choisir ;
   * - 'inconnu' : rien de proche : à choisir dans la liste ou à retirer.
   * Une recette proche n'est jamais choisie toute seule.
   */
  function rapprocher(nom, recettes) {
    const liste = Array.isArray(recettes) ? recettes : [];
    const k = cle(nom);
    if (!k) return { statut: 'inconnu', candidats: [] };
    const identiques = liste.filter((r) => cle(r.name) === k);
    if (identiques.length === 1) return { statut: 'trouve', recette: identiques[0], candidats: [] };
    if (identiques.length > 1) return { statut: 'ambigu', candidats: identiques };
    const q = mots(nom);
    const proches = liste
      .map((r) => {
        const n = mots(r.name);
        const communs = q.filter((w) => n.some((x) => x === w || (w.length >= 4 && x.length >= 4 && (x.startsWith(w) || w.startsWith(x))))).length;
        return { r, score: communs / Math.max(q.length, 1) };
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score);
    if (proches.length) return { statut: 'ambigu', candidats: proches.map((x) => x.r) };
    return { statut: 'inconnu', candidats: [] };
  }

  /**
   * Regroupe les lignes prêtes ({ recetteId, nombre, poidsG, nom }) en une feuille par recette,
   * dans l'ordre de première apparition.
   */
  function feuilles(lignes) {
    const ordre = [];
    const par = new Map();
    lignes.forEach((l) => {
      if (!par.has(l.recetteId)) { par.set(l.recetteId, []); ordre.push(l.recetteId); }
      par.get(l.recetteId).push({ label: l.nom, count: l.nombre, weight: l.poidsG });
    });
    return ordre.map((id) => ({ recetteId: id, pieces: par.get(id) }));
  }

  // ---------- affichage des poids, sans arrondi ----------
  /**
   * « 12000 » → « 12 000 g » ; « 4012.5 » → « 4 012,5 g ». Les poids ne sont pas arrondis :
   * seules les traces de calcul en virgule flottante (au-delà du millième de gramme) sont ôtées.
   */
  function grammes(g) {
    if (g === null || g === undefined || !Number.isFinite(Number(g))) return '—';
    const v = Math.round(Number(g) * 1000) / 1000;
    const [ent, dec] = String(Math.abs(v)).split('.');
    const groupe = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${v < 0 ? '−' : ''}${groupe}${dec ? `,${dec}` : ''} g`;
  }

  /** Pour les tests (Node) : fournit la reconnaissance des nombres en lettres. */
  const utiliserSaisieStock = (api) => { saisieStockTests = api; };

  return { analyser, decouper, rapprocher, feuilles, grammes, mots, cle, MESSAGES, utiliserSaisieStock };
});
