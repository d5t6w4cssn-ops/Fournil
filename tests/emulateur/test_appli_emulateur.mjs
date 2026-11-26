// L'appli complète, avec le VRAI code Firebase (gstatic 9.23 compat) branché sur les émulateurs
// Auth et Firestore, dans un vrai Chromium, sous la Content-Security-Policy de index.html.
// Vérifie : connexion, lecture, synchro temps réel dans les deux sens, hors ligne puis retour.
//
// Sécurité : le test remplace la configuration par un projet fictif « demo-fournil » et
// redirige Auth et Firestore vers l'émulateur AVANT toute utilisation ; toute autre requête
// (dont *.googleapis.com) est bloquée, et le test échoue si une seule a été tentée.
// La seule différence avec la page publiée : l'adresse locale des émulateurs est ajoutée à
// connect-src, sinon la CSP (à juste titre) refuserait de leur parler.
//
// Lancer : npm run test:emulateur  (Java 21 + firebase-tools ; jamais la vraie base)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROJET = 'demo-fournil';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8080';
const ADMIN_UID = '7aqnISWywCZKEMiH7sYdsL14DI13';
const EMAIL = 'essai@exemple.invalid';
const MDP = 'mot-de-passe-essai';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function serveur() {
  const srv = http.createServer((req, res) => {
    const chemin = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
    const fichier = path.join(RACINE, chemin);
    if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream' });
    if (chemin === 'index.html') {
      const html = fs.readFileSync(fichier, 'utf8');
      const avec = html.replace(/(connect-src [^;"]*)/, `$1 ${AUTH} ${FS}`);
      if (avec === html) throw new Error('CSP introuvable dans index.html');
      res.end(avec);
      return;
    }
    fs.createReadStream(fichier).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
async function viderEmulateurs() {
  await fetch(`${FS}/emulator/v1/projects/${PROJET}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJET}/accounts`, { method: 'DELETE' });
}
async function creerCompte() {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts`, { method: 'POST', headers: owner, body: JSON.stringify({ localId: ADMIN_UID, email: EMAIL, password: MDP }) });
  assert.equal(r.status, 200, await r.text());
}
const urlDoc = (p) => `${FS}/v1/projects/${PROJET}/databases/(default)/documents/${p}`;
async function ecrireDoc(p, champs) {
  const fields = Object.fromEntries(Object.entries(champs).map(([k, v]) => [k, { stringValue: v }]));
  const r = await fetch(urlDoc(p), { method: 'PATCH', headers: owner, body: JSON.stringify({ fields }) });
  assert.equal(r.status, 200, await r.text());
}
async function lireChamp(p, champ) {
  const r = await fetch(urlDoc(p), { headers: owner });
  if (r.status !== 200) return null;
  const d = await r.json();
  return d.fields && d.fields[champ] ? d.fields[champ].stringValue : null;
}
async function attendre(fn, ms = 15000) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > fin) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const RECETTES = [{ id: 'r1', name: 'Baguette émulateur', ingredients: [{ id: 'a', name: 'Farine T65', qtyG: 1000 }, { id: 'b', name: 'Eau', qtyG: 680 }], notes: '' }];

// Avant les scripts de la page : configuration fictive et émulateurs, puis écoute de la CSP.
const BRANCHEMENT = `
window.__csp = [];
document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
(() => {
  let fb;
  Object.defineProperty(window, 'firebase', {
    configurable: true,
    get() { return fb; },
    set(v) {
      fb = v;
      if (!v || v.__branche) return;
      v.__branche = true;
      const init = v.initializeApp.bind(v);
      v.initializeApp = (config, nom) => {
        const app = init({ ...config, apiKey: 'demo-cle', projectId: '${PROJET}', authDomain: 'localhost', appId: undefined, messagingSenderId: undefined, storageBucket: undefined }, nom);
        app.auth().useEmulator('${AUTH}', { disableWarnings: true });
        app.firestore().useEmulator('127.0.0.1', 8080);
        return app;
      };
    },
  });
})();`;

test('émulateur : connexion, lecture, synchro dans les deux sens, hors ligne, sous la CSP', { timeout: 240000 }, async () => {
  await viderEmulateurs();
  await creerCompte();
  await ecrireDoc('boulangerie/recettes', { recipes: JSON.stringify(RECETTES), calcHistory: '[]' });
  await ecrireDoc('boulangerie/state', { state: JSON.stringify({ products: [], freeNotes: 'avant' }) });
  await ecrireDoc('boulangerie/labo', { state: JSON.stringify({}) });

  const srv = await serveur();
  const origine = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  const interdites = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('**/*', (r) => {
      const u = r.request().url();
      if (u.startsWith(origine) || u.startsWith(AUTH) || u.startsWith(FS) || u.startsWith('https://www.gstatic.com/firebasejs/9.23.0/')) return r.continue();
      // test de réseau de Firestore (image d'un pixel) : répondu ici, sans sortir sur internet
      if (u.startsWith('https://www.google.com/images/cleardot.gif')) return r.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64') });
      interdites.push(u);
      return r.abort();
    });
    await ctx.addInitScript(BRANCHEMENT);
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) erreurs.push(m.text()); });

    // 1. connexion par l'écran de connexion
    await page.goto(`${origine}/index.html`);
    await page.locator('#loginEmail').waitFor({ state: 'visible', timeout: 30000 });
    await page.fill('#loginEmail', EMAIL);
    await page.fill('#loginPassword', MDP);
    await page.click('#loginBtn');
    await page.waitForFunction(() => document.getElementById('homeScreen').style.display === 'flex', null, { timeout: 30000 });

    // 2. lecture : la recette de l'émulateur est affichée
    await page.evaluate("openModule('fournil');sw('recettes')");
    await page.getByText('Baguette émulateur').first().waitFor({ timeout: 15000 });

    // 3. synchro serveur → appli (temps réel)
    await ecrireDoc('boulangerie/state', { state: JSON.stringify({ products: [], freeNotes: 'depuis le serveur' }) });
    assert.ok(await attendre(() => page.evaluate(() => S.freeNotes === 'depuis le serveur')), 'modification du serveur reçue');

    // 4. synchro appli → serveur
    await page.evaluate(() => { S.freeNotes = 'depuis l’appli'; save(); });
    assert.ok(await attendre(async () => (await lireChamp('boulangerie/state', 'state') || '').includes('depuis l’appli')), 'enregistrement reçu par le serveur');

    // 5. hors ligne : la saisie est gardée, puis envoyée au retour du réseau
    await ctx.setOffline(true);
    await page.evaluate(() => { S.freeNotes = 'saisi hors ligne'; save(); });
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => S.freeNotes), 'saisi hors ligne');
    await ctx.setOffline(false);
    assert.ok(await attendre(async () => (await lireChamp('boulangerie/state', 'state') || '').includes('saisi hors ligne'), 30000), 'envoyé au retour du réseau');

    assert.deepEqual(await page.evaluate(() => window.__csp), [], 'aucune ressource refusée par la CSP');
    assert.deepEqual(erreurs, []);
  } finally {
    await browser.close();
    srv.close();
  }
  assert.deepEqual(interdites, [], 'aucune requête hors du serveur local, de gstatic et des émulateurs');
});
