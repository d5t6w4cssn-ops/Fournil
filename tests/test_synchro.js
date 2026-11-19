// Bloquant B2 : un enregistrement qui échoue ne passe plus inaperçu.
// Persistance hors ligne, état réel (Synchronisé / Pas encore envoyé / Hors ligne),
// message clair et « Réessayer » si le serveur refuse.
// Lancer : node --test tests/test_synchro.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerAppli } = require('./charger-appli.js');
const { donneesDemo } = require('./donnees-demo.js');

async function ouvrir(t, opts = {}) {
  const d = donneesDemo();
  const a = await chargerAppli({ etat: d.state, labo: d.labo, recettes: d.recettes, ...opts });
  t.after(() => a.window.close());
  a.window.eval("openModule('fournil');sw('tasks')");
  return { a, w: a.window, doc: a.window.document };
}
const badge = (doc) => doc.querySelector('#hdrFournil .etat-synchro').textContent;
const bandeau = (doc) => doc.getElementById('bandeauSynchro');
function ajouterTache(w, texte) {
  w.eval(`openM('mTask');document.getElementById('taskInput').value=${JSON.stringify(texte)};addTask();`);
}
const taches = (a) => JSON.parse(a.fake.docs.get('boulangerie/state').state).tasks.map((x) => x.text);

test('la persistance hors ligne est activée avant toute lecture', async (t) => {
  const { a } = await ouvrir(t);
  assert.equal(a.fake.journal[0], 'persistance');
  assert.equal(JSON.stringify(a.fake.persistance()), JSON.stringify({ synchronizeTabs: true }));
  await a.pause(30);
});

test('en ligne : « Synchronisé » une fois la donnée arrivée au serveur', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  assert.equal(badge(doc), 'Synchronisé');
  assert.equal(doc.getElementById('syncTxt').textContent, 'Synchronisé');
  ajouterTache(w, 'Nettoyer le four');
  await a.pause(30);
  assert.equal(badge(doc), 'Synchronisé');
  assert.ok(taches(a).includes('Nettoyer le four'));
});

test('réseau lent : « Pas encore envoyé » tant que le serveur n’a pas confirmé', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  a.fake.setHorsLigne(true); // le réseau ne répond plus, sans que le navigateur le sache
  ajouterTache(w, 'Tâche en attente');
  await a.pause(30);
  assert.equal(badge(doc), 'Pas encore envoyé');
  a.fake.setHorsLigne(false);
  await a.pause(30);
  assert.equal(badge(doc), 'Synchronisé');
});

test('hors ligne : la saisie est gardée, « Hors ligne », puis envoyée au retour du réseau', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  a.fake.setHorsLigne(true);
  w.dispatchEvent(new w.Event('offline'));
  await a.pause(10);
  assert.equal(badge(doc), 'Hors ligne');
  ajouterTache(w, 'Saisie sans réseau');
  await a.pause(30);
  assert.equal(badge(doc), 'Hors ligne · pas encore envoyé');
  assert.equal(a.fake.nbEnAttente(), 1, "gardée sur l'appareil, en attente d'envoi");
  assert.equal(bandeau(doc), null, "pas d'erreur : c'est normal hors ligne");
  a.fake.setHorsLigne(false);
  w.dispatchEvent(new w.Event('online'));
  await a.pause(30);
  assert.equal(a.fake.nbEnAttente(), 0);
  assert.equal(badge(doc), 'Synchronisé');
  assert.ok(taches(a).includes('Saisie sans réseau'));
});

test('envoi refusé : message clair, « Erreur d’envoi », Réessayer renvoie les mêmes données', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  a.fake.refuserProchainEnvoi('permission-denied');
  const avant = a.fake.writes.length;
  ajouterTache(w, 'Tâche refusée');
  await a.pause(30);
  assert.equal(badge(doc), "Erreur d'envoi");
  const b = bandeau(doc);
  assert.ok(b && !b.hidden, 'bandeau visible');
  assert.match(b.textContent, /Pas enregistré \(Fournil\)/);
  assert.match(b.textContent, /n'a pas le droit d'écrire/);
  const refuse = a.fake.writes[a.fake.writes.length - 1];
  b.querySelector('.bandeau-reessayer').click();
  await a.pause(30);
  const renvoye = a.fake.writes[a.fake.writes.length - 1];
  assert.equal(a.fake.writes.length, avant + 2);
  assert.deepEqual(renvoye.data, refuse.data, 'mêmes données renvoyées');
  assert.equal(b.hidden, true);
  assert.equal(badge(doc), 'Synchronisé');
  assert.ok(taches(a).includes('Tâche refusée'));
});

test('messages selon la cause : session expirée, données trop lourdes', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  a.fake.refuserProchainEnvoi('unauthenticated');
  ajouterTache(w, 'A');
  await a.pause(30);
  assert.match(bandeau(doc).textContent, /session a expiré/);
  bandeau(doc).querySelector('.bandeau-fermer').click();
  assert.equal(bandeau(doc).hidden, true);
  a.fake.refuserProchainEnvoi('invalid-argument');
  ajouterTache(w, 'B');
  await a.pause(30);
  assert.equal(bandeau(doc).hidden, false);
  assert.match(bandeau(doc).textContent, /trop lourdes/);
});

test('recettes : un envoi refusé est aussi signalé', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  w.eval("sw('recettes')");
  a.fake.refuserProchainEnvoi('permission-denied');
  doc.querySelector('#tab-recettes .tabs [data-tab="calculator"]').click();
  const vue = doc.getElementById('rc-calculator-view');
  const champ = vue.querySelector('.stepper-val input');
  champ.value = '10';
  champ.dispatchEvent(new w.Event('input', { bubbles: true }));
  vue.querySelector('.save-calc-btn').click();
  await a.pause(30);
  assert.match(bandeau(doc).textContent, /Pas enregistré \(Recettes\)/);
});

test('persistance indisponible sur le navigateur : l’appli marche quand même et le dit', async (t) => {
  const { a, w, doc } = await ouvrir(t, { configurerFirebase: (fake) => fake.setEchecPersistance('unimplemented') });
  await a.pause(30);
  assert.match(doc.getElementById('toast').textContent, /Mode hors ligne indisponible/);
  ajouterTache(w, 'Sans persistance');
  await a.pause(30);
  assert.ok(taches(a).includes('Sans persistance'));
  assert.equal(badge(doc), 'Synchronisé');
});
