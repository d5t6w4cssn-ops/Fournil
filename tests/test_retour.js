// Audit G5 : le bouton retour du téléphone, dans un vrai Chromium (jsdom ne gère pas
// le retour dans l'historique). Faux Firebase, aucun accès réseau extérieur.
// Lancer : node --test tests/test_retour.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { donneesDemo } = require('./donnees-demo.js');

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

test('retour : ferme la fenêtre ouverte, puis revient à l’écran précédent', { timeout: 120000 }, async () => {
  const srv = http.createServer((req, res) => {
    const f = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const origine = `http://127.0.0.1:${srv.address().port}`;
  const d = donneesDemo();
  const docs = { 'boulangerie/state': { state: JSON.stringify(d.state) }, 'boulangerie/labo': { state: JSON.stringify(d.labo) } };
  const fake = fs.readFileSync(path.join(__dirname, 'fake-firebase.js'), 'utf8');
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(origine) ? r.continue() : r.abort()));
    await ctx.addInitScript(`var module={exports:{}};${fake};window.firebase=module.exports.createFakeFirebase(${JSON.stringify(docs)}).firebase;`);
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.goto(`${origine}/index.html`);
    await page.waitForFunction(() => document.getElementById('homeScreen').style.display === 'flex');
    const onglet = () => page.evaluate(() => [activeModule, tab]);
    const retour = async () => { await page.goBack({ waitUntil: 'commit' }).catch(() => null); await page.waitForTimeout(200); };
    for (const id of ['stock', 'taches', 'recettes']) await page.click(`.app-nav [data-nav="${id}"]`);
    assert.deepEqual(await onglet(), ['fournil', 'recettes']);
    await retour();
    assert.deepEqual(await onglet(), ['fournil', 'tasks']);
    await page.evaluate(() => openM('mTask'));
    await retour();
    assert.equal(await page.evaluate(() => document.getElementById('mTask').classList.contains('open')), false, 'fenêtre fermée');
    assert.deepEqual(await onglet(), ['fournil', 'tasks'], 'on reste sur les Tâches');
    await page.click('.app-nav .nav-plus');
    await retour();
    assert.equal(await page.evaluate(() => document.getElementById('navPlus').hidden), true, 'menu « Plus » fermé');
    await retour();
    assert.deepEqual(await onglet(), ['fournil', 'stock']);
    await retour();
    assert.deepEqual(await onglet(), [null, 'stock'], "retour à l'accueil");
    assert.deepEqual(erreurs, []);
  } finally {
    await browser.close();
    srv.close();
  }
});
