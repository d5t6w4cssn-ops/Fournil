# Fournil

Application web de gestion d'une boulangerie, utilisée chaque jour par l'équipe :
stock du congélateur, magasin, recettes et calculs, tâches, notes d'équipe, Labo pâtisserie,
et Bureau (matières premières, commandes fournisseurs, tournée de livraison, journal,
statistiques).

- **En ligne** : https://d5t6w4cssn-ops.github.io/Fournil/ (accès sur compte, aucune inscription libre).
- **Technique** : une page HTML, du JavaScript natif et du CSS, sans étape de construction.
  Les données sont dans Firebase (Firestore) et restent disponibles hors ligne sur l'appareil.
- **Fonctionnement détaillé** : voir [ARCHITECTURE.md](ARCHITECTURE.md).

## Lancer le site en local

Il suffit de servir le dossier avec n'importe quel petit serveur web, par exemple :

```bash
python3 -m http.server 8080 --bind 127.0.0.1
# puis ouvrir http://localhost:8080/
```

La page se connecte au vrai projet Firebase : il faut un compte autorisé. Pour essayer sans
toucher aux vraies données, utiliser les tests ou les outils ci-dessous, qui remplacent
Firebase par une copie en mémoire (`tests/fake-firebase.js`).

## Tests

```bash
npm ci                              # dépendances de test uniquement (jsdom, Playwright, axe…)
npx playwright install chromium     # navigateur pour les tests dans Chromium
npm test                            # tous les tests (environ 120)
node --test tests/test_stock.js     # un seul fichier
```

Les tests n'accèdent jamais au réseau ni à la vraie base : Firebase est remplacé par
`tests/fake-firebase.js`, rempli de données de démonstration (`tests/donnees-demo.js`).
Deux tests comparent Fournil au code de Grigne s'il est présent dans `~/grigne` ; sinon ils
sont ignorés.

Outils utiles (dossier `tools/`) :

| Commande | Rôle |
|---|---|
| `npx eslint .` | vérification du code |
| `node tools/audit-accessibilite.cjs` | audit axe de tous les écrans (clair, sombre, Lecture facile) |
| `node tools/captures.cjs . <dossier> <suffixe>` | captures de tous les écrans |
| `node tools/captures-reference.cjs <dossier>` | captures reproductibles (horloge figée) ; `--comparer` pour comparer au pixel |
| `node tools/verifier-en-ligne.cjs` | vérifie le site publié (chargement, erreurs, fichiers manquants) |
| `node tools/importer-grigne.mjs` | reprend les écrans de Grigne et régénère `recettes/recettes.js` et `.css` |
| `node tools/audit-parcours.cjs` | parcours d'une journée de boulanger, avec cas limites |

## Publication

- Le site est publié tel quel par **GitHub Pages** depuis la branche `main` : chaque envoi
  sur `main` met le site en ligne en une à deux minutes. On travaille toujours sur une autre
  branche, et on ne fusionne dans `main` qu'avec l'accord du propriétaire.
- L'intégration continue (`.github/workflows/tests.yml`) lance les tests à chaque envoi ;
  elle ne publie rien.
- Les règles de sécurité Firestore sont dans `firebase/firestore-fournil.rules` et se
  publient à part : `firebase deploy --only firestore:rules --project fournils-5e5d1`.

## Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) : modules, fichiers, données, synchronisation, sécurité.
- [SECURITY.md](SECURITY.md) : signaler une faille.
- [CHANGELOG.md](CHANGELOG.md) : ce qui a changé.
- [docs/](docs/) : format d'échange des recettes avec Grigne, héritage du style de Grigne,
  liste du code mort.
