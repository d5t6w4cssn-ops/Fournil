import test from 'node:test';
import assert from 'node:assert/strict';
import { toGrams, numVal, gramsOf, formatGrams, fmtNum, fixed } from '../../recettes/src/core/units.js';
import { esc } from '../../recettes/src/core/text.js';
import { parseRecipeText } from '../../recettes/src/core/parse.js';
import { getFlourWeightG, getTotalG, computeScaling, computeTargetG } from '../../recettes/src/core/recipe-math.js';
import { computeLevain, levainRatio } from '../../recettes/src/core/levain.js';
import { computeWaterTemp, computeHydration, computeCross } from '../../recettes/src/core/simple-calcs.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('unités et formats', () => {
  assert.equal(toGrams(2, 'kg'), 2000);
  assert.equal(toGrams(50, 'cl'), 500);
  assert.equal(toGrams(3, 'inconnue'), 3);
  assert.equal(numVal('1,5'), 1.5);
  assert.equal(numVal(''), null);
  assert.equal(numVal('abc'), null);
  assert.equal(gramsOf('-1', 'g'), null);
  assert.equal(gramsOf('2', 'kg'), 2000);
  assert.equal(formatGrams(350), '350\u202Fg');
  assert.equal(formatGrams(1250), '1,25\u202Fkg');
  assert.equal(formatGrams(157.94), '157,9\u202Fg');
  assert.equal(formatGrams(2000), '2\u202Fkg');
  assert.equal(fixed(7.894, 2), '7,89');
  assert.equal(fmtNum(70.555, 1), '70,6');
  assert.equal(fmtNum(null), '—');
  assert.equal(fmtNum(Infinity), '—');
});

test('esc neutralise le HTML et les attributs', () => {
  const s = esc(`"><img src=x onerror=alert(1)>'&`);
  assert.ok(!/[<>"']/.test(s));
  assert.equal(esc(null), '');
  assert.equal(esc(12), '12');
});

test('analyse de texte de recette', () => {
  const { ingredients, notes } = parseRecipeText('500 g farine T65\neau 350 g\n10,5 g sel\nPointage 30 min\n');
  assert.deepEqual(ingredients.map((i) => [i.name, i.qtyG]), [
    ['farine T65', 500],
    ['eau', 350],
    ['sel', 10.5],
  ]);
  assert.equal(notes, 'Pointage 30 min');
});

test('analyse : quantité alternative', () => {
  const { ingredients } = parseRecipeText('5/10 g levure');
  assert.equal(ingredients[0].name, 'levure (ou 10g)');
  assert.equal(ingredients[0].qtyG, 5);
});

const recipe = {
  ingredients: [
    { id: 'a', name: 'Farine T65', qtyG: 1000 },
    { id: 'b', name: 'Eau', qtyG: 700 },
    { id: 'c', name: 'Sel', qtyG: 20 },
  ],
};
const calc = (o) => ({ mode: 'total', totalQty: '', totalUnit: 'kg', pieceRows: [], flourQty: '', flourUnit: 'kg', ...o });

test('recette : poids de farine et total', () => {
  assert.equal(getFlourWeightG(recipe), 1000);
  assert.equal(getTotalG(recipe), 1720);
});

test('calculateur : poids total 15 kg', () => {
  const s = computeScaling(recipe, calc({ totalQty: '15' }));
  close(s.coefficient, 15000 / 1720);
  close(s.targetG, 15000);
  close(s.factor * 1000, 15000 / 1.72, 1e-6);
});

test('calculateur : pièces 15 × 350 g', () => {
  assert.equal(computeTargetG(calc({ mode: 'pieces', pieceRows: [{ count: '15', weight: '350' }] })), 5250);
  assert.equal(computeTargetG(calc({ mode: 'pieces', pieceRows: [{ count: '0', weight: '350' }] })), null);
});

test('calculateur : poids de farine 2 kg', () => {
  const s = computeScaling(recipe, calc({ mode: 'farine', flourQty: '2' }));
  close(s.coefficient, 2);
  close(s.targetG, 3440);
  close(s.factor, 2);
});

test('calculateur : recette sans farine → base poids total', () => {
  const r = { ingredients: [{ id: 'x', name: 'Sucre', qtyG: 300 }, { id: 'y', name: 'Beurre', qtyG: 200 }] };
  const s = computeScaling(r, calc({ totalQty: '1' }));
  assert.equal(s.usesFlourBasis, false);
  close(s.coefficient, 2);
  assert.equal(computeScaling(r, calc({ mode: 'farine', flourQty: '1' })).coefficient, null);
});

test('levain : 1/1/1 avec 1 kg', () => {
  const r = computeLevain({ preset: '1-1-1', mode: 'have', qty: '1', unit: 'kg' });
  assert.deepEqual([r.levG, r.eauG, r.farG, r.totG], [1000, 1000, 1000, 3000]);
});
test('levain : 1/2/2 avec 100 g', () => {
  const r = computeLevain({ preset: '1-2-2', mode: 'have', qty: '100', unit: 'g' });
  assert.deepEqual([r.levG, r.eauG, r.farG, r.totG], [100, 200, 200, 500]);
});
test('levain : 1/3/3 pour 700 g au total', () => {
  const r = computeLevain({ preset: '1-3-3', mode: 'total', qty: '700', unit: 'g' });
  close(r.levG, 100); close(r.eauG, 300); close(r.farG, 300); close(r.totG, 700);
});
test('levain : personnalisé 1/4/3 avec 50 g', () => {
  const r = computeLevain({ preset: 'custom', cLev: '1', cEau: '4', cFar: '3', mode: 'have', qty: '50', unit: 'g' });
  assert.deepEqual([r.eauG, r.farG, r.totG], [200, 150, 400]);
});
test('levain : ratio invalide ou poids absent', () => {
  assert.equal(levainRatio({ preset: 'custom', cLev: '0', cEau: '1', cFar: '1' }), null);
  assert.equal(computeLevain({ preset: 'custom', cLev: '', cEau: '1', cFar: '1', mode: 'have', qty: '1', unit: 'kg' }).status, 'invalid');
  assert.equal(computeLevain({ preset: '1-1-1', mode: 'have', qty: '', unit: 'kg' }).status, 'waiting');
});

test('température de base', () => {
  assert.equal(computeWaterTemp({ tb: '54', labo: '22', farine: '20' }), 12);
  assert.equal(computeWaterTemp({ tb: '54', labo: '', farine: '20' }), null);
  assert.equal(computeWaterTemp({ tb: '54', labo: '22,5', farine: '20' }), 11.5);
});

test('hydratation', () => {
  const a = computeHydration({ farine: '1', fUnit: 'kg', eau: '0.7', eUnit: 'kg' });
  close(a.percent, 70); assert.equal(a.totalG, 1700);
  const b = computeHydration({ farine: '850', fUnit: 'g', eau: '600', eUnit: 'g' });
  assert.equal(fmtNum(b.percent, 1), '70,6');
  assert.equal(computeHydration({ farine: '0', fUnit: 'g', eau: '5', eUnit: 'g' }).status, 'flour-zero');
  assert.equal(computeHydration({ farine: '', fUnit: 'g', eau: '5', eUnit: 'g' }).status, 'waiting');
});

test('produit en croix', () => {
  assert.equal(computeCross({ a: '200', b: '500', c: '80' }).value, 200);
  assert.equal(fmtNum(computeCross({ a: '3', b: '7', c: '10' }).value, 2), '23,33');
  assert.equal(computeCross({ a: '0', b: '1', c: '1' }).status, 'a-zero');
  assert.equal(computeCross({ a: '2.5', b: '-4', c: '5' }).value, -8);
  assert.equal(computeCross({ a: '1', b: '1', c: '' }).status, 'waiting');
});
