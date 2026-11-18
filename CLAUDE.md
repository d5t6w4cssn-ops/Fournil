# Fournil

PWA de gestion d'une boulangerie, utilisée **tous les jours par l'équipe, avec de vraies
données**. Tout tient dans un seul fichier, `index.html` (HTML + CSS + JavaScript natif,
sans build ni dépendance à l'exécution). Le déploiement consiste à remplacer ce fichier.

## Règles absolues

- **Production** : le dépôt `d5t6w4cssn-ops/Fournil` est publié par GitHub Pages depuis
  `main` (https://d5t6w4cssn-ops.github.io/Fournil/). Ne jamais pousser sur `main` sans
  l'accord explicite de l'utilisateur. Toujours travailler sur une branche à part.
- **Vraies données** : ne jamais toucher à la version en ligne ni aux vraies données
  Firebase (projet `fournils-5e5d1`). Les tests utilisent un faux Firebase, jamais la vraie base.
- **Mots de passe** : ne jamais en demander. Firebase uniquement via
  `firebase login --no-localhost`, et seulement sur le projet de Fournil.
- **Grigne** (`~/grigne`) : on le lit, on n'y écrit jamais rien.
- Tout en **français**, l'interface **tutoie**. Lancer les tests après chaque changement.

## Ordre des projets

1. **Export / import des recettes** au format Grigne (`format-export.md`).
2. **Sécurité** : règles Firestore trop ouvertes (tout utilisateur connecté lit et écrit
   `boulangerie/*`), inscription libre à vérifier dans la console Firebase, PDF.js chargé
   depuis un CDN sans contrôle d'intégrité, thermomètre Tuya cassé (à réparer ou retirer).
3. **Refonte dans le style de Grigne** : voir `HERITAGE-GRIGNE.md` (maquettes d'abord,
   écran par écran, accord de l'utilisateur avant d'appliquer).

## Organisation du code (`index.html`)

- Écran de connexion (Firebase Auth e-mail / mot de passe), puis accueil avec trois
  modules : **Fournil**, **Labo**, **Bureau** (`openModule`).
- Onglets du Fournil (`sw`) : Stock, Magasin, Recettes, Tâches, Histo, Calendrier,
  Réglages ; le Labo a les siens (`swL`).
- Firebase 9.23 *compat* (gstatic) et PDF.js 3.11 (cdnjs) chargés par `<script>`.
- Données Firestore, collection `boulangerie` : `state` (Fournil), `labo`, `recettes`.
  Chaque document stocke du JSON sous forme de texte. Écoute en temps réel
  (`initFirebase` → `onSnapshot`), cache local par `localStorage` / `window.storage`.
- **Recettes** : module isolé dans une IIFE (`<script>` vers la fin du fichier), partagé
  entre Fournil et Labo. Document `boulangerie/recettes`, champs `recipes` et
  `calcHistory`. Une recette : `{ id, name, ingredients: [{ id, name, qtyG }], notes, tb? }`,
  quantités toujours en grammes. Onglets Bibliothèque, Calculateur, Température de base.
- Échappement **à l'affichage** avec `esc()` (texte → HTML) ; ne jamais injecter un texte
  venu des données ou d'un fichier sans `esc()` ou `textContent`.

## Export / import des recettes

Dans Recettes → Bibliothèque, carte « Mes recettes : exporter / importer » :

- Exporter : fichier `fournil-recettes-AAAA-MM-JJ.json` au format Grigne version 2
  (`app: "grigne"`), lisible tel quel par « Importer un fichier Grigne ». Lecture seule.
- Importer : lit un fichier Grigne (versions 1 et 2), montre un aperçu, demande
  confirmation, ajoute sans jamais écraser (doublon identique ignoré, nom pris →
  « Nom (importée) »), affiche un bilan. Les règles suivent `~/grigne/src/js/core/export.js`.

## Tests

```bash
npm install          # jsdom, uniquement pour les tests
npm test             # lance tous les tests/test_*.js
```

`tests/fake-firebase.js` remplace Firebase (Auth + Firestore en mémoire) et bloque tout
appel réseau. `tests/test_echange_grigne.js` vérifie aussi l'aller-retour avec le code de
Grigne (`~/grigne/src/js/core/export.js`, importé en lecture seule).
