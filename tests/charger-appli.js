// Charge index.html dans jsdom avec le faux Firebase. Les <script src> externes
// (Firebase, PDF.js) ne sont pas téléchargés et fetch est bloqué : aucun accès réseau.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createFakeFirebase } = require('./fake-firebase.js');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pause = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function chargerAppli({ recettes } = {}) {
  const initial = {};
  if (recettes) initial['boulangerie/recettes'] = { recipes: JSON.stringify(recettes) };
  const fake = createFakeFirebase(initial);
  const erreurs = [];
  const telechargements = [];
  const reseau = [];

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => erreurs.push(String(e && (e.stack || e.message || e))));
  vc.on('error', (...a) => erreurs.push(a.join(' ')));

  const dom = new JSDOM(HTML, {
    url: 'https://fournil.test/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.firebase = fake.firebase;
      window.pdfjsLib = { GlobalWorkerOptions: {} };
      const mem = new Map();
      window.storage = {
        get: async (k) => (mem.has(k) ? { value: mem.get(k) } : null),
        set: async (k, v) => { mem.set(k, v); },
      };
      window.fetch = (u) => { reseau.push(String(u)); return Promise.reject(new Error('réseau bloqué en test')); };
      window.alert = () => {};
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
  await pause(20);
  await pause(20);

  const lib = () => window.document.getElementById('rc-library-view');
  const carte = () => lib().querySelector('.rc-echange');
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
    input.dispatchEvent(new window.Event('change'));
    await pause(20);
  }

  async function confirmer() {
    zone().querySelector('.rc-import-ok').click();
    await pause(20);
  }

  const recettesEnBase = () => {
    const d = fake.docs.get('boulangerie/recettes');
    return d && d.recipes ? JSON.parse(d.recipes) : [];
  };
  const ecrituresRecettes = () => fake.writes.filter((w) => w.path === 'boulangerie/recettes' && 'recipes' in w.data);

  return { dom, window, fake, erreurs, reseau, lib, carte, zone, exporter, choisirFichier, confirmer, recettesEnBase, ecrituresRecettes, pause };
}

module.exports = { chargerAppli };
