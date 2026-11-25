// Rôle « équipe » : fonctions de données (séparation du stock, fusion, migration).
// Lancer : node --test tests/test_equipe_donnees.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../assets/js/equipe-donnees.js');
const { donneesDemo } = require('./donnees-demo.js');

const prod = (id, stockReel, extra = {}) => ({ id, name: id, emoji: '🥐', stockReel, base: 0, commande: 0, seuil: 5, ...extra });

test('séparer puis assembler redonne exactement le même état', () => {
  const { state } = donneesDemo();
  const { stock, reste } = E.separer(state);
  assert.deepEqual(Object.keys(stock).sort(), ['history', 'lastDate', 'products']);
  assert.equal(reste.products, undefined);
  assert.equal(reste.history, undefined);
  assert.ok(Array.isArray(reste.tasks));
  assert.deepEqual(E.assembler(reste, stock), { ...state, products: state.products, history: state.history, lastDate: state.lastDate });
});

test('fusion : deux personnes ajoutent en même temps, rien n’est perdu', () => {
  const base = { products: [prod('a', 10), prod('b', 5)], history: [], lastDate: '2026-11-25' };
  const local = { products: [prod('a', 13), prod('b', 5)], history: [{ id: 'h1', pid: 'a', type: 'ajustement', delta: 3 }], lastDate: '2026-11-25' };
  const distant = { products: [prod('a', 8), prod('b', 9)], history: [{ id: 'h2', pid: 'a', type: 'retrait', qty: 2 }, { id: 'h3', pid: 'b', type: 'recharge', qty: 4 }], lastDate: '2026-11-25' };
  const r = E.fusionnerStock(base, local, distant);
  assert.equal(r.products.find((p) => p.id === 'a').stockReel, 11, '8 (serveur) + 3 (moi)');
  assert.equal(r.products.find((p) => p.id === 'b').stockReel, 9, 'changé seulement par l’autre');
  assert.deepEqual(r.history.map((h) => h.id), ['h1', 'h2', 'h3']);
});

test('fusion : jamais sous 0, suppressions et ajouts de produits respectés', () => {
  const base = { products: [prod('a', 3), prod('b', 1), prod('c', 1)], history: [{ id: 'x' }], lastDate: null };
  const local = { products: [prod('a', 0), prod('c', 1), prod('n', 7)], history: [], lastDate: null };
  const distant = { products: [prod('a', 1), prod('b', 1), prod('c', 1), prod('d', 2)], history: [{ id: 'x' }, { id: 'y' }], lastDate: '2026-11-26' };
  const r = E.fusionnerStock(base, local, distant);
  assert.deepEqual(r.products.map((p) => p.id), ['a', 'c', 'n', 'd'], 'b supprimé par moi, n ajouté par moi, d ajouté par l’autre');
  assert.equal(r.products[0].stockReel, 0, '1 − 3 → 0, jamais négatif');
  assert.deepEqual(r.history.map((h) => h.id), ['y'], 'ma suppression de x appliquée');
  assert.equal(r.lastDate, '2026-11-26');
});

test('fusion : un réglage changé par moi gagne, sinon celui du serveur', () => {
  const base = { products: [prod('a', 1, { seuil: 5, name: 'A' })], history: [] };
  const local = { products: [prod('a', 1, { seuil: 8, name: 'A' })], history: [] };
  const distant = { products: [prod('a', 1, { seuil: 5, name: 'A2' })], history: [] };
  const r = E.fusionnerStock(base, local, distant);
  assert.equal(r.products[0].seuil, 8);
  assert.equal(r.products[0].name, 'A2');
});

test('signature des nouvelles lignes d’historique (auteur et heure), jamais celles des autres', () => {
  const h = [{ id: 'n1' }, { id: 'vieux' }, { id: 'n2', par: 'Léa' }];
  const n = E.signerNouvelles(h, new Set(['vieux']), { uid: 'u1', prenom: 'Sam' }, 1234);
  assert.equal(n, 1);
  assert.deepEqual(h[0], { id: 'n1', par: 'Sam', parUid: 'u1', t: 1234 });
  assert.deepEqual(h[1], { id: 'vieux' });
  assert.equal(h[2].par, 'Léa');
});

test('seuil bas : alerte seulement au passage ok → faible ou vide', () => {
  const avant = [prod('a', 10, { seuil: 5 }), prod('b', 4, { seuil: 5 }), prod('c', 10, { seuil: 5 })];
  const apres = [prod('a', 5, { seuil: 5 }), prod('b', 2, { seuil: 5 }), prod('c', 0, { seuil: 5 })];
  const r = E.passagesSousSeuil(avant, apres);
  assert.deepEqual(r.map((x) => [x.id, x.statut, x.dispo]), [['a', 'low', 5], ['c', 'empty', 0]]);
  assert.deepEqual(E.passagesSousSeuil(apres, apres), []);
});

test('calculs partagés : aller-retour document, droits de suppression', () => {
  const c = { id: 'abc123', timestamp: 5, recipeName: 'Baguette', label: null, targetG: 1000, coefficient: 1, basis: 'farine', breakdown: [] };
  const { id, doc } = E.calculVersDoc(c, { uid: 'u1', prenom: 'Sam' });
  assert.equal(id, 'abc123');
  assert.deepEqual(Object.keys(doc).sort(), ['auteurPrenom', 'auteurUid', 'calcul', 'timestamp']);
  const r = E.docVersCalcul(id, doc);
  assert.deepEqual(r, { ...c, auteurUid: 'u1', auteurPrenom: 'Sam' });
  assert.equal(E.peutSupprimer(r, 'u1'), true);
  assert.equal(E.peutSupprimer(r, 'u2'), false);
  assert.equal(E.peutSupprimer(r, E.ADMIN_UID), true);
  assert.notEqual(E.calculVersDoc({ id: 'a/b' }, { uid: 'u' }).id, 'a/b', 'identifiant invalide remplacé');
});

test('préparer la migration : stock séparé, calculs recopiés avec l’auteur administrateur, sauvegarde complète', () => {
  const d = donneesDemo();
  const histo = [{ id: 'k1', timestamp: 2, recipeName: 'Pain', targetG: 500 }, { id: 'k2', timestamp: 1, recipeName: 'Brioche', targetG: 900 }];
  const docs = {
    state: { state: JSON.stringify(d.state) },
    labo: { state: JSON.stringify(d.labo) },
    recettes: { recipes: JSON.stringify(d.recettes), calcHistory: JSON.stringify(histo) },
  };
  const m = E.preparerMigration(docs, { maintenant: Date.UTC(2026, 10, 26) });
  const stock = JSON.parse(m.stock.state);
  const reste = JSON.parse(m.state.state);
  assert.deepEqual(stock.products, d.state.products);
  assert.deepEqual(stock.history, d.state.history);
  assert.equal(reste.products, undefined);
  assert.deepEqual(reste.tasks, d.state.tasks);
  assert.deepEqual(E.assembler(reste, stock), { ...d.state });
  assert.equal(m.calculs.length, 2);
  assert.ok(m.calculs.every((c) => c.doc.auteurUid === E.ADMIN_UID));
  assert.equal(m.sauvegarde.state, docs.state.state);
  assert.equal(m.sauvegarde.labo, docs.labo.state);
  assert.equal(m.sauvegarde.calcHistory, docs.recettes.calcHistory);
  assert.throws(() => E.preparerMigration({ state: null }), /introuvable|illisible/);
});
