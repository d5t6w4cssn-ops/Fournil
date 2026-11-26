# Rapport de la nuit 3 (26 → 27 novembre 2026)

Branche de travail : `nuit-3`, partie de `main` à jour (`6351280`), poussée régulièrement.
`main` n'a pas été touchée. Aucune action sur le vrai Firebase (émulateur seulement).

## Avancement

| Étape | État |
|---|---|
| 1. Recettes au propre (fiche avant/après) | fait |
| 2. Saisie rapide des calculs | fait |
| 3. CSP | fait |
| 4. Nettoyage du dépôt | fait |
| Fin : ESLint, tests, CI, docs | fait |

## 1. Recettes au propre

- Fichier lu : `fournil-recettes-2026-11-26 (1).json` (export de 21 h 41, le plus récent).
  Copie de travail dans `reference/recettes-nuit-3/` (dossier ignoré par git : tes recettes
  ne sont pas publiées). L'original n'a pas été modifié.
- Ses 14 recettes sont **identiques** à celles de l'export de 21 h 08 (seule la date d'export
  change) : la mise à jour préparée ce soir n'a donc pas encore été appliquée dans l'appli.
  J'ai repris ce travail tel quel (déjà relu avec toi ce soir).
- **Fiche avant/après** : `/mnt/chromeos/MyFiles/Downloads/recettes-avant-apres.html`
  (ancien texte, nouveau texte, « Corrigé par moi » en vert, « Reste à vérifier » en jaune).
- **Fichier des notes propres**, prêt à appliquer : `/mnt/chromeos/MyFiles/Downloads/recettes-notes-propres.json`
  (identique à `fournil-recettes-corrigees-2026-11-26.json` de ce soir).
- Contrôlé par programme : identifiants, ordre et quantités des ingrédients identiques ;
  aucun chiffre ajouté ni perdu dans les notes (sauf la correction voulue « 2e → 1re vitesse »
  des Chutes viennoises) ; poids de farine et allergènes détectés identiques.
- **Rien n'est appliqué.**

### Façon la plus sûre de l'appliquer (déjà en ligne depuis ce soir)

Le mode d'import demandé existe déjà sur `main` (commit `6351280`, publié avec ton accord) :
Recettes → Bibliothèque → **« Mettre à jour noms et notes »**. Il ne touche que les recettes
de même identifiant ayant exactement les mêmes ingrédients et quantités ; il change seulement
le nom, les notes et les noms d'ingrédients ; il montre un aperçu, puis télécharge une
sauvegarde complète juste avant d'écrire. Testé (4 tests) et essayé à blanc avec tes
14 recettes sur le faux Firebase. Je ne l'ai pas utilisé sur les vraies données.

## 2. Saisie rapide des calculs

- **Où elle était** : Recettes → onglet **Calculateur** (« Calcul » sur téléphone), tout en
  haut, carte « Saisie rapide ». Elle est bien dans la version en ligne (vérifié sur
  GitHub Pages) et elle marche (texte et dictée ; tests `tests/test_feuilles.js`).
  Elle était seulement **difficile à trouver** : rien ne la signalait depuis la Bibliothèque,
  le premier écran des Recettes.
- **Correction** : un bouton bien visible **« Saisie rapide des calculs »** en haut de la
  Bibliothèque. Il ouvre le Calculateur et place le curseur dans le champ de saisie.
  Visible aussi pour le rôle équipe. Testé.
- **Essai avec tes vraies recettes** (« 30 pains sportifs à 400 g, 20 campagnes à 500 g,
  10 tradition à 250 g, 12 meules de 1 kg ») : Pain sportif et Meule trouvés directement ;
  « tradition » proposé (à confirmer dans la liste) ; « campagnes » **pas reconnu** tant que
  la recette s'appelle « Pain capagne » (faute de frappe). Avec les noms corrigés de
  l'étape 1 (« Pain de campagne »), l'appli la propose. Une recette proche n'est jamais
  choisie toute seule (choix prudent, inchangé).
- **Où elle se trouve maintenant** : Recettes → Bibliothèque → bouton « Saisie rapide des
  calculs » (ou directement Recettes → Calculateur, en haut).

## 3. CSP

- Balise `<meta http-equiv="Content-Security-Policy">` en tête de `index.html` (GitHub Pages
  ne permet pas d'en-têtes HTTP). Détail des règles et de leurs raisons : `SECURITY.md`.
- **Vérifié** :
  - `tests/test_csp.js` (Chromium, faux Firebase) : tous les écrans du Fournil, du Labo, du
    Bureau et des Recettes, saisie rapide → feuille PDF, ancien message avec son : **aucun
    refus**. Contre-épreuve : un script venu d'un autre site est bien refusé.
  - `tests/test_pdf.js`, `test_petit_ecran.js`, `test_retour.js` tournent désormais sous la
    CSP : import PDF (PDF.js local et son worker) OK.
  - **Nouveau** `npm run test:emulateur` : l'appli avec le **vrai code Firebase** branché sur
    les émulateurs Auth + Firestore (projet fictif `demo-fournil`, toute autre requête bloquée) :
    connexion par l'écran de connexion, lecture, synchro serveur → appli et appli → serveur,
    saisie hors ligne puis envoi au retour du réseau. **Passe.** Ajouté à la CI (job `regles`).
  - Ce test a trouvé un vrai besoin : Firestore charge l'image `www.google.com/images/cleardot.gif`
    pour tester le réseau ; autorisée à cette adresse exacte seulement.
  - Voix : la dictée (`SpeechRecognition`) passe par le navigateur, pas par la page : la CSP
    ne la concerne pas. Les boutons micro s'affichent sans refus.
- `firebase.json` : ajout de la section `emulators` (Auth 9099, Firestore 8080, sans interface),
  nécessaire pour l'émulateur Auth. Ne change rien à la publication des règles.

## 4. Nettoyage du dépôt

### Monolithe

Plus gros fichiers suivis (hors copies de Grigne, PDF.js et polices) : `index.html` 193 Ko,
`package-lock.json` 128 Ko, `recettes/recettes.js` 121 Ko (généré), `recettes/recettes.css`
65 Ko (généré), `assets/css/fournil-grigne.css` 50 Ko, `assets/js/acces.js` 28 Ko,
`assets/js/stock.js` 28 Ko.

- **Fait** : les styles d'origine (466 lignes du `<style>` de `index.html`) sont sortis, sans
  aucune modification, dans `assets/css/fournil-base.css`, chargé au même endroit (même ordre
  des styles). `index.html` passe de 193 à 156 Ko. Vérifié : ESLint, tous les tests, et
  **72 captures** de tous les écrans (mobile et ordinateur, clair et sombre) comparées au pixel
  avant / après : aucun écart visible (au plus 2 niveaux de couleur sur 255 sur un carré de
  30 px, du lissage, déjà mesuré entre deux prises du même code).
  - Ce découpage a fait échouer `tests/test_pdf.js` : son petit serveur envoyait les `.css`
    avec un type inconnu, que Chromium ignore. Corrigé dans le test (types de GitHub Pages,
    vérifiés : `text/css`). L'appli en ligne n'était pas concernée.
- **Proposé, pas fait** : sortir le **script principal** (~2 100 lignes en fin de
  `index.html`) dans `assets/js/principal.js`. Simple en apparence, mais il serait alors
  vérifié par ESLint (beaucoup de corrections à prévoir), et des outils et tests lisent
  `index.html`. Pas de gain de sécurité tant que les `onclick` restent. À faire dans une
  session dédiée, avec le retrait des `onclick` (ce qui permettrait ensuite une CSP sans
  `'unsafe-inline'`).

### Code mort supprimé

Méthode : chaque classe de `assets/css/fournil-base.css` cherchée dans tout le projet (HTML,
JavaScript, généré compris, noms construits compris) ; chaque fonction cherchée partout, tests
et outils compris. Un morceau à la fois, **ESLint + tous les tests (180) après chaque
suppression**, tous verts :

| Commit | Supprimé | Où |
|---|---|---|
| `ae96acd` | `.mat-card` (+ `::before`, `.low`, `.empty`, `.dlc-soon`), `.mat-header`, `.mat-badges`, `.mat-stock-row`, `.mat-stock-val`, `.mat-ctrl`, `.mat-btn` (+ `:active`), `.mat-in` (+ `:focus`) | `fournil-base.css` (écran Matières) |
| `3837223` | `.hebdo-card` | `fournil-base.css` et sélecteur de `fournil-grigne.css` |
| `d55ce1b` | `.cal-day.other-month` | `fournil-base.css` |

- Aucune fonction JavaScript morte (les 5 candidates trouvées par la recherche automatique
  sont appelées sous la forme `...nom(` dans `fiche-pdf.js`).
- Déjà retirés lors de nuits précédentes (mais `docs/CODE-MORT.md` ne le disait pas : mis à
  jour) : la copie locale `window.storage` et l'attente des Statistiques (`77f79ff`), et
  27 règles de styles recouvertes par la refonte (`cff28f2`, 20 novembre).
- **Pas touchés, par prudence** : les styles « recouverts par la refonte » et les éléments
  « à vérifier » de `docs/CODE-MORT.md` (encore reliés à du code ou à affiner écran par écran).

### Branches

Vérifié avec `git branch --merged main` (local et GitHub). Avant chaque suppression : tag
annoté `archive/<nom>` sur le dernier commit, poussé sur GitHub, puis vérification que le tag
pointe bien sur ce commit. Suppression avec `git branch -d` (jamais `-D`), puis sur GitHub.

| Branche supprimée | Dernier commit | Tag d'archive | Où |
|---|---|---|---|
| `equipe-uid-deja-utilise` | `1b819c8` | `archive/equipe-uid-deja-utilise` | locale seulement |
| `export-import` | `c22b481` | `archive/export-import` | locale + GitHub |
| `nuit-2` | `7a30a63` | `archive/nuit-2` | locale + GitHub |
| `nuit-equipe` | `8010c99` | `archive/nuit-equipe` | locale + GitHub |
| `recettes-mise-a-jour-notes` | `6351280` | `archive/recettes-mise-a-jour-notes` | locale seulement |
| `refonte` | `b52f8a3` | `archive/refonte` | locale + GitHub |
| `sans-retrait-plusieurs-jours` | `c01667c` | `archive/sans-retrait-plusieurs-jours` | locale seulement |
| `securite` | `197c83c` | `archive/securite` | locale + GitHub |

Pour en récupérer une : `git branch <nom> archive/<nom>`.

| Branche gardée | Pourquoi |
|---|---|
| `main` | production (jamais touchée) |
| `nuit-3` | travail de cette nuit |
| `avant-equipe`, `avant-export-import` (locales et GitHub), `avant-nuit-2`, `avant-refonte`, `avant-securite`, `avant-stock-b1-b2` (GitHub) | branches de sauvegarde `avant-*` : gardées par règle |

Aucune branche non fusionnée à part `nuit-3`.

## Décisions prises

- Étape 1 : pas de nouveau code d'import, celui de ce soir répond déjà à la demande.
- Étape 2 : je n'ai pas déplacé la saisie rapide (le Calculateur reste sa place logique) ;
  j'ai ajouté un accès direct visible depuis la Bibliothèque.
- Étape 3 : CSP **sans** retirer `'unsafe-inline'` (scripts et styles). Le retirer casserait
  les ~140 boutons `onclick="…"` de l'appli ; c'est un chantier à part, noté dans
  `SECURITY.md`. Tout le reste est verrouillé (sources, connexions, objets, `base`, formulaires).
- Étape 3 : `frame-src` autorise l'iframe d'authentification de Firebase
  (`fournils-5e5d1.firebaseapp.com`) par précaution : la connexion par e-mail ne s'en sert
  pas dans le test, mais Firebase peut la charger ; sans elle, la connexion pourrait casser.
- Étape 4 : seul le découpage des styles a été fait (mécanique, vérifié au pixel) ; le script
  principal reste dans `index.html` (proposition ci-dessus).
- Étape 4 : seuls les styles prouvés inutilisés ont été supprimés ; tout ce qui restait
  « probable » ou « à vérifier » est laissé.

## Vérifications finales (sur `nuit-3`, commit `bec621a`)

- ESLint : **0 erreur** (`npx eslint .`).
- Fichiers générés des recettes à jour (`node tools/importer-grigne.mjs --verifier`).
- `npm test` : **180 tests sur 180** (177 au départ sur `main`, + 1 pour l'accès direct à
  la saisie rapide, + 2 pour la CSP dans `tests/test_csp.js`).
- `npm run test:regles` : **10 sur 10** (émulateur).
- `npm run test:emulateur` : **1 sur 1** (nouveau : vrai Firebase sur les émulateurs, sous la CSP).
- **CI GitHub verte** sur `nuit-3` (jobs `tests` et `regles`, ce dernier avec le test sur l'émulateur).
- 72 captures de tous les écrans identiques à celles d'avant la nuit (à un lissage invisible près).
- Documentation à jour : `CHANGELOG.md`, `ARCHITECTURE.md`, `SECURITY.md`, `docs/CODE-MORT.md`,
  `CLAUDE.md`.
- Aucune action sur le vrai Firebase ; `main` intacte ; aucun historique réécrit.

## Ce qui reste (pas fait cette nuit)

- Retirer les ~140 `onclick="…"` et sortir le script principal de `index.html`, pour une CSP
  sans `'unsafe-inline'` (chantier proposé, voir étapes 3 et 4).
- Les points « Reste à vérifier » (en jaune) de la fiche recettes : seul toi peux les compléter.
- Les éléments « à vérifier » de `docs/CODE-MORT.md`.

## À valider par toi

1. **Fiche recettes** : ouvre `/mnt/chromeos/MyFiles/Downloads/recettes-avant-apres.html`.
   Si elle te convient : Recettes → Bibliothèque → « Mettre à jour noms et notes » →
   `recettes-notes-propres.json` → l'aperçu doit dire « 14 recettes à mettre à jour » →
   confirmer (une sauvegarde se télécharge avant).
2. **Fusion de `nuit-3` dans `main`** (mise en ligne : bouton d'accès à la saisie rapide,
   CSP, styles rangés). Après avoir regardé le rapport, tape :
   `! git checkout main && git merge --ff-only nuit-3 && git push origin main`
   Puis, après la mise en ligne, vérifie sur ton téléphone : connexion, Stock, Recettes,
   saisie rapide (dictée comprise), import d'un PDF. En cas de souci, la version d'avant est
   le commit `6351280` (`git revert` ou demande-moi).
3. **Branches supprimées** : la liste est à l'étape 4 ; toutes récupérables par leur tag
   `archive/<nom>`. Rien à faire si elle te convient.

NUIT TERMINÉE
