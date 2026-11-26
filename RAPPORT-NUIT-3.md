# Rapport de la nuit 3 (26 → 27 novembre 2026)

Branche de travail : `nuit-3`, partie de `main` à jour (`6351280`), poussée régulièrement.
`main` n'a pas été touchée. Aucune action sur le vrai Firebase (émulateur seulement).

## Avancement

| Étape | État |
|---|---|
| 1. Recettes au propre (fiche avant/après) | fait |
| 2. Saisie rapide des calculs | fait |
| 3. CSP | en cours |
| 4. Nettoyage du dépôt | reste |
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

## Décisions prises

- Étape 1 : pas de nouveau code d'import, celui de ce soir répond déjà à la demande.

## À valider par toi

- La fiche `recettes-avant-apres.html`, puis appliquer `recettes-notes-propres.json` avec
  « Mettre à jour noms et notes ».
