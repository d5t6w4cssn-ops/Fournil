# Rapport de la nuit 3 (26 → 27 novembre 2026)

Branche de travail : `nuit-3`, partie de `main` à jour (`6351280`), poussée régulièrement.
`main` n'a pas été touchée. Aucune action sur le vrai Firebase (émulateur seulement).

## Avancement

| Étape | État |
|---|---|
| 1. Recettes au propre (fiche avant/après) | fait |
| 2. Saisie rapide des calculs | en cours |
| 3. CSP | reste |
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

## Décisions prises

- Étape 1 : pas de nouveau code d'import, celui de ce soir répond déjà à la demande.

## À valider par toi

- La fiche `recettes-avant-apres.html`, puis appliquer `recettes-notes-propres.json` avec
  « Mettre à jour noms et notes ».
