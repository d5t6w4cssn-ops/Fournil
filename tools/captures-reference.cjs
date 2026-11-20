// Captures reproductibles de tous les écrans, pour vérifier au pixel qu'un changement
// (rangement, nettoyage) ne modifie rien à l'écran.
//   node tools/captures-reference.cjs <dossier de sortie>
//   node tools/captures-reference.cjs --comparer <référence> <nouvelles> [<2e référence>]
// Deux prises du même code peuvent différer de quelques pixels (lissage des dessins) : avec
// une 2e référence, ce bruit mesuré image par image est le seul écart toléré.
// Horloge figée (même date, même heure), animations coupées, polices attendues, faux
// Firebase rempli des données de démonstration. Mobile 390 px et ordinateur 1280 px,
// clair et sombre. Aucun accès à la vraie base.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const HEURE = new Date('2026-11-19T09:30:00+01:00'); // un jeudi matin, à Paris
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const ECRANS = [
  ['connexion', 'showLogin()'],
  ['accueil', ''],
  ['stock', "openModule('fournil');sw('stock')"],
  ['magasin', "openModule('fournil');sw('magasin')"],
  ['recettes', "openModule('fournil');sw('recettes')"],
  ['recettes-calcul', "openModule('fournil');sw('recettes');document.querySelector('#tab-recettes [data-tab=calculator]').click()"],
  ['taches', "openModule('fournil');sw('tasks')"],
  ['historique', "openModule('fournil');sw('histo')"],
  ['calendrier', "openModule('fournil');sw('calendrier')"],
  ['reglages', "openModule('fournil');sw('settings')"],
  ['labo-stock', "openModule('labo');swL('lstock')"],
  ['labo-taches', "openModule('labo');swL('ltasks')"],
  ['matieres', "openModule('bureau');swB('matieres')"],
  ['fournisseurs', "openModule('bureau');swB('cmd-fournisseur')"],
  ['tournee', "openModule('bureau');swB('cmd-clients')"],
  ['journal', "openModule('bureau');swB('journal')"],
  ['stats', "openModule('bureau');swB('stats')"],
  ['guide', 'openHelp()'],
];
const VARIANTES = [
  ['mobile', { width: 390, height: 844 }],
  ['ordinateur', { width: 1280, height: 860 }],
];

async function capturer(sortie) {
  const { chromium } = require('playwright');
  const { donneesDemo } = require('../tests/donnees-demo.js');
  fs.mkdirSync(sortie, { recursive: true });
  const srv = http.createServer((req, res) => {
    const f = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const origine = `http://127.0.0.1:${srv.address().port}`;
  // données de démonstration datées du jour figé (aucun passage au jour suivant)
  const d = donneesDemo();
  const jour = '2026-11-19';
  d.state.lastDate = jour;
  d.labo.lastDate = jour;
  const docs = {
    'boulangerie/state': { state: JSON.stringify(d.state) },
    'boulangerie/labo': { state: JSON.stringify(d.labo) },
    'boulangerie/recettes': { recipes: JSON.stringify(d.recettes), calcHistory: JSON.stringify(d.calcHistory) },
  };
  const fake = fs.readFileSync(path.join(RACINE, 'tests', 'fake-firebase.js'), 'utf8');
  const browser = await chromium.launch();
  const manquants = new Set();
  const erreurs = [];
  for (const [nomV, viewport] of VARIANTES) {
    for (const theme of ['clair', 'sombre']) {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'fr-FR', timezoneId: 'Europe/Paris', colorScheme: theme === 'sombre' ? 'dark' : 'light', reducedMotion: 'reduce' });
      await ctx.clock.install({ time: HEURE });
      await ctx.route('**/*', (route) => (route.request().url().startsWith(origine) ? route.continue() : route.abort()));
      await ctx.addInitScript(`var module={exports:{}};${fake};window.firebase=module.exports.createFakeFirebase(${JSON.stringify(docs)}).firebase;`);
      for (const [nomE, js] of ECRANS) {
        const page = await ctx.newPage();
        page.on('pageerror', (e) => erreurs.push(`${nomE} ${nomV} ${theme} : ${e.message}`));
        page.on('response', (r) => { if (r.status() === 404) manquants.add(r.url().replace(origine, '')); });
        await page.goto(`${origine}/index.html`);
        await page.clock.runFor(1500);
        if (js) await page.evaluate(js);
        await page.clock.runFor(500);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: path.join(sortie, `${nomE}-${nomV}-${theme}.png`), animations: 'disabled', caret: 'hide' });
        await page.close();
      }
      await ctx.close();
    }
  }
  await browser.close();
  srv.close();
  console.log(`${ECRANS.length * 4} captures dans ${sortie}`);
  if (manquants.size) console.log('Fichiers manquants :', [...manquants].join(', '));
  if (erreurs.length) console.log('Erreurs :', erreurs.join('\n'));
  return manquants.size || erreurs.length ? 1 : 0;
}

function comparer(a, b, c) {
  const { PNG } = require('pngjs');
  const pixelmatch = require('pixelmatch');
  const noms = fs.readdirSync(a).filter((f) => f.endsWith('.png')).sort();
  const differents = [];
  for (const n of noms) {
    const fb = path.join(b, n);
    if (!fs.existsSync(fb)) { differents.push(`${n} : absente de ${b}`); continue; }
    const ia = PNG.sync.read(fs.readFileSync(path.join(a, n)));
    const ib = PNG.sync.read(fs.readFileSync(fb));
    if (ia.width !== ib.width || ia.height !== ib.height) { differents.push(`${n} : tailles différentes`); continue; }
    const nb = pixelmatch(ia.data, ib.data, null, ia.width, ia.height, { threshold: 0 });
    let bruit = 0;
    if (c && fs.existsSync(path.join(c, n))) {
      const ic = PNG.sync.read(fs.readFileSync(path.join(c, n)));
      if (ic.width === ia.width && ic.height === ia.height) bruit = pixelmatch(ia.data, ic.data, null, ia.width, ia.height, { threshold: 0 });
    }
    if (nb > bruit) differents.push(`${n} : ${nb} pixel(s) différent(s) (bruit mesuré : ${bruit})`);
  }
  console.log(differents.length ? `Différences (${differents.length}/${noms.length}) :\n${differents.join('\n')}` : `Aucune différence (au-delà du bruit mesuré) : ${noms.length} captures.`);
  return differents.length ? 1 : 0;
}

(async () => {
  const args = process.argv.slice(2);
  const code = args[0] === '--comparer' ? comparer(path.resolve(args[1]), path.resolve(args[2]), args[3] && path.resolve(args[3])) : await capturer(path.resolve(args[0] || 'captures-reference'));
  process.exit(code);
})();
