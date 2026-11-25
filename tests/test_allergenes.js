// Allergènes déduits des ingrédients.
// Lancer : node --test tests/test_allergenes.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../assets/js/allergenes.js');

const ids = (noms) => A.allergenes(noms).map((a) => a.id);

test('les 14 allergènes réglementaires, dans l’ordre', () => {
  assert.equal(A.ALLERGENES.length, 14);
  assert.deepEqual(A.ALLERGENES.map((a) => a.id), ['gluten', 'crustaces', 'oeufs', 'poissons', 'arachides', 'soja', 'lait', 'fruits-a-coque', 'celeri', 'moutarde', 'sesame', 'sulfites', 'lupin', 'mollusques']);
});

test('recettes de boulangerie courantes', () => {
  assert.deepEqual(ids(['Farine T65', 'Eau', 'Levain liquide', 'Sel', 'Levure fraîche']), ['gluten']);
  assert.deepEqual(ids(['Farine T45', 'Œufs', 'Beurre', 'Sucre', 'Levure fraîche', 'Sel']), ['gluten', 'oeufs', 'lait']);
  assert.deepEqual(ids(['Farine de seigle T130', 'Eau']), ['gluten']);
  assert.deepEqual(ids(['Farine T55', 'Poudre d’amande', 'Graines de sésame', 'Crème fraîche', 'Noisettes torréfiées']), ['gluten', 'lait', 'fruits-a-coque', 'sesame']);
});

test('pièges : pas de faux allergènes', () => {
  assert.deepEqual(ids(['Farine de riz', 'Farine de sarrasin', 'Fécule de maïs']), [], 'farines sans gluten');
  assert.deepEqual(ids(['Lait de coco', 'Beurre de cacao', 'Noix de coco râpée', 'Noix de muscade']), []);
  assert.deepEqual(ids(['Levain']), ['gluten'], 'levain = farine');
  assert.ok(!ids(['Levain']).includes('sulfites'), '« vin » ne se trouve pas dans « levain »');
  assert.deepEqual(ids(['Chocolat noir']), [], 'chocolat sans précision : pas deviné');
  assert.deepEqual(ids(['Chocolat au lait']), ['lait']);
  assert.deepEqual(ids(['Beurre noisette']), ['lait'], 'beurre noisette : lait, pas de fruits à coque');
});

test('chaque allergène dit quels ingrédients l’ont déclenché', () => {
  const r = A.allergenes([{ name: 'Farine T80' }, { name: 'Levain liquide' }, { name: 'Eau' }]);
  assert.deepEqual(r, [{ id: 'gluten', nom: 'Gluten', detail: 'céréales contenant du gluten', ingredients: ['Farine T80', 'Levain liquide'] }]);
  assert.match(A.AVERTISSEMENT, /vérifie les étiquettes/);
});
