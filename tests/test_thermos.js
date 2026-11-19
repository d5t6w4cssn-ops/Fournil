// Thermomètres retirés : plus aucun affichage ni appel réseau, mais les anciennes
// données (S.thermos) restent intactes dans boulangerie/state (format inchangé).
// Lancer : node --test tests/test_thermos.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerAppli } = require('./charger-appli.js');

const today = require('../assets/js/date.js').dateParis();
const anciennes = [
  { id: 'th_1', name: 'Chambre froide', mode: 'tuya', clientId: 'abc', secret: 'chut', deviceId: 'dev', temp: null, hum: null, maxTemp: 5 },
  { id: 'th_2', name: 'Congélateur', mode: 'ip', ip: '192.168.1.42', temp: -18, hum: 40, maxTemp: -15 },
];
const etat = { products: [{ id: 'p_1', name: 'Croissant', emoji: '🥐', stockReel: 5, base: 0, commande: 0, seuil: 2 }], tasks: [], lastDate: today, history: [], thermos: anciennes, notes: [], boulangers: [], freeNotes: '', journal: {} };

test("plus aucune trace des thermomètres dans l'interface", async () => {
  const a = await chargerAppli({ etat });
  const w = a.window;
  const doc = w.document;
  for (const t of ['stock', 'settings']) { w.eval(`openModule('fournil');sw('${t}')`); await a.pause(5); }
  assert.equal(doc.getElementById('mThermo'), null, "plus de fenêtre d'ajout");
  assert.equal(doc.getElementById('thermoCards'), null, 'plus de cartes dans le Stock');
  const visible = doc.body.cloneNode(true);
  visible.querySelectorAll('script, style').forEach((e) => e.remove());
  assert.doesNotMatch(visible.textContent, /thermom|Chambre froide|192\.168/i);
  for (const f of ['addThermo', 'delThermo', 'renderThermos', 'renderThermoCards', 'fetchThermo']) {
    assert.equal(typeof w[f], 'undefined', `${f} n'existe plus`);
  }
  await a.pause(50);
  assert.deepEqual(a.reseau, [], 'aucun appel réseau vers une sonde');
  assert.deepEqual(a.erreurs, []);
  w.close();
});

test('les anciennes données de thermomètres restent intactes après un enregistrement', async () => {
  const a = await chargerAppli({ etat });
  const w = a.window;
  w.eval("openModule('fournil');sw('stock')");
  w.eval('save()');
  await a.pause(20);
  const s = JSON.parse(a.fake.docs.get('boulangerie/state').state);
  assert.deepEqual(s.thermos, anciennes);
  w.close();
});
