// Feuilles de calcul dans l'appli : saisie rapide des calculs (texte et dictée), une feuille
// par recette, bouton PDF, allergènes.
// Lancer : node --test tests/test_feuilles.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerAppli } = require('./charger-appli.js');
const { donneesDemo } = require('./donnees-demo.js');
const P = require('../assets/js/fiche-pdf.js');

async function ouvrir(t, opts = {}) {
  const d = donneesDemo();
  const a = await chargerAppli({ etat: d.state, labo: d.labo, recettes: d.recettes, ...opts });
  t.after(() => a.window.close());
  const w = a.window;
  w.eval("openModule('fournil');sw('recettes')");
  w.document.getElementById('tab-calculator').click();
  await a.pause(20);
  return { a, d, w, doc: w.document };
}
const carte = (doc) => doc.querySelector('#rc-saisie-calculs .rc-saisie');
function taper(doc, texte) {
  carte(doc).querySelector('#rcSaisieTexte').value = texte;
  carte(doc).querySelector('.rc-saisie-analyser').click();
}
const lignes = (doc) => [...carte(doc).querySelectorAll('.rc-saisie-ligne')];
const voir = (doc) => carte(doc).querySelector('.rc-saisie-voir');
const feuilles = (doc) => [...carte(doc).querySelectorAll('.rc-feuille')];
const nb = (s) => s.replace(/\u202F/g, ' ').replace(/\s+/g, ' ');
// le PDF n'a que des caractères ASCII : on peut le relire comme du texte
const lire = (w, blob) => new Promise((ok, ko) => { const fr = new w.FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = ko; fr.readAsText(blob); });
const hexPdf = (s) => P.winAnsi(s).map((o) => o.toString(16).padStart(2, '0')).join('');

test('saisie rapide : une feuille par recette, nom ambigu demandé, poids non arrondis', async (t) => {
  const { a, doc } = await ouvrir(t);
  assert.ok(carte(doc), 'carte en haut de l’écran Calcul');
  taper(doc, '30 baguettes de tradition à 350 g, 20 pains de campagne à 500 g, 5 brioches à 400 g');
  const L = lignes(doc);
  assert.equal(L.length, 3);
  assert.equal(L[0].querySelector('select').value, 'r_1', 'nom identique : repris');
  assert.equal(L[1].querySelector('select').value, 'r_3');
  // « brioches » : proche de « Brioche Nanterre » mais pas identique → demandé, pas deviné
  assert.equal(L[2].querySelector('select').value, '');
  assert.match(nb(L[2].textContent), /plusieurs recettes possibles/);
  assert.match(L[2].querySelector('select').textContent, /Brioche Nanterre \(proposée\)/);
  assert.equal(voir(doc).disabled, true);
  L[2].querySelector('select').value = 'r_2';
  L[2].querySelector('select').dispatchEvent(new a.window.Event('change'));
  assert.equal(voir(doc).disabled, false);
  assert.match(voir(doc).textContent, /Voir les 3 feuilles/);
  voir(doc).click();
  const F = feuilles(doc);
  assert.equal(F.length, 3, 'une feuille par recette');
  const t0 = nb(F[0].textContent);
  assert.match(t0, /Baguette de tradition/);
  assert.match(t0, /30 baguettes de tradition × 350 g = 10 500 g/);
  // 10 500 g de pâte, recette de 1 942 g pour 1 kg de farine : 1000 × 10500 / 1942 g de farine
  assert.match(t0, /Farine T65\s*5 406,797 g/);
  assert.match(t0, /Total pâte crue : 10 500 g/);
  assert.match(nb(F[2].textContent), /Brioche Nanterre[\s\S]*5 brioches × 400 g = 2 000 g/);
  assert.equal(carte(doc).querySelectorAll('.rc-feuille .ref-line').length, 3, 'pas de total global');
  assert.ok(!/total général|tout compris/i.test(carte(doc).textContent));
  assert.deepEqual(a.erreurs, []);
});

test('saisie rapide : recette inconnue à choisir ou à retirer, ligne incomplète expliquée', async (t) => {
  const { doc } = await ouvrir(t);
  taper(doc, '12 fougasses à 300 g, 10 pains de campagne, 8 brioches nanterre à 0,25 kg');
  const L = lignes(doc);
  assert.match(nb(L[0].textContent), /« fougasses » : recette inconnue/);
  assert.equal(L[0].querySelector('select').value, '');
  assert.match(nb(L[1].textContent), /Poids par pièce manquant/);
  assert.equal(L[2].querySelector('select').value, 'r_2');
  assert.match(nb(L[2].textContent), /8 brioches nanterre × 250 g/);
  L[0].querySelector('.rc-saisie-retirer').click();
  lignes(doc)[0].querySelector('.rc-saisie-retirer').click();
  assert.equal(lignes(doc).length, 1);
  assert.equal(voir(doc).disabled, false);
  assert.match(voir(doc).textContent, /Voir la feuille/);
});

test('saisie rapide : enregistrer les feuilles dans les calculs enregistrés (avec les pièces)', async (t) => {
  const { a, doc } = await ouvrir(t);
  taper(doc, '30 baguettes de tradition à 350 g, 20 pains de campagne à 500 g');
  voir(doc).click();
  carte(doc).querySelector('.rc-saisie-tout').click();
  await a.pause(30);
  const h = JSON.parse(a.fake.docs.get('boulangerie/recettes').calcHistory);
  assert.deepEqual(h.slice(0, 2).map((c) => c.recipeName), ['Baguette de tradition', 'Pain de campagne']);
  assert.deepEqual(h[0].pieces, [{ label: 'baguettes de tradition', count: 30, weight: 350 }]);
  assert.equal(h[0].targetG, 10500);
  assert.ok(Math.abs(h[0].breakdown[0].grams - (1000 * 10500) / 1942) < 1e-9, 'poids exacts');
  assert.ok(carte(doc).querySelector('.rc-saisie-tout').disabled);
  assert.match(doc.getElementById('rc-calculator-view').textContent, /Calculs enregistrés/);
});

test('dictée : le texte dicté arrive dans le champ', async (t) => {
  const { doc } = await ouvrir(t, {
    preparer(window) {
      window.SpeechRecognition = class {
        start() { setTimeout(() => { this.onresult({ results: [[{ transcript: 'trente pains de campagne à 500 grammes' }]] }); this.onend(); }, 0); }
        stop() { this.onend(); }
      };
    },
  });
  const micro = carte(doc).querySelector('.rc-saisie-micro');
  assert.equal(micro.disabled, false);
  micro.click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(carte(doc).querySelector('#rcSaisieTexte').value, 'trente pains de campagne à 500 grammes');
  carte(doc).querySelector('.rc-saisie-analyser').click();
  assert.equal(lignes(doc)[0].querySelector('select').value, 'r_3');
  assert.match(nb(lignes(doc)[0].textContent), /30 pains de campagne × 500 g/);
});

test('PDF : sur chaque feuille, téléchargé sur l’appareil, rien envoyé en ligne', async (t) => {
  const { a, doc } = await ouvrir(t);
  taper(doc, '5 brioches nanterre à 400 g');
  voir(doc).click();
  const ecrituresAvant = a.fake.writes.length;
  feuilles(doc)[0].querySelector('[data-action=pdf]').click();
  await a.pause(20);
  assert.equal(a.telechargements.length, 1);
  const f = a.telechargements[0];
  assert.match(f.nom, /^fiche-brioche-nanterre-\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.equal(f.blob.type, 'application/pdf');
  const texte = await lire(a.window, f.blob);
  assert.ok(texte.startsWith('%PDF-1.4'));
  assert.ok(texte.includes(hexPdf('Brioche Nanterre')));
  assert.ok(texte.includes(hexPdf('5 brioches nanterre × 400 g = 2 000 g')));
  assert.ok(texte.includes(hexPdf('Œufs (Œufs)')), 'allergènes dans le PDF');
  assert.ok(texte.includes(hexPdf('Pétrissage lent, beurre ajouté en fin')), 'étapes de la recette');
  assert.equal(a.fake.writes.length, ecrituresAvant, 'rien écrit dans la base');
  assert.deepEqual(a.reseau, [], 'aucun accès réseau');
});

test('PDF aussi sur la feuille de Grigne et sur les calculs enregistrés', async (t) => {
  const d = donneesDemo();
  const { a, doc, w } = await ouvrir(t, { docs: { 'boulangerie/recettes': { recipes: JSON.stringify(d.recettes), calcHistory: JSON.stringify(d.calcHistory) } } });
  const vue = doc.getElementById('rc-calculator-view');
  const champ = vue.querySelector('.stepper input');
  champ.value = '10';
  champ.dispatchEvent(new w.Event('input'));
  vue.querySelector('.result-card .rc-pdf-btn').click();
  await a.pause(20);
  assert.equal(a.telechargements.length, 1);
  assert.match(a.telechargements[0].nom, /^fiche-baguette-de-tradition-/);
  const ligne = vue.querySelector('.history-item');
  ligne.querySelector('.rc-pdf-btn').click();
  await a.pause(20);
  assert.equal(a.telechargements.length, 2);
  const texte = await lire(w, a.telechargements[1].blob);
  assert.ok(texte.includes(hexPdf('Fournée du matin')));
});

test('allergènes : sur la feuille en cours, les calculs enregistrés et la Bibliothèque', async (t) => {
  const { doc, w } = await ouvrir(t);
  // feuille de Grigne (Baguette de tradition) : gluten
  const vue = doc.getElementById('rc-calculator-view');
  assert.match(nb(vue.querySelector('.result-card .rc-allergenes').textContent), /Allergènes Gluten/);
  assert.match(vue.querySelector('.result-card .rc-allergenes').textContent, /vérifie les étiquettes/);
  // Brioche Nanterre : gluten, œufs, lait
  const sel = vue.querySelector('#rc-calc-recipe');
  sel.value = 'r_2';
  sel.dispatchEvent(new w.Event('change'));
  const noms = [...doc.querySelectorAll('#rc-calculator-view .result-card .rc-allergenes-liste li')].map((li) => li.textContent);
  assert.deepEqual(noms, ['Gluten', 'Œufs', 'Lait']);
  // Bibliothèque
  doc.getElementById('tab-library').click();
  const cartes = [...doc.querySelectorAll('#rc-library-view .recipe-row')];
  assert.equal(cartes.length, 4);
  assert.ok(cartes.every((c) => c.querySelector('.rc-allergenes')), 'chaque recette a ses allergènes');
  assert.deepEqual([...cartes[1].querySelectorAll('.rc-allergenes-liste li')].map((li) => li.textContent), ['Gluten', 'Œufs', 'Lait']);
});
