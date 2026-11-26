# Journal des changements

Les dates sont celles de la mise en ligne (ou de la branche, si ce n'est pas encore en ligne).

## Nuit du 26 au 27 novembre 2026 (branche `nuit-3`, pas encore en ligne)

- **Saisie rapide des calculs plus facile à trouver** : bouton « Saisie rapide des calculs »
  en haut de Recettes → Bibliothèque ; il ouvre le Calculateur, curseur dans le champ.
- **Sécurité : Content-Security-Policy** (balise `<meta>`) : la page ne charge et ne
  contacte que ses propres fichiers, Firebase et la météo. Testée dans Chromium sur tous
  les écrans et avec le vrai code Firebase sur les émulateurs (connexion, synchro, hors ligne).
- **Rangement** : les styles d'origine sortent de `index.html` vers
  `assets/css/fournil-base.css` (sans modification, vérifié au pixel sur 72 captures) ;
  styles jamais utilisés supprimés (`.mat-*`, `.hebdo-card`, `.cal-day.other-month`).
- **Branches** : 8 branches déjà fusionnées supprimées, chacune archivée par un tag
  `archive/<nom>` (récupérable).

## 26 novembre 2026 (en ligne)

- **Mettre à jour noms et notes** (Recettes → Bibliothèque) : remplace le nom, les notes et
  les noms d'ingrédients des recettes de même identifiant, seulement si ingrédients et
  quantités sont identiques ; aperçu, puis sauvegarde complète téléchargée juste avant.
- **Équipe** : un identifiant (UID) déjà utilisé est refusé au lieu d'écraser le membre.

## 26 novembre 2026 (branche `sans-retrait-plusieurs-jours`)

- **Plus aucun retrait automatique quand l'appli est restée fermée plusieurs jours** : le
  stock reste tel quel, seuls la date et les commandes sont remises à zéro, avec un petit
  message (« 3 jours sans ouverture, stock inchangé »). Un seul jour manqué : inchangé, les
  sorties de la veille sont retirées.

## Nuit du 25 au 26 novembre 2026 (branche `nuit-equipe`, pas encore en ligne)

- **Plus de fenêtre « plusieurs jours »** à l'ouverture : quand l'appli n'a pas été ouverte
  depuis plusieurs jours, un seul jour de sorties est retiré, avec un petit message.
- **Rôle « équipe »** (2 ou 3 personnes) : Stock (ajouter / retirer, saisie rapide),
  Historique du stock, Recettes en consultation et tous les calculs. Tâches, Labo, Bureau,
  Magasin, Calendrier et Réglages sont cachés et refusés par les règles Firestore.
  Réglages → **Équipe** (responsable) : ton prénom, les membres, la préparation des données.
- **Stock à plusieurs** : les ajouts et retraits faits en même temps sur deux téléphones
  sont tous gardés (fusion à l'enregistrement).
- **Historique du stock** : qui a ajouté ou retiré quoi, et à quelle heure.
- **Alerte de stock bas** : quand un produit passe sous son seuil (message et bandeau en
  haut du Stock).
- **Calculs enregistrés partagés**, avec le prénom de l'auteur ; chacun supprime les siens,
  le responsable peut supprimer tous les calculs.
- **Saisie rapide des calculs** (texte ou dictée) : « 30 pains sportifs à 400 g, 20
  campagnes à 500 g » → une feuille de calcul par recette ; un nom de recette ambigu ou
  inconnu est demandé, jamais deviné ; poids non arrondis.
- **Fiche PDF** sur chaque feuille de calcul, dans le style de la fiche « SB » (pastille
  dorée, deux épis de blé redessinés en SVG) ; téléchargée sur l'appareil, rien en ligne.
- **Allergènes** affichés automatiquement sur chaque feuille, chaque recette et dans le PDF.
- Calcul du levain, produit en croix et température de l'eau de coulage : déjà présents
  (repris de Grigne à l'identique), ouverts à l'équipe.

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
