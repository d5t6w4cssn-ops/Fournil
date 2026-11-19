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
async function cliquer(a, doc, action) {
  fen(doc).querySelector(`[data-action=${action}]`).click();
  await a.pause(40);
}

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

test('plusieurs jours : on demande combien, 1 proposé par défaut', async (t) => {
  const { a, doc } = await ouvrir(t, { joursFournil: 3 });
  assert.equal(ouverte(doc), true);
  const texte = fen(doc).textContent.replace(/\s+/g, ' ');
  assert.match(texte, /il y a 3 jours/);
  assert.equal(fen(doc).querySelector('#jourNb').value, '1');
  assert.match(texte, /Croissant : −46/);
  assert.match(fen(doc).querySelector('[data-action=appliquer]').textContent, /Retirer 1 jour de sorties/);
  assert.equal(etat(a).lastDate, jour(3), 'rien de changé avant la réponse');
  await cliquer(a, doc, 'appliquer');
  const s = etat(a);
  assert.equal(s.lastDate, AUJ);
  assert.equal(stock(s, 'croissant'), 18);
  assert.equal(ouverte(doc), false);
});

test('plusieurs jours : en retirer 3 (base seulement après le premier jour, jamais sous 0)', async (t) => {
  const { a, doc } = await ouvrir(t, { joursFournil: 3 });
  const plus = fen(doc).querySelector('[data-pas="1"]');
  plus.click(); plus.click(); plus.click(); // ne dépasse pas 3
  assert.equal(fen(doc).querySelector('#jourNb').value, '3');
  assert.match(fen(doc).textContent, /Croissant : −64/);
  await cliquer(a, doc, 'appliquer');
  const s = etat(a);
  assert.equal(stock(s, 'croissant'), 0);
  assert.equal(stock(s, 'pain_choc'), 0);
  const sorties = s.history.filter((h) => h.type === 'sortie' && h.pid === 'croissant' && h.id.includes('_j'));
  assert.deepEqual(sorties.map((h) => [h.date, h.qty]).sort(), [[jour(2), 46], [jour(1), 18]].sort(), 'chaque sortie datée de son jour');
});

test('0 jour : la date passe à aujourd’hui, le stock ne bouge pas', async (t) => {
  const { a, d, doc } = await ouvrir(t, { joursFournil: 4 });
  const champ = fen(doc).querySelector('#jourNb');
  champ.value = '0';
  champ.dispatchEvent(new a.window.Event('input'));
  assert.match(fen(doc).querySelector('[data-action=appliquer]').textContent, /Ne rien retirer/);
  await cliquer(a, doc, 'appliquer');
  const s = etat(a);
  assert.equal(s.lastDate, AUJ);
  assert.deepEqual(s.products.map((p) => p.stockReel), d.state.products.map((p) => p.stockReel));
});

test('« Plus tard » : rien ne change et la question ne revient pas avant la prochaine ouverture', async (t) => {
  const { a, w, doc } = await ouvrir(t, { joursFournil: 3 });
  const avant = a.fake.writes.length;
  await cliquer(a, doc, 'plus-tard');
  assert.equal(ouverte(doc), false);
  assert.equal(etat(a).lastDate, jour(3));
  w.fournilJour.verifier('fournil');
  await a.pause(20);
  assert.equal(ouverte(doc), false);
  assert.equal(a.fake.writes.length, avant, 'rien écrit');
});

test('deux appareils : si l’autre a déjà passé la journée, rien n’est retiré deux fois', async (t) => {
  const { a, doc } = await ouvrir(t, { joursFournil: 3 });
  // pendant que la question est affichée, un autre appareil passe la journée
  const autre = etat(a);
  autre.lastDate = AUJ;
  autre.products.find((p) => p.id === 'croissant').stockReel = 100;
  a.fake.externalSet('boulangerie/state', { state: JSON.stringify(autre) });
  await cliquer(a, doc, 'appliquer');
  assert.equal(stock(etat(a), 'croissant'), 100, 'stock de l’autre appareil gardé tel quel');
  assert.match(doc.getElementById('toast').textContent, /déjà été passée sur un autre appareil/);
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

test('Fournil et Labo en retard de plusieurs jours : deux questions, l’une après l’autre', async (t) => {
  const { a, doc } = await ouvrir(t, { joursFournil: 2, joursLabo: 5 });
  assert.match(fen(doc).textContent, /Fournil : nouvelle journée[\s\S]*il y a 2 jours/);
  await cliquer(a, doc, 'appliquer');
  assert.equal(ouverte(doc), true, 'la question du Labo suit');
  assert.match(fen(doc).textContent, /Labo : nouvelle journée[\s\S]*il y a 5 jours/);
  await cliquer(a, doc, 'appliquer');
  assert.equal(labo(a).lastDate, AUJ);
  assert.equal(etat(a).lastDate, AUJ);
});
