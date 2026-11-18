import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, exportFileName, exportText, mergeImport, parseExport, EXPORT_VERSION } from '../../recettes/src/core/export.js';

const PAIN = {
  id: 'r1',
  name: 'Pain',
  ingredients: [
    { id: 'i1', name: 'Farine T65', qtyG: 1000 },
    { id: 'i2', name: 'Eau', qtyG: 680 },
  ],
  notes: 'Pointage 1 h',
  tb: 56,
};
const BRIOCHE = { id: 'r2', name: 'Brioche', ingredients: [{ id: 'i1', name: 'Farine T45', qtyG: 500 }], notes: '', tb: '' };
const HIST = { id: 'h1', timestamp: 1000, recipeName: 'Pain', label: null, targetG: 3000, coefficient: 1.78, basis: 'total', breakdown: [] };
const DATE = new Date(2026, 10, 17, 9, 30);
let n = 0;
const makeId = () => `n${++n}`;

test('export : nom du fichier daté', () => {
  assert.equal(exportFileName(DATE), 'grigne-recettes-2026-11-17.json');
  assert.equal(exportFileName(new Date(2027, 0, 5)), 'grigne-recettes-2027-01-05.json');
});

test('export : en-tête et recettes complètes', () => {
  const out = buildExport([PAIN, BRIOCHE], [HIST], DATE);
  assert.equal(out.app, 'grigne');
  assert.equal(out.version, EXPORT_VERSION);
  assert.equal(out.version, 2);
  assert.equal(out.exportedAt, DATE.toISOString());
  assert.equal(out.recipeCount, 2);
  assert.deepEqual(out.recipes[0], {
    id: 'r1',
    name: 'Pain',
    ingredients: [
      { id: 'i1', name: 'Farine T65', qtyG: 1000, unit: 'g' },
      { id: 'i2', name: 'Eau', qtyG: 680, unit: 'g' },
    ],
    notes: 'Pointage 1 h',
    tb: 56,
  });
  assert.equal(out.recipes[1].tb, null, 'TB absente : null');
  assert.deepEqual(out.history, [HIST]);
});

test('export puis lecture : on retrouve les mêmes recettes', () => {
  const back = parseExport(exportText([PAIN, BRIOCHE], [HIST], DATE));
  assert.deepEqual(back.recipes, [PAIN, BRIOCHE]);
  assert.deepEqual(back.history, [HIST]);
});

test('lecture : fichiers refusés', () => {
  assert.deepEqual(parseExport('pas du json'), { error: 'json' });
  assert.deepEqual(parseExport('{"app":"autre","recipes":[]}'), { error: 'format' });
  assert.deepEqual(parseExport('{"app":"grigne"}'), { error: 'format' });
  assert.deepEqual(parseExport('null'), { error: 'format' });
  assert.deepEqual(parseExport('{"app":"grigne","version":3,"recipes":[]}'), { error: 'version' });
});

test('lecture : anciennes sauvegardes (version 1) acceptées', () => {
  const v1 = JSON.stringify({ app: 'grigne', version: 1, recipes: [PAIN], history: [] });
  assert.deepEqual(parseExport(v1).recipes, [PAIN]);
  const sansVersion = JSON.stringify({ app: 'grigne', recipes: [PAIN] });
  assert.deepEqual(parseExport(sansVersion).recipes, [PAIN]);
});

test('lecture : le contenu passe par sanitizeRecipes', () => {
  const sale = JSON.stringify({
    app: 'grigne',
    version: 2,
    recipes: [
      { id: 'x', name: '<b>Pain</b>', ingredients: [{ name: 'Farine', qtyG: 100 }, { name: 'Eau', qtyG: -5 }, { name: 'Sel', qtyG: 'beaucoup' }], tb: 'chaud' },
      { name: '', ingredients: [{ name: 'Farine', qtyG: 1 }] },
      'texte',
    ],
  });
  const { recipes, history } = parseExport(sale);
  assert.equal(recipes.length, 1);
  assert.equal(recipes[0].name, '<b>Pain</b>', 'gardé tel quel : échappé à l’affichage');
  assert.deepEqual(recipes[0].ingredients.map((i) => i.name), ['Farine']);
  assert.equal(recipes[0].tb, '');
  assert.deepEqual(history, []);
});

test('import : ajoute sans écraser, ignore les doublons exacts', () => {
  const current = { recipes: [PAIN], history: [] };
  const modifie = { ...PAIN, ingredients: [{ id: 'i1', name: 'Farine T65', qtyG: 1000 }, { id: 'i2', name: 'Eau', qtyG: 700 }] };
  const r = mergeImport(current, { recipes: [{ ...PAIN, id: 'autre' }, modifie, BRIOCHE], history: [HIST] }, makeId);
  assert.equal(r.skipped, 1, 'le Pain identique (même sous un autre identifiant) est ignoré');
  assert.equal(r.added, 2);
  assert.deepEqual(r.recipes[0], PAIN, 'la recette existante est intacte');
  const copie = r.recipes[1];
  assert.notEqual(copie.id, 'r1', 'identifiant déjà pris : nouvel identifiant');
  assert.equal(copie.name, 'Pain (importée)', 'nom déjà pris : renommée');
  assert.equal(copie.ingredients[1].qtyG, 700);
  assert.deepEqual(r.recipes[2], BRIOCHE);
  assert.deepEqual(r.history, [HIST]);
  assert.equal(new Set(r.recipes.map((x) => x.id)).size, 3);
});

test('import : deuxième import du même fichier sans effet', () => {
  const file = { recipes: [PAIN, BRIOCHE], history: [HIST] };
  const once = mergeImport({ recipes: [], history: [] }, file, makeId);
  const twice = mergeImport({ recipes: once.recipes, history: once.history }, file, makeId);
  assert.equal(twice.added, 0);
  assert.equal(twice.skipped, 2);
  assert.deepEqual(twice.recipes, once.recipes);
  assert.deepEqual(twice.history, once.history);
});

test('import : noms renommés sans collision, historique limité à 20', () => {
  const autre = (qty) => ({ ...BRIOCHE, id: `b${qty}`, ingredients: [{ id: 'i', name: 'Farine', qtyG: qty }] });
  const r = mergeImport({ recipes: [BRIOCHE], history: [] }, { recipes: [autre(1), autre(2)], history: [] }, makeId);
  assert.deepEqual(r.recipes.map((x) => x.name), ['Brioche', 'Brioche (importée)', 'Brioche (importée 2)']);
  const many = Array.from({ length: 25 }, (_, k) => ({ ...HIST, id: `h${k}`, timestamp: k }));
  const h = mergeImport({ recipes: [], history: many.slice(0, 10) }, { recipes: [], history: many.slice(5) }, makeId).history;
  assert.equal(h.length, 20);
  assert.equal(h[0].timestamp, 24, 'du plus récent au plus ancien');
  assert.equal(new Set(h.map((x) => x.id)).size, 20);
});
