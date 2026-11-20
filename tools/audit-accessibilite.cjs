// Audit d'accessibilité (axe-core) de tous les écrans : clair, sombre et Lecture facile,
// sur mobile (390 px) et ordinateur (1280 px), avec le faux Firebase et les données de démonstration.
// node tools/audit-accessibilite.cjs [--json fichier]   (aucun accès à la vraie base)
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { donneesDemo } = require('../tests/donnees-demo.js');

const RACINE = path.join(__dirname, '..');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const ECRANS = {
  connexion: 'showLogin()',
  accueil: 'goHome()',
  stock: "openModule('fournil');sw('stock')",
  magasin: "openModule('fournil');sw('magasin')",
  recettes: "openModule('fournil');sw('recettes')",
  'recettes-calcul': "openModule('fournil');sw('recettes');document.querySelector('#tab-recettes [data-tab=calculator]').click()",
  'recettes-levain': "openModule('fournil');sw('recettes');document.querySelector('#tab-recettes [data-tab=levain]').click()",
  taches: "openModule('fournil');sw('tasks')",
  historique: "openModule('fournil');sw('histo')",
  calendrier: "openModule('fournil');sw('calendrier')",
  reglages: "openModule('fournil');sw('settings')",
  labo: "openModule('labo');swL('lstock')",
  'labo-taches': "openModule('labo');swL('ltasks')",
  matieres: "openModule('bureau');swB('matieres')",
  fournisseurs: "openModule('bureau');swB('cmd-fournisseur')",
  tournee: "openModule('bureau');swB('cmd-clients')",
  journal: "openModule('bureau');swB('journal')",
  stats: "openModule('bureau');swB('stats')",
  'menu-plus': "openModule('fournil');sw('stock');document.querySelector('.nav-plus').click()",
  'fenetre-tache': "openModule('fournil');sw('tasks');openM('mTask')",
  guide: 'openHelp()',
};
const TOUTES_VARIANTES = [
  { nom: 'mobile-clair', viewport: { width: 390, height: 844 }, theme: 'light' },
  { nom: 'mobile-sombre', viewport: { width: 390, height: 844 }, theme: 'dark' },
  { nom: 'mobile-lecture-facile', viewport: { width: 390, height: 844 }, theme: 'light', lecture: true },
  { nom: 'ordinateur-clair', viewport: { width: 1280, height: 860 }, theme: 'light' },
];

// AXE_VARIANTES=mobile-clair,mobile-sombre : seulement ces variantes (test plus rapide).
const VARIANTES = TOUTES_VARIANTES.filter((v) => !process.env.AXE_VARIANTES || process.env.AXE_VARIANTES.split(',').includes(v.nom));

(async () => {
  const srv = http.createServer((req, res) => {
    const f = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const origine = `http://127.0.0.1:${srv.address().port}`;
  const d = donneesDemo();
  const docs = {
    'boulangerie/state': { state: JSON.stringify(d.state) },
    'boulangerie/labo': { state: JSON.stringify(d.labo) },
    'boulangerie/recettes': { recipes: JSON.stringify(d.recettes), calcHistory: JSON.stringify(d.calcHistory) },
  };
  const fake = fs.readFileSync(path.join(RACINE, 'tests', 'fake-firebase.js'), 'utf8');
  const browser = await chromium.launch();
  const regles = {}; // id → { impact, aide, ecrans: Set, exemples: Set }
  for (const v of VARIANTES) {
    const ctx = await browser.newContext({ viewport: v.viewport, colorScheme: v.theme === 'dark' ? 'dark' : 'light', reducedMotion: 'reduce' });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(origine) ? r.continue() : r.abort()));
    await ctx.addInitScript(`var module={exports:{}};${fake};window.firebase=module.exports.createFakeFirebase(${JSON.stringify(docs)}).firebase;
      try{localStorage.setItem('fournil-theme',${JSON.stringify(v.theme)});${v.lecture ? "localStorage.setItem('fournil-lecture','facile');" : ''}}catch(e){}`);
    for (const [nom, js] of Object.entries(ECRANS)) {
      const page = await ctx.newPage();
      await page.goto(`${origine}/index.html`);
      await page.waitForTimeout(600);
      await page.evaluate(js);
      await page.waitForTimeout(300);
      await page.addScriptTag({ content: AXE });
      const r = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }));
      r.violations.forEach((viol) => {
        const g = regles[viol.id] || (regles[viol.id] = { impact: viol.impact, aide: viol.help, ecrans: new Set(), exemples: new Set() });
        g.ecrans.add(`${nom} (${v.nom})`);
        viol.nodes.slice(0, 3).forEach((n) => g.exemples.add(n.target.join(' ')));
      });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  srv.close();
  const liste = Object.entries(regles).map(([id, g]) => ({ id, impact: g.impact, aide: g.aide, nbEcrans: g.ecrans.size, ecrans: [...g.ecrans].slice(0, 6), exemples: [...g.exemples].slice(0, 6) }));
  liste.sort((a, b) => b.nbEcrans - a.nbEcrans);
  if (!liste.length) console.log('Aucune violation axe sur', Object.keys(ECRANS).length * VARIANTES.length, 'écrans.');
  liste.forEach((r) => console.log(`- ${r.id} [${r.impact}] ${r.aide} — ${r.nbEcrans} écran(s) ; ex. ${r.exemples.slice(0, 3).join(' | ')}`));
  const i = process.argv.indexOf('--json');
  if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(liste, null, 2));
  process.exit(liste.length ? 1 : 0);
})();
