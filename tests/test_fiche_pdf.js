// Fiche PDF d'une feuille de calcul (fabriquée sans bibliothèque) et logo des épis.
// Lancer : node --test tests/test_fiche_pdf.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../assets/js/fiche-pdf.js');

const FICHE = {
  titre: 'Pain de campagne', sousTitre: 'Feuille de calcul', infos: ['20 campagnes × 500 g'],
  ingredients: [{ nom: 'Farine T80', quantite: '4 705,882 g', enPremier: true }, { nom: 'Eau', quantite: '4 117,647 g' }],
  total: '10 000 g', allergenes: [{ nom: 'Gluten', ingredients: ['Farine T80'] }], avertissement: 'Vérifie.', notes: 'Pointage 2 h', pied: 'Fournil',
};

test('PDF valide : en-tête, objets, table des positions exacte', () => {
  const pdf = P.creerPdf(FICHE, { date: Date.UTC(2026, 10, 26) });
  assert.ok(pdf.startsWith('%PDF-1.4\n'));
  assert.ok(pdf.endsWith('%%EOF\n'));
  assert.ok([...pdf].every((c) => c.charCodeAt(0) < 128), 'que de l’ASCII : 1 caractère = 1 octet');
  const xref = Number(pdf.match(/startxref\n(\d+)\n/)[1]);
  assert.equal(pdf.slice(xref, xref + 4), 'xref');
  const positions = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  positions.forEach((p, i) => assert.equal(pdf.slice(p, p + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `objet ${i + 1} à sa place`));
  // longueur des flux exacte
  for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const debut = m.index + m[0].length;
    assert.equal(pdf.slice(debut + Number(m[1]), debut + Number(m[1]) + 10), '\nendstream');
  }
  assert.match(pdf, /\/BaseFont \/Helvetica /);
  assert.match(pdf, /\/Count 1 /);
});

test('textes français encodés (accents, œ, ×, espace fine) et présents', () => {
  const hex = (s) => P.winAnsi(s).map((o) => o.toString(16).padStart(2, '0')).join('');
  const pdf = P.creerPdf({ ...FICHE, titre: 'Brioche aux œufs', infos: ['20 × 500 g'] });
  assert.ok(pdf.includes(hex('Brioche aux œufs')));
  assert.ok(pdf.includes(hex('4 705,882 g')));
  assert.ok(pdf.includes(hex('Allergènes')));
  assert.deepEqual(P.winAnsi('é×œ €'), [0xe9, 0xd7, 0x9c, 0xa0, 0x80]);
  assert.deepEqual(P.winAnsi('漢'), [0x3f]);
});

test('longue recette : plusieurs pages, numérotées', () => {
  const ingredients = Array.from({ length: 60 }, (_, i) => ({ nom: `Ingrédient ${i + 1}`, quantite: `${i + 1} g` }));
  const pdf = P.creerPdf({ ...FICHE, ingredients });
  const n = Number(pdf.match(/\/Count (\d+)/)[1]);
  assert.ok(n >= 2);
  const hex = (s) => P.winAnsi(s).map((o) => o.toString(16).padStart(2, '0')).join('');
  assert.ok(pdf.includes(hex(`Fournil · page ${n} / ${n}`)));
});

test('nom de fichier sûr', () => {
  assert.equal(P.nomFichier('Pain de campagne « levain » / œuf', '2026-11-26'), 'fiche-pain-de-campagne-levain-oeuf-2026-11-26.pdf');
  assert.equal(P.nomFichier('', '2026-11-26'), 'fiche-fiche-2026-11-26.pdf');
});

test('logo des épis : SVG à jour, fait des mêmes tracés que le PDF', () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'assets', 'img', 'epis.svg'), 'utf8');
  assert.equal(svg, P.episSvg(), 'lancer node tools/dessiner-epis.cjs');
  assert.match(svg, /viewBox="0 0 400 560"/);
  assert.ok(P.episChemins().length > 20);
  assert.ok(!/NaN|undefined/.test(svg));
});
