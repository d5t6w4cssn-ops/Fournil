// Saisie rapide des calculs : reconnaissance du texte, rapprochement des recettes.
// Lancer : node --test tests/test_saisie_calculs.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../assets/js/saisie-calculs.js');

F.utiliserSaisieStock(require('../assets/js/saisie-rapide.js'));

const R = [
  { id: 'r1', name: 'Pain sportif' },
  { id: 'r2', name: 'Campagne' },
  { id: 'r3', name: 'Pain de campagne au levain' },
  { id: 'r4', name: 'Baguette de tradition' },
  { id: 'r5', name: 'Baguette' },
  { id: 'r6', name: 'Brioche Nanterre' },
];
const simple = (t) => F.analyser(t).map((l) => [l.nombre, l.nom, l.poidsG, l.erreur]);

test('l’exemple : deux lignes, poids en grammes', () => {
  assert.deepEqual(simple('30 pains sportifs à 400 g, 20 campagnes à 500 g'), [[30, 'pains sportifs', 400, null], [20, 'campagnes', 500, null]]);
});

test('écritures variées : kg, décimales, « × », dictée sans virgule, nombres en lettres', () => {
  assert.deepEqual(simple('15 baguettes à 0,35 kg; 8 × 1,2 kg de pain de campagne au levain'), [[15, 'baguettes', 350, null], [8, 'pain de campagne au levain', 1200, null]]);
  assert.deepEqual(simple('trente pains sportifs à 400 grammes vingt campagnes à 500 grammes'), [[30, 'pains sportifs', 400, null], [20, 'campagnes', 500, null]]);
  assert.deepEqual(simple('10 brioches de 250g et 12 baguettes à 300 g'), [[10, 'brioches', 250, null], [12, 'baguettes', 300, null]]);
  assert.deepEqual(simple('4 pains de campagne à 1 kilo'), [[4, 'pains de campagne', 1000, null]]);
});

test('poids jamais arrondis', () => {
  assert.equal(F.analyser('3 pains à 333,3 g')[0].poidsG, 333.3);
  assert.equal(F.analyser('7 pains à 0,4125 kg')[0].poidsG, 412.5);
  assert.equal(F.grammes(4012.5), '4 012,5 g');
  assert.equal(F.grammes(117.6470588), '117,647 g', 'seules les traces de calcul au-delà du milligramme sont ôtées');
  assert.equal(F.grammes(12000), '12 000 g');
  assert.equal(F.grammes(0.1 + 0.2), '0,3 g');
});

test('lignes incomplètes : message clair, rien de deviné', () => {
  const e = (t) => F.analyser(t)[0].erreur;
  assert.equal(e('30 pains sportifs'), 'sans-poids');
  assert.equal(e('30 pains sportifs à 400'), 'sans-unite');
  assert.equal(e('pains sportifs à 400 g'), 'sans-nombre');
  assert.equal(e('2,5 pains à 400 g'), 'nombre-invalide');
  assert.equal(e('0 pain à 400 g'), 'nombre-invalide');
  assert.ok(Object.values(F.MESSAGES).every((m) => typeof m === 'string' && m.length > 10));
});

test('rapprochement : identique (pluriel, accents, majuscules) → trouvé ; sinon on demande', () => {
  assert.equal(F.rapprocher('pains sportifs', R).recette.id, 'r1');
  assert.equal(F.rapprocher('CAMPAGNES', R).recette.id, 'r2');
  assert.equal(F.rapprocher('brioches nanterre', R).recette.id, 'r6');
  // « baguettes » : la recette « Baguette » existe, identique → trouvée
  assert.equal(F.rapprocher('baguettes', R).recette.id, 'r5');
  // proche mais pas identique : jamais choisi tout seul
  const b = F.rapprocher('brioches', R);
  assert.equal(b.statut, 'ambigu');
  assert.deepEqual(b.candidats.map((r) => r.id), ['r6']);
  const t = F.rapprocher('tradition', R);
  assert.equal(t.statut, 'ambigu');
  assert.deepEqual(t.candidats.map((r) => r.id), ['r4']);
  assert.equal(F.rapprocher('fougasse', R).statut, 'inconnu');
  // deux recettes au même nom : ambigu
  assert.equal(F.rapprocher('campagne', [...R, { id: 'r7', name: 'campagnes' }]).statut, 'ambigu');
});

test('une feuille par recette, dans l’ordre, sans total global', () => {
  const f = F.feuilles([
    { recetteId: 'r1', nombre: 30, poidsG: 400, nom: 'pains sportifs' },
    { recetteId: 'r2', nombre: 20, poidsG: 500, nom: 'campagnes' },
    { recetteId: 'r1', nombre: 5, poidsG: 800, nom: 'gros pains sportifs' },
  ]);
  assert.deepEqual(f, [
    { recetteId: 'r1', pieces: [{ label: 'pains sportifs', count: 30, weight: 400 }, { label: 'gros pains sportifs', count: 5, weight: 800 }] },
    { recetteId: 'r2', pieces: [{ label: 'campagnes', count: 20, weight: 500 }] },
  ]);
});
