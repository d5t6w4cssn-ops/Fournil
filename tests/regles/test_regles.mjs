// Règles Firestore (firebase/firestore-fournil.rules) et migration « équipe », sur
// l'ÉMULATEUR Firestore uniquement (projet fictif demo-fournil : aucun lien avec la vraie base).
// Lancer : npm run test:regles   (démarre l'émulateur, lance ces tests, l'arrête)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

const require = createRequire(import.meta.url);
const E = require('../../assets/js/equipe-donnees.js');
const { donneesDemo } = require('../donnees-demo.js');
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Émulateur absent : lance « npm run test:regles ».');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({
  projectId: 'demo-fournil',
  firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(RACINE, 'firebase', 'firestore-fournil.rules'), 'utf8') },
});
test.after(() => env.cleanup());

const ADMIN = E.ADMIN_UID;
const db = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const d = donneesDemo();
const HISTO = [{ id: 'k1', timestamp: 2, recipeName: 'Baguette', label: null, targetG: 5000, coefficient: 2, basis: 'farine', breakdown: [] }];
const DOCS = {
  'boulangerie/state': { state: JSON.stringify(d.state) },
  'boulangerie/labo': { state: JSON.stringify(d.labo) },
  'boulangerie/recettes': { recipes: JSON.stringify(d.recettes), calcHistory: JSON.stringify(HISTO) },
};

async function preparer({ migrer = true } = {}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    for (const [chemin, data] of Object.entries(DOCS)) await f.doc(chemin).set(data);
    await f.doc('membres/lea').set({ prenom: 'Léa', role: 'equipe' });
    await f.doc('membres/sam').set({ prenom: 'Sam', role: 'equipe' });
    await f.doc('membres/ancien').set({ prenom: 'Ancien', role: 'retire' });
  });
  if (migrer) await E.migrerBase(db(ADMIN), { maintenant: Date.UTC(2026, 10, 26) });
}
const calcul = (uid, prenom, extra = {}) => ({ auteurUid: uid, auteurPrenom: prenom, timestamp: Date.now(), calcul: JSON.stringify({ recipeName: 'Pain' }), ...extra });

test('migration sur une copie : stock séparé, rien de perdu, sauvegarde faite, une seule fois', async () => {
  await preparer({ migrer: false });
  const r = await E.migrerBase(db(ADMIN), { maintenant: Date.UTC(2026, 10, 26) });
  assert.equal(r.deja, false);
  assert.equal(r.produits, d.state.products.length);
  assert.equal(r.calculs, 1);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    const stock = JSON.parse((await f.doc('boulangerie/stock').get()).data().state);
    const reste = JSON.parse((await f.doc('boulangerie/state').get()).data().state);
    assert.deepEqual(E.assembler(reste, stock), d.state, 'stock + reste = état d’origine');
    assert.equal(reste.products, undefined);
    const sauv = await f.collection('sauvegardes').get();
    assert.equal(sauv.size, 1);
    assert.equal(sauv.docs[0].data().state, DOCS['boulangerie/state'].state);
    const c = await f.doc('calculs/k1').get();
    assert.equal(c.data().auteurUid, ADMIN);
    assert.equal((await f.doc('boulangerie/labo').get()).data().state, DOCS['boulangerie/labo'].state, 'Labo inchangé');
    assert.equal((await f.doc('boulangerie/recettes').get()).data().recipes, DOCS['boulangerie/recettes'].recipes, 'recettes inchangées');
  });
  assert.deepEqual(await E.migrerBase(db(ADMIN)), { deja: true }, 'deuxième lancement : rien');
});

test('retour à l’ancien format : l’état d’origine revient dans boulangerie/state', async () => {
  await preparer();
  const r = await E.annulerMigration(db(ADMIN));
  assert.equal(r.deja, false);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    assert.equal((await f.doc('boulangerie/stock').get()).exists, false);
    assert.deepEqual(JSON.parse((await f.doc('boulangerie/state').get()).data().state), d.state);
    assert.equal(JSON.parse((await f.doc('boulangerie/recettes').get()).data().calcHistory)[0].recipeName, 'Baguette');
  });
});

test('la migration est refusée à l’équipe', async () => {
  await preparer({ migrer: false });
  await assertFails(E.migrerBase(db('lea')));
});

test('visiteur non connecté et compte inconnu : aucun accès', async () => {
  await preparer();
  for (const f of [db(null), db('inconnu'), db('ancien')]) {
    for (const chemin of ['boulangerie/state', 'boulangerie/stock', 'boulangerie/labo', 'boulangerie/recettes', 'calculs/k1', 'sauvegardes/x']) {
      await assertFails(f.doc(chemin).get());
    }
    await assertFails(f.doc('boulangerie/stock').set({ state: '{}' }));
    await assertFails(f.collection('calculs').doc('n').set(calcul('inconnu', 'X')));
  }
});

test('équipe : recettes en lecture seule', async () => {
  await preparer();
  const f = db('lea');
  await assertSucceeds(f.doc('boulangerie/recettes').get());
  await assertFails(f.doc('boulangerie/recettes').set({ recipes: '[]' }, { merge: true }));
  await assertFails(f.doc('boulangerie/recettes').delete());
});

test('équipe : stock lu et mis à jour, mais pas créé, supprimé ni détourné', async () => {
  await preparer();
  const f = db('lea');
  await assertSucceeds(f.doc('boulangerie/stock').get());
  await assertSucceeds(f.doc('boulangerie/stock').set({ state: JSON.stringify({ products: [], history: [], lastDate: null }) }));
  await assertFails(f.doc('boulangerie/stock').set({ state: '{}', autre: 1 }));
  await assertFails(f.doc('boulangerie/stock').set({ state: 42 }));
  await assertFails(f.doc('boulangerie/stock').delete());
  await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('boulangerie/stock').delete());
  await assertFails(f.doc('boulangerie/stock').set({ state: '{}' }), 'création réservée à la migration');
});

test('équipe : tâches, Labo, Bureau, sauvegardes inaccessibles', async () => {
  await preparer();
  const f = db('lea');
  for (const chemin of ['boulangerie/state', 'boulangerie/labo', 'boulangerie/autre', 'sauvegardes/x']) {
    await assertFails(f.doc(chemin).get());
    await assertFails(f.doc(chemin).set({ state: '{}' }));
  }
});

test('équipe : calculs partagés (lecture de tous, création à son prénom, suppression des siens seulement)', async () => {
  await preparer();
  const lea = db('lea');
  const sam = db('sam');
  await assertSucceeds(lea.doc('calculs/k1').get());
  await assertSucceeds(lea.collection('calculs').get());
  await assertSucceeds(lea.doc('calculs/c-lea').set(calcul('lea', 'Léa')));
  await assertFails(lea.doc('calculs/c-faux').set(calcul('sam', 'Sam')), 'au nom d’un autre');
  await assertFails(lea.doc('calculs/c-faux2').set(calcul('lea', 'Patron')), 'autre prénom que le sien');
  await assertFails(lea.doc('calculs/c-faux3').set(calcul('lea', 'Léa', { pirate: true })), 'champ en trop');
  await assertFails(lea.doc('calculs/c-lea').set(calcul('lea', 'Léa', { timestamp: 1 })), 'modification interdite');
  await assertFails(sam.doc('calculs/c-lea').delete(), 'Sam ne supprime pas le calcul de Léa');
  await assertFails(lea.doc('calculs/k1').delete(), 'ni celui de l’administrateur');
  await assertSucceeds(lea.doc('calculs/c-lea').delete());
});

test('administrateur : tout, y compris supprimer les calculs des autres et gérer l’équipe', async () => {
  await preparer();
  const f = db(ADMIN);
  await assertSucceeds(db('sam').doc('calculs/c-sam').set(calcul('sam', 'Sam')));
  await assertSucceeds(f.doc('calculs/c-sam').delete());
  for (const chemin of ['boulangerie/state', 'boulangerie/labo', 'boulangerie/recettes', 'boulangerie/stock']) {
    await assertSucceeds(f.doc(chemin).get());
  }
  await assertSucceeds(f.doc('boulangerie/recettes').set({ recipes: '[]' }, { merge: true }));
  await assertSucceeds(f.doc('calculs/c-admin').set(calcul(ADMIN, 'Patron')));
  await assertSucceeds(f.doc('membres/nouveau').set({ prenom: 'Nina', role: 'equipe' }));
  await assertSucceeds(f.doc('membres/nouveau').delete());
  await assertSucceeds(f.collection('sauvegardes').get());
});

test('membres : chacun lit sa fiche, personne ne s’ajoute ni ne change son rôle', async () => {
  await preparer();
  const lea = db('lea');
  await assertSucceeds(lea.doc('membres/lea').get());
  await assertFails(lea.doc('membres/sam').get());
  await assertFails(lea.doc('membres/lea').set({ prenom: 'Léa', role: 'admin' }));
  await assertFails(db('intrus').doc('membres/intrus').set({ prenom: 'Intrus', role: 'equipe' }));
});
