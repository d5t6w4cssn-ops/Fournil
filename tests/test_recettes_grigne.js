// Le module Recettes reprend Grigne sans le modifier : on vérifie que les copies
// (recettes/src) sont identiques aux fichiers de Grigne (si ~/grigne est présent,
// lu sans rien y écrire) et que recettes.js / recettes.css sont à jour.
// Les calculs eux-mêmes sont vérifiés par les tests de Grigne repris dans tests/grigne/.
// Lancer : node --test tests/test_recettes_grigne.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const GRIGNE = process.env.GRIGNE_DIR || path.join(os.homedir(), 'grigne');
const absent = !fs.existsSync(path.join(GRIGNE, 'src', 'js')) && `Grigne introuvable (${GRIGNE})`;

test('les fichiers de Grigne copiés dans recettes/src sont identiques aux originaux', { skip: absent }, () => {
  const copies = [];
  const parcourir = (dir, rel = '') => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    if (e.isDirectory()) parcourir(path.join(dir, e.name), path.join(rel, e.name));
    else if (e.name.endsWith('.js')) copies.push(path.join(rel, e.name));
  });
  parcourir(path.join(RACINE, 'recettes', 'src'));
  assert.ok(copies.length >= 16, `${copies.length} fichiers copiés`);
  for (const f of copies) {
    const original = fs.readFileSync(path.join(GRIGNE, 'src', 'js', f), 'utf8');
    const copie = fs.readFileSync(path.join(RACINE, 'recettes', 'src', f), 'utf8');
    assert.equal(copie, original, `${f} a été modifié`);
  }
  for (const f of ['base.css', 'app.css']) {
    assert.equal(fs.readFileSync(path.join(RACINE, 'recettes', 'src', 'css', f), 'utf8'), fs.readFileSync(path.join(GRIGNE, 'assets', 'css', f), 'utf8'), `${f} a été modifié`);
  }
});

test('recettes.js et recettes.css correspondent à leurs sources', () => {
  const sortie = execFileSync(process.execPath, [path.join(RACINE, 'tools', 'importer-grigne.mjs'), '--verifier'], { encoding: 'utf8' });
  assert.match(sortie, /à jour/);
});

test('le tampon des recettes affiche « FOURNIL » (remplacé à l’assemblage, la copie de Grigne reste intacte)', () => {
  const bundle = fs.readFileSync(path.join(RACINE, 'recettes', 'recettes.js'), 'utf8');
  assert.match(bundle, />FOURNIL<\/textPath>/);
  assert.doesNotMatch(bundle, />GRIGNE<\/textPath>/);
  assert.match(fs.readFileSync(path.join(RACINE, 'recettes', 'src', 'ui', 'dom.js'), 'utf8'), />GRIGNE<\/textPath>/);
});
