// G8 : la date du jour est toujours celle de Paris, même entre minuit et 2 h et au
// changement d'heure. Lancer : node --test tests/test_date.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dateParis, decalerJour } = require('../assets/js/date.js');
const { chargerAppli } = require('./charger-appli.js');

test('0 h 30 en hiver (UTC+1) : déjà le lendemain à Paris', () => {
  assert.equal(dateParis(new Date('2026-01-15T23:30:00Z')), '2026-01-16'); // 0 h 30 à Paris
  assert.equal(dateParis(new Date('2026-01-15T22:59:59Z')), '2026-01-15'); // 23 h 59 à Paris
});

test('0 h 30 et 1 h 30 en été (UTC+2) : déjà le lendemain à Paris', () => {
  assert.equal(dateParis(new Date('2026-07-15T22:30:00Z')), '2026-07-16'); // 0 h 30
  assert.equal(dateParis(new Date('2026-07-15T23:30:00Z')), '2026-07-16'); // 1 h 30
  assert.equal(dateParis(new Date('2026-07-15T21:59:59Z')), '2026-07-15'); // 23 h 59
});

test('changement d’heure de printemps (29 mars 2026) et d’automne (25 octobre 2026)', () => {
  assert.equal(dateParis(new Date('2026-03-28T23:30:00Z')), '2026-03-29'); // 0 h 30, encore en heure d'hiver
  assert.equal(dateParis(new Date('2026-03-29T00:59:00Z')), '2026-03-29'); // 1 h 59
  assert.equal(dateParis(new Date('2026-03-29T01:00:00Z')), '2026-03-29'); // 3 h 00, heure d'été
  assert.equal(dateParis(new Date('2026-10-24T22:30:00Z')), '2026-10-25'); // 0 h 30, encore en heure d'été
  assert.equal(dateParis(new Date('2026-10-25T00:30:00Z')), '2026-10-25'); // 2 h 30, avant le recul
  assert.equal(dateParis(new Date('2026-10-25T01:30:00Z')), '2026-10-25'); // 2 h 30, après le recul
  assert.equal(dateParis(new Date('2026-10-25T22:59:00Z')), '2026-10-25'); // 23 h 59, heure d'hiver
  assert.equal(dateParis(new Date('2026-10-25T23:00:00Z')), '2026-10-26');
});

test('jour précédent / suivant : fins de mois, d’année, changement d’heure', () => {
  assert.equal(decalerJour('2026-03-29', -1), '2026-03-28');
  assert.equal(decalerJour('2026-03-28', 1), '2026-03-29');
  assert.equal(decalerJour('2026-10-25', 1), '2026-10-26');
  assert.equal(decalerJour('2026-03-01', -1), '2026-02-28');
  assert.equal(decalerJour('2028-03-01', -1), '2028-02-29');
  assert.equal(decalerJour('2026-12-31', 1), '2027-01-01');
  assert.equal(decalerJour('2026-11-19', -6), '2026-11-13');
});

// L'appli entière, avec l'horloge réglée sur un instant précis
async function appliA(t, instant) {
  const a = await chargerAppli({
    preparer(window) {
      const Vrai = window.Date;
      const fixe = new Vrai(instant).getTime();
      class Date extends Vrai {
        constructor(...args) { if (args.length) super(...args); else super(fixe); }
        static now() { return fixe; }
      }
      window.Date = Date;
    },
  });
  t.after(() => a.window.close());
  return a;
}

test('l’appli à 0 h 30 en hiver : aujourd’hui, en-tête, journal et calendrier sur le jour de Paris', async (t) => {
  const a = await appliA(t, '2026-01-15T23:30:00Z');
  const w = a.window;
  assert.equal(w.eval('today()'), '2026-01-16');
  w.eval("openModule('fournil');sw('stock')");
  assert.match(w.document.getElementById('hdate').textContent, /vendredi 16 janvier/i);
  assert.equal(w.eval('journalDate'), '2026-01-16');
  assert.equal(w.eval('calSelectedDate'), '2026-01-16');
  assert.equal(w.eval('calMonth'), 0);
  w.eval("openModule('bureau');swB('journal')");
  assert.match(w.document.getElementById('bur-journal').textContent, /Aujourd'hui/);
});

test('l’appli à 0 h 30 en été', async (t) => {
  const a = await appliA(t, '2026-07-31T22:30:00Z');
  assert.equal(a.window.eval('today()'), '2026-08-01');
  assert.equal(a.window.eval('calMonth'), 7, 'août');
});

test('plus aucun calcul de « aujourd’hui » en heure universelle dans le code de l’appli', () => {
  const racine = path.join(__dirname, '..');
  const fichiers = ['index.html', ...fs.readdirSync(path.join(racine, 'assets/js')).map((f) => `assets/js/${f}`), ...fs.readdirSync(path.join(racine, 'recettes/adaptation')).map((f) => `recettes/adaptation/${f}`)];
  for (const f of fichiers) {
    const code = fs.readFileSync(path.join(racine, f), 'utf8');
    assert.doesNotMatch(code, /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/, f);
    assert.doesNotMatch(code, /new Date\(\)\.get(FullYear|Month|Date)\(\)/, f);
  }
});
