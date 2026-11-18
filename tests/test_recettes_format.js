// Le module Recettes (écrans de Grigne) garde exactement le format de
// boulangerie/recettes : Fournil en ligne et le Labo doivent continuer à le lire.
// Lancer : node --test tests/test_recettes_format.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chargerAppli } = require('./charger-appli.js');

const core = (f) => import(pathToFileURL(path.join(__dirname, '..', 'recettes', 'src', 'core', f)).href);
const ing = (id, name, qtyG) => ({ id, name, qtyG });
const EXISTANTES = [
  { id: 'r1', name: 'Baguette', ingredients: [ing('a', 'Farine T65', 1000), ing('b', 'Eau', 680), ing('c', 'Sel', 20)], notes: 'Pointage 1 h' },
  { id: 'r2', name: 'Brioche', ingredients: [ing('a', 'Farine T45', 1000), ing('b', 'Beurre', 500)], notes: '', tb: 54, champInconnu: 'gardé' },
];
const cles = (o) => Object.keys(o).sort();
const saisir = (w, input, valeur) => {
  input.value = valeur;
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
};

test("ajouter une recette depuis l'écran Grigne garde le format et ne touche pas aux autres", async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  const w = a.window;
  const doc = w.document;
  w.eval("openModule('fournil');sw('recettes')");
  doc.querySelector('#rc-library-view .lib-add').click();
  const form = doc.querySelector('#rc-library-view .name-input').closest('form, .card, .recipe-form') || doc.getElementById('rc-library-view');
  saisir(w, form.querySelector('.name-input'), 'Pain de mie');
  const ligne = form.querySelector('.ing-list');
  saisir(w, ligne.querySelector('input[type=text]'), 'Farine T45');
  saisir(w, ligne.querySelector('input[type=number]'), '500');
  form.querySelector('.save-btn').click();
  await a.pause(20);

  const base = a.recettesEnBase();
  assert.equal(base.length, 3);
  assert.deepEqual(base.slice(0, 2), EXISTANTES, 'recettes existantes intactes (y compris un champ inconnu)');
  const r = base[2];
  assert.deepEqual(cles(r), ['id', 'ingredients', 'name', 'notes', 'tb']);
  assert.equal(r.name, 'Pain de mie');
  assert.deepEqual(r.ingredients.map(cles), [['id', 'name', 'qtyG']]);
  assert.equal(r.ingredients[0].qtyG, 500);
  assert.equal(typeof r.ingredients[0].qtyG, 'number');
  assert.ok(r.tb === '' || typeof r.tb === 'number');
  assert.deepEqual(a.erreurs, []);
  w.close();
});

test('le Labo voit les mêmes recettes, et une mise à jour venue du serveur est affichée', async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  const w = a.window;
  const doc = w.document;
  w.eval("openModule('labo');swL('recettes')");
  await a.pause(10);
  assert.ok(doc.getElementById('tab-recettes').classList.contains('active'), 'section Recettes visible dans le Labo');
  assert.match(doc.getElementById('rc-library-view').textContent, /Baguette[\s\S]*Brioche/);
  // un autre appareil ajoute une recette
  w.rcApplyRemote({ recipes: JSON.stringify([...EXISTANTES, { id: 'r3', name: 'Fougasse', ingredients: [ing('a', 'Farine T65', 1000)], notes: '' }]) });
  assert.match(doc.getElementById('rc-library-view').textContent, /Fougasse/);
  w.close();
});

test('calculateur : même résultat que le code de Grigne, historique enregistré au même format', async () => {
  const { computeScaling } = await core('recipe-math.js');
  const { formatGrams } = await core('units.js');
  const a = await chargerAppli({ recettes: EXISTANTES });
  const w = a.window;
  const doc = w.document;
  w.eval("openModule('fournil');sw('recettes')");
  doc.querySelector('#tab-recettes .tabs [data-tab="calculator"]').click();
  const vue = doc.getElementById('rc-calculator-view');
  const choix = vue.querySelector('select.picker-v');
  choix.value = 'r1';
  choix.dispatchEvent(new w.Event('change', { bubbles: true }));
  saisir(w, vue.querySelector('.stepper-val input'), '10');
  await a.pause(10);

  const attendu = computeScaling(EXISTANTES[0], { mode: 'total', totalQty: '10', totalUnit: 'kg', pieceRows: [], flourQty: '', flourUnit: 'kg' });
  const texte = vue.textContent.replace(/\s+/g, ' ');
  for (const i of EXISTANTES[0].ingredients) {
    const g = formatGrams(i.qtyG * attendu.factor).replace(/ /g, ' ');
    assert.ok(texte.replace(/ /g, ' ').includes(g), `${i.name} : ${g} attendu`);
  }

  vue.querySelector('.save-calc-btn').click();
  await a.pause(20);
  const doc2 = a.fake.docs.get('boulangerie/recettes');
  const histo = JSON.parse(doc2.calcHistory);
  assert.equal(histo.length, 1);
  assert.deepEqual(cles(histo[0]), ['basis', 'breakdown', 'coefficient', 'id', 'label', 'recipeName', 'targetG', 'timestamp']);
  assert.equal(histo[0].recipeName, 'Baguette');
  assert.deepEqual(JSON.parse(doc2.recipes), EXISTANTES, 'enregistrer un calcul ne réécrit pas les recettes autrement');
  w.close();
});
