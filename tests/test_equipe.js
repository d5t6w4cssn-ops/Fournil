// Rôle « équipe » dans l'appli (jsdom + faux Firebase qui imite les règles).
// Les vraies règles sont testées sur l'émulateur : tests/regles/ (npm run test:regles).
// Lancer : node --test tests/test_equipe.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerAppli } = require('./charger-appli.js');
const { donneesDemo } = require('./donnees-demo.js');
const E = require('../assets/js/equipe-donnees.js');

const LEA = { uid: 'leaUid000001', email: 'lea@exemple.fr' };
const FICHE_LEA = { 'membres/leaUid000001': { prenom: 'Léa', role: 'equipe' } };

/** Données après la migration « équipe » (même fonction que la vraie migration). */
function docsMigres(d, avecCalculs = true) {
  const m = E.preparerMigration({
    state: { state: JSON.stringify(d.state) },
    recettes: { recipes: JSON.stringify(d.recettes), calcHistory: JSON.stringify(d.calcHistory) },
  }, { maintenant: Date.now() });
  const docs = {
    'boulangerie/state': m.state,
    'boulangerie/stock': m.stock,
    'boulangerie/labo': { state: JSON.stringify(d.labo) },
    'boulangerie/recettes': { recipes: JSON.stringify(d.recettes) },
  };
  if (avecCalculs) m.calculs.forEach((c) => { docs[`calculs/${c.id}`] = c.doc; });
  return docs;
}

async function ouvrir(t, { utilisateur, docs, migre = true, avecCalculs = true } = {}) {
  const d = donneesDemo();
  const opts = migre
    ? { docs: { ...docsMigres(d, avecCalculs), ...(docs || {}) } }
    : { etat: d.state, labo: d.labo, recettes: d.recettes, docs };
  const a = await chargerAppli({ ...opts, utilisateur });
  t.after(() => a.window.close());
  await a.pause(60);
  const w = a.window;
  w.confirm = () => true;
  const toasts = [];
  const t0 = w.toast;
  w.toast = (m) => { toasts.push(m); t0(m); };
  return { a, d, w, doc: w.document, toasts };
}
const stock = (a) => JSON.parse(a.fake.docs.get('boulangerie/stock').state);
const reste = (a) => JSON.parse(a.fake.docs.get('boulangerie/state').state);
const ecritures = (a, chemin) => a.fake.writes.filter((x) => x.path === chemin);

test('administrateur, données migrées : le stock est lu et écrit dans boulangerie/stock, le reste dans state', async (t) => {
  const { a, d, w, doc } = await ouvrir(t);
  assert.equal(w.fournilAcces.role(), 'admin');
  assert.equal(w.fournilAcces.mode(), 'separe');
  assert.equal(w.eval('S.products.length'), d.state.products.length);
  assert.equal(w.eval('S.tasks.length'), d.state.tasks.length, 'tâches lues dans state');
  const avantState = ecritures(a, 'boulangerie/state').length;
  w.eval("openModule('fournil');sw('stock')");
  doc.querySelector('.stock-rapide[data-id="croissant"] [data-sens="1"]').click();
  await a.pause(40);
  const s = stock(a);
  assert.equal(s.products.find((p) => p.id === 'croissant').stockReel, 65);
  assert.equal(s.history[0].type, 'ajustement');
  assert.equal(s.history[0].par, 'Responsable', 'auteur : prénom par défaut du responsable');
  assert.ok(s.history[0].t > 0, 'heure gardée');
  assert.equal(reste(a).products, undefined, 'le stock ne retourne pas dans state');
  assert.ok(ecritures(a, 'boulangerie/state').length <= avantState + 1);
  // une tâche : écrite dans state, le stock ne bouge pas
  const nbStock = ecritures(a, 'boulangerie/stock').length;
  w.eval("toggleTask('t_1')");
  await a.pause(40);
  assert.equal(reste(a).tasks.find((x) => x.id === 't_1').done, true);
  assert.equal(ecritures(a, 'boulangerie/stock').length, nbStock, 'pas d’écriture du stock pour une tâche');
  assert.deepEqual(a.erreurs, []);
});

test('équipe : ouvre le Stock directement, jamais d’accès interdit tenté', async (t) => {
  const { a, w, doc } = await ouvrir(t, { utilisateur: LEA, docs: FICHE_LEA });
  assert.equal(w.fournilAcces.role(), 'equipe');
  assert.ok(doc.body.classList.contains('role-equipe'));
  assert.equal(w.eval('activeModule'), 'fournil');
  assert.equal(w.eval('S.products.length'), 5);
  assert.equal(w.eval('S.tasks.length'), 0, 'aucune tâche chargée');
  // écrans interdits : refusés même appelés directement
  w.eval("openModule('labo')");
  assert.equal(w.eval('activeModule'), 'fournil');
  w.eval("openModule('bureau')");
  assert.equal(w.eval('activeModule'), 'fournil');
  for (const o of ['tasks', 'magasin', 'calendrier', 'settings']) {
    w.eval(`sw('${o}')`);
    assert.equal(w.eval('tab'), 'stock', `onglet ${o} refusé`);
  }
  w.eval("sw('histo')");
  assert.equal(w.eval('tab'), 'histo', 'l’historique du stock est permis');
  w.eval("sw('recettes')");
  assert.equal(w.eval('tab'), 'recettes');
  assert.deepEqual(a.fake.refus, [], 'aucune lecture ni écriture interdite tentée');
  assert.ok(!a.fake.journal.includes('ecoute:boulangerie/state'));
  assert.ok(!a.fake.journal.includes('ecoute:boulangerie/labo'));
});

test('équipe : ajouter et retirer du stock, signé de son prénom dans l’historique', async (t) => {
  const { a, w, doc } = await ouvrir(t, { utilisateur: LEA, docs: FICHE_LEA });
  w.eval("sw('stock')");
  doc.querySelector('.stock-rapide[data-id="croissant"] [data-sens="1"]').click();
  doc.querySelector('.stock-rapide[data-id="croissant"] [data-sens="1"]').click();
  await a.pause(40);
  doc.querySelector('.stock-rapide[data-id="brioche"] .stock-motif').click();
  const f = doc.getElementById('mStockFenetre');
  f.querySelector('#srQte').value = '2';
  f.querySelector('#srMotif').value = 'casse';
  f.querySelector('[data-action=retirer]').click();
  await a.pause(40);
  const s = stock(a);
  assert.equal(s.products.find((p) => p.id === 'croissant').stockReel, 66);
  assert.equal(s.products.find((p) => p.id === 'brioche').stockReel, 7);
  const lignes = s.history.filter((h) => h.par === 'Léa');
  assert.deepEqual(lignes.map((h) => h.type).sort(), ['ajustement', 'retrait']);
  assert.ok(lignes.every((h) => h.parUid === LEA.uid && h.t > 0));
  w.eval("sw('histo')");
  assert.match(doc.getElementById('histoList').textContent, /par Léa · \d\d:\d\d/);
  // ni les tâches ni le Labo ne sont écrits
  assert.equal(ecritures(a, 'boulangerie/state').length, 0);
  assert.equal(ecritures(a, 'boulangerie/labo').length, 0);
  assert.deepEqual(a.fake.refus, []);
  // l'équipe ne supprime pas l'historique
  const n = stock(a).history.length;
  w.eval(`delHistoEntry(${JSON.stringify(s.history[0].id)})`);
  w.eval('clearHisto()');
  await a.pause(30);
  assert.equal(stock(a).history.length, n);
});

test('deux personnes en même temps : les deux changements sont gardés', async (t) => {
  const { a, w, doc } = await ouvrir(t, { utilisateur: LEA, docs: FICHE_LEA });
  w.eval("sw('stock')");
  // un autre appareil retire 10 croissants, Léa ne l'a pas encore reçu
  const autre = stock(a);
  autre.products.find((p) => p.id === 'croissant').stockReel -= 10;
  autre.history.unshift({ id: 'h_autre', type: 'retrait', pid: 'croissant', qty: 10, par: 'Sam' });
  a.fake.externalSet('boulangerie/stock', { state: JSON.stringify(autre) });
  doc.querySelector('.stock-rapide[data-id="croissant"] [data-sens="1"]').click();
  await a.pause(60);
  const s = stock(a);
  assert.equal(s.products.find((p) => p.id === 'croissant').stockReel, 64 - 10 + 1);
  assert.ok(s.history.some((h) => h.id === 'h_autre'), 'la ligne de Sam est gardée');
  assert.ok(s.history.some((h) => h.par === 'Léa'), 'la ligne de Léa est ajoutée');
  assert.equal(w.eval("S.products.find(p=>p.id==='croissant').stockReel"), 55, 'affichage à jour');
  await a.pause(100);
});

test('équipe : recettes en consultation seulement, calculs permis', async (t) => {
  const { a, w, doc, toasts } = await ouvrir(t, { utilisateur: LEA, docs: FICHE_LEA });
  w.eval("sw('recettes')");
  const avant = a.fake.docs.get('boulangerie/recettes').recipes;
  // même si le bouton est cliqué (il est caché par le style), rien n'est enregistré
  doc.querySelector('#rc-library-view .del-btn').click();
  await a.pause(30);
  assert.equal(a.fake.docs.get('boulangerie/recettes').recipes, avant);
  assert.ok(toasts.some((m) => /consultation seulement/.test(m)));
  assert.equal(doc.querySelectorAll('#rc-library-view .recipe-row').length, 4, 'la liste revient comme sur le serveur');
  assert.deepEqual(a.fake.refus, []);
});

test('calculs partagés : prénom de l’auteur, chacun supprime les siens', async (t) => {
  const { a, w, doc } = await ouvrir(t, { utilisateur: LEA, docs: FICHE_LEA });
  w.eval("sw('recettes')");
  doc.getElementById('tab-calculator').click();
  await a.pause(20);
  const vue = () => doc.getElementById('rc-calculator-view');
  // calcul de l'administrateur (migré) : affiché avec son auteur, sans bouton Supprimer pour Léa
  const ligneAdmin = [...vue().querySelectorAll('.history-item')].find((r) => /Fournée du matin/.test(r.textContent));
  assert.ok(ligneAdmin, 'calcul migré affiché');
  assert.equal(ligneAdmin.querySelector('.del-btn'), null);
  // Léa enregistre un calcul
  const champ = vue().querySelector('.stepper input');
  champ.value = '10';
  champ.dispatchEvent(new w.Event('input'));
  vue().querySelector('.calc-label-input').value = 'Tournée de Léa';
  vue().querySelector('.save-calc-btn').click();
  await a.pause(60);
  const docs = [...a.fake.docs.entries()].filter(([k]) => k.startsWith('calculs/'));
  const sien = docs.find(([, v]) => v.auteurUid === LEA.uid);
  assert.ok(sien, 'calcul enregistré dans calculs/');
  assert.equal(sien[1].auteurPrenom, 'Léa');
  assert.equal(JSON.parse(sien[1].calcul).label, 'Tournée de Léa');
  const ligne = [...vue().querySelectorAll('.history-item')].find((r) => /Tournée de Léa/.test(r.textContent));
  assert.match(ligne.textContent, /par Léa/);
  assert.equal(docs.length, 2);
  // elle supprime le sien
  ligne.querySelector('.del-btn').click();
  await a.pause(60);
  assert.equal(a.fake.docs.has(sien[0]), false);
  assert.ok([...a.fake.docs.keys()].some((k) => k === 'calculs/c_1'), 'celui de l’administrateur reste');
  assert.deepEqual(a.fake.refus, []);
});

test('administrateur : supprime aussi les calculs des autres', async (t) => {
  const autre = E.calculVersDoc({ id: 'c_sam', timestamp: Date.now(), recipeName: 'Pain de campagne', label: 'Essai de Sam', targetG: 1000, coefficient: 1, basis: 'farine', breakdown: [] }, { uid: 'samUid0000001', prenom: 'Sam' });
  const { a, doc, w } = await ouvrir(t, { docs: { 'calculs/c_sam': autre.doc } });
  w.eval("openModule('fournil');sw('recettes')");
  doc.getElementById('tab-calculator').click();
  await a.pause(20);
  const ligne = [...doc.querySelectorAll('#rc-calculator-view .history-item')].find((r) => /Essai de Sam/.test(r.textContent));
  assert.match(ligne.textContent, /par Sam/);
  ligne.querySelector('.del-btn').click();
  await a.pause(40);
  assert.equal(a.fake.docs.has('calculs/c_sam'), false);
});

test('alerte de seuil bas : au passage sous le seuil, pas avant', async (t) => {
  const { a, w, doc, toasts } = await ouvrir(t, { utilisateur: LEA, docs: FICHE_LEA });
  w.eval("sw('stock')");
  // Viennoise : 22 en stock, 12 de base → 10 dispo, seuil 15 : déjà faible, pas d'alerte
  // Pain au chocolat : 48 − 30 = 18 dispo, seuil 20 : déjà faible aussi
  // Croissant : 64 − 46 = 18 dispo, seuil 20 → faible ; on monte d'abord au-dessus
  w.eval("S.products.find(p=>p.id==='croissant').stockReel=70;save()");
  await a.pause(40);
  assert.equal(doc.getElementById('alerteSeuil'), null);
  for (let i = 0; i < 4; i++) doc.querySelector('.stock-rapide[data-id="croissant"] [data-sens="-1"]').click();
  await a.pause(40);
  const b = doc.getElementById('alerteSeuil');
  assert.ok(b, 'alerte affichée');
  assert.match(b.textContent, /Croissant : 20 dispo \(seuil 20\)/);
  assert.ok(toasts.some((m) => /Croissant sous le seuil/.test(m)));
  b.querySelector('.alerte-fermer').click();
  assert.equal(doc.getElementById('alerteSeuil'), null);
  await a.pause(100);
});

test('alerte de seuil : aussi quand un autre appareil fait passer sous le seuil', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  w.eval("openModule('fournil');sw('stock')");
  const autre = stock(a);
  autre.products.find((p) => p.id === 'croissant').stockReel = 100;
  a.fake.externalSet('boulangerie/stock', { state: JSON.stringify(autre) });
  await w.fournilAcces.actualiser();
  await a.pause(20);
  assert.equal(doc.getElementById('alerteSeuil'), null);
  autre.products.find((p) => p.id === 'croissant').stockReel = 50;
  a.fake.externalSet('boulangerie/stock', { state: JSON.stringify(autre) });
  await w.fournilAcces.actualiser();
  await a.pause(20);
  assert.match(doc.getElementById('alerteSeuil').textContent, /Croissant : 4 dispo/);
});

test('équipe avant la migration : message d’attente, rien n’est écrit', async (t) => {
  const { a, w, doc } = await ouvrir(t, { utilisateur: LEA, docs: FICHE_LEA, migre: false });
  assert.match(doc.getElementById('accesMessage').textContent, /pas encore prêt pour l’équipe/);
  assert.equal(w.fournilAcces.mode(), 'ancien');
  w.eval('save()');
  await a.pause(20);
  assert.equal(a.fake.writes.length, 0);
  assert.deepEqual(a.fake.refus, []);
});

test('compte inconnu : aucun accès, message clair', async (t) => {
  const { a, w, doc } = await ouvrir(t, { utilisateur: { uid: 'inconnu00001' } });
  assert.equal(w.fournilAcces.role(), 'aucun');
  assert.match(doc.getElementById('accesMessage').textContent, /pas encore accès/);
  w.eval("openModule('fournil')");
  assert.equal(w.eval('activeModule'), null);
  assert.equal(a.fake.writes.length, 0);
  assert.deepEqual(a.fake.refus.filter((r) => r.path.startsWith('boulangerie')), [], 'aucune donnée demandée');
});

test('Réglages → Équipe : préparer les données (migration), ajouter un membre', async (t) => {
  const d0 = donneesDemo();
  const { a, w, doc } = await ouvrir(t, { migre: false, docs: { 'boulangerie/recettes': { recipes: JSON.stringify(d0.recettes), calcHistory: JSON.stringify(d0.calcHistory) } } });
  w.eval("openModule('fournil');sw('settings')");
  const carte = () => doc.querySelector('#settingsList .carte-equipe');
  assert.ok(carte(), 'carte Équipe');
  assert.match(carte().textContent, /pas encore préparées/);
  carte().querySelector('[data-equipe=migrer]').click();
  await a.pause(80);
  assert.ok(a.fake.docs.has('boulangerie/stock'), 'stock séparé');
  assert.ok([...a.fake.docs.keys()].some((k) => k.startsWith('sauvegardes/avant-equipe-')), 'sauvegarde faite');
  assert.ok(a.fake.docs.has('calculs/c_1'), 'calculs recopiés');
  assert.equal(w.fournilAcces.mode(), 'separe');
  w.eval("sw('settings')");
  assert.match(carte().textContent, /prêtes pour l’équipe/);
  carte().querySelector('#equipeUid').value = 'NouveauUid1234';
  carte().querySelector('#equipePrenom').value = 'Nina';
  carte().querySelector('[data-equipe=ajouter]').click();
  await a.pause(40);
  assert.deepEqual(a.fake.docs.get('membres/NouveauUid1234'), { prenom: 'Nina', role: 'equipe' });
  w.eval("sw('settings')");
  assert.match(carte().textContent, /Nina/);
  // les données de l'appli n'ont pas bougé
  assert.equal(w.eval('S.products.length'), 5);
  assert.equal(w.eval('S.tasks.length'), 4);
});

test('équipe : saisie rapide du stock sans création de produit', async (t) => {
  const { a, w, doc } = await ouvrir(t, { utilisateur: LEA, docs: FICHE_LEA });
  w.eval("sw('stock')");
  doc.getElementById('saisieTexte').value = '5 croissants, 3 chaussons';
  doc.querySelector('#saisieRapide .saisie-apercu-btn').click();
  const L = [...doc.querySelectorAll('#saisieRapide .saisie-ligne')];
  assert.equal(L.length, 2);
  assert.match(L[1].textContent, /Produit inconnu/);
  assert.equal(doc.querySelector('#saisieRapide option[value="__nouveau__"]'), null, 'pas de « Nouveau produit »');
  assert.equal(doc.querySelector('#saisieRapide [data-action=valider]').disabled, true);
  L[1].querySelector('[data-champ=supprimer]').click();
  await a.pause(20);
  const v = doc.querySelector('#saisieRapide [data-action=valider]');
  assert.equal(v.disabled, false);
  v.click();
  await a.pause(60);
  assert.equal(stock(a).products.find((p) => p.id === 'croissant').stockReel, 69);
  assert.equal(stock(a).history[0].type, 'saisie');
  assert.equal(stock(a).history[0].par, 'Léa');
  assert.deepEqual(a.fake.refus, []);
  await a.pause(100);
});
