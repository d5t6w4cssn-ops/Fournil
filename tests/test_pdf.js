// Import d'une recette depuis un PDF, dans un vrai Chromium (Playwright), avec
// PDF.js hébergé dans vendor/pdfjs et le faux Firebase. Aucun accès réseau extérieur :
// toute requête hors du petit serveur local du test est bloquée et signalée.
// Lancer : node --test tests/test_pdf.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const RACINE = path.join(__dirname, '..');
// mêmes types que GitHub Pages (sinon Chromium ignore les feuilles de style)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

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

// Petit PDF avec du texte sélectionnable, une ligne par élément de `lignes`.
function fabriquerPdf(lignes) {
  const flux = ['BT', '/F1 14 Tf', '72 720 Td', '18 TL', ...lignes.map((l) => `(${l}) Tj T*`), 'ET'].join('\n');
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(flux)} >>\nstream\n${flux}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const positions = [];
  objets.forEach((o, i) => { positions.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${positions.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

test('import PDF : PDF.js local, chargé seulement au premier PDF, ingrédients détectés', { timeout: 120000 }, async () => {
  const srv = await serveur();
  const origine = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const requetes = [];
    const bloquees = [];
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(origine)) { requetes.push(u.slice(origine.length)); return route.continue(); }
      bloquees.push(u);
      return route.abort();
    });
    const fake = fs.readFileSync(path.join(__dirname, 'fake-firebase.js'), 'utf8');
    await ctx.addInitScript(`var module={exports:{}};${fake};window.firebase=module.exports.createFakeFirebase({}).firebase;`);
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

    await page.goto(`${origine}/index.html`);
    await page.waitForFunction(() => document.getElementById('homeScreen').style.display === 'flex');
    // La section Recettes n'apparaît que dans son onglet (pas sous le Stock ni les Réglages).
    for (const t of ['stock', 'settings']) {
      await page.evaluate((o) => { openModule('fournil'); sw(o); }, t);
      assert.equal(await page.locator('#tab-recettes').isVisible(), false, `Recettes visible dans l'onglet ${t}`);
    }
    await page.evaluate(() => { openModule('labo'); swL('lstock'); });
    assert.equal(await page.locator('#tab-recettes').isVisible(), false, 'Recettes visible dans le stock du Labo');
    await page.evaluate(() => { openModule('fournil'); sw('recettes'); });
    assert.equal(await page.locator('#tab-recettes').isVisible(), true);

    assert.equal(requetes.filter((r) => r.includes('pdfjs')).length, 0, "PDF.js n'est pas chargé tant qu'aucun PDF n'est importé");
    assert.equal(bloquees.filter((u) => /cdnjs|pdf\.js/.test(u)).length, 0, 'aucun appel au CDN de PDF.js');

    await page.locator('#rc-library-view .empty .btn-dark').click();
    const pdf = fabriquerPdf(['Farine T65 1000 g', 'Eau 650 g', 'Sel 20 g', 'Pointage 1 h']);
    await page.locator('#rc-library-view .dropzone input[type=file]').setInputFiles({ name: 'pain-test.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.getByText('3 ingrédients détectés').waitFor({ timeout: 30000 });

    const valeurs = await page.locator('#rc-library-view .ing-row').evaluateAll((rows) =>
      rows.map((r) => [...r.querySelectorAll('input')].map((i) => i.value).join(' ')));
    assert.deepEqual(valeurs, ['Farine T65 1000', 'Eau 650', 'Sel 20']);
    assert.equal(await page.locator('.name-input').inputValue(), 'Pain test');

    assert.ok(requetes.includes('/vendor/pdfjs/pdf.min.js'), 'pdf.min.js chargé depuis le projet');
    assert.ok(requetes.includes('/vendor/pdfjs/pdf.worker.min.js'), 'pdf.worker.min.js chargé depuis le projet');
    assert.equal(bloquees.filter((u) => /cdnjs|pdf/.test(u)).length, 0, 'aucun appel au CDN de PDF.js');

    // Deuxième PDF : PDF.js n'est pas rechargé
    await page.locator('#rc-library-view .dropzone input[type=file]').setInputFiles({ name: 'autre.pdf', mimeType: 'application/pdf', buffer: fabriquerPdf(['Farine T45 500 g', 'Lait 300 g']) });
    await page.getByText('2 ingrédients détectés').waitFor({ timeout: 30000 });
    assert.equal(requetes.filter((r) => r === '/vendor/pdfjs/pdf.min.js').length, 1);

    assert.deepEqual(erreurs, []);
  } finally {
    await browser.close();
    srv.close();
  }
});
