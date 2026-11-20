// Audit G6 : à 320 px de large, aucun écran ne défile sur le côté (vrai Chromium).
// Lancer : node --test tests/test_petit_ecran.js
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
const ECRANS = {
  accueil: 'goHome()', stock: "openModule('fournil');sw('stock')", magasin: "sw('magasin')", recettes: "sw('recettes')",
  calcul: "document.querySelector('#tab-recettes [data-tab=calculator]').click()", levain: "document.querySelector('#tab-recettes [data-tab=levain]').click()",
  taches: "sw('tasks')", historique: "sw('histo')", calendrier: "sw('calendrier')", reglages: "sw('settings')",
  labo: "openModule('labo');swL('lstock')", 'labo magasin': "swL('lmagasin')", 'labo tâches': "swL('ltasks')",
  matieres: "openModule('bureau');swB('matieres')", fournisseurs: "swB('cmd-fournisseur')", tournee: "swB('cmd-clients')", journal: "swB('journal')", stats: "swB('stats')",
};

test('320 px : aucun défilement horizontal, sur tous les écrans', { timeout: 180000 }, async () => {
  const srv = http.createServer((req, res) => {
    const f = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const origine = `http://127.0.0.1:${srv.address().port}`;
  const d = donneesDemo();
  const docs = { 'boulangerie/state': { state: JSON.stringify(d.state) }, 'boulangerie/labo': { state: JSON.stringify(d.labo) }, 'boulangerie/recettes': { recipes: JSON.stringify(d.recettes) } };
  const fake = fs.readFileSync(path.join(__dirname, 'fake-firebase.js'), 'utf8');
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(origine) ? r.continue() : r.abort()));
    await ctx.addInitScript(`var module={exports:{}};${fake};window.firebase=module.exports.createFakeFirebase(${JSON.stringify(docs)}).firebase;`);
    const page = await ctx.newPage();
    await page.goto(`${origine}/index.html`);
    await page.waitForFunction(() => document.getElementById('homeScreen').style.display === 'flex');
    const trop = [];
    for (const [nom, js] of Object.entries(ECRANS)) {
      await page.evaluate(js);
      await page.waitForTimeout(100);
      const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
      if (largeur > 320) trop.push(`${nom} : ${largeur} px`);
    }
    assert.deepEqual(trop, []);
  } finally {
    await browser.close();
    srv.close();
  }
});
