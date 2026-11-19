// Charge index.html dans jsdom avec le faux Firebase. Seuls les fichiers du projet
// (recettes/recettes.js…) sont chargés, depuis le disque ; tout le reste (Firebase,
// polices, CDN) est bloqué et fetch aussi : aucun accès réseau.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');
const { createFakeFirebase } = require('./fake-firebase.js');

const FICHIER_HTML = process.env.FOURNIL_HTML || path.join(__dirname, '..', 'index.html');
const HTML = fs.readFileSync(FICHIER_HTML, 'utf8');
const RACINE = path.join(__dirname, '..');
const ORIGINE = 'https://fournil.test/';

// Sert les fichiers du projet (scripts seulement) ; refuse tout le reste.
class ChargeurLocal extends ResourceLoader {
  fetch(url, options) {
    if (url.startsWith(ORIGINE) && options.element && options.element.localName === 'script') {
      const fichier = path.join(RACINE, decodeURIComponent(new URL(url).pathname));
      if (fichier.startsWith(RACINE) && fs.existsSync(fichier)) return Promise.resolve(fs.readFileSync(fichier));
    }
    return null;
  }
}
const pause = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function chargerAppli({ recettes, etat, labo, preparer, configurerFirebase } = {}) {
  const initial = {};
  if (recettes) initial['boulangerie/recettes'] = { recipes: JSON.stringify(recettes) };
  if (etat) initial['boulangerie/state'] = { state: JSON.stringify(etat) };
  if (labo) initial['boulangerie/labo'] = { state: JSON.stringify(labo) };
  const fake = createFakeFirebase(initial);
  if (configurerFirebase) configurerFirebase(fake); // ex. persistance indisponible
  const erreurs = [];
  const telechargements = [];
  const reseau = [];

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => erreurs.push(String(e && (e.stack || e.message || e))));
  vc.on('error', (...a) => erreurs.push(a.join(' ')));

  const dom = new JSDOM(HTML, {
    url: ORIGINE,
    runScripts: 'dangerously',
    resources: new ChargeurLocal(),
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.firebase = fake.firebase;
      // Pas de window.storage : il n'existe pas en production non plus.
      if (preparer) preparer(window); // ex. faux micro pour la dictée
      window.fetch = (u) => { reseau.push(String(u)); return Promise.reject(new Error('réseau bloqué en test')); };
      window.alert = () => {};
      // CSS.escape existe dans tous les navigateurs, pas dans jsdom.
      if (!window.CSS) window.CSS = { escape: (v) => String(v).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
      window.scrollTo = () => {};
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      const blobs = new Map();
      window.URL.createObjectURL = (blob) => { const u = `blob:test/${blobs.size}`; blobs.set(u, blob); return u; };
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function () {
        if (this.hasAttribute('download')) telechargements.push({ nom: this.download, blob: blobs.get(this.href) });
      };
    },
  });
  const { window } = dom;
  // Prête : écoutes temps réel de state, labo et recettes en place, premières données reçues.
  for (let i = 0; i < 300 && fake.nbEcoutes() < 3; i++) await pause(10);
  await pause(30);

  const lib = () => window.document.getElementById('rc-library-view');
  const carte = () => window.document.querySelector('#tab-recettes .rc-echange');
  const zone = () => carte().querySelector('.rc-echange-zone');
  const lireBlob = (blob) => new Promise((res, rej) => {
    const fr = new window.FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsText(blob);
  });

  async function exporter() {
    const avant = telechargements.length;
    carte().querySelector('.rc-export-btn').click();
    await pause();
    if (telechargements.length === avant) return null;
    const t = telechargements[telechargements.length - 1];
    return { nom: t.nom, texte: await lireBlob(t.blob) };
  }

  async function choisirFichier(texte, nom = 'grigne-recettes.json', taille) {
    const input = carte().querySelector('.rc-import-input');
    const file = new window.File([texte], nom, { type: 'application/json' });
    if (taille !== undefined) Object.defineProperty(file, 'size', { value: taille });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    const avant = zone().innerHTML;
    input.dispatchEvent(new window.Event('change'));
    // attendre que l'aperçu (ou le message) remplace l'ancien contenu, 3 s au plus
    for (let i = 0; i < 300 && zone().innerHTML === avant; i++) await pause(10);
    await pause(10);
  }

  async function confirmer() {
    zone().querySelector('.rc-import-ok').click();
    // attendre le bilan (ou une erreur) : « Import en cours… » doit disparaître
    for (let i = 0; i < 300 && (!/Import terminé|Rien à ajouter|rien n’a été importé|échoué/.test(zone().textContent)); i++) await pause(10);
    await pause(10);
  }

  const recettesEnBase = () => {
    const d = fake.docs.get('boulangerie/recettes');
    return d && d.recipes ? JSON.parse(d.recipes) : [];
  };
  const ecrituresRecettes = () => fake.writes.filter((w) => w.path === 'boulangerie/recettes' && 'recipes' in w.data);

  return { dom, window, fake, erreurs, reseau, lib, carte, zone, exporter, choisirFichier, confirmer, recettesEnBase, ecrituresRecettes, pause };
}

module.exports = { chargerAppli };
