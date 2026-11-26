// Bloquant B1 : passage au jour suivant, sur les vraies données.
// Lancer : node --test tests/test_jour.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerAppli } = require('./charger-appli.js');
const { donneesDemo } = require('./donnees-demo.js');

const { dateParis, decalerJour } = require('../assets/js/date.js');
const jour = (n) => decalerJour(dateParis(), -n);
const AUJ = jour(0);

async function ouvrir(t, { joursFournil = 0, joursLabo = 0, ...opts } = {}) {
  const d = donneesDemo();
  d.state.lastDate = jour(joursFournil);
  d.labo.lastDate = jour(joursLabo);
  const a = await chargerAppli({ etat: d.state, labo: d.labo, recettes: d.recettes, ...opts });
  t.after(() => a.window.close());
  await a.pause(40);
  return { a, d, w: a.window, doc: a.window.document };
}
const etat = (a) => JSON.parse(a.fake.docs.get('boulangerie/state').state);
const labo = (a) => JSON.parse(a.fake.docs.get('boulangerie/labo').state);
const stock = (s, id) => s.products.find((p) => p.id === id).stockReel;
const fen = (doc) => doc.getElementById('mJour');
const ouverte = (doc) => !!fen(doc) && fen(doc).classList.contains('open');

test('un jour manqué : sorties de la veille retirées tout seul (Fournil et Labo), une seule fois', async (t) => {
  const { a, doc } = await ouvrir(t, { joursFournil: 1, joursLabo: 1 });
  assert.equal(ouverte(doc), false, 'pas de question pour un seul jour');
  const s = etat(a);
  assert.equal(s.lastDate, AUJ);
  assert.deepEqual(['croissant', 'pain_choc', 'viennoise', 'brioche', 'pain_raisins'].map((id) => stock(s, id)), [18, 18, 10, 3, 0]);
  assert.ok(s.products.every((p) => p.commande === 0), 'commandes remises à 0');
  assert.equal(s.tasks.filter((x) => x.auto).length, 0, 'tâches automatiques effacées');
  const sortie = s.history.find((h) => h.type === 'sortie' && h.pid === 'croissant' && h.date === AUJ && h.qty === 46);
  assert.ok(sortie, 'sortie de 46 croissants (40 de base + 6 commandés) datée du jour');
  const l = labo(a);
  assert.equal(l.lastDate, AUJ);
  assert.equal(stock(l, 'lp_1'), 4, 'tarte : 12 − (6 + 2)');
  // relancer la vérification ne retire rien de plus
  a.window.fournilJour.verifier('fournil');
  await a.pause(40);
  assert.equal(stock(etat(a), 'croissant'), 18);
  assert.equal(a.fake.nbTransactions(), 2, 'une transaction par module');
});

test('plusieurs jours : aucune fenêtre, aucun retrait du stock', async (t) => {
  const { a, doc } = await ouvrir(t, { joursFournil: 3 });
  assert.equal(ouverte(doc), false, 'aucune fenêtre');
  assert.equal(doc.querySelectorAll('.overlay.open').length, 0);
  const s = etat(a);
  assert.equal(s.lastDate, AUJ);
  assert.equal(stock(s, 'croissant'), 64, 'stock inchangé');
  assert.ok(s.products.every((p) => p.commande === 0), 'commandes remises à 0');
  const sorties = s.history.filter((h) => h.type === 'sortie' && h.id.includes('_j'));
  assert.equal(sorties.length, 0, 'aucune sortie ajoutée');
  assert.match(doc.getElementById('toast').textContent, /3 jours sans ouverture, stock inchangé/);
});

test('deux appareils : si l’autre a déjà passé la journée, rien n’est retiré deux fois', async (t) => {
  const { a } = await ouvrir(t, { joursFournil: 3 });
  assert.equal(etat(a).lastDate, AUJ);
  const autre = etat(a);
  autre.products.find((p) => p.id === 'croissant').stockReel = 100;
  a.fake.externalSet('boulangerie/state', { state: JSON.stringify(autre) });
  await a.pause(40);
  await a.window.fournilJour.appliquer('fournil', 1);
  assert.equal(stock(etat(a), 'croissant'), 100, 'stock de l’autre appareil gardé tel quel');
  assert.match(a.window.document.getElementById('toast').textContent, /déjà été passée sur un autre appareil/);
});

test('hors ligne : appliqué sur l’appareil, envoyé au retour du réseau', async (t) => {
  const { a, w } = await ouvrir(t, { joursFournil: 1, configurerFirebase: (fake) => fake.setHorsLigne(true) });
  assert.equal(w.eval('S.lastDate'), AUJ);
  assert.equal(w.eval("S.products.find(p=>p.id==='croissant').stockReel"), 18);
  assert.ok(a.fake.nbEnAttente() >= 1, 'en attente d’envoi');
  a.fake.setHorsLigne(false);
  await a.pause(40);
  assert.equal(a.fake.nbEnAttente(), 0);
  assert.equal(stock(etat(a), 'croissant'), 18);
});

test('Fournil et Labo en retard de plusieurs jours : aucune question, rien retiré', async (t) => {
  const { a, doc } = await ouvrir(t, { joursFournil: 2, joursLabo: 5 });
  assert.equal(ouverte(doc), false);
  assert.equal(labo(a).lastDate, AUJ);
  assert.equal(etat(a).lastDate, AUJ);
  assert.equal(stock(labo(a), 'lp_1'), 12, 'tarte : stock inchangé');
  assert.equal(stock(etat(a), 'croissant'), 64, 'croissants : stock inchangé');
});
