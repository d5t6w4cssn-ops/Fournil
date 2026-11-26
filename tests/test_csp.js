// Content-Security-Policy de Fournil, dans un vrai Chromium (Playwright) avec le faux Firebase.
// La règle est dans une balise <meta> de index.html (GitHub Pages ne permet pas d'en-têtes).
// On ouvre tous les écrans, on fabrique une feuille de calcul en PDF, on lit un ancien message
// avec son, et on vérifie qu'aucune ressource de l'appli n'est refusée ; puis qu'un script
// venu d'ailleurs, lui, est bien refusé.
// Lancer : node --test tests/test_csp.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { donneesDemo } = require('./donnees-demo.js');

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

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

function lireCsp() {
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  return m && m[1];
}

test('CSP : balise présente, avant tout script, avec les règles attendues', () => {
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const csp = lireCsp();
  assert.ok(csp, 'balise <meta http-equiv="Content-Security-Policy">');
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'), 'placée avant le premier script');
  const d = Object.fromEntries(csp.split(';').map((s) => s.trim()).filter(Boolean).map((s) => { const [k, ...v] = s.split(/\s+/); return [k, v]; }));
  assert.deepEqual(d['default-src'], ["'self'"]);
  assert.deepEqual(d['object-src'], ["'none'"]);
  assert.deepEqual(d['base-uri'], ["'self'"]);
  assert.deepEqual(d['form-action'], ["'self'"]);
  // scripts : le projet et Firebase (gstatic) seulement ; jamais eval
  assert.deepEqual(d['script-src'].filter((s) => s !== "'unsafe-inline'"), ["'self'", 'https://www.gstatic.com/firebasejs/9.23.0/']);
  assert.ok(!d['script-src'].includes("'unsafe-eval'"));
  for (const hote of ['https://firestore.googleapis.com', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://api.open-meteo.com', 'https://nominatim.openstreetmap.org']) {
    assert.ok(d['connect-src'].includes(hote), `connect-src autorise ${hote}`);
  }
  assert.ok(!csp.includes('*'), 'aucun joker');
  assert.ok(!/\bhttp:/.test(csp), 'aucune adresse non chiffrée');
});

test('CSP : tous les écrans, feuille PDF, message avec son, sans aucun refus ; un script étranger est refusé', { timeout: 180000 }, async () => {
  const srv = await serveur();
  const origine = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(origine) ? r.continue() : r.abort()));
    const fake = fs.readFileSync(path.join(__dirname, 'fake-firebase.js'), 'utf8');
    const d = donneesDemo();
    // un ancien message avec son (data:audio), pour vérifier media-src
    const etat = JSON.parse(JSON.stringify(d.state));
    etat.notes = [{ id: 'n1', time: '08:00', text: '', isVocal: true, audioUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=', transcription: 'test' }];
    const docs = { 'boulangerie/state': { state: JSON.stringify(etat) }, 'boulangerie/labo': { state: JSON.stringify(d.labo) }, 'boulangerie/recettes': { recipes: JSON.stringify(d.recettes) } };
    await ctx.addInitScript(`window.__csp=[];document.addEventListener('securitypolicyviolation',(e)=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));var module={exports:{}};${fake};window.firebase=module.exports.createFakeFirebase(${JSON.stringify(docs)}).firebase;`);
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) erreurs.push(m.text()); });
    await page.goto(`${origine}/index.html`);
    await page.waitForFunction(() => document.getElementById('homeScreen').style.display === 'flex');

    const ecrans = [
      ...['stock', 'magasin', 'recettes', 'tasks', 'histo', 'calendrier', 'settings'].map((t) => `openModule('fournil');sw('${t}')`),
      'renderNotes()',
      ...['lstock', 'lmagasin', 'ltasks', 'lhisto', 'lcalendr', 'lsettings'].map((t) => `openModule('labo');swL('${t}')`),
      ...['matieres', 'cmd-fournisseur', 'cmd-clients', 'journal', 'stats'].map((t) => `openModule('bureau');swB('${t}')`),
    ];
    for (const e of ecrans) { await page.evaluate(e); await page.waitForTimeout(30); }
    await page.evaluate("openModule('fournil');sw('recettes')");
    for (const t of ['library', 'calculator', 'tb', 'levain', 'hydra', 'croix']) {
      await page.click(`#tab-recettes .tabs [data-tab="${t}"]`);
      await page.waitForTimeout(30);
    }
    // saisie rapide des calculs → feuille → PDF (téléchargement par blob:)
    await page.click('#tab-recettes .tabs [data-tab="library"]');
    await page.click('#panel-library [data-vers-saisie]');
    await page.fill('#rcSaisieTexte', '30 baguettes de tradition à 350 g');
    await page.click('#rc-saisie-calculs .rc-saisie-analyser');
    await page.click('#rc-saisie-calculs .rc-saisie-voir');
    const [telech] = await Promise.all([page.waitForEvent('download'), page.click('#rc-saisie-calculs .rc-feuille [data-action=pdf]')]);
    assert.match(telech.suggestedFilename(), /\.pdf$/);
    // message avec son : l'élément audio charge sa source data:
    await page.evaluate("openModule('fournil');renderNotes()");
    await page.waitForTimeout(100);

    assert.deepEqual(await page.evaluate(() => window.__csp), [], 'aucune ressource de l’appli refusée');
    assert.deepEqual(erreurs, []);

    // contre-épreuve : un script injecté depuis un autre site est refusé par la règle
    await page.evaluate(() => { const s = document.createElement('script'); s.src = 'https://exemple.invalid/x.js'; document.head.appendChild(s); });
    await page.waitForTimeout(100);
    const refus = await page.evaluate(() => window.__csp);
    assert.ok(refus.some((v) => v.startsWith('script-src') && v.includes('exemple.invalid')), `script étranger refusé (${refus.join(', ')})`);
  } finally {
    await browser.close();
    srv.close();
  }
});
