// Aller-retour Fournil ↔ Grigne avec le vrai code de lecture de Grigne
// (~/grigne/src/js/core/export.js, importé en lecture seule : rien n'est modifié).
// Lancer : node --test tests/test_echange_grigne.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chargerAppli } = require('./charger-appli.js');

const GRIGNE = process.env.GRIGNE_DIR || path.join(os.homedir(), 'grigne');
const EXPORT_JS = path.join(GRIGNE, 'src', 'js', 'core', 'export.js');
const absent = !fs.existsSync(EXPORT_JS) && `Grigne introuvable (${EXPORT_JS})`;
const grigne = () => import(pathToFileURL(EXPORT_JS).href);

const ing = (id, name, qtyG) => ({ id, name, qtyG });
const FOURNIL = [
  { id: 'r1', name: 'Baguette', ingredients: [ing('a', 'Farine T65', 1000), ing('b', 'Eau', 680), ing('c', 'Sel', 20), ing('d', 'Levure', 2.5)], notes: 'Pointage 1 h\nApprêt 45 min' },
  { id: 'r2', name: 'Brioche « maison » & co', ingredients: [ing('a', 'Farine T45', 1000), ing('b', 'Beurre', 500)], notes: '', tb: 54 },
];
const GRIGNE_RECETTES = [
  { id: 'k3f9a21', name: 'Pain de campagne', ingredients: [ing('a1', 'Farine T80', 800), ing('a2', 'Farine de seigle T130', 200), ing('a3', 'Eau', 700), ing('a4', 'Sel', 20)], notes: 'Autolyse 1 h\nCuisson 45 min à 240 °C', tb: 56 },
  { id: 'p8x2m4', name: 'Pâte à pizza', ingredients: [ing('b1', 'Farine T00', 1000), ing('b2', 'Eau', 650), ing('b3', 'Levure fraîche', 2.5)], notes: '', tb: '' },
];
const sansIds = (list) => list.map((r) => ({
  name: r.name,
  ingredients: r.ingredients.map((i) => [i.name, i.qtyG]),
  notes: r.notes || '',
  tb: typeof r.tb === 'number' ? r.tb : null,
}));

test('Fournil → Grigne : le fichier exporté par Fournil est lu tel quel par Grigne', { skip: absent }, async () => {
  const { parseExport, mergeImport } = await grigne();
  const a = await chargerAppli({ recettes: FOURNIL });
  const f = await a.exporter();
  a.window.close();

  const lu = parseExport(f.texte);
  assert.equal(lu.error, undefined);
  assert.deepEqual(sansIds(lu.recipes), sansIds(FOURNIL));

  // Import dans un Grigne vide : tout est ajouté
  const vide = mergeImport({ recipes: [], history: [] }, lu, () => Math.random().toString(36).slice(2));
  assert.equal(vide.added, 2);
  assert.equal(vide.skipped, 0);
  // Deuxième import : tout est reconnu comme déjà présent
  const encore = mergeImport({ recipes: vide.recipes, history: vide.history }, parseExport(f.texte), () => 'x');
  assert.equal(encore.added, 0);
  assert.equal(encore.skipped, 2);
});

test('Grigne → Fournil → Grigne : un fichier Grigne importé dans Fournil puis réexporté revient identique', { skip: absent }, async () => {
  const { exportText, parseExport, mergeImport } = await grigne();
  const texteGrigne = exportText(GRIGNE_RECETTES, [], new Date('2026-11-17T08:30:00Z'));

  const a = await chargerAppli({ recettes: FOURNIL });
  await a.choisirFichier(texteGrigne, 'grigne-recettes-2026-11-17.json');
  assert.match(a.zone().textContent, /2 recettes à ajouter, 0 déjà présente/);
  await a.confirmer();
  assert.match(a.zone().textContent, /Import terminé : 2 recettes ajoutées, 0 déjà présente/);
  const base = a.recettesEnBase();
  assert.deepEqual(sansIds(base.slice(0, 2)), sansIds(FOURNIL), 'recettes Fournil intactes');
  assert.deepEqual(sansIds(base.slice(2)), sansIds(GRIGNE_RECETTES), 'recettes Grigne identiques');

  // Réexport depuis Fournil, réimport dans le Grigne d'origine : rien de nouveau sauf les recettes Fournil
  const f = await a.exporter();
  a.window.close();
  const origine = { recipes: parseExport(texteGrigne).recipes, history: [] };
  const fusion = mergeImport(origine, parseExport(f.texte), () => 'nouvel-id');
  assert.equal(fusion.skipped, 2, 'les 2 recettes Grigne sont reconnues');
  assert.equal(fusion.added, 2, 'seules les 2 recettes Fournil sont ajoutées');
});

test('Grigne → Fournil : réimporter le même fichier Grigne ne crée pas de doublon', { skip: absent }, async () => {
  const { exportText } = await grigne();
  const texteGrigne = exportText(GRIGNE_RECETTES, [], new Date());
  const a = await chargerAppli({ recettes: [] });
  await a.choisirFichier(texteGrigne);
  await a.confirmer();
  await a.choisirFichier(texteGrigne);
  assert.match(a.zone().textContent, /Rien à ajouter : 2 recettes déjà présentes/);
  assert.equal(a.recettesEnBase().length, 2);
  a.window.close();
});
