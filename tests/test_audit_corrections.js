// Corrections de l'audit (gênants et détails) : un test par correction.
// Lancer : node --test tests/test_audit_corrections.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerAppli } = require('./charger-appli.js');
const { donneesDemo } = require('./donnees-demo.js');

async function ouvrir(t) {
  const d = donneesDemo();
  const a = await chargerAppli({ etat: d.state, labo: d.labo, recettes: d.recettes });
  t.after(() => a.window.close());
  return { a, d, w: a.window, doc: a.window.document };
}
const etat = (a) => JSON.parse(a.fake.docs.get('boulangerie/state').state);
const labo = (a) => JSON.parse(a.fake.docs.get('boulangerie/labo').state);
const msg = (doc, id) => (doc.querySelector(`.champ-erreur[data-pour="${id}"]`) || { textContent: '' }).textContent;

test('G4 : champ obligatoire vide → message sous le champ, curseur dedans, rien d’enregistré', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  // chaque bouton, l'écran déjà ouvert : aucune écriture
  const sansEcriture = async (ecran, action) => {
    w.eval(ecran);
    await a.pause(20);
    const avant = a.fake.writes.length;
    w.eval(action);
    await a.pause(20);
    assert.equal(a.fake.writes.length, avant, `rien enregistré : ${action}`);
  };
  await sansEcriture("openModule('fournil');sw('tasks')", "openM('mTask');document.getElementById('taskInput').value='  ';addTask()");
  assert.match(msg(doc, 'taskInput'), /Écris la tâche/);
  assert.equal(doc.activeElement.id, 'taskInput');
  assert.equal(doc.getElementById('taskInput').getAttribute('aria-invalid'), 'true');
  await sansEcriture("sw('settings')", "openM('mProduct');document.getElementById('np-name').value='';saveProduct()");
  assert.match(msg(doc, 'np-name'), /Donne un nom au produit/);
  await sansEcriture("openModule('bureau');swB('matieres')", "openM('mMatiere');document.getElementById('mat-name').value='';saveMatiere()");
  assert.match(msg(doc, 'mat-name'), /matière première/);
  await sansEcriture("swB('cmd-clients')", "openM('mCmdClient');document.getElementById('cc-nom').value='';addCmdClient()");
  assert.match(msg(doc, 'cc-nom'), /nom du client/);
  await sansEcriture("void 0", "openM('mBoulanger');document.getElementById('bl-name').value='';addBoulanger()");
  assert.match(msg(doc, 'bl-name'), /prénom/);
  // le message disparaît dès qu'on tape
  const champ = doc.getElementById('taskInput');
  champ.value = 'x';
  champ.dispatchEvent(new w.Event('input'));
  assert.equal(msg(doc, 'taskInput'), '');
});

test('G4 (bug trouvé) : un produit du Labo créé après un premier essai sans nom reste dans le Labo', async (t) => {
  const { a, w } = await ouvrir(t);
  w.eval("openModule('labo');swL('lsettings');openLaboAddProduct();document.getElementById('np-name').value='';saveProduct()");
  w.eval("document.getElementById('np-name').value='Paris-Brest';saveProduct()");
  await a.pause(20);
  assert.ok(labo(a).products.some((p) => p.name === 'Paris-Brest'), 'dans le Labo');
  assert.ok(!etat(a).products.some((p) => p.name === 'Paris-Brest'), 'pas dans le Fournil');
});

test('G1 : seuil 0 accepté ; quantité non entière refusée avec un message (Fournil et Labo)', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  w.eval("openModule('fournil');sw('stock');openCorrect('croissant')");
  doc.getElementById('mc-stock').value = '12.7';
  w.eval('saveCorrect()');
  await a.pause(20);
  assert.match(msg(doc, 'mc-stock'), /nombre entier/);
  assert.equal(etat(a).products.find((p) => p.id === 'croissant').stockReel, 64, 'rien ajouté');
  doc.getElementById('mc-stock').value = '12';
  doc.getElementById('mc-seuil').value = '0';
  w.eval('saveCorrect()');
  await a.pause(20);
  const c = etat(a).products.find((p) => p.id === 'croissant');
  assert.equal(c.stockReel, 76);
  assert.equal(c.seuil, 0, 'seuil 0 gardé');
  // Labo : la quantité refusée ne fait pas perdre le mode Labo
  w.eval("openModule('labo');swL('lstock');openLaboCorrect('lp_1')");
  doc.getElementById('mc-stock').value = '2.5';
  w.eval('saveCorrect()');
  doc.getElementById('mc-stock').value = '3';
  w.eval('saveCorrect()');
  await a.pause(20);
  assert.equal(labo(a).products.find((p) => p.id === 'lp_1').stockReel, 15);
  assert.equal(etat(a).products.find((p) => p.id === 'croissant').stockReel, 76, 'rien dans le Fournil');
  // création d'un produit avec seuil 0
  w.eval("openModule('fournil');sw('settings');openM('mProduct');document.getElementById('np-name').value='Fougasse';document.getElementById('np-seuil').value='0';saveProduct()");
  await a.pause(20);
  assert.equal(etat(a).products.find((p) => p.name === 'Fougasse').seuil, 0);
});
