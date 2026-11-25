// Étape 6 : calcul du levain, produit en croix et température de l'eau de coulage.
// Ces outils viennent de Grigne, copiés sans modification (tests/test_recettes_grigne.js) :
// les calculs sont exactement ceux de Grigne. Ici : ils sont ouverts à l'équipe et calculent.
// Lancer : node --test tests/test_outils.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerAppli } = require('./charger-appli.js');
const { donneesDemo } = require('./donnees-demo.js');
const E = require('../assets/js/equipe-donnees.js');

async function ouvrirEquipe(t) {
  const d = donneesDemo();
  const m = E.preparerMigration({ state: { state: JSON.stringify(d.state) } });
  const a = await chargerAppli({
    utilisateur: { uid: 'leaUid000001' },
    docs: { 'boulangerie/state': m.state, 'boulangerie/stock': m.stock, 'boulangerie/recettes': { recipes: JSON.stringify(d.recettes) }, 'membres/leaUid000001': { prenom: 'Léa', role: 'equipe' } },
  });
  t.after(() => a.window.close());
  await a.pause(60);
  a.window.eval("sw('recettes')");
  return { a, w: a.window, doc: a.window.document };
}
function saisir(w, champ, valeur) {
  champ.value = valeur;
  champ.dispatchEvent(new w.Event('input'));
}

test('équipe : température de l’eau de coulage = base − (labo + farine)', async (t) => {
  const { w, doc } = await ouvrirEquipe(t);
  doc.getElementById('tab-tb').click();
  const panneau = doc.getElementById('panel-tb');
  assert.equal(panneau.hidden, false);
  const champs = panneau.querySelectorAll('input[type=number]');
  assert.equal(champs.length, 3);
  saisir(w, champs[0], '56');
  saisir(w, champs[1], '22');
  saisir(w, champs[2], '19');
  assert.match(panneau.textContent, /15,0\s°C/);
});

test('équipe : produit en croix', async (t) => {
  const { w, doc } = await ouvrirEquipe(t);
  doc.getElementById('tab-croix').click();
  const panneau = doc.getElementById('panel-croix');
  assert.equal(panneau.hidden, false);
  const champs = panneau.querySelectorAll('input[type=number]');
  saisir(w, champs[0], '1000');
  saisir(w, champs[1], '20');
  saisir(w, champs[2], '2500');
  assert.match(panneau.textContent, /50/);
});

test('équipe : calcul du levain ouvert', async (t) => {
  const { doc } = await ouvrirEquipe(t);
  doc.getElementById('tab-levain').click();
  const panneau = doc.getElementById('panel-levain');
  assert.equal(panneau.hidden, false);
  assert.ok(panneau.querySelector('input'), 'champs du levain');
  assert.match(panneau.textContent, /1-1-1|1 : 1 : 1|Rafraîchi|levain/i);
});
