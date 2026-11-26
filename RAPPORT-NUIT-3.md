# Rapport de la nuit 3 (26 → 27 novembre 2026)

Branche de travail : `nuit-3`, partie de `main` à jour (`6351280`), poussée régulièrement.
`main` n'a pas été touchée. Aucune action sur le vrai Firebase (émulateur seulement).

## Avancement

| Étape | État |
|---|---|
| 1. Recettes au propre (fiche avant/après) | fait |
| 2. Saisie rapide des calculs | fait |
| 3. CSP | fait |
| 4. Nettoyage du dépôt | en cours |
| Fin : ESLint, tests, CI, docs | reste |

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

## Décisions prises

- Étape 1 : pas de nouveau code d'import, celui de ce soir répond déjà à la demande.
- Étape 2 : je n'ai pas déplacé la saisie rapide (le Calculateur reste sa place logique) ;
  j'ai ajouté un accès direct visible depuis la Bibliothèque.
- Étape 3 : CSP **sans** retirer `'unsafe-inline'` (scripts et styles). Le retirer casserait
  les ~140 boutons `onclick="…"` de l'appli ; c'est un chantier à part, noté dans
  `SECURITY.md`. Tout le reste est verrouillé (sources, connexions, objets, `base`, formulaires).

## À valider par toi

- La fiche `recettes-avant-apres.html`, puis appliquer `recettes-notes-propres.json` avec
  « Mettre à jour noms et notes ».
