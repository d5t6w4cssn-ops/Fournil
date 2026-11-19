// Stock : remise à zéro, boutons − / +, retrait avec motif (Fournil, Labo, matières).
// Lancer : node --test tests/test_stock.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerAppli } = require('./charger-appli.js');
const { donneesDemo } = require('./donnees-demo.js');

async function demo(t) {
  const d = donneesDemo();
  const a = await chargerAppli({ etat: d.state, labo: d.labo, recettes: d.recettes });
  // fermer la page même si une vérification échoue (sinon ses minuteries gardent le test ouvert)
  t.after(() => a.window.close());
  return { a, d, w: a.window, doc: a.window.document };
}
const etat = (a) => JSON.parse(a.fake.docs.get('boulangerie/state').state);
const labo = (a) => JSON.parse(a.fake.docs.get('boulangerie/labo').state);
const fen = (doc) => doc.getElementById('mStockFenetre');

test('remise à zéro : bouton dans Réglages, confirmation claire, Annuler ne change rien', async (t) => {
  const { a, w, doc } = await demo(t);
  w.eval("openModule('fournil');sw('settings')");
  const btn = doc.querySelector('#settingsList .stock-raz-btn');
  assert.ok(btn, 'bouton présent');
  assert.match(btn.textContent, /Remettre tout le stock à zéro/);
  const avant = a.fake.writes.length;
  btn.click();
  const f = fen(doc);
  assert.ok(f.classList.contains('open'));
  const texte = f.textContent.replace(/\s+/g, ' ');
  assert.match(texte, /5 produits du Fournil/);
  assert.match(texte, /3 produits du Labo/);
  assert.match(texte, /4 matières premières/);
  assert.match(texte, /ne peut pas être annulée/);
  f.querySelector('[data-action=annuler]').click();
  await a.pause(20);
  assert.equal(a.fake.writes.length, avant, 'rien écrit');
  assert.equal(f.classList.contains('open'), false);
  w.close();
});

test('remise à zéro : seules les quantités passent à 0', async (t) => {
  const { a, d, w, doc } = await demo(t);
  w.eval("openModule('fournil');sw('settings')");
  doc.querySelector('#settingsList .stock-raz-btn').click();
  fen(doc).querySelector('[data-action=raz]').click();
  await a.pause(30);
  const s = etat(a);
  const l = labo(a);
  assert.ok(s.products.every((p) => p.stockReel === 0));
  assert.ok(s.matieres.every((m) => m.stock === 0));
  assert.ok(l.products.every((p) => p.stockReel === 0));
  // le reste ne bouge pas
  assert.deepEqual(s.products.map((p) => [p.id, p.name, p.emoji, p.base, p.seuil, p.commande]), d.state.products.map((p) => [p.id, p.name, p.emoji, p.base, p.seuil, p.commande]));
  assert.deepEqual(s.matieres.map((m) => [m.id, m.name, m.unit, m.seuil, m.conso, m.dlc]), d.state.matieres.map((m) => [m.id, m.name, m.unit, m.seuil, m.conso, m.dlc]));
  assert.deepEqual(l.products.map((p) => [p.id, p.name, p.base, p.seuil]), d.labo.products.map((p) => [p.id, p.name, p.base, p.seuil]));
  assert.deepEqual(s.cmdClients, d.state.cmdClients);
  assert.deepEqual(s.tasks.filter((t) => !t.auto), d.state.tasks.filter((t) => !t.auto));
  assert.deepEqual(JSON.parse(a.fake.docs.get('boulangerie/recettes').recipes), d.recettes, 'recettes intactes');
  assert.equal(s.history[0].type, 'raz');
  assert.equal(l.history[0].type, 'raz');
  assert.equal(s.history.length, d.state.history.length + 1, "l'historique est gardé");
  w.eval("sw('histo')");
  assert.match(doc.getElementById('histoList').textContent, /Stock remis à zéro/);
  assert.deepEqual(a.erreurs, []);
  w.close();
});

test('− / + sur un produit du Fournil : enregistré tout de suite, regroupé dans l’historique', async (t) => {
  const { a, d, w, doc } = await demo(t);
  w.eval("openModule('fournil');sw('stock')");
  const rangee = doc.querySelector('.stock-rapide[data-cat="fournil"][data-id="croissant"]');
  assert.ok(rangee, 'rangée − / + sur la carte');
  const plus = rangee.querySelector('[data-sens="1"]');
  const moins = rangee.querySelector('[data-sens="-1"]');
  plus.click(); plus.click(); plus.click(); moins.click();
  await a.pause(20);
  const s = etat(a);
  assert.equal(s.products.find((p) => p.id === 'croissant').stockReel, d.state.products[0].stockReel + 2);
  const h = s.history.filter((x) => x.type === 'ajustement');
  assert.equal(h.length, 1, 'une seule ligne pour les appuis successifs');
  assert.equal(h[0].delta, 2);
  assert.equal(rangee.querySelector('.stock-rapide-val').textContent, String(d.state.products[0].stockReel + 2));
  w.close();
});

test('− à 0 : le stock ne descend pas et un message prévient', async (t) => {
  const { a, w, doc } = await demo(t);
  w.eval("openModule('fournil');sw('stock')");
  const msgs = [];
  const toastOrigine = w.toast;
  w.toast = (m) => { msgs.push(m); toastOrigine(m); };
  doc.querySelector('.stock-rapide[data-id="pain_raisins"] [data-sens="-1"]').click();
  await a.pause(20);
  assert.equal(etat(a).products.find((p) => p.id === 'pain_raisins').stockReel, 0);
  assert.match(msgs.join(' '), /Pain aux raisins : le stock est déjà à 0/);
  w.close();
});

test('retrait avec motif : quantité + motif gardés dans l’historique, jamais sous 0 sans prévenir', async (t) => {
  const { a, w, doc } = await demo(t);
  w.eval("openModule('fournil');sw('stock')");
  doc.querySelector('.stock-rapide[data-id="brioche"] .stock-motif').click();
  const f = fen(doc);
  const qte = f.querySelector('#srQte');
  // vide → message
  f.querySelector('[data-action=retirer]').click();
  assert.match(f.querySelector('#srMsg').textContent, /supérieure à 0/);
  // plus que le stock (9) → prévient, ne retire pas encore
  qte.value = '15';
  f.querySelector('#srMotif').value = 'casse';
  f.querySelector('#srNote').value = 'plaque tombée';
  f.querySelector('[data-action=retirer]').click();
  await a.pause(10);
  assert.match(f.querySelector('#srMsg').textContent, /n'y a que 9 en stock/);
  assert.equal(etat(a).products.find((p) => p.id === 'brioche').stockReel, 9, 'rien retiré avant confirmation');
  f.querySelector('[data-action=retirer]').click();
  await a.pause(20);
  const s = etat(a);
  assert.equal(s.products.find((p) => p.id === 'brioche').stockReel, 0);
  const h = s.history[0];
  assert.equal(h.type, 'retrait');
  assert.equal(h.motif, 'casse');
  assert.equal(h.note, 'plaque tombée');
  assert.equal(h.qty, 9);
  assert.equal(h.demande, 15);
  w.eval("sw('histo')");
  assert.match(doc.getElementById('histoList').textContent, /Retiré · Casse — plaque tombée/);
  w.close();
});

test('Labo et matières premières : − / + et retrait avec motif (avec unité et décimales)', async (t) => {
  const { a, d, w, doc } = await demo(t);
  w.eval("openModule('labo');swL('lstock')");
  doc.querySelector('.stock-rapide[data-cat="labo"][data-id="lp_1"] [data-sens="1"]').click();
  await a.pause(20);
  assert.equal(labo(a).products.find((p) => p.id === 'lp_1').stockReel, d.labo.products[0].stockReel + 1);
  assert.equal(labo(a).history[0].type, 'ajustement');

  w.eval("openModule('bureau');swB('matieres')");
  doc.querySelector('.stock-rapide[data-cat="matieres"][data-id="m_3"] [data-sens="-1"]').click();
  await a.pause(20);
  assert.equal(etat(a).matieres.find((m) => m.id === 'm_3').stock, 0.5, 'levure 1,5 kg − 1 kg');
  doc.querySelector('.stock-rapide[data-cat="matieres"][data-id="m_3"] [data-sens="-1"]').click();
  await a.pause(20);
  assert.equal(etat(a).matieres.find((m) => m.id === 'm_3').stock, 0, 'jamais sous 0 : 0,5 kg − 1 → 0');
  // réception de beurre (+) : corrige le bloquant B3 de l'audit
  doc.querySelector('.stock-rapide[data-cat="matieres"][data-id="m_2"] [data-sens="1"]').click();
  await a.pause(20);
  assert.equal(etat(a).matieres.find((m) => m.id === 'm_2').stock, 9);
  doc.querySelector('.stock-rapide[data-cat="matieres"][data-id="m_1"] .stock-motif').click();
  const f = fen(doc);
  f.querySelector('#srQte').value = '2,5';
  f.querySelector('#srMotif').value = 'perte';
  f.querySelector('[data-action=retirer]').click();
  await a.pause(20);
  assert.equal(etat(a).matieres.find((m) => m.id === 'm_1').stock, 117.5);
  const h = etat(a).history[0];
  assert.deepEqual([h.type, h.qty, h.unit, h.motif], ['retrait', 2.5, 'kg', 'perte']);
  assert.deepEqual(a.erreurs, []);
  w.close();
});
