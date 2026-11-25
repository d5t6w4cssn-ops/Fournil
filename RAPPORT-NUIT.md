# Rapport de la nuit (25 → 26 novembre 2026) — rôle « équipe »

Branche de sauvegarde : `avant-equipe` (état de `nuit-2` au départ, poussée).
Branche de travail : `nuit-equipe` (poussée régulièrement). `main` n'a pas été touchée.
Aucune action sur le vrai Firebase.

## Avancement

| Étape | État |
|---|---|
| 0. Branches `avant-equipe` et `nuit-equipe` | fait |
| 1. Supprimer la fenêtre « plusieurs jours » | fait (commit « Étape 1 ») |
| 2. Rôle « équipe » + règles + migration | en cours : règles + migration écrites et testées sur l'émulateur ; reste l'appli (écrans, enregistrement) |
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

- **Étape 2, données** : le stock du Fournil était rangé dans le même document que les tâches,
  le Bureau et les notes (`boulangerie/state`). Les règles Firestore ne peuvent protéger qu'un
  document entier : il faut donc **séparer** le stock dans un nouveau document
  `boulangerie/stock` (produits, historique, date du jour). Les calculs enregistrés passent
  dans une collection `calculs/` (un document par calcul, avec l'auteur). Les membres de
  l'équipe sont décrits par `membres/{uid}` = `{ prenom, role: 'equipe' }`.
- **Migration** : écrite (`assets/js/equipe-donnees.js`, `migrerBase`), testée sur une copie
  des données de démonstration dans l'émulateur (pas sur une copie des vraies données : les
  lire aurait été une action sur le vrai Firebase). Elle fait d'abord une **sauvegarde
  complète** dans `sauvegardes/avant-equipe-…`, écrit tout d'un seul coup (tout ou rien),
  refuse de se relancer, et peut être **annulée** (`annulerMigration`).
- **Règles** : `firebase/firestore-fournil.rules` remplacé par la version « équipe » ;
  l'ancienne est gardée dans `firebase/firestore-avant-equipe.rules`. Rien n'est publié.
- **Émulateur** : il demande Java 21 ; l'ordinateur a Java 17. J'ai installé un Java 21
  portable dans `~/.local/jdk21` (rien dans le système). Pour lancer les tests des règles :
  `JAVA_HOME=~/.local/jdk21/jdk-21.0.13.1+2 PATH=$JAVA_HOME/bin:$PATH npm run test:regles`.

## Ce qui bloque

## Ce que tu dois valider le matin
