# Rapport de la nuit (25 → 26 novembre 2026) — rôle « équipe »

Branche de sauvegarde : `avant-equipe` (état de `nuit-2` au départ, poussée).
Branche de travail : `nuit-equipe` (poussée régulièrement). `main` n'a pas été touchée.
Aucune action sur le vrai Firebase.

## Avancement

| Étape | État |
|---|---|
| 0. Branches `avant-equipe` et `nuit-equipe` | fait |
| 1. Supprimer la fenêtre « plusieurs jours » | fait (commit « Étape 1 ») |
| 2. Rôle « équipe » + règles + migration | à faire |
| 3. Saisie rapide des calculs | à faire |
| 4. Bouton PDF des feuilles de calcul | à faire |
| 5. Allergènes | à faire |
| 6. Outils levain / produit en croix / température | à faire |
| Fin : ESLint, tests, CI, docs | à faire |

## Décisions prises

- **Étape 1** : la fenêtre « L'appli n'a pas été ouverte depuis… combien de jours retirer ? »
  est supprimée. Quand plusieurs jours ont été manqués, l'appli retire **un seul jour** de
  sorties (ce que la fenêtre proposait par défaut, et ce que faisait l'appli d'origine) et
  affiche un petit message (« 3 jours sans ouverture, un seul jour de sorties retiré »).
  Rien n'est retiré deux fois si deux appareils s'ouvrent en même temps (inchangé).

## Ce qui bloque

## Ce que tu dois valider le matin
