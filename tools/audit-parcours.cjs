// Audit : une journée de boulanger dans Fournil, avec le faux Firebase et les données
// de démonstration. Chaque scénario note ce qui s'affiche et ce qui est enregistré.
// node tools/audit-parcours.cjs [dossier du site]   (aucun accès à la vraie base)
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { donneesDemo } = require('../tests/donnees-demo.js');

const RACINE = path.resolve(process.argv[2] || '.');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const notes = [];
const note = (scenario, constat) => { notes.push({ scenario, constat }); console.log(`• [${scenario}] ${constat}`); };

function serveur() {
  const srv = http.createServer((req, res) => {
    const chemin = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
    const f = path.join(RACINE, chemin);
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

const hier = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

async function ouvrir(browser, origine, { modifier, viewport = { width: 390, height: 844 }, echecEcriture = false } = {}) {
  const d = donneesDemo();
  if (modifier) modifier(d);
  const docs = {
    'boulangerie/state': { state: JSON.stringify(d.state) },
    'boulangerie/labo': { state: JSON.stringify(d.labo) },
    'boulangerie/recettes': { recipes: JSON.stringify(d.recettes), calcHistory: JSON.stringify(d.calcHistory) },
  };
  const fake = fs.readFileSync(path.join(__dirname, '..', 'tests', 'fake-firebase.js'), 'utf8');
  const ctx = await browser.newContext({ viewport, locale: 'fr-FR' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(origine) ? r.continue() : r.abort()));
  await ctx.addInitScript(`var module={exports:{}};${fake};
    window.__fake=module.exports.createFakeFirebase(${JSON.stringify(docs)});
    window.firebase=window.__fake.firebase;
    ${echecEcriture ? `(function(){const fs=window.firebase.firestore;window.firebase.firestore=()=>{const f=fs();return{collection:(c)=>{const col=f.collection(c);return{doc:(x)=>{const dd=col.doc(x);return{...dd,set:()=>Promise.reject(new Error('hors ligne'))};}};}};};})();` : ''}`);
  const page = await ctx.newPage();
  const erreurs = [];
  const toasts = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  await page.goto(`${origine}/index.html`);
  await page.waitForFunction(() => window.__fake && window.__fake.nbEcoutes() >= 3, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.exposeFunction('__toast', (t) => toasts.push(t));
  await page.evaluate(() => { const o = window.toast; window.toast = (m) => { window.__toast(String(m)); return o(m); }; });
  const etat = () => page.evaluate(() => JSON.parse(window.__fake.docs.get('boulangerie/state').state));
  const labo = () => page.evaluate(() => JSON.parse(window.__fake.docs.get('boulangerie/labo').state));
  const ecritures = () => page.evaluate(() => window.__fake.writes.length);
  return { ctx, page, erreurs, toasts, etat, labo, ecritures };
}

(async () => {
  const srv = await serveur();
  const origine = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();

  // 1. Nouvelle journée : la veille, on avait sorti 40+6 croissants
  {
    const s = await ouvrir(browser, origine, { modifier: (d) => { d.state.lastDate = hier(); } });
    const e = await s.etat();
    const c = e.products.find((p) => p.id === 'croissant');
    note('passage au jour suivant', `lastDate=${e.lastDate} (attendu ${new Date().toISOString().slice(0, 10)}), croissant stock=${c.stockReel} (attendu 18), commande=${c.commande} (attendu 0)`);
    await s.page.evaluate(() => { openModule('fournil'); sw('magasin'); });
    note('passage au jour suivant', `pastille magasin : « ${(await s.page.locator('#tab-magasin .day-pill').innerText()).replace(/\s+/g, ' ')} »`);
    await s.ctx.close();
  }

  // 2. Magasin : saisies extrêmes dans « base / jour »
  {
    const s = await ouvrir(browser, origine);
    await s.page.evaluate(() => { openModule('fournil'); sw('magasin'); });
    for (const v of ['1,5', '-5', '99999999', '', 'abc']) {
      await s.page.evaluate((val) => { const i = document.getElementById('base-croissant'); i.value = val; i.dispatchEvent(new Event('input')); }, v);
      await s.page.waitForTimeout(400);
      const c = (await s.etat()).products.find((p) => p.id === 'croissant');
      const affiche = await s.page.evaluate(() => document.getElementById('base-croissant')?.value);
      note('magasin base/jour', `saisie « ${v} » → enregistré base=${c.base}, champ affiche « ${affiche} », dispo affichée=${await s.page.evaluate(() => document.querySelector('#stockList, body') && dispo(S.products.find(p=>p.id==='croissant')))}`);
    }
    // double clic sur +
    const avant = (await s.etat()).products.find((p) => p.id === 'croissant').base;
    await s.page.locator('#tab-magasin .mc-btn').nth(1).dblclick();
    await s.page.waitForTimeout(500);
    note('magasin double clic +', `base ${avant} → ${(await s.etat()).products.find((p) => p.id === 'croissant').base}`);
    note('magasin', `erreurs page : ${JSON.stringify(s.erreurs)}`);
    await s.ctx.close();
  }

  // 3. Correction du stock (✏️) et réapprovisionnement
  {
    const s = await ouvrir(browser, origine);
    await s.page.evaluate(() => { openModule('fournil'); sw('stock'); openCorrect('croissant'); });
    const champs = await s.page.evaluate(() => [...document.querySelectorAll('#mCorrect input')].map((i) => `${i.id}:${i.type}=${i.value}`));
    note('correction stock', `champs de la fenêtre : ${champs.join(', ')}`);
    await s.page.evaluate(() => { document.getElementById('mc-stock').value = ''; saveCorrect(); });
    await s.page.waitForTimeout(200);
    note('correction stock', `stock vidé puis Enregistrer → croissant stock=${(await s.etat()).products.find((p) => p.id === 'croissant').stockReel}`);
    await s.page.evaluate(() => { openCorrect('croissant'); document.getElementById('mc-stock').value = '12.7'; saveCorrect(); });
    await s.page.waitForTimeout(200);
    note('correction stock', `saisie 12.7 → stock=${(await s.etat()).products.find((p) => p.id === 'croissant').stockReel}`);
    note('correction stock', `messages : ${JSON.stringify(s.toasts)}`);
    await s.ctx.close();
  }

  // 4. Tâches : vide, double clic, cocher, auto-tâches qui reviennent
  {
    const s = await ouvrir(browser, origine);
    await s.page.evaluate(() => { openModule('fournil'); sw('tasks'); });
    const n0 = (await s.etat()).tasks.length;
    await s.page.evaluate(() => { openM('mTask'); document.getElementById('taskInput').value = '   '; addTask(); });
    note('tâches', `ajout d'une tâche vide → ${(await s.etat()).tasks.length - n0} tâche(s) ajoutée(s), fenêtre ouverte=${await s.page.evaluate(() => document.getElementById('mTask').classList.contains('open'))}, message=${JSON.stringify(s.toasts.slice(-1))}`);
    await s.page.evaluate(() => { openM('mTask'); document.getElementById('taskInput').value = 'Tester le four'; });
    await s.page.locator('#mTask .mbtn-p').dblclick();
    await s.page.waitForTimeout(200);
    note('tâches', `double clic sur Ajouter → ${(await s.etat()).tasks.filter((t) => t.text === 'Tester le four').length} tâche(s) « Tester le four »`);
    // cocher une tâche auto : revient-elle ?
    const autoAvant = (await s.etat()).tasks.filter((t) => t.auto && !t.done).length;
    await s.page.evaluate(() => { const t = S.tasks.find((x) => x.auto && !x.done); toggleTask(t.id); });
    await s.page.evaluate(() => { sw('stock'); sw('tasks'); });
    await s.page.waitForTimeout(200);
    const e = await s.etat();
    note('tâches auto', `auto non faites avant=${autoAvant}, après avoir coché une puis changé d'onglet=${e.tasks.filter((t) => t.auto && !t.done).length}, auto faites=${e.tasks.filter((t) => t.auto && t.done).length}`);
    await s.ctx.close();
  }

  // 5. Produits : création vide, nombres énormes
  {
    const s = await ouvrir(browser, origine);
    await s.page.evaluate(() => { openModule('fournil'); sw('settings'); openM('mProduct'); });
    const n0 = (await s.etat()).products.length;
    await s.page.evaluate(() => { document.getElementById('np-name').value = ''; saveProduct(); });
    note('produits', `création sans nom → ${(await s.etat()).products.length - n0} ajouté, fenêtre ouverte=${await s.page.evaluate(() => document.getElementById('mProduct').classList.contains('open'))}, message=${JSON.stringify(s.toasts.slice(-1))}`);
    await s.page.evaluate(() => { document.getElementById('np-name').value = 'Test énorme'; document.getElementById('np-stock').value = '1e9'; document.getElementById('np-seuil').value = '0'; saveProduct(); });
    await s.page.waitForTimeout(200);
    const p = (await s.etat()).products.find((x) => x.name === 'Test énorme');
    note('produits', `stock « 1e9 », seuil « 0 » → stockReel=${p && p.stockReel}, seuil=${p && p.seuil}`);
    await s.page.evaluate(() => sw('stock'));
    note('produits', `débordement horizontal Stock après grand nombre : ${await s.page.evaluate(() => document.documentElement.scrollWidth)} px pour 390`);
    await s.ctx.close();
  }

  // 6. Bureau : matières en kg avec décimales
  {
    const s = await ouvrir(browser, origine);
    await s.page.evaluate(() => { openModule('bureau'); swB('matieres'); });
    const types = await s.page.evaluate(() => [...document.querySelectorAll('[id^="mat-val-"]')].slice(0, 1).map((i) => `${i.type} step=${i.step}`));
    note('matières', `champ de quantité : ${types}`);
    await s.page.evaluate(() => { const i = document.getElementById('mat-val-m_3'); i.value = '0.3'; useMatiere('m_3'); });
    await s.page.waitForTimeout(200);
    const m3 = (await s.etat()).matieres.find((m) => m.id === 'm_3');
    note('matières', `levure 1,5 kg − 0,3 kg → stock enregistré=${m3.stock}, affiché « ${await s.page.evaluate(() => document.getElementById('mfn-s-m_3')?.textContent || document.getElementById('msv-s-m_3')?.textContent)} »`);
    await s.page.evaluate(() => { adjMatStock('m_2', 1); adjMatStock('m_2', 1); });
    note('matières', `boutons +/− sur le beurre : champ=${await s.page.evaluate(() => document.getElementById('mat-val-m_2').value)} (rien n'est enregistré tant qu'on n'appuie pas sur un bouton d'action ?) stock=${(await s.etat()).matieres.find((m) => m.id === 'm_2').stock}`);
    const boutons = await s.page.evaluate(() => [...document.querySelectorAll('#bur-matieres button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 12));
    note('matières', `boutons visibles : ${JSON.stringify(boutons)}`);
    await s.ctx.close();
  }

  // 7. Commande client → fournil → validation
  {
    const s = await ouvrir(browser, origine);
    await s.page.evaluate(() => { openModule('bureau'); swB('cmd-clients'); openM('mCmdClient'); document.getElementById('cc-nom').value = ''; addCmdClient(); });
    note('commandes clients', `création sans nom → fenêtre ouverte=${await s.page.evaluate(() => document.getElementById('mCmdClient').classList.contains('open'))}, message=${JSON.stringify(s.toasts.slice(-1))}`);
    await s.page.evaluate(() => sendCmdToFournil('cc_1'));
    await s.page.waitForTimeout(200);
    let e = await s.etat();
    const tache = e.tasks.find((t) => t.cmdId === 'cc_1');
    note('commandes clients', `envoyer au fournil → statut=${e.cmdClients.find((c) => c.id === 'cc_1').status}, tâche créée=${!!tache} « ${tache && tache.text} »`);
    await s.page.evaluate(() => sendCmdToFournil('cc_1'));
    await s.page.waitForTimeout(200);
    e = await s.etat();
    note('commandes clients', `deuxième envoi de la même commande → ${e.tasks.filter((t) => t.cmdId === 'cc_1').length} tâche(s)`);
    await s.page.evaluate(() => { openModule('fournil'); sw('tasks'); const t = S.tasks.find((x) => x.cmdId === 'cc_1'); toggleTask(t.id); });
    await s.page.waitForTimeout(200);
    e = await s.etat();
    note('commandes clients', `tâche cochée côté fournil → statut commande=${e.cmdClients.find((c) => c.id === 'cc_1').status}`);
    await s.page.evaluate(() => { openModule('bureau'); swB('cmd-clients'); });
    const pop = s.ctx.waitForEvent('page', { timeout: 1500 }).catch(() => null);
    await s.page.evaluate(() => lancerTournee());
    const p2 = await pop;
    note('tournée', `« Lancer la tournée » → ${p2 ? 'nouvel onglet ' + p2.url().slice(0, 80) : 'pas de nouvel onglet'} ; messages=${JSON.stringify(s.toasts.slice(-2))}`);
    await s.ctx.close();
  }

  // 8. Journal : saisie, changement de jour sans enregistrer
  {
    const s = await ouvrir(browser, origine);
    await s.page.evaluate(() => { openModule('bureau'); swB('journal'); document.getElementById('journalObs').value = 'Note non enregistrée'; });
    await s.page.locator('.journal-nav-btn').first().click();
    await s.page.locator('.journal-nav-btn').last().click();
    note('journal', `observation tapée puis jour précédent / suivant sans « Enregistrer » → champ=« ${await s.page.evaluate(() => document.getElementById('journalObs').value)} », enregistré=« ${(await s.etat()).journal[new Date().toISOString().slice(0, 10)].obs} »`);
    await s.ctx.close();
  }

  // 9. Hors ligne : les écritures échouent
  {
    const s = await ouvrir(browser, origine, { echecEcriture: true });
    await s.page.evaluate(() => { openModule('fournil'); sw('tasks'); openM('mTask'); document.getElementById('taskInput').value = 'Hors ligne'; addTask(); });
    await s.page.waitForTimeout(300);
    const visible = await s.page.evaluate(() => [...document.querySelectorAll('.toast, #rc-save-warn, #syncTxt')].map((e) => `${e.id || e.className}: ${e.textContent.trim()} (${getComputedStyle(e).display})`));
    note('hors ligne', `tâche ajoutée pendant que l'écriture échoue → messages=${JSON.stringify(s.toasts)}, indicateurs=${JSON.stringify(visible)}, erreurs=${JSON.stringify(s.erreurs.slice(0, 2))}`);
    await s.ctx.close();
  }

  // 10. Petit écran 320 px : débordement horizontal
  {
    const s = await ouvrir(browser, origine, { viewport: { width: 320, height: 640 } });
    const ecrans = { stock: "openModule('fournil');sw('stock')", magasin: "openModule('fournil');sw('magasin')", taches: "openModule('fournil');sw('tasks')", calendrier: "openModule('fournil');sw('calendrier')", reglages: "openModule('fournil');sw('settings')", recettes: "openModule('fournil');sw('recettes')", labo: "openModule('labo');swL('lstock')", matieres: "openModule('bureau');swB('matieres')", tournee: "openModule('bureau');swB('cmd-clients')", journal: "openModule('bureau');swB('journal')" };
    const deb = [];
    for (const [n, js] of Object.entries(ecrans)) {
      await s.page.evaluate(js);
      await s.page.waitForTimeout(150);
      const w = await s.page.evaluate(() => document.documentElement.scrollWidth);
      if (w > 320) deb.push(`${n}=${w}px`);
    }
    note('petit écran 320 px', deb.length ? `débordement horizontal : ${deb.join(', ')}` : 'aucun débordement horizontal');
    // retour arrière du navigateur
    await s.page.evaluate(() => { openModule('fournil'); sw('tasks'); });
    const url = s.page.url();
    await s.page.goBack().catch(() => null);
    note('retour arrière', `après Tâches, bouton retour du navigateur → ${s.page.url() === url ? 'reste sur la page (aucun écran précédent)' : 'quitte Fournil : ' + s.page.url()}`);
    await s.ctx.close();
  }

  // 11. Labo : produit, magasin, tâche
  {
    const s = await ouvrir(browser, origine);
    await s.page.evaluate(() => { openModule('labo'); swL('lmagasin'); });
    await s.page.evaluate(() => { const i = document.getElementById('lbase-lp_1'); i.value = '3'; i.dispatchEvent(new Event('input')); });
    await s.page.waitForTimeout(500);
    note('labo magasin', `base tarte → ${(await s.labo()).products.find((p) => p.id === 'lp_1').base} ; erreurs=${JSON.stringify(s.erreurs.slice(0, 2))}`);
    await s.page.evaluate(() => { swL('ltasks'); openM('mTask'); document.getElementById('taskInput').value = 'Tâche labo'; addTask(); });
    await s.page.waitForTimeout(200);
    note('labo tâches', `tâche ajoutée au Labo → dans labo=${(await s.labo()).tasks.some((t) => t.text === 'Tâche labo')}, dans fournil=${(await s.etat()).tasks.some((t) => t.text === 'Tâche labo')}`);
    await s.page.evaluate(() => { const b = [...document.querySelectorAll('.app-nav [data-nav="taches"]')][0]; b.click(); });
    note('labo → navigation', `depuis le Labo, « Tâches » de la barre ouvre : module=${await s.page.evaluate(() => activeModule)} onglet=${await s.page.evaluate(() => tab)}`);
    await s.ctx.close();
  }

  // 12. Recettes : virgule, grands nombres, calcul en pièces
  {
    const s = await ouvrir(browser, origine);
    await s.page.evaluate(() => { openModule('fournil'); sw('recettes'); document.querySelector('#tab-recettes [data-tab=calculator]').click(); });
    const vue = s.page.locator('#rc-calculator-view');
    for (const v of ['1,5', '1.5', '999999', '0', '-2']) {
      await vue.locator('.stepper-val input').fill('');
      await vue.locator('.stepper-val input').type(v);
      await s.page.waitForTimeout(150);
      const t = (await vue.locator('.result-card').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 140);
      note('calculateur', `poids voulu « ${v} » kg → ${t}`);
    }
    await s.ctx.close();
  }

  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(process.env.AUDIT_SORTIE || '.', 'audit-notes.json'), JSON.stringify(notes, null, 2));
})();
