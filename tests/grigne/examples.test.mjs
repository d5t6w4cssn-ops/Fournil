// Test unitaire repris de Grigne (~/grigne/tests/unit), chemins adaptés à recettes/src :
// vérifie que les calculs du module Recettes donnent exactement les mêmes résultats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeExampleRecipes } from '../../recettes/src/core/examples.js';
import { sanitizeRecipes } from '../../recettes/src/core/sanitize.js';
import { getFlourWeightG } from '../../recettes/src/core/recipe-math.js';

test('recettes d\'exemple : trois recettes valides, marquées « (exemple) »', () => {
  const list = makeExampleRecipes();
  assert.equal(list.length, 3);
  assert.deepEqual(sanitizeRecipes(list), list); // même format qu'une recette saisie : rien n'est retiré
  for (const r of list) {
    assert.match(r.name, /\(exemple\)$/);
    assert.equal(getFlourWeightG(r), 1000); // pourcentages de boulanger sur 1 kg de farine
  }
  const ids = list.flatMap((r) => [r.id, ...r.ingredients.map((i) => i.id)]);
  assert.equal(new Set(ids).size, ids.length);
});

test('recettes d\'exemple : pourcentages de boulanger réalistes', () => {
  const [baguette, campagne, brioche] = makeExampleRecipes();
  const pct = (r, name) => r.ingredients.find((i) => i.name === name).qtyG / 10;
  assert.equal(pct(baguette, 'Eau'), 70);
  assert.equal(pct(baguette, 'Sel'), 1.8);
  assert.equal(pct(campagne, 'Levain liquide'), 20);
  assert.equal(pct(brioche, 'Beurre'), 50);
});
