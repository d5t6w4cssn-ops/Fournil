// Allergènes d'une recette, déduits automatiquement des noms de ses ingrédients.
// Les 14 allergènes à déclarer (règlement européen INCO n° 1169/2011, annexe II), dans
// l'ordre de la réglementation. Fonctions pures : utilisées par les feuilles de calcul et
// le PDF (window.FournilAllergenes), testées par tests/test_allergenes.js.
// Détection prudente : un nom clair déclenche l'allergène ; les cas incertains (ex.
// « chocolat » sans précision) ne sont pas devinés. La fiche rappelle de vérifier les
// étiquettes des fournisseurs.
(function (racine, fabrique) {
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (racine && racine.document) racine.FournilAllergenes = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Chaque règle : mots qui déclenchent (début de mot), et expressions qui l'annulent.
  const ALLERGENES = [
    {
      id: 'gluten', nom: 'Gluten',
      detail: 'céréales contenant du gluten',
      mots: ['farine', 'ble', 'froment', 'seigle', 'orge', 'avoine', 'epeautre', 'kamut', 'gluten', 'malt', 'semoule', 'chapelure', 'levain', 'pain', 'brioche', 'pate feuilletee', 'pate brisee', 'pate sablee', 'biscuit', 'boulgour', 'couscous', 'son de', 'germe de ble', 'speculoos', 'crumble'],
      sauf: ['farine de riz', 'farine de mais', 'farine de sarrasin', 'farine de chataigne', 'farine de pois', 'farine de coco', 'farine d amande', 'farine de noisette', 'farine de lupin', 'farine de soja', 'farine de quinoa', 'farine de manioc', 'farine de teff', 'farine de millet', 'fecule', 'ble noir', 'sans gluten', 'farine de lentille', 'farine de souchet'],
    },
    { id: 'crustaces', nom: 'Crustacés', mots: ['crustace', 'crevette', 'crabe', 'homard', 'langouste', 'langoustine', 'ecrevisse', 'gambas'] },
    { id: 'oeufs', nom: 'Œufs', mots: ['oeuf', 'jaune d oeuf', 'blanc d oeuf', 'jaunes', 'blancs', 'meringue', 'dorure', 'mayonnaise', 'ovoproduit'] },
    { id: 'poissons', nom: 'Poissons', mots: ['poisson', 'saumon', 'thon', 'anchois', 'cabillaud', 'morue', 'sardine', 'truite', 'maquereau', 'colin'] },
    { id: 'arachides', nom: 'Arachides', mots: ['arachide', 'cacahuete', 'cacahouete', 'beurre de cacahuete'] },
    { id: 'soja', nom: 'Soja', mots: ['soja', 'tofu', 'edamame', 'lecithine de soja'] },
    {
      id: 'lait', nom: 'Lait',
      detail: 'y compris le lactose',
      mots: ['lait', 'beurre', 'creme', 'fromage', 'yaourt', 'yogourt', 'lactose', 'lactoserum', 'babeurre', 'mascarpone', 'ricotta', 'mozzarella', 'emmental', 'comte', 'parmesan', 'gruyere', 'chevre', 'feta', 'ghee', 'chocolat au lait', 'chocolat blanc', 'caseine', 'petit lait', 'fromage blanc', 'cream cheese', 'brioche', 'pate feuilletee'],
      sauf: ['lait de coco', 'lait d amande', 'lait de soja', 'lait d avoine', 'lait de riz', 'lait de noisette', 'beurre de cacao', 'beurre de cacahuete', 'beurre d arachide', 'creme de marron', 'creme de coco', 'creme d amande', 'beurre de karite', 'beurre vegetal', 'creme vegetale', 'sans lactose'],
    },
    {
      id: 'fruits-a-coque', nom: 'Fruits à coque',
      detail: 'amandes, noisettes, noix…',
      mots: ['amande', 'noisette', 'noix', 'cajou', 'pecan', 'pistache', 'macadamia', 'praline', 'pralin', 'frangipane', 'massepain', 'pate d amande', 'gianduja', 'nougat', 'nougatine', 'financier', 'lait d amande', 'creme d amande', 'farine d amande', 'farine de noisette', 'poudre d amande'],
      sauf: ['noix de coco', 'noix de muscade', 'noix de saint jacques', 'noix de veau', 'beurre noisette'],
    },
    { id: 'celeri', nom: 'Céleri', mots: ['celeri', 'celeri rave', 'sel de celeri'] },
    { id: 'moutarde', nom: 'Moutarde', mots: ['moutarde'] },
    { id: 'sesame', nom: 'Sésame', mots: ['sesame', 'tahini', 'tahin', 'halva'] },
    { id: 'sulfites', nom: 'Sulfites', detail: 'anhydride sulfureux et sulfites', mots: ['sulfite', 'bisulfite', 'metabisulfite', 'anhydride sulfureux', 'vin', 'vinaigre de vin', 'e220', 'e221', 'e222', 'e223', 'e224', 'e226', 'e227', 'e228'] },
    { id: 'lupin', nom: 'Lupin', mots: ['lupin'] },
    { id: 'mollusques', nom: 'Mollusques', mots: ['mollusque', 'moule', 'huitre', 'calamar', 'calmar', 'poulpe', 'seiche', 'escargot', 'bulot', 'palourde', 'coquille saint jacques', 'saint jacques', 'bigorneau'] },
  ];

  /** Texte comparable : minuscules, sans accents, œ → oe, ponctuation → espace. */
  function normaliser(s) {
    return ` ${String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim()} `;
  }
  // un mot déclencheur doit commencer un mot du nom (« vin » ne trouve pas « levain »,
  // « oeuf » trouve « oeufs ») ; une exception s'applique à son expression exacte
  const contient = (texte, mot) => texte.includes(` ${mot}`);

  /** Allergènes d'un seul ingrédient (liste d'identifiants). */
  function allergenesIngredient(nom) {
    const t = normaliser(nom);
    return ALLERGENES.filter((a) => {
      let reste = t;
      (a.sauf || []).forEach((s) => { reste = reste.split(` ${s} `).join(' ').split(` ${s}`).join(' '); });
      return a.mots.some((m) => contient(reste, m));
    }).map((a) => a.id);
  }

  /**
   * Allergènes d'une liste d'ingrédients ({ name } ou textes), dans l'ordre réglementaire :
   * [{ id, nom, detail, ingredients: [noms qui l'ont déclenché] }].
   */
  function allergenes(ingredients) {
    const noms = (ingredients || []).map((i) => (typeof i === 'string' ? i : i && i.name)).filter(Boolean);
    const trouves = new Map();
    noms.forEach((n) => {
      allergenesIngredient(n).forEach((id) => {
        if (!trouves.has(id)) trouves.set(id, []);
        if (!trouves.get(id).includes(n)) trouves.get(id).push(n);
      });
    });
    return ALLERGENES.filter((a) => trouves.has(a.id)).map((a) => ({ id: a.id, nom: a.nom, detail: a.detail || '', ingredients: trouves.get(a.id) }));
  }

  const AVERTISSEMENT = 'Allergènes repérés automatiquement d’après les noms des ingrédients : vérifie les étiquettes de tes fournisseurs (traces, additifs).';

  return { allergenes, allergenesIngredient, normaliser, ALLERGENES, AVERTISSEMENT };
});
