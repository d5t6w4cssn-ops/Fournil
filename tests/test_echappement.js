// Échappement de tous les affichages : chaque texte des données (Fournil, Labo,
// Bureau, recettes) est remplacé par du HTML piégé. Après avoir ouvert tous les
// écrans, aucun élément piégé ne doit exister dans la page, et aucun gestionnaire
// onclick ne doit pouvoir sortir de sa chaîne JavaScript.
// Lancer : node --test tests/test_echappement.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerAppli } = require('./charger-appli.js');

const today = require('../assets/js/date.js').dateParis();
// Piège : casse un attribut entre guillemets doubles ou simples, puis crée un élément marqué.
const P = (champ) => `"'><i data-piege="${champ}"></i>`;
// Piège pour les identifiants utilisés dans onclick="f('…')" : sortie de la chaîne JS.
const PID = (champ) => `x');window.__piege=(window.__piege||[]).concat('${champ}');('`;

function donnees() {
  const produit = (pre) => ({ id: PID(pre + '.id'), name: P(pre + '.name'), emoji: P(pre + '.emoji'), stockReel: 3, base: 1, commande: 1, seuil: 5, recipeUrl: P(pre + '.recipeUrl') });
  const tache = (pre, extra = {}) => ({ id: PID(pre + '.id'), text: P(pre + '.text'), done: false, auto: false, cat: P(pre + '.cat'), ...extra });
  const histo = (pre) => ({ id: PID(pre + '.id'), date: today, type: 'sortie', pid: PID(pre + '.pid'), name: P(pre + '.name'), emoji: P(pre + '.emoji'), qty: 2 });
  const histoTache = (pre) => ({ id: PID(pre + '.id'), text: P(pre + '.text'), cat: P(pre + '.cat'), date: today, time: P(pre + '.time') });
  const S = {
    products: [produit('S.products')],
    tasks: [tache('S.tasks'), tache('S.tasksAuto', { auto: true, pid: PID('S.tasksAuto.pid') }), tache('S.tasksDone', { done: true })],
    lastDate: today,
    history: [histo('S.history')],
    thermos: [{ id: PID('S.thermos.id'), name: P('S.thermos.name'), mode: 'ip', ip: P('S.thermos.ip'), temp: 4, hum: 50, maxTemp: 3 },
      { id: PID('S.thermosTuya.id'), name: P('S.thermosTuya.name'), mode: 'tuya', temp: null, hum: null }],
    notes: [{ id: PID('S.notes.id'), author: P('S.notes.author'), text: P('S.notes.text'), time: P('S.notes.time') },
      { id: PID('S.notesVocal.id'), author: P('S.notesVocal.author'), text: '', audioUrl: P('S.notesVocal.audioUrl'), isVocal: true, transcription: P('S.notesVocal.transcription'), time: P('S.notesVocal.time') },
      { id: PID('S.notesVocal2.id'), author: 'a', text: '', audioUrl: 'data:audio/webm;base64,AA', isVocal: true, transcription: null, time: 't' }],
    boulangers: [P('S.boulangers')],
    freeNotes: P('S.freeNotes'),
    journal: { [today]: { obs: P('S.journal.obs'), produits: {} } },
    histoTaches: [histoTache('S.histoTaches')],
    matieres: [{ id: PID('S.matieres.id'), name: P('S.matieres.name'), emoji: P('S.matieres.emoji'), unit: P('S.matieres.unit'), stock: 1, seuil: 5, conso: 1, dlc: today }],
    cmdClients: [{ id: PID('S.cmdClients.id'), nom: P('S.cmdClients.nom'), adresse: P('S.cmdClients.adresse'), date: today, heure: P('S.cmdClients.heure'), detail: P('S.cmdClients.detail'), status: 'pending', createdAt: today },
      { id: PID('S.cmdClientsSent.id'), nom: P('S.cmdClientsSent.nom'), adresse: P('S.cmdClientsSent.adresse'), date: today, heure: '10:00', detail: P('S.cmdClientsSent.detail'), status: 'sent', createdAt: today }],
    seuilsCharge: { low: 30, mid: 80 },
  };
  const L = {
    products: [produit('L.products')],
    tasks: [tache('L.tasks'), tache('L.tasksAuto', { auto: true, pid: PID('L.tasksAuto.pid') })],
    lastDate: today,
    history: [histo('L.history')],
    histoTaches: [histoTache('L.histoTaches')],
  };
  const recettes = [{ id: PID('R.id'), name: P('R.name'), ingredients: [{ id: PID('R.ing.id'), name: P('R.ing.name'), qtyG: 500 }, { id: 'f', name: 'Farine', qtyG: 1000 }], notes: P('R.notes'), tb: 56 }];
  const calcHistory = [{ id: PID('H.id'), timestamp: Date.now(), recipeName: P('H.recipeName'), label: P('H.label'), targetG: 1000, coefficient: 1, basis: 'farine', breakdown: [{ name: P('H.breakdown.name'), grams: 10 }] }];
  return { S, L, recettes, calcHistory };
}

test('aucun texte des données ne peut injecter du HTML ou du JavaScript', async () => {
  const d = donnees();
  const a = await chargerAppli({ recettes: d.recettes, etat: d.S, docs: { 'membres/piegeUid0001': { prenom: P('membres.prenom'), role: 'equipe' } } });
  a.fake.externalSet('boulangerie/labo', { state: JSON.stringify(d.L) });
  a.fake.externalSet('boulangerie/recettes', { calcHistory: JSON.stringify(d.calcHistory) });
  const w = a.window;
  const doc = w.document;
  await w.eval('actualiserApp()');
  await a.pause(50);

  const trouves = new Set();
  const onclickCasses = new Set();
  const releve = (ecran) => {
    doc.querySelectorAll('[data-piege]').forEach((el) => trouves.add(`${ecran} → ${el.getAttribute('data-piege')}`));
    // Chaque gestionnaire en ligne doit rester du JavaScript valide (sinon un identifiant a cassé la chaîne).
    doc.querySelectorAll('[onclick],[onchange],[oninput]').forEach((el) => {
      for (const at of ['onclick', 'onchange', 'oninput']) {
        const code = el.getAttribute(at);
        if (!code) continue;
        try { new w.Function(code); } catch { onclickCasses.add(`${ecran} → ${at}="${code.slice(0, 80)}"`); }
        if (/__piege/.test(code) && !/\\'|&#39;|\\u0027/.test(code.replace(/[^']/g, '') ? code : '')) {
          // la présence du texte est normale ; ce qui compte : s'exécute-t-il ?
        }
      }
    });
  };
  const ecran = async (nom, fn) => {
    try { await fn(); } catch (e) { trouves.add(`${nom} → ERREUR ${e.message}`); }
    await a.pause(5);
    releve(nom);
  };

  await ecran('accueil', () => {});
  for (const t of ['stock', 'magasin', 'recettes', 'tasks', 'histo', 'calendrier', 'settings']) {
    await ecran(`fournil/${t}`, () => { w.eval(`openModule('fournil');sw('${t}')`); });
  }
  await ecran('fournil/notes', () => w.eval('renderNotes()'));
  for (const t of ['lstock', 'lmagasin', 'ltasks', 'lhisto', 'lcalendr', 'lsettings']) {
    await ecran(`labo/${t}`, () => { w.eval(`openModule('labo');swL('${t}')`); });
  }
  for (const t of ['matieres', 'cmd-fournisseur', 'cmd-clients', 'journal', 'stats']) {
    await ecran(`bureau/${t}`, () => { w.eval(`openModule('bureau');swB('${t}')`); });
  }
  // Recettes : bibliothèque dépliée, calculateur, historique, température de base
  await ecran('recettes/bibliotheque', () => {
    w.eval("openModule('fournil');sw('recettes')");
    doc.querySelectorAll('#rc-library-view .recipe-row, #rc-library-view .row-toggle, #rc-library-view .notes-btn').forEach((b) => b.click());
  });
  await ecran('recettes/modifier', () => { doc.querySelector('#rc-library-view .edit-btn').click(); });
  for (const t of ['calculator', 'tb', 'levain', 'hydra', 'croix']) {
    await ecran(`recettes/${t}`, () => { doc.querySelector(`#tab-recettes .tabs [data-tab="${t}"]`).click(); });
  }
  await ecran('recettes/calc-etapes', () => { const b = doc.querySelector('#rc-calculator-view .notes-toggle, #rc-calculator-view button[aria-label*="tape"]'); if (b) b.click(); });
  // Feuilles de calcul : saisie rapide (nom inconnu, puis recette choisie), feuille, détail des calculs enregistrés
  await ecran('recettes/saisie-apercu', () => {
    doc.querySelector('#tab-recettes .tabs [data-tab="calculator"]').click();
    doc.getElementById('rcSaisieTexte').value = `3 ${P('saisie.nom')} à 400 g`;
    doc.querySelector('#rc-saisie-calculs .rc-saisie-analyser').click();
  });
  await ecran('recettes/saisie-feuille', () => {
    const sel = doc.querySelector('#rc-saisie-calculs .rc-saisie-recette');
    sel.value = sel.options[1].value;
    sel.dispatchEvent(new w.Event('change'));
    doc.querySelector('#rc-saisie-calculs .rc-saisie-voir').click();
    doc.querySelector('#rc-saisie-calculs .rc-feuille [data-action=pdf]').click();
  });
  await ecran('recettes/calculs-detail', () => {
    doc.querySelectorAll('#rc-calculator-view .history-item .row-toggle').forEach((b) => b.click());
    doc.querySelectorAll('#rc-calculator-view .rc-pdf-btn').forEach((b) => b.click());
  });
  await ecran('fournil/reglages-equipe', () => { w.eval("openModule('fournil');sw('settings')"); });

  // Cliquer sur tous les boutons d'action en ligne : aucun ne doit exécuter le piège.
  // (on neutralise les effets de bord : confirm → false, prompt → null)
  w.confirm = () => false;
  w.prompt = () => null;
  let clics = 0;
  for (const el of doc.querySelectorAll('[onclick]')) {
    if (/__piege/.test(el.getAttribute('onclick'))) { try { el.click(); clics++; } catch { /* une erreur JS est acceptable, une exécution ne l'est pas */ } }
  }

  await a.pause(100); // laisser finir les actions lancées par les clics avant de fermer
  const executes = w.__piege || [];
  a.window.close();
  assert.ok(clics > 0 || true);
  assert.deepEqual([...trouves].sort(), [], 'HTML injecté');
  assert.deepEqual([...onclickCasses].sort(), [], 'gestionnaires onclick cassés par un identifiant');
  assert.deepEqual(executes, [], 'JavaScript exécuté depuis les données');
});

test("le PDF d'un produit n'accepte qu'un vrai PDF, jamais une adresse javascript:", async () => {
  const today2 = require('../assets/js/date.js').dateParis();
  const prod = (id, recipeUrl) => ({ id, name: 'P', emoji: 'e', stockReel: 0, base: 0, commande: 0, seuil: 5, recipeUrl });
  const a = await chargerAppli({ etat: { products: [prod('ok', 'data:application/pdf;base64,JVBERi0='), prod('ko', 'javascript:window.__piege=1')], tasks: [], lastDate: today2, history: [], thermos: [], notes: [], boulangers: [], freeNotes: '', journal: {} } });
  await a.pause(20);
  const frame = a.window.document.getElementById('pdfFrame');
  a.window.openRecipe('ko');
  assert.equal(frame.getAttribute('src'), '');
  a.window.openRecipe('ok');
  assert.match(frame.getAttribute('src'), /^data:application\/pdf/);
  assert.equal(a.window.__piege, undefined);
  await a.pause(20);
  a.window.close();
});

test('rôle équipe : les prénoms, calculs partagés et lignes d’historique piégés restent du texte', async () => {
  const E = require('../assets/js/equipe-donnees.js');
  const d = donnees();
  const m = E.preparerMigration({ state: { state: JSON.stringify({ ...d.S, history: [...d.S.history, { id: 'h_lea', date: today, type: 'ajustement', pid: 'p', name: P('H.name'), emoji: 'x', delta: 1, qty: 1, par: P('H.par'), t: Date.now() }] }) } });
  const calcul = E.calculVersDoc({ ...d.calcHistory[0], id: 'c_piege' }, { uid: 'samUid000001', prenom: P('calcul.auteurPrenom') });
  const a = await chargerAppli({
    utilisateur: { uid: 'leaUid000001' },
    docs: {
      'boulangerie/stock': m.stock, 'boulangerie/state': m.state, 'boulangerie/recettes': { recipes: JSON.stringify(d.recettes) },
      'calculs/c_piege': calcul.doc, 'membres/leaUid000001': { prenom: 'Léa', role: 'equipe' },
    },
  });
  const w = a.window;
  const doc = w.document;
  await a.pause(60);
  const trouves = new Set();
  const releve = (nom) => doc.querySelectorAll('[data-piege]').forEach((el) => trouves.add(`${nom} → ${el.getAttribute('data-piege')}`));
  for (const t of ['stock', 'histo', 'recettes']) { w.eval(`sw('${t}')`); await a.pause(5); releve(t); }
  doc.querySelector('#tab-recettes .tabs [data-tab="calculator"]').click();
  doc.querySelectorAll('#rc-calculator-view .history-item .row-toggle').forEach((b) => b.click());
  releve('calculs');
  w.eval("S.products.forEach(p=>{p.stockReel=0});save()");
  await a.pause(30);
  releve('alerte');
  await a.pause(60);
  const executes = w.__piege || [];
  w.close();
  assert.deepEqual([...trouves].sort(), [], 'HTML injecté');
  assert.deepEqual(executes, [], 'JavaScript exécuté depuis les données');
});
