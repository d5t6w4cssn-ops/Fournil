// Saisie rapide du stock : reconnaissance d'un texte écrit ou dicté, par exemple
// « 40 viennoises, 50 chaussons, 200 pains au chocolat et 300 croissants ».
// Fonctions pures (aucun accès à la page) : utilisées par assets/js/stock.js dans le
// navigateur (window.FournilSaisie) et testées par tests/test_saisie_rapide.js.
(function (racine, fabrique) {
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.FournilSaisie = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- nombres écrits en lettres ----------
  const NOMBRES = {
    un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
    onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
    vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
    cent: 100, cents: 100, mille: 1000,
  };
  const MOTS_NOMBRES = Object.keys(NOMBRES).sort((a, b) => b.length - a.length).join('|');
  const RE_NOMBRE_LETTRES = new RegExp(`(?<![\\p{L}\\d])((?:${MOTS_NOMBRES})(?:[\\s-]+(?:et[\\s-]+)?(?:${MOTS_NOMBRES}))*)(?![\\p{L}])`, 'giu');

  function valeurLettres(suite) {
    const mots = suite.toLowerCase().split(/[\s-]+/).filter((m) => m && m !== 'et');
    let total = 0;
    let courant = 0;
    let dernier = 0;
    for (const m of mots) {
      const v = NOMBRES[m];
      if (v === 100) courant = (courant || 1) * 100;
      else if (v === 1000) { total += (courant || 1) * 1000; courant = 0; }
      else if (v === 20 && dernier === 4) courant += 76; // quatre-vingt(s) = 80
      else courant += v;
      dernier = v;
    }
    return total + courant;
  }

  function lettresEnChiffres(texte) {
    return texte
      .replace(RE_NOMBRE_LETTRES, (m) => String(valeurLettres(m)))
      // « 2 douzaines de croissants » → 24 ; « une douzaine » → 12
      .replace(/(\d+)\s*douzaines?\s+(?:de\s+|d['’]\s*)?/giu, (_, n) => `${Number(n) * 12} `)
      .replace(/(?<![\p{L}\d])douzaines?\s+(?:de\s+|d['’]\s*)?/giu, '12 ')
      // « moins 20 croissants » → -20 ; « plus 20 » → +20
      .replace(/(?<![\p{L}])moins\s+(?=\d)/giu, '-')
      .replace(/(?<![\p{L}])plus\s+(?=\d)/giu, '+');
  }

  // ---------- découpage en lignes « nombre + produit » ----------
  const SEPARATEURS = /\n|;|•|(?<!\d),|,(?!\d)|\.(?!\d)|\s+(?:et|puis)\s+(?=[+-]?\d)/iu;
  const RE_NOMBRE = /(^|[\s(])([+-]?\s?\d+(?:[.,]\d+)?)(?=$|[\s\p{L}])/gu;
  const REMPLISSAGE = new Set(['', 'et', 'puis', 'voila', 'voilà', 'merci', 'ok', "c'est tout", 'cest tout']);
  const UNITES = /^(?:x\b|×|fois\b|pi[eè]ces?\b|pcs?\b|unit[eé]s?\b)\s*/iu;

  function couperParNombres(morceau) {
    const t = morceau.trim();
    const nombres = [...t.matchAll(RE_NOMBRE)];
    if (nombres.length < 2) return [t];
    const coupes = /^[+-]?\s?\d/.test(t)
      ? nombres.slice(1).map((m) => m.index + m[1].length) // « 40 viennoises 50 chaussons »
      : nombres.slice(0, -1).map((m) => m.index + m[0].length); // « viennoises 40 chaussons 50 »
    const parts = [];
    let debut = 0;
    for (const c of coupes) {
      parts.push(t.slice(debut, c));
      debut = c;
    }
    parts.push(t.slice(debut));
    return parts.map((p) => p.trim()).filter(Boolean);
  }

  function nettoyerNom(nom) {
    return nom
      .replace(/^[\s:=x×-]+/u, '')
      .replace(UNITES, '')
      .replace(/^(?:de|des|du|d['’])\s*/iu, '')
      .replace(/\s+(?:et\s+)?(?:voil[aà]|merci|ok|c['’]?est tout)$/iu, '')
      .replace(/[\s.!?:=]+$/u, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function lireLigne(texte) {
    const t = texte.trim();
    let m = t.match(/^([+-])?\s*(\d+(?:[.,]\d+)?)(?![\d])\s*(.*)$/su);
    let signe;
    let nombre;
    let nom;
    if (m) {
      [, signe, nombre, nom] = m;
    } else {
      m = t.match(/^(.*?)\s*[:=x×]?\s*([+-])?\s*(\d+(?:[.,]\d+)?)\s*(?:pi[eè]ces?|pcs?|unit[eé]s?)?$/iu);
      if (m) [, nom, signe, nombre] = m;
    }
    if (!m) return { texte: t, quantite: null, signe: null, nom: nettoyerNom(t), erreur: 'sans-quantite' };
    nom = nettoyerNom(nom || '');
    const quantite = Number(nombre.replace(',', '.'));
    const ligne = { texte: t, quantite, signe: signe || null, nom, erreur: null };
    if (!nom) ligne.erreur = 'sans-produit';
    else if (!(quantite > 0)) ligne.erreur = 'quantite-nulle';
    else if (!Number.isInteger(quantite)) ligne.erreur = 'quantite-decimale';
    return ligne;
  }

  /** Texte libre → liste de lignes { texte, quantite, signe ('+' | '-' | null), nom, erreur }. */
  function analyser(texte) {
    const prepare = lettresEnChiffres(String(texte || ''));
    const lignes = [];
    prepare.split(SEPARATEURS).forEach((morceau) => {
      if (!morceau || REMPLISSAGE.has(morceau.trim().toLowerCase())) return;
      couperParNombres(morceau).forEach((p) => {
        const propre = p.replace(/^(?:et|puis)\s+/iu, '').trim();
        if (!propre || REMPLISSAGE.has(propre.toLowerCase())) return;
        lignes.push(lireLigne(propre));
      });
    });
    return lignes;
  }

  // ---------- rapprochement avec les produits existants ----------
  const MOTS_VIDES = new Set(['de', 'du', 'des', 'd', 'au', 'aux', 'a', 'la', 'le', 'les', 'l', 'en', 'et', 'avec']);
  const INVARIABLES = new Set(['noix', 'croix', 'choix', 'prix', 'paix', 'voix', 'pois', 'ananas', 'cassis', 'anis', 'frais', 'gros', 'epais', 'bras', 'bois', 'mais', 'jus', 'fois', 'radis', 'souris', 'nems', 'kiwis']);
  const SYNONYMES = {
    chocolatine: ['pain', 'chocolat'], painchoc: ['pain', 'chocolat'], pac: ['pain', 'chocolat'],
    choco: ['chocolat'], croiss: ['croissant'], vienno: ['viennoise'], tradi: ['tradition'], trad: ['tradition'],
  };

  function normaliser(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['’`]/g, ' ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function singulier(mot) {
    if (mot.length > 3 && !INVARIABLES.has(mot) && /[sx]$/.test(mot) && !/ss$/.test(mot)) return mot.slice(0, -1);
    return mot;
  }
  /** Mots significatifs d'un nom : sans accents, sans majuscules, au singulier, abréviations développées. */
  function cle(nom) {
    const mots = [];
    normaliser(nom).split(' ').forEach((m) => {
      if (!m || MOTS_VIDES.has(m)) return;
      const s = singulier(m);
      if (SYNONYMES[s]) mots.push(...SYNONYMES[s]);
      else if (SYNONYMES[m]) mots.push(...SYNONYMES[m]);
      else mots.push(s);
    });
    // « pain choc » et « pain chocolatine » se recoupent : pas de doublon de mots
    return [...new Set(mots)];
  }

  function distance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cout = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cout);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }
  function scoreMot(q, p) {
    if (q === p) return 1;
    if ((q.length >= 3 && p.startsWith(q)) || (p.length >= 4 && q.startsWith(p))) return 0.9;
    const dist = distance(q, p);
    const court = Math.min(q.length, p.length);
    if (dist <= 1 && court >= 4) return 0.85;
    if (dist <= 2 && court >= 7) return 0.8;
    return 0;
  }
  function score(nom, produit) {
    const Q = cle(nom);
    const P = cle(produit);
    if (!Q.length || !P.length) return 0;
    if (Q.join(' ') === P.join(' ')) return 1;
    const utilises = new Set();
    let somme = 0;
    for (const q of Q) {
      let meilleur = 0;
      let lequel = -1;
      P.forEach((p, i) => {
        const s = scoreMot(q, p);
        if (s > meilleur || (s === meilleur && s > 0 && !utilises.has(i) && utilises.has(lequel))) { meilleur = s; lequel = i; }
      });
      somme += meilleur;
      if (lequel >= 0 && meilleur > 0) utilises.add(lequel);
    }
    const parMots = (somme / Q.length) * (0.55 + 0.45 * (utilises.size / P.length));
    const a = Q.join('');
    const b = P.join('');
    const global = 1 - distance(a, b) / Math.max(a.length, b.length);
    return Math.max(parMots, global * 0.95);
  }

  const SEUIL_SUR = 0.8;
  const SEUIL_PROCHE = 0.6;
  /**
   * Nom tapé → { statut, produit, candidats }.
   * statut : 'trouve' (un produit clairement), 'ambigu' (plusieurs possibles ou ressemblance
   * faible : à choisir, jamais deviné), 'nouveau' (rien ne ressemble vraiment).
   */
  function rapprocher(nom, produits) {
    const notes = (produits || [])
      .map((p) => ({ produit: p, score: score(nom, p.name) }))
      .filter((c) => c.score >= SEUIL_PROCHE)
      .sort((x, y) => y.score - x.score);
    if (!notes.length) return { statut: 'nouveau', produit: null, candidats: [] };
    const [premier, second] = notes;
    if (premier.score >= SEUIL_SUR && (!second || second.score < premier.score - 0.05)) {
      return { statut: 'trouve', produit: premier.produit, candidats: notes };
    }
    // Un seul produit ressemble, et il contient tous les mots tapés (« chaussons » →
    // « Chausson aux pommes ») : c'est lui.
    const Q = cle(nom);
    const P = cle(premier.produit.name);
    if (!second && Q.every((q) => P.some((p) => scoreMot(q, p) >= 0.85))) {
      return { statut: 'trouve', produit: premier.produit, candidats: notes };
    }
    return { statut: 'ambigu', produit: null, candidats: notes.filter((c) => c.score >= premier.score - 0.1) };
  }

  /** Nom d'un produit à créer, tiré du texte : « pains au chocolat » → « Pain au chocolat ». */
  function nomProduit(nomBrut) {
    const mots = String(nomBrut || '').trim().split(/\s+/).filter(Boolean).map((m) => {
      const n = normaliser(m);
      return n.length > 3 && !INVARIABLES.has(n) && /[sx]$/.test(n) && !/ss$/.test(n) ? m.slice(0, -1) : m;
    });
    const t = mots.join(' ');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  const MESSAGES = {
    'sans-produit': 'Nombre sans produit : indique le produit ou retire la ligne.',
    'sans-quantite': 'Quantité manquante : indique un nombre ou retire la ligne.',
    'quantite-nulle': 'La quantité doit être supérieure à 0.',
    'quantite-decimale': 'Indique un nombre entier de pièces.',
  };

  return { analyser, rapprocher, nomProduit, normaliser, cle, score, lettresEnChiffres, MESSAGES };
});
