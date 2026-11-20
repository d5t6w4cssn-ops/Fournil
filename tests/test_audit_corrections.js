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
  // laisser finir les mises à jour en cours avant de fermer la page
  t.after(async () => { await a.pause(60); a.window.close(); });
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

test('G2 : vider le champ du magasin pour retaper ne remet pas 0 (Fournil et Labo)', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  w.eval("openModule('fournil');sw('magasin')");
  const champ = doc.getElementById('base-croissant');
  champ.value = '';
  champ.dispatchEvent(new w.Event('input'));
  await a.pause(400);
  assert.equal(etat(a).products.find((p) => p.id === 'croissant').base, 40, 'base inchangée');
  assert.equal(champ.value, '', 'le champ reste vide pendant la saisie');
  champ.value = '45';
  champ.dispatchEvent(new w.Event('input'));
  await a.pause(400);
  assert.equal(etat(a).products.find((p) => p.id === 'croissant').base, 45);
  w.eval("openModule('labo');swL('lmagasin')");
  const l = doc.getElementById('lbase-lp_1');
  l.value = '';
  l.dispatchEvent(new w.Event('input'));
  await a.pause(400);
  assert.equal(labo(a).products.find((p) => p.id === 'lp_1').base, 6);
});

test('G3 : l’observation du journal s’enregistre toute seule, même si on change de jour tout de suite', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  const auj = w.eval('today()');
  w.eval("openModule('bureau');swB('journal')");
  const obs = doc.getElementById('journalObs');
  obs.value = 'Four 2 réparé';
  obs.dispatchEvent(new w.Event('input'));
  doc.querySelector('.journal-nav-btn').click(); // jour précédent, aussitôt
  await a.pause(30);
  assert.equal(etat(a).journal[auj].obs, 'Four 2 réparé');
  doc.querySelectorAll('.journal-nav-btn')[1].click(); // retour à aujourd'hui
  assert.equal(doc.getElementById('journalObs').value, 'Four 2 réparé');
  const o2 = doc.getElementById('journalObs');
  o2.value = 'Four 2 réparé, pâte un peu froide';
  o2.dispatchEvent(new w.Event('input'));
  await a.pause(800);
  assert.equal(etat(a).journal[auj].obs, 'Four 2 réparé, pâte un peu froide');
});


test('D6 : quantités des matières premières affichées avec une virgule', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  w.eval("openModule('bureau');swB('matieres')");
  assert.equal(doc.getElementById('msv-s-m_3').textContent, '1,5');
  const champ = doc.getElementById('mat-val-m_3');
  champ.value = '0.3';
  w.eval("useMatiere('m_3')");
  await a.pause(20);
  assert.equal(doc.getElementById('msv-s-m_3').textContent, '1,2');
  assert.equal(JSON.parse(a.fake.docs.get('boulangerie/state').state).matieres.find((m) => m.id === 'm_3').stock, 1.2, 'donnée inchangée (nombre)');
});

test('Guide (tâche 4) : bouton « ? », premier pas, une section par module, sommaire sans changer l’adresse', async (t) => {
  const { w, doc } = await ouvrir(t);
  doc.querySelector('.bouton-guide').click();
  const g = doc.getElementById('helpOverlay');
  assert.equal(g.style.display, 'flex');
  assert.match(g.textContent, /Premier pas en 3 minutes/);
  for (const id of ['g-stock', 'g-saisie', 'g-magasin', 'g-recettes', 'g-taches', 'g-historique', 'g-labo', 'g-matieres', 'g-fournisseurs', 'g-tournee', 'g-journal', 'g-reglages', 'g-synchro', 'g-journee']) {
    assert.ok(doc.getElementById(id), id);
  }
  assert.ok(doc.querySelectorAll('#helpOverlay .guide-ex').length >= 12, 'un exemple concret par module');
  const adresse = w.location.href;
  doc.querySelector('.guide-toc a[href="#g-tournee"]').click();
  assert.equal(w.location.href, adresse, "l'adresse ne change pas");
  doc.querySelector('#helpOverlay .sheet-close').click();
  assert.equal(g.style.display, 'none');
});

test('G7 : dans le Labo, la barre du bas ouvre les écrans du Labo ; le 4e bouton ramène au Fournil', async (t) => {
  const { w, doc } = await ouvrir(t);
  const nav = (id) => doc.querySelector(`.app-nav [data-nav="${id}"]`);
  nav('labo').click();
  assert.equal(w.eval('activeModule'), 'labo');
  assert.match(nav('labo').textContent, /Fournil/, 'le bouton devient « Fournil »');
  nav('taches').click();
  assert.deepEqual([w.eval('activeModule'), w.eval('laboTab')], ['labo', 'ltasks']);
  assert.ok(nav('taches').classList.contains('actif'));
  nav('stock').click();
  assert.deepEqual([w.eval('activeModule'), w.eval('laboTab')], ['labo', 'lstock']);
  nav('recettes').click();
  assert.deepEqual([w.eval('activeModule'), w.eval('laboTab')], ['labo', 'recettes']);
  assert.ok(doc.getElementById('tab-recettes').classList.contains('active'));
  nav('labo').click(); // « Fournil »
  assert.deepEqual([w.eval('activeModule'), w.eval('tab')], ['fournil', 'stock']);
  assert.match(nav('labo').textContent, /Labo/);
  nav('taches').click();
  assert.deepEqual([w.eval('activeModule'), w.eval('tab')], ['fournil', 'tasks']);
});

test('D1 : au-delà de 1 000 pièces sur une ligne, confirmation par un second appui', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  // saisie rapide
  w.eval("openModule('fournil');sw('stock')");
  doc.getElementById('saisieTexte').value = '1200 croissants, 10 brioches';
  doc.querySelector('#saisieRapide .saisie-apercu-btn').click();
  assert.match(doc.querySelector('#saisieRapide .saisie-ligne').textContent, /Plus de 1 000 pièces/);
  const avant = a.fake.writes.length;
  doc.querySelector('#saisieRapide [data-action=valider]').click();
  await a.pause(20);
  assert.equal(a.fake.writes.length, avant, 'rien enregistré au premier appui');
  const bouton = doc.querySelector('#saisieRapide [data-action=valider]');
  assert.match(bouton.textContent, /Oui, enregistrer/);
  bouton.click();
  await a.pause(30);
  assert.equal(etat(a).products.find((p) => p.id === 'croissant').stockReel, 1264);
  // fenêtre ✏️
  w.eval("openCorrect('brioche')");
  doc.getElementById('mc-stock').value = '1500';
  w.eval('saveCorrect()');
  await a.pause(20);
  assert.match(msg(doc, 'mc-stock'), /Plus de 1 000 pièces/);
  assert.equal(etat(a).products.find((p) => p.id === 'brioche').stockReel, 19, 'pas encore ajouté');
  w.eval('saveCorrect()');
  await a.pause(30);
  assert.equal(etat(a).products.find((p) => p.id === 'brioche').stockReel, 1519);
  // 1 000 pile : pas de confirmation
  w.eval("openCorrect('viennoise')");
  doc.getElementById('mc-stock').value = '1000';
  w.eval('saveCorrect()');
  await a.pause(30);
  assert.equal(etat(a).products.find((p) => p.id === 'viennoise').stockReel, 1022);
});
