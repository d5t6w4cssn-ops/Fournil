// Migration « équipe » sur une COPIE des données, dans l'ÉMULATEUR Firestore uniquement.
// Ne touche jamais la vraie base : refuse de tourner sans émulateur (FIRESTORE_EMULATOR_HOST)
// et avec un autre projet que « demo-… ». La vraie migration se fait dans l'appli, par le
// responsable : Réglages → Équipe → « Préparer les données pour l'équipe… ».
//
//   npm run migration:essai        copie = données de démonstration
//   firebase emulators:exec --only firestore --project demo-fournil "node tools/migration-equipe.mjs copie.json"
//                                  copie = fichier { "boulangerie/state": {…}, … }
//
// Étapes : copie dans l'émulateur → migration (même fonction que l'appli, compte
// administrateur) → vérifications (rien de perdu, sauvegarde faite) → annulation →
// vérification du retour à l'identique.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const require = createRequire(import.meta.url);
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = require('../assets/js/equipe-donnees.js');
const { donneesDemo } = require('../tests/donnees-demo.js');

const hote = process.env.FIRESTORE_EMULATOR_HOST;
const projet = process.env.GCLOUD_PROJECT || 'demo-fournil';
if (!hote) { console.error('Refusé : pas d’émulateur (FIRESTORE_EMULATOR_HOST absent). Lance : npm run migration:essai'); process.exit(1); }
if (!projet.startsWith('demo-')) { console.error(`Refusé : le projet « ${projet} » n’est pas un projet d’essai (demo-…).`); process.exit(1); }

const fichier = process.argv[2];
let copie;
if (fichier) {
  copie = JSON.parse(fs.readFileSync(fichier, 'utf8'));
} else {
  const d = donneesDemo();
  copie = {
    'boulangerie/state': { state: JSON.stringify(d.state) },
    'boulangerie/labo': { state: JSON.stringify(d.labo) },
    'boulangerie/recettes': { recipes: JSON.stringify(d.recettes), calcHistory: JSON.stringify(d.calcHistory) },
  };
}

const [host, port] = hote.split(':');
const env = await initializeTestEnvironment({
  projectId: projet,
  firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(RACINE, 'firebase', 'firestore-fournil.rules'), 'utf8') },
});
let erreurs = 0;
const verifier = (ok, texte) => { console.log(`${ok ? '✓' : '✗'} ${texte}`); if (!ok) erreurs++; };
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const [chemin, data] of Object.entries(copie)) await ctx.firestore().doc(chemin).set(data);
  });
  console.log(`Copie chargée dans l’émulateur (${Object.keys(copie).length} documents).`);
  const admin = env.authenticatedContext(E.ADMIN_UID).firestore();
  const r = await E.migrerBase(admin);
  console.log(`Migration : ${r.produits} produits, ${r.lignesHistorique} lignes d’historique, ${r.calculs} calculs ; sauvegarde ${r.sauvegarde}.`);
  const origine = JSON.parse(copie['boulangerie/state'].state);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    const stock = JSON.parse((await f.doc('boulangerie/stock').get()).data().state);
    const reste = JSON.parse((await f.doc('boulangerie/state').get()).data().state);
    verifier(JSON.stringify(E.assembler(reste, stock)) === JSON.stringify(E.assembler(E.separer(origine).reste, E.separer(origine).stock)), 'stock + reste = données d’origine');
    verifier((await f.doc(`sauvegardes/${r.sauvegarde}`).get()).data().state === copie['boulangerie/state'].state, 'sauvegarde identique à l’original');
    if (copie['boulangerie/labo']) verifier((await f.doc('boulangerie/labo').get()).data().state === copie['boulangerie/labo'].state, 'Labo inchangé');
    if (copie['boulangerie/recettes']) verifier((await f.doc('boulangerie/recettes').get()).data().recipes === copie['boulangerie/recettes'].recipes, 'recettes inchangées');
    verifier((await f.collection('calculs').get()).size === r.calculs, 'calculs recopiés');
  });
  verifier((await E.migrerBase(admin)).deja === true, 'deuxième lancement refusé');
  await E.annulerMigration(admin);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const etat = JSON.parse((await ctx.firestore().doc('boulangerie/state').get()).data().state);
    verifier(JSON.stringify(E.separer(etat)) === JSON.stringify(E.separer(origine)), 'annulation : retour aux données d’origine');
  });
} finally {
  await env.cleanup();
}
console.log(erreurs ? `${erreurs} vérification(s) en échec.` : 'Tout est bon.');
process.exit(erreurs ? 1 : 0);
