# Rapport de la nuit (25 → 26 novembre 2026) — rôle « équipe »

Branche de sauvegarde : `avant-equipe` (état de `nuit-2` au départ, poussée).
Branche de travail : `nuit-equipe` (poussée régulièrement). `main` n'a pas été touchée.
Aucune action sur le vrai Firebase.

## Avancement

| Étape | État |
|---|---|
| 0. Branches `avant-equipe` et `nuit-equipe` | fait |
| 1. Supprimer la fenêtre « plusieurs jours » | fait (commit « Étape 1 ») |
| 2. Rôle « équipe » + règles + migration | fait (appli + règles + migration testées) ; publication et migration réelles : à valider par toi |
| 3. Saisie rapide des calculs | en cours (écrit et branché, tests de l'écran à écrire) |
| 4. Bouton PDF des feuilles de calcul | en cours (écrit et branché, tests de l'écran à écrire) |
| 5. Allergènes | en cours (écrit et branché, tests de l'écran à écrire) |
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

- **Étape 2, appli** (`assets/js/acces.js`) : l'administrateur garde tout. L'équipe voit
  seulement Stock, Historique et Recettes (consultation + calculs). Le reste est caché, les
  fonctions sont bloquées dans l'appli, et refusées par les règles. Avant la migration,
  l'appli marche exactement comme avant pour toi ; l'équipe voit « pas encore prêt ».
- **Plusieurs personnes en même temps sur le stock** : chaque enregistrement du stock se
  fait dans une transaction qui **fusionne** (stock du serveur + mon changement), pour ne
  jamais perdre l'ajout d'un collègue. Hors ligne, l'enregistrement part au retour du réseau
  et remplace alors la version du serveur (limite connue, rare).
- **Historique du stock** : chaque nouvelle ligne garde le prénom et l'heure (« par Léa ·
  14:32 »). Les sorties automatiques du matin n'ont pas d'auteur. L'équipe ne peut pas
  supprimer de lignes d'historique (bouton caché et fonction bloquée).
- **Prénoms** : chaque membre a une fiche `membres/{uid}` avec son prénom (que tu remplis
  dans Réglages → Équipe). Ton prénom à toi : « Responsable » tant que tu ne l'as pas mis.
- **Équipe et produits** : l'équipe ne crée pas de produit (ni dans Réglages, ni par la
  saisie rapide : un produit inconnu doit être choisi dans la liste) ; elle ne change pas
  l'ordre des produits ni les seuils.
- **Seuils bas** : le seuil existait déjà par produit (Réglages → produit). Alerte quand un
  produit **passe** sous son seuil (même règle que la pastille « Faible » : disponible ≤
  seuil) : message + bandeau « Stock bas » en haut du Stock, aussi quand c'est un autre
  appareil qui fait passer sous le seuil.
- **Déconnexion** : la page se recharge, pour ne rien garder en mémoire du compte précédent.

## Ce qui bloque

## Ce que tu dois valider le matin
