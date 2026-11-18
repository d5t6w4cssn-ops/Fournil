// Captures de tous les modules avec le faux Firebase rempli de données de démonstration.
// node tools/captures.cjs <dossier du site> <dossier de sortie> <suffixe>
// Mobile 390 px et ordinateur 1280 px, clair et sombre. Aucun accès à la vraie base :
// les scripts Firebase sont bloqués et remplacés par tests/fake-firebase.js.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { donneesDemo } = require('../tests/donnees-demo.js');

const [RACINE, SORTIE, SUFFIXE = 'capture'] = process.argv.slice(2).map((v, i) => (i < 2 ? path.resolve(v) : v));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const ECRANS = [
  ['01-accueil', ''],
  ['02-recettes', "openModule('fournil');sw('recettes')"],
  ['03-recettes-calcul', "openModule('fournil');sw('recettes');document.querySelector('#tab-recettes [data-tab=calculator]')?.click()"],
  ['04-stock', "openModule('fournil');sw('stock')"],
  ['05-magasin', "openModule('fournil');sw('magasin')"],
  ['06-taches', "openModule('fournil');sw('tasks')"],
  ['07-historique', "openModule('fournil');sw('histo')"],
  ['08-calendrier', "openModule('fournil');sw('calendrier')"],
  ['09-reglages', "openModule('fournil');sw('settings')"],
  ['10-labo-stock', "openModule('labo');swL('lstock')"],
  ['11-labo-taches', "openModule('labo');swL('ltasks')"],
  ['12-bureau-matieres', "openModule('bureau');swB('matieres')"],
  ['13-bureau-fournisseurs', "openModule('bureau');swB('cmd-fournisseur')"],
  ['14-tournee', "openModule('bureau');swB('cmd-clients')"],
  ['15-journal', "openModule('bureau');swB('journal')"],
  ['16-stats', "openModule('bureau');swB('stats')"],
];
const VARIANTES = [
  ['mobile', { width: 390, height: 844 }],
  ['ordinateur', { width: 1280, height: 860 }],
];

function serveur() {
  const srv = http.createServer((req, res) => {
    const chemin = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
    const fichier = path.join(RACINE, chemin);
    if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream' });
    fs.createReadStream(fichier).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const srv = await serveur();
  const origine = `http://127.0.0.1:${srv.address().port}`;
  const d = donneesDemo();
  const docs = {
    'boulangerie/state': { state: JSON.stringify(d.state) },
    'boulangerie/labo': { state: JSON.stringify(d.labo) },
    'boulangerie/recettes': { recipes: JSON.stringify(d.recettes), calcHistory: JSON.stringify(d.calcHistory) },
  };
  const fake = fs.readFileSync(path.join(__dirname, '..', 'tests', 'fake-firebase.js'), 'utf8');
  const browser = await chromium.launch();
  const erreurs = [];
  for (const [nomV, viewport] of VARIANTES) {
    for (const theme of ['clair', 'sombre']) {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'fr-FR', colorScheme: theme === 'sombre' ? 'dark' : 'light' });
      await ctx.route('**/*', (route) => {
        const u = route.request().url();
        if (u.startsWith(origine) || /fonts\.(googleapis|gstatic)\.com/.test(u)) return route.continue();
        return route.abort();
      });
      await ctx.addInitScript(`var module={exports:{}};${fake};window.firebase=module.exports.createFakeFirebase(${JSON.stringify(docs)}).firebase;
        try{localStorage.setItem('fournil-theme', ${JSON.stringify(theme === 'sombre' ? 'dark' : 'light')});}catch(e){}`);
      for (const [nomE, js] of ECRANS) {
        const page = await ctx.newPage();
        page.on('pageerror', (e) => erreurs.push(`${nomE} ${nomV} ${theme} : ${e.message}`));
        await page.goto(`${origine}/index.html`);
        await page.waitForTimeout(700);
        if (js) { try { await page.evaluate(js); } catch (e) { erreurs.push(`${nomE} : ${e.message}`); } }
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(SORTIE, `${nomE}-${nomV}-${theme}-${SUFFIXE}.png`) });
        await page.close();
      }
      await ctx.close();
    }
  }
  await browser.close();
  srv.close();
  console.log(`${ECRANS.length * 4} captures dans ${SORTIE}`);
  if (erreurs.length) console.log('Erreurs :\n' + erreurs.join('\n'));
})();
