# Journal des changements

Les dates sont celles de la mise en ligne (ou de la branche, si ce n'est pas encore en ligne).

## 20 novembre 2026

- **Messages vocaux** : seule la transcription en texte est enregistrée, plus aucun son dans
  Firestore. Les anciens sons sont gardés ; Réglages → « Place occupée » montre leur poids.
- **Labo** : la barre du bas ouvre le stock, les recettes et les tâches du Labo ; le 4e
  bouton devient « Fournil ».
- Confirmation au-delà de 1 000 pièces sur une ligne ; « FOURNIL » sur le tampon des
  recettes ; bouton « ‹ Menu » retiré sur mobile.

## Nuit du 19 au 20 novembre 2026

- **Date de Paris** : « aujourd'hui » est toujours calculé à l'heure de Paris, même entre
  minuit et 2 h et au changement d'heure (avant : heure universelle).
- **Corrections de l'audit** : messages clairs quand un champ obligatoire est vide ; seuil
  d'alerte à 0 possible ; quantité non entière refusée avec un message ; magasin : vider le
  champ ne remet plus 0 ; observation du journal enregistrée toute seule ; bouton retour du
  téléphone ; plus de défilement horizontal à 320 px ; quantités des matières avec virgule.
  Bug trouvé en passant : un produit du Labo pouvait partir dans le Fournil.
- **Accessibilité** : aucune violation axe sur tous les écrans (zoom autorisé, zone
  principale et titres, étiquettes des champs, contraste des tâches faites, fenêtres
  annoncées).
- **Guide d'utilisation** dans le style de Grigne (bouton « ? »).
- **Rangement du dépôt** pour un audit : documentation (README, ARCHITECTURE, SECURITY),
  `docs/`, `firebase/`, code mort sûr retiré, ESLint, intégration continue, sans aucun
  changement à l'écran (captures comparées au pixel).

## 19 novembre 2026

- **Stock** : remise à zéro dans Réglages ; − / + et « Retrait avec motif » sur chaque
  produit (Fournil, Labo, matières premières) ; saisie rapide par texte ou dictée, avec aperçu.
- **Enregistrement fiable** : persistance hors ligne, état réel affiché (Synchronisé, Pas
  encore envoyé, Hors ligne, Erreur d'envoi), message clair et « Réessayer ».
- **Passage au jour suivant** sur les vraies données, avec question si plusieurs jours ont
  été manqués, et transaction pour ne jamais retirer deux fois.
- **Refonte** dans le style de Grigne : palette claire et sombre, Lecture facile,
  navigation (barre du bas / barre latérale), Recettes = écrans de Grigne.

## 18 novembre 2026

- **Sécurité** : règles Firestore limitées au compte du propriétaire, inscription libre
  fermée, PDF.js hébergé avec le site, échappement de tous les textes affichés,
  thermomètres retirés (Tuya ne fonctionnait pas, l'IP locale ne peut pas marcher en https).
- **Recettes** : export et import au format de Grigne, sans jamais écraser une recette.
