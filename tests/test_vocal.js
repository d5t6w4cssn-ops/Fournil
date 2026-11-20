// Messages vocaux : seule la transcription en texte est enregistrée (plus de son dans
// Firestore) ; les anciens messages avec un son restent ; Réglages affiche leur poids.
// Lancer : node --test tests/test_vocal.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerAppli } = require('./charger-appli.js');
const { donneesDemo } = require('./donnees-demo.js');

function micro(window, phrase) {
  window.SpeechRecognition = class {
    start() { setTimeout(() => this.onresult({ results: [[{ transcript: phrase }]] }), 0); }
    stop() { setTimeout(() => this.onend(), 0); }
  };
}

test('message vocal : texte transcrit enregistré, aucun son', async (t) => {
  const d = donneesDemo();
  const a = await chargerAppli({ etat: d.state, preparer: (w) => micro(w, 'Four 2 trop chaud ce matin') });
  t.after(() => a.window.close());
  const w = a.window;
  w.eval('renderNotes()');
  w.eval('toggleVocal()');
  await a.pause(20);
  w.eval('toggleVocal()'); // arrêter
  await a.pause(30);
  const s = JSON.parse(a.fake.docs.get('boulangerie/state').state);
  const n = s.notes[0];
  assert.equal(n.isVocal, true);
  assert.equal(n.transcription, 'Four 2 trop chaud ce matin');
  assert.equal(n.text, 'Four 2 trop chaud ce matin');
  assert.equal('audioUrl' in n, false, 'aucun son enregistré');
  assert.match(w.document.getElementById('notesList').textContent, /Four 2 trop chaud ce matin/);
  assert.doesNotMatch(a.fake.writes.map((x) => JSON.stringify(x.data)).join(''), /data:audio/);
});

test('sans reconnaissance vocale : message clair, rien enregistré', async (t) => {
  const d = donneesDemo();
  const a = await chargerAppli({ etat: d.state });
  t.after(() => a.window.close());
  const avant = a.fake.writes.length;
  a.window.eval('renderNotes();toggleVocal()');
  await a.pause(20);
  assert.match(a.window.document.getElementById('toast').textContent, /dictée n’est pas disponible/);
  assert.equal(a.fake.writes.length, avant);
});

test('anciens messages avec son : gardés, et leur poids affiché dans Réglages', async (t) => {
  const d = donneesDemo();
  const son = `data:audio/webm;base64,${'A'.repeat(200 * 1024)}`;
  d.state.notes.push({ id: 'v_old', author: 'Sam', text: '', audioUrl: son, isVocal: true, transcription: null, time: '1 nov. 06:00' });
  const a = await chargerAppli({ etat: d.state });
  t.after(() => a.window.close());
  const w = a.window;
  w.eval("openModule('fournil');sw('settings')");
  const carte = w.document.querySelector('#settingsList .place-occupee');
  assert.ok(carte, 'carte « Place occupée »');
  assert.match(carte.textContent.replace(/\s+/g, ' '), /Anciens messages vocaux avec leur son : 1, soit 200 Ko/);
  assert.match(carte.textContent, /Fournil et Bureau/);
  w.eval('save()');
  await a.pause(20);
  assert.equal(JSON.parse(a.fake.docs.get('boulangerie/state').state).notes.find((n) => n.id === 'v_old').audioUrl, son, 'ancien son gardé');
});
