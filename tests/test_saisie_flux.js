// Saisie rapide dans l'appli : aperçu, corrections, enregistrement en une seule
// opération, une seule ligne d'historique, dictée.
// Lancer : node --test tests/test_saisie_flux.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerAppli } = require('./charger-appli.js');
const { donneesDemo } = require('./donnees-demo.js');

async function ouvrir(t, opts = {}) {
  const d = donneesDemo();
  const a = await chargerAppli({ etat: d.state, labo: d.labo, recettes: d.recettes, ...opts });
  t.after(() => a.window.close());
  a.window.eval("openModule('fournil');sw('stock')");
  return { a, d, w: a.window, doc: a.window.document };
}
const etat = (a) => JSON.parse(a.fake.docs.get('boulangerie/state').state);
const lignes = (doc) => [...doc.querySelectorAll('#saisieRapide .saisie-ligne')];
function taper(doc, texte) {
  doc.getElementById('saisieTexte').value = texte;
  doc.querySelector('#saisieRapide .saisie-apercu-btn').click();
}
const valider = (doc) => doc.querySelector('#saisieRapide [data-action=valider]');
const ecrituresState = (a) => a.fake.writes.filter((x) => x.path === 'boulangerie/state').length;

test("l'exemple : aperçu, nouveau produit, enregistrement en une seule opération", async (t) => {
  const { a, d, w, doc } = await ouvrir(t);
  assert.ok(doc.querySelector('#tab-stock > #saisieRapide'), 'carte en haut du Stock');
  taper(doc, '40 viennoises, 50 chaussons, 200 pains au chocolat, 300 croissants');
  const L = lignes(doc);
  assert.equal(L.length, 4);
  const txt = L.map((li) => li.textContent.replace(/\s+/g, ' '));
  assert.match(txt[0], /Stock : 22 → 62/);
  assert.match(txt[1], /nouveau produit/);
  assert.equal(L[1].querySelector('.saisie-nom').value, 'Chausson');
  assert.match(txt[1], /Stock : 0 → 50/);
  assert.match(txt[2], /Stock : 48 → 248/);
  assert.match(txt[3], /Stock : 64 → 364/);
  assert.equal(valider(doc).disabled, false);
  assert.match(valider(doc).textContent, /Enregistrer 4 lignes/);

  const avant = ecrituresState(a);
  const histoAvant = etat(a).history.length;
  valider(doc).click();
  await a.pause(20);
  assert.equal(ecrituresState(a) - avant, 1, 'une seule écriture');
  const s = etat(a);
  const p = (id) => s.products.find((x) => x.id === id);
  assert.equal(p('viennoise').stockReel, 62);
  assert.equal(p('pain_choc').stockReel, 248);
  assert.equal(p('croissant').stockReel, 364);
  const chausson = s.products.find((x) => x.name === 'Chausson');
  assert.ok(chausson, 'Chausson créé');
  assert.equal(chausson.stockReel, 50);
  assert.deepEqual(Object.keys(chausson).sort(), Object.keys(d.state.products[0]).concat('recipeUrl').filter((k, i, t2) => t2.indexOf(k) === i).sort(), 'même forme que les autres produits');
  assert.equal(s.history.length, histoAvant + 1, 'une seule ligne d’historique');
  assert.equal(s.history[0].type, 'saisie');
  assert.deepEqual(s.history[0].lignes.map((l) => [l.name, l.delta, !!l.nouveau]), [['Viennoise', 40, false], ['Chausson', 50, true], ['Pain au chocolat', 200, false], ['Croissant', 300, false]]);
  assert.equal(doc.getElementById('saisieTexte').value, '', 'champ vidé');
  assert.match(doc.querySelector('#saisieRapide .saisie-apercu').textContent, /4 produits mis à jour/);
  assert.ok(doc.getElementById('pc-' + chausson.id), 'carte du nouveau produit affichée');
  w.eval("sw('histo')");
  assert.match(doc.getElementById('histoList').textContent, /Saisie rapide · \+40 Viennoise, \+50 Chausson \(nouveau\)/);
  assert.deepEqual(a.erreurs, []);
});

test('un nombre seul est signalé ; on ne peut pas enregistrer tant que la ligne reste', async (t) => {
  const { a, doc } = await ouvrir(t);
  taper(doc, '40 croissants, 25');
  const L = lignes(doc);
  assert.equal(L.length, 2);
  assert.ok(L[1].classList.contains('a-corriger'));
  assert.match(L[1].textContent, /Nombre sans produit/);
  assert.equal(valider(doc).disabled, true);
  const avant = a.fake.writes.length;
  valider(doc).click();
  await a.pause(10);
  assert.equal(a.fake.writes.length, avant, 'rien enregistré');
  L[1].querySelector('[data-champ=supprimer]').click();
  assert.equal(lignes(doc).length, 1);
  assert.equal(valider(doc).disabled, false);
  valider(doc).click();
  await a.pause(20);
  assert.equal(etat(a).products.find((p) => p.id === 'croissant').stockReel, 104);
});

test('RETIRER : le stock ne descend pas sous 0 et l’aperçu prévient', async (t) => {
  const { a, doc } = await ouvrir(t);
  doc.querySelector('#saisieRapide [data-mode=retirer]').click();
  taper(doc, '20 brioches, 10 croissants');
  const L = lignes(doc);
  assert.match(L[0].textContent.replace(/\s+/g, ' '), /Stock : 9 → 0 \(il n'y en a que 9 : le stock passera à 0, pas en dessous\)/);
  assert.match(L[1].textContent, /Stock : 64 → 54/);
  valider(doc).click();
  await a.pause(20);
  const s = etat(a);
  assert.equal(s.products.find((p) => p.id === 'brioche').stockReel, 0);
  assert.equal(s.products.find((p) => p.id === 'croissant').stockReel, 54);
  assert.deepEqual(s.history[0].lignes.map((l) => [l.delta, l.demande]), [[-9, -20], [-10, -10]]);
});

test('un signe moins force le retrait de la ligne même en mode AJOUTER', async (t) => {
  const { a, doc } = await ouvrir(t);
  taper(doc, '-20 croissants, 5 brioches');
  const L = lignes(doc);
  assert.match(L[0].textContent, /Stock : 64 → 44/);
  assert.match(L[1].textContent, /Stock : 9 → 14/);
  valider(doc).click();
  await a.pause(20);
  assert.equal(etat(a).products.find((p) => p.id === 'croissant').stockReel, 44);
});

test('corriger une ligne : nom vague à choisir, quantité et sens modifiables', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  taper(doc, '30 pains');
  let L = lignes(doc);
  assert.match(L[0].textContent, /Plusieurs produits possibles/);
  assert.match(L[0].querySelector('select').textContent, /Pain au chocolat \(proposé\)[\s\S]*Pain aux raisins \(proposé\)/);
  const sel = L[0].querySelector('select');
  sel.value = 'pain_raisins';
  sel.dispatchEvent(new w.Event('change'));
  L = lignes(doc);
  const qte = L[0].querySelector('[data-champ=quantite]');
  qte.value = '12';
  qte.dispatchEvent(new w.Event('change'));
  L = lignes(doc);
  assert.match(L[0].textContent, /Stock : 0 → 12/);
  L[0].querySelector('[data-champ=sens]').click();
  L = lignes(doc);
  assert.match(L[0].textContent, /Stock : 0 → 0/);
  L[0].querySelector('[data-champ=sens]').click();
  valider(doc).click();
  await a.pause(20);
  assert.equal(etat(a).products.find((p) => p.id === 'pain_raisins').stockReel, 12);
});

test('deux lignes sur le même nouveau produit : un seul produit créé', async (t) => {
  const { a, doc } = await ouvrir(t);
  taper(doc, '10 chaussons et 5 chaussons');
  valider(doc).click();
  await a.pause(20);
  const c = etat(a).products.filter((p) => p.name === 'Chausson');
  assert.equal(c.length, 1);
  assert.equal(c[0].stockReel, 15);
});

test('le texte tapé est échappé dans l’aperçu', async (t) => {
  const { a, w, doc } = await ouvrir(t);
  w.__piege = 0;
  taper(doc, '3 <img src=x onerror="window.__piege=1">');
  assert.equal(doc.querySelector('#saisieRapide img'), null);
  assert.match(lignes(doc)[0].textContent, /<img src=x/);
  valider(doc).click();
  await a.pause(20);
  w.eval("sw('stock')");
  assert.equal(doc.querySelector('#stockList img'), null);
  assert.equal(w.__piege, 0);
});

test('dictée : le texte dicté s’affiche dans le champ, sans aperçu automatique', async (t) => {
  const { doc } = await ouvrir(t, {
    preparer(window) {
      window.SpeechRecognition = class {
        start() {
          setTimeout(() => {
            this.onresult({ results: [[{ transcript: '40 viennoises et 300 croissants' }]] });
            this.onend();
          }, 0);
        }
        stop() { this.onend(); }
      };
    },
  });
  const micro = doc.querySelector('#saisieRapide .saisie-micro');
  assert.equal(micro.disabled, false);
  doc.getElementById('saisieTexte').value = '10 brioches';
  micro.click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(doc.getElementById('saisieTexte').value, '10 brioches, 40 viennoises et 300 croissants');
  assert.equal(lignes(doc).length, 0, "pas d'aperçu avant que l'utilisateur le demande");
});
