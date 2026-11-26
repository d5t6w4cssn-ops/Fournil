// Export / import des recettes au format Grigne, testé dans l'appli complète
// (jsdom) avec le faux Firebase. Lancer : node --test tests/test_echange_recettes.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerAppli } = require('./charger-appli.js');

const ing = (id, name, qtyG) => ({ id, name, qtyG });
const EXISTANTES = [
  { id: 'r1', name: 'Baguette', ingredients: [ing('a', 'Farine T65', 1000), ing('b', 'Eau', 680), ing('c', 'Sel', 20)], notes: 'Pointage 1 h' },
  { id: 'r2', name: 'Brioche', ingredients: [ing('a', 'Farine T45', 1000), ing('b', 'Beurre', 500)], notes: '', tb: 54 },
  { id: 'r3', name: 'Pain de seigle', ingredients: [ing('a', 'Farine de seigle', 1000), ing('b', 'Eau', 800)], notes: '' },
];

function fichierGrigne(recipes, extra = {}) {
  return JSON.stringify({
    app: 'grigne',
    version: 2,
    exportedAt: '2026-11-17T08:30:00.000Z',
    recipeCount: recipes.length,
    recipes: recipes.map((r) => ({
      id: r.id,
      name: r.name,
      ingredients: r.ingredients.map((i) => ({ ...i, unit: 'g' })),
      notes: r.notes || '',
      tb: typeof r.tb === 'number' ? r.tb : null,
    })),
    history: [],
    ...extra,
  }, null, 2);
}

const nouvelle = (n) => ({ id: `g${n}`, name: `Recette Grigne ${n}`, ingredients: [ing('x', 'Farine T80', 500 + n), ing('y', 'Eau', 350)], notes: `Étape ${n}`, tb: 56 });

test("l'appli se charge sans erreur ni accès réseau", async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  assert.deepEqual(a.erreurs, []);
  assert.deepEqual(a.reseau, []);
  assert.ok(a.carte(), 'la carte « Mes recettes : exporter / importer » est affichée');
  assert.match(a.carte().textContent, /Mes recettes : exporter \/ importer/);
  a.window.close();
});

test('exporter : fichier au format Grigne v2, sans aucune écriture', async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  const avant = a.fake.writes.length;
  const f = await a.exporter();
  assert.ok(f, 'un fichier est téléchargé');
  assert.match(f.nom, /^fournil-recettes-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(a.fake.writes.length, avant, 'aucune écriture dans Firebase');
  const d = JSON.parse(f.texte);
  assert.equal(d.app, 'grigne');
  assert.equal(d.version, 2);
  assert.ok(!Number.isNaN(Date.parse(d.exportedAt)));
  assert.equal(d.recipeCount, 3);
  assert.equal(d.recipes.length, 3);
  assert.deepEqual(d.history, []);
  assert.deepEqual(d.recipes[0], {
    id: 'r1', name: 'Baguette', notes: 'Pointage 1 h', tb: null,
    ingredients: [
      { id: 'a', name: 'Farine T65', qtyG: 1000, unit: 'g' },
      { id: 'b', name: 'Eau', qtyG: 680, unit: 'g' },
      { id: 'c', name: 'Sel', qtyG: 20, unit: 'g' },
    ],
  });
  assert.equal(d.recipes[1].tb, 54);
  assert.match(f.texte, /\n {2}"app"/, 'JSON indenté de 2 espaces');
  assert.match(a.zone().textContent, /3 recettes exportées/);
  a.window.close();
});

test("exporter : une recette sans nom ou sans ingrédient valide n'est pas exportée", async () => {
  const a = await chargerAppli({
    recettes: [...EXISTANTES, { id: 'bad', name: '  ', ingredients: [ing('a', 'Farine', 100)], notes: '' }],
  });
  const d = JSON.parse((await a.exporter()).texte);
  assert.equal(d.recipeCount, 3);
  assert.match(a.zone().textContent, /1 recette sans nom ou sans ingrédient n’a pas été exportée/);
  a.window.close();
});

test('exporter : bibliothèque vide → message, aucun fichier', async () => {
  const a = await chargerAppli({ recettes: [] });
  assert.equal(await a.exporter(), null);
  assert.match(a.zone().textContent, /Aucune recette à exporter/);
  a.window.close();
});

test("importer : aperçu, rien n'est écrit avant la confirmation", async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  const avant = a.fake.writes.length;
  const fichier = fichierGrigne([
    nouvelle(1), nouvelle(2), nouvelle(3), nouvelle(4),
    EXISTANTES[0], // identique (même id)
    { ...EXISTANTES[1], id: 'autre-id' }, // identique, autre id
    { id: 'r3', name: 'Pain de seigle', ingredients: [ing('a', 'Farine de seigle', 900)], notes: '' }, // même nom, contenu différent
  ]);
  await a.choisirFichier(fichier, 'grigne-recettes-2026-11-17.json');
  const t = a.zone().textContent.replace(/\s+/g, ' ');
  assert.match(t, /5 recettes à ajouter, 2 déjà présentes/);
  assert.match(t, /grigne-recettes-2026-11-17\.json/);
  assert.match(t, /Pain de seigle \(importée\)/);
  assert.ok(a.zone().querySelector('.rc-import-ok'), 'bouton de confirmation');
  assert.equal(a.fake.writes.length, avant, 'aucune écriture avant confirmation');
  assert.equal(a.recettesEnBase().length, 3);
  a.window.close();
});

test('importer : annuler ne change rien', async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  const avant = a.fake.writes.length;
  await a.choisirFichier(fichierGrigne([nouvelle(1)]));
  a.zone().querySelector('.rc-import-cancel').click();
  await a.pause(20);
  assert.equal(a.fake.writes.length, avant);
  assert.equal(a.zone().textContent.trim(), '');
  a.window.close();
});

test("importer : ajoute sans jamais écraser, puis bilan ; un second import n'ajoute rien", async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  const autreSeigle = { id: 'r3', name: 'Pain de seigle', ingredients: [ing('a', 'Farine de seigle', 900)], notes: '' };
  const fichier = fichierGrigne([nouvelle(1), nouvelle(2), EXISTANTES[0], autreSeigle]);
  await a.choisirFichier(fichier);
  await a.confirmer();

  assert.equal(a.ecrituresRecettes().length, 1, 'une seule écriture');
  const base = a.recettesEnBase();
  assert.equal(base.length, 6);
  // les recettes existantes sont intactes, dans le même ordre
  assert.deepEqual(base.slice(0, 3), EXISTANTES);
  const ajoutees = base.slice(3);
  assert.deepEqual(ajoutees.map((r) => r.name), ['Recette Grigne 1', 'Recette Grigne 2', 'Pain de seigle (importée)']);
  const seigle = ajoutees[2];
  assert.notEqual(seigle.id, 'r3', "l'identifiant déjà pris est remplacé");
  assert.deepEqual(seigle.ingredients, [ing('a', 'Farine de seigle', 900)]);
  assert.equal(ajoutees[0].tb, 56);
  assert.equal(new Set(base.map((r) => r.id)).size, 6, 'identifiants uniques');

  const bilan = a.zone().textContent.replace(/\s+/g, ' ');
  assert.match(bilan, /Import terminé : 3 recettes ajoutées \(dont 1 renommée « \(importée\) »\), 1 déjà présente \(ignorée\)\./);
  assert.match(a.lib().textContent, /Pain de seigle \(importée\)/, 'la bibliothèque affiche les nouvelles recettes');

  // Même fichier une deuxième fois : rien à ajouter, aucune écriture
  await a.choisirFichier(fichier);
  assert.match(a.zone().textContent, /Rien à ajouter : 4 recettes déjà présentes/);
  assert.equal(a.ecrituresRecettes().length, 1);
  a.window.close();
});

test("importer : « (importée 2) » si « (importée) » est déjà pris", async () => {
  const a = await chargerAppli({
    recettes: [EXISTANTES[0], { ...EXISTANTES[0], id: 'r9', name: 'Baguette (importée)', notes: 'v2' }],
  });
  await a.choisirFichier(fichierGrigne([{ ...EXISTANTES[0], id: 'zz', notes: 'v3' }]));
  await a.confirmer();
  assert.equal(a.recettesEnBase()[2].name, 'Baguette (importée 2)');
  a.window.close();
});

test("importer : repart de la version du serveur, une recette ajoutée ailleurs n'est pas perdue", async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  await a.choisirFichier(fichierGrigne([nouvelle(1)]));
  // Pendant l'aperçu, un autre appareil ajoute une recette (sans que l'écoute temps réel ne l'ait encore apportée)
  const ailleurs = { id: 'r4', name: 'Fougasse', ingredients: [ing('a', 'Farine T65', 1000)], notes: '' };
  a.fake.externalSet('boulangerie/recettes', { recipes: JSON.stringify([...EXISTANTES, ailleurs]) });
  await a.confirmer();
  assert.deepEqual(a.recettesEnBase().map((r) => r.name), ['Baguette', 'Brioche', 'Pain de seigle', 'Fougasse', 'Recette Grigne 1']);
  a.window.close();
});

test("importer : serveur injoignable → rien n'est écrit", async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  await a.choisirFichier(fichierGrigne([nouvelle(1)]));
  const avant = a.fake.writes.length;
  a.fake.setFailServerGet(true);
  await a.confirmer();
  assert.equal(a.fake.writes.length, avant);
  assert.match(a.zone().textContent, /rien n’a été importé/);
  a.window.close();
});

test('importer : fichiers refusés avec un message clair', async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  const avant = a.fake.writes.length;
  const cas = [
    ['pas du json', /n’est pas lisible/],
    [JSON.stringify({ app: 'autre', recipes: [] }), /n’est pas un fichier d’export Grigne/],
    [JSON.stringify({ app: 'grigne', recipes: {} }), /n’est pas un fichier d’export Grigne/],
    [JSON.stringify({ app: 'grigne', version: 3, recipes: [] }), /version plus récente/],
    [JSON.stringify({ app: 'grigne', version: 2, recipes: [{ name: '', ingredients: [] }] }), /aucune recette utilisable/],
  ];
  for (const [texte, attendu] of cas) {
    await a.choisirFichier(texte);
    assert.match(a.zone().textContent, attendu, texte);
  }
  await a.choisirFichier(fichierGrigne([nouvelle(1)]), 'gros.json', 6 * 1024 * 1024);
  assert.match(a.zone().textContent, /trop gros/);
  assert.equal(a.fake.writes.length, avant);
  a.window.close();
});

test('importer : fichier version 1 (tb = "", sans unit) accepté, ingrédients invalides écartés', async () => {
  const a = await chargerAppli({ recettes: [] });
  const v1 = JSON.stringify({
    app: 'grigne',
    exportedAt: '2026-10-01T10:00:00.000Z',
    recipes: [{
      id: 'v1', name: 'Pain de mie', notes: '', tb: '',
      ingredients: [{ id: 'a', name: 'Farine T45', qtyG: 1000 }, { id: 'b', name: 'Lait', qtyG: '600' }, { id: 'c', name: '', qtyG: 5 }, { id: 'd', name: 'Sucre', qtyG: -3 }],
    }],
  });
  await a.choisirFichier(v1);
  assert.match(a.zone().textContent, /1 recette à ajouter, 0 déjà présente/);
  await a.confirmer();
  const [r] = a.recettesEnBase();
  assert.equal(r.name, 'Pain de mie');
  assert.deepEqual(r.ingredients, [ing('a', 'Farine T45', 1000)]);
  assert.equal('tb' in r, false);
  a.window.close();
});

test('importer : le texte du fichier est échappé à l’affichage (aperçu, bilan, bibliothèque)', async () => {
  const a = await chargerAppli({ recettes: [] });
  a.window.__pirate = 0;
  const piege = '<img src=x onerror="window.__pirate=1">';
  const fichier = fichierGrigne([{
    id: '"><svg onload=window.__pirate=2>',
    name: `Pain ${piege}`,
    ingredients: [ing('"><b>', `Farine ${piege}`, 500)],
    notes: `Étape ${piege}`,
  }]);
  await a.choisirFichier(fichier, `nom ${piege}.json`);
  assert.equal(a.carte().querySelector('img, svg[onload], b'), null, 'aperçu sans HTML injecté');
  assert.match(a.zone().textContent, /Pain <img src=x/);
  await a.confirmer();
  await a.pause(20);
  const lib = a.lib();
  assert.equal(lib.querySelector('img[src="x"], svg[onload]'), null, 'bibliothèque sans HTML injecté');
  assert.match(lib.textContent, /Pain <img src=x onerror=/);
  assert.match(lib.textContent, /Farine <img src=x/);
  // ouvrir la recette et ses étapes
  lib.querySelector('.recipe-row').click();
  lib.querySelector('.notes-btn').click();
  assert.equal(lib.querySelector('img[src="x"]'), null);
  assert.equal(a.window.__pirate, 0, 'aucun script exécuté');
  a.window.close();
});

// ── Mettre à jour noms et notes (recettes de même identifiant, mêmes ingrédients) ──
async function choisirMaj(a, texte, nom = 'corrige.json') {
  const input = a.carte().querySelector('.rc-maj-input');
  const file = new a.window.File([texte], nom, { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  const avant = a.zone().innerHTML;
  input.dispatchEvent(new a.window.Event('change'));
  for (let i = 0; i < 300 && a.zone().innerHTML === avant; i++) await a.pause(10);
  await a.pause(10);
}
async function confirmerMaj(a) {
  a.zone().querySelector('.rc-maj-ok').click();
  for (let i = 0; i < 300 && !/Mise à jour terminée|rien n’a été mis à jour/.test(a.zone().textContent); i++) await a.pause(10);
  await a.pause(10);
}
const CORRIGE = [
  { ...EXISTANTES[0], name: 'Baguette de tradition', notes: 'Pointage\n1. 1 h.', ingredients: [ing('a', 'Farine T65 (Tradition)', 1000), ing('b', 'Eau', 680), ing('c', 'Sel fin', 20)] },
  EXISTANTES[1], // identique : rien à faire
  { ...EXISTANTES[2], notes: 'Cuisson\n1. 45 min.', ingredients: [ing('a', 'Farine de seigle', 999), ing('b', 'Eau', 800)] }, // quantité changée : refusée
  nouvelle(1), // absente : ignorée, jamais ajoutée
];

test('mettre à jour : aperçu sans écriture, refus si les quantités diffèrent', async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  const avant = a.fake.writes.length;
  await choisirMaj(a, fichierGrigne(CORRIGE));
  const t = a.zone().textContent.replace(/\s+/g, ' ');
  assert.match(t, /1 recette à mettre à jour, 1 déjà à jour, 1 absente de ta bibliothèque/);
  assert.match(t, /Baguette → Baguette de tradition \(notes, 2 noms d’ingrédients\)/);
  assert.match(t, /Refusées : Pain de seigle \(ingrédients ou quantités différents\)/);
  assert.equal(a.fake.writes.length, avant, 'aucune écriture avant confirmation');
  a.zone().querySelector('.rc-import-cancel').click();
  await a.pause(20);
  assert.equal(a.fake.writes.length, avant);
  a.window.close();
});

test('mettre à jour : sauvegarde téléchargée d’abord, puis seuls noms et notes changent', async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  await choisirMaj(a, fichierGrigne(CORRIGE));
  const nbTelech = a.telechargements.length;
  await confirmerMaj(a);
  assert.equal(a.telechargements.length, nbTelech + 1, 'une sauvegarde téléchargée');
  const sauv = a.telechargements.at(-1);
  assert.match(sauv.nom, /^fournil-recettes-sauvegarde-\d{4}-\d{2}-\d{2}-\d{2}h\d{2}\.json$/);
  const texte = await new Promise((ok) => { const fr = new a.window.FileReader(); fr.onload = () => ok(fr.result); fr.readAsText(sauv.blob); });
  assert.deepEqual(JSON.parse(texte).recipes.map((r) => r.name), ['Baguette', 'Brioche', 'Pain de seigle'], 'la sauvegarde est la version d’avant');
  assert.equal(a.ecrituresRecettes().length, 1, 'une seule écriture');
  const base = a.recettesEnBase();
  assert.equal(base.length, 3, 'rien ajouté ni supprimé');
  assert.deepEqual(base[0], { id: 'r1', name: 'Baguette de tradition', notes: 'Pointage\n1. 1 h.', ingredients: [ing('a', 'Farine T65 (Tradition)', 1000), ing('b', 'Eau', 680), ing('c', 'Sel fin', 20)] });
  assert.deepEqual(base.slice(1), EXISTANTES.slice(1), 'les autres recettes sont intactes');
  assert.match(a.zone().textContent, /1 recette mise à jour .*1 refusée.*fournil-recettes-sauvegarde-/);
  a.window.close();
});

test('mettre à jour : nom déjà pris par une autre recette → refusée ; serveur injoignable → rien', async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  await choisirMaj(a, fichierGrigne([{ ...EXISTANTES[0], name: 'Brioche' }]));
  assert.match(a.zone().textContent, /Rien à mettre à jour.*1 recette refusée/);
  await choisirMaj(a, fichierGrigne([{ ...EXISTANTES[0], notes: 'Nouvelles notes' }]), 'b.json');
  const avant = a.fake.writes.length, nbTelech = a.telechargements.length;
  a.fake.setFailServerGet(true);
  await confirmerMaj(a);
  assert.equal(a.fake.writes.length, avant);
  assert.equal(a.telechargements.length, nbTelech, 'pas de sauvegarde inutile');
  assert.match(a.zone().textContent, /rien n’a été mis à jour/);
  a.window.close();
});

test('mettre à jour : textes du fichier échappés dans l’aperçu', async () => {
  const a = await chargerAppli({ recettes: EXISTANTES });
  await choisirMaj(a, fichierGrigne([{ ...EXISTANTES[0], name: '<img src=x onerror=alert(1)>' }]));
  assert.equal(a.zone().querySelector('img'), null);
  assert.match(a.zone().textContent, /<img src=x/);
  a.window.close();
});
