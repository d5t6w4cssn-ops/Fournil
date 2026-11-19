// Reconnaissance de la saisie rapide (assets/js/saisie-rapide.js) : découpage du texte,
// nombres, produits reconnus, nouveaux produits, cas à signaler.
// Lancer : node --test tests/test_saisie_rapide.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyser, rapprocher, nomProduit, lettresEnChiffres } = require('../assets/js/saisie-rapide.js');

const PRODUITS = [
  { id: 'croissant', name: 'Croissant' },
  { id: 'pain_choc', name: 'Pain au chocolat' },
  { id: 'viennoise', name: 'Viennoise' },
  { id: 'brioche', name: 'Brioche' },
  { id: 'pain_raisins', name: 'Pain aux raisins' },
  { id: 'tresse', name: 'Tressé' },
  { id: 'chausson_pommes', name: 'Chausson aux pommes' },
];
const PRODUITS_SANS_CHAUSSON = PRODUITS.filter((p) => p.id !== 'chausson_pommes');

// Texte → [quantité, signe, id du produit reconnu | 'nouveau:<Nom>' | 'ambigu' | erreur]
function resume(texte, produits = PRODUITS) {
  return analyser(texte).map((l) => {
    if (l.erreur) return [l.quantite, l.signe, l.erreur];
    const r = rapprocher(l.nom, produits);
    const cible = r.statut === 'trouve' ? r.produit.id : r.statut === 'nouveau' ? `nouveau:${nomProduit(l.nom)}` : 'ambigu';
    return [l.quantite, l.signe, cible];
  });
}

test("l'exemple de l'utilisateur", () => {
  assert.deepEqual(resume('40 viennoises, 50 chaussons, 200 pains au chocolat, 300 croissants', PRODUITS_SANS_CHAUSSON), [
    [40, null, 'viennoise'],
    [50, null, 'nouveau:Chausson'],
    [200, null, 'pain_choc'],
    [300, null, 'croissant'],
  ]);
});

test('séparateurs : virgule, « et », « puis », point-virgule, retour à la ligne, rien du tout (dictée)', () => {
  const attendu = [[40, null, 'viennoise'], [300, null, 'croissant']];
  for (const t of [
    '40 viennoises, 300 croissants',
    '40 viennoises et 300 croissants',
    '40 viennoises puis 300 croissants',
    '40 viennoises ; 300 croissants',
    '40 viennoises\n300 croissants',
    '40 viennoises 300 croissants',
    '40 viennoises,300 croissants',
    '40 viennoises. 300 croissants.',
    '  40   viennoises ,  300  croissants  ',
  ]) assert.deepEqual(resume(t), attendu, t);
});

test('singulier, pluriel, accents, majuscules', () => {
  for (const t of ['1 croissant', '1 croissants', '1 CROISSANTS', '1 Croissant', '1 croissânt']) {
    assert.deepEqual(resume(t), [[1, null, 'croissant']], t);
  }
  assert.deepEqual(resume('3 tresses'), [[3, null, 'tresse']]);
  assert.deepEqual(resume('3 TRESSÉS'), [[3, null, 'tresse']]);
  assert.deepEqual(resume('2 pain au chocolat'), [[2, null, 'pain_choc']]);
  assert.deepEqual(resume('2 pains aux chocolats'), [[2, null, 'pain_choc']]);
  assert.deepEqual(resume('5 pains aux raisins'), [[5, null, 'pain_raisins']]);
});

test('abréviations courantes et petites fautes', () => {
  for (const [t, id] of [
    ['20 pain choc', 'pain_choc'], ['20 pains choc', 'pain_choc'], ['20 pain choco', 'pain_choc'],
    ['20 chocolatines', 'pain_choc'], ['20 croisant', 'croissant'], ['20 croissans', 'croissant'],
    ['20 crossaints', 'croissant'], ['20 vienoises', 'viennoise'], ['20 brioshes', 'brioche'],
    ['20 croiss', 'croissant'], ['20 pain raisin', 'pain_raisins'], ['20 chaussons', 'chausson_pommes'],
  ]) assert.deepEqual(resume(t), [[20, null, id]], t);
});

test('nombres en lettres et douzaines (dictée)', () => {
  assert.equal(lettresEnChiffres('vingt-cinq croissants'), '25 croissants');
  assert.deepEqual(resume('deux brioches et douze croissants'), [[2, null, 'brioche'], [12, null, 'croissant']]);
  assert.deepEqual(resume('une brioche'), [[1, null, 'brioche']]);
  assert.deepEqual(resume('quatre-vingts croissants'), [[80, null, 'croissant']]);
  assert.deepEqual(resume('soixante-dix viennoises'), [[70, null, 'viennoise']]);
  assert.deepEqual(resume('vingt et un croissants'), [[21, null, 'croissant']]);
  assert.deepEqual(resume('deux cents pains au chocolat'), [[200, null, 'pain_choc']]);
  assert.deepEqual(resume('2 douzaines de croissants'), [[24, null, 'croissant']]);
  assert.deepEqual(resume('une douzaine de brioches'), [[12, null, 'brioche']]);
});

test('signe moins ou plus sur une ligne, « moins 20 » dicté', () => {
  assert.deepEqual(resume('-20 croissants, 10 brioches'), [[20, '-', 'croissant'], [10, null, 'brioche']]);
  assert.deepEqual(resume('moins 20 croissants et plus 5 brioches'), [[20, '-', 'croissant'], [5, '+', 'brioche']]);
  assert.deepEqual(resume('- 3 viennoises'), [[3, '-', 'viennoise']]);
});

test('le nombre après le produit', () => {
  assert.deepEqual(resume('croissants : 300'), [[300, null, 'croissant']]);
  assert.deepEqual(resume('croissants 300, viennoises 40'), [[300, null, 'croissant'], [40, null, 'viennoise']]);
  assert.deepEqual(resume('brioche x 4'), [[4, null, 'brioche']]);
  assert.deepEqual(resume('4 x brioches'), [[4, null, 'brioche']]);
  assert.deepEqual(resume('4 pièces de brioche'), [[4, null, 'brioche']]);
});

test('un nombre seul, sans produit, est signalé et jamais deviné', () => {
  assert.deepEqual(resume('40'), [[40, null, 'sans-produit']]);
  assert.deepEqual(resume('40 croissants, 25'), [[40, null, 'croissant'], [25, null, 'sans-produit']]);
  assert.deepEqual(resume('300 croissants et 12'), [[300, null, 'croissant'], [12, null, 'sans-produit']]);
});

test('autres cas à signaler : produit sans quantité, zéro, décimale', () => {
  assert.deepEqual(resume('croissants'), [[null, null, 'sans-quantite']]);
  assert.deepEqual(resume('0 croissant'), [[0, null, 'quantite-nulle']]);
  assert.deepEqual(resume('1,5 croissant'), [[1.5, null, 'quantite-decimale']]);
  assert.deepEqual(resume('2.5 brioches'), [[2.5, null, 'quantite-decimale']]);
});

test('nom trop vague : à choisir (ambigu), pas deviné', () => {
  assert.deepEqual(resume('30 pains'), [[30, null, 'ambigu']]);
  const r = rapprocher('pain', PRODUITS);
  assert.equal(r.statut, 'ambigu');
  assert.deepEqual(r.candidats.map((c) => c.produit.id).sort(), ['pain_choc', 'pain_raisins']);
});

test('produits inconnus : créés avec un nom propre au singulier', () => {
  assert.deepEqual(resume('15 gâteaux basques, 8 choux à la crème, 3 noix de coco', PRODUITS), [
    [15, null, 'nouveau:Gâteau basque'],
    [8, null, 'nouveau:Chou à la crème'],
    [3, null, 'nouveau:Noix de coco'],
  ]);
  assert.equal(nomProduit('pains de mie'), 'Pain de mie');
  assert.equal(nomProduit('FICELLES'), 'FICELLE');
  assert.equal(nomProduit('baguettes tradition'), 'Baguette tradition');
});

test('mots de remplissage ignorés, texte vide', () => {
  assert.deepEqual(resume(''), []);
  assert.deepEqual(resume('   '), []);
  assert.deepEqual(resume('40 viennoises et voilà'), [[40, null, 'viennoise']]);
  assert.deepEqual(resume('40 viennoises, merci'), [[40, null, 'viennoise']]);
});

test('ne confond pas deux produits proches', () => {
  const p = [...PRODUITS, { id: 'croissant_amandes', name: 'Croissant aux amandes' }];
  assert.deepEqual(resume('10 croissants', p), [[10, null, 'croissant']]);
  assert.deepEqual(resume('10 croissants aux amandes', p), [[10, null, 'croissant_amandes']]);
  assert.deepEqual(resume('10 croissants amande', p), [[10, null, 'croissant_amandes']]);
});

test('grands nombres et liste longue', () => {
  assert.deepEqual(resume('1000 croissants'), [[1000, null, 'croissant']]);
  const r = resume('1 croissant, 2 brioches, 3 viennoises, 4 pains au chocolat, 5 pains aux raisins, 6 tressés');
  assert.deepEqual(r.map((x) => x[0]), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(r.map((x) => x[2]), ['croissant', 'brioche', 'viennoise', 'pain_choc', 'pain_raisins', 'tresse']);
});
