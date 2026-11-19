// Vérifie le site publié, sans se connecter : page chargée, aucune erreur dans la
// console, aucune requête en échec, aucun appel à un CDN de PDF.js.
// Lancer : node tools/verifier-en-ligne.cjs [adresse]
'use strict';
const { chromium } = require('playwright');
const URL_SITE = process.argv[2] || 'https://d5t6w4cssn-ops.github.io/Fournil/';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' })).newPage();
  const consoleMsgs = [], pageErrors = [], failed = [], requetes = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure() && r.failure().errorText}`));
  page.on('request', (r) => requetes.push(r.url()));
  const resp = await page.goto(`${URL_SITE}?v=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const res = await page.evaluate(() => ({
    titre: document.title,
    carteExportImport: !!document.querySelector('#tab-recettes .rc-echange'),
    ecransGrigne: !!document.querySelector('#tab-recettes .tabs [data-tab="levain"]'),
    navigation: !!document.getElementById('appNav'),
    styleGrigne: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    ecranConnexion: getComputedStyle(document.getElementById('loginScreen')).display,
    thermometres: !!document.getElementById('mThermo'),
  }));
  const cdn = requetes.filter((u) => /cdnjs|pdf\.js/.test(u));
  console.log(JSON.stringify({ http: resp.status(), ...res, cdnPdfJs: cdn, pageErrors, consoleMsgs, failed }, null, 2));
  await browser.close();
  process.exit(resp.status() === 200 && !pageErrors.length && !consoleMsgs.length && !failed.length ? 0 : 1);
})();
