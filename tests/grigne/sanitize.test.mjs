// Test unitaire repris de Grigne (~/grigne/tests/unit), chemins adaptés à recettes/src :
// vérifie que les calculs du module Recettes donnent exactement les mêmes résultats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRecipes, sanitizeHistory } from '../../recettes/src/core/sanitize.js';

test('recettes valides conservées', () => {
  const r = sanitizeRecipes([{ id: 'r1', name: 'Pain', ingredients: [{ id: 'i', name: 'Farine', qtyG: 500 }], notes: 'n', tb: 54 }]);
  assert.deepEqual(r, [{ id: 'r1', name: 'Pain', ingredients: [{ id: 'i', name: 'Farine', qtyG: 500 }], notes: 'n', tb: 54 }]);
});

test('données corrompues : rien ne plante, tout est écarté', () => {
  assert.deepEqual(sanitizeRecipes('x'), []);
  assert.deepEqual(sanitizeRecipes(null), []);
  const r = sanitizeRecipes([
    null, 3, { name: '' }, { name: 'A' },
    { name: 'B', ingredients: [{ name: 'f', qtyG: 'beaucoup' }] },
    { name: 'C', ingredients: [{ name: 'f', qtyG: -2 }] },
    { name: 'D', ingredients: [{ name: 'f', qtyG: 10 }], tb: 'chaud', notes: 12 },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].name, 'D');
  assert.equal(r[0].tb, '');
  assert.equal(r[0].notes, '');
});

test('identifiants dupliqués ou absents régénérés', () => {
  const ing = [{ name: 'f', qtyG: 1 }];
  const r = sanitizeRecipes([{ id: 'x', name: 'A', ingredients: ing }, { id: 'x', name: 'B', ingredients: ing }, { name: 'C', ingredients: ing }]);
  assert.equal(new Set(r.map((x) => x.id)).size, 3);
});

test('noms trop longs tronqués', () => {
  const r = sanitizeRecipes([{ name: 'a'.repeat(1000), ingredients: [{ name: 'f', qtyG: 1 }] }]);
  assert.equal(r[0].name.length, 200);
});

test('historique : types forcés', () => {
  const h = sanitizeHistory([
    { id: 'h', timestamp: 1, recipeName: 'P', label: null, targetG: 1000, coefficient: '2', basis: 'farine', breakdown: [{ name: 'f', grams: 5 }, { name: 'x', grams: 'a' }] },
    { timestamp: 'x', targetG: 1 },
    { timestamp: 1, targetG: 'x' },
  ]);
  assert.equal(h.length, 1);
  assert.equal(h[0].coefficient, null);
  assert.equal(h[0].breakdown.length, 1);
});

test('historique limité à 20 entrées', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ timestamp: i, targetG: 1 }));
  assert.equal(sanitizeHistory(many).length, 20);
});
