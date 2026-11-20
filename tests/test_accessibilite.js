// Accessibilité : aucune violation axe (WCAG 2.1 A et AA + bonnes pratiques) sur les 20
// écrans, en clair et en sombre. L'audit complet (avec Lecture facile et ordinateur) :
// node tools/audit-accessibilite.cjs. Lancer : node --test tests/test_accessibilite.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('axe : aucune violation sur tous les écrans, en clair et en sombre', { timeout: 900000 }, () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'audit-accessibilite.cjs')], {
    env: { ...process.env, AXE_VARIANTES: 'mobile-clair,mobile-sombre' },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Aucune violation axe/);
});
