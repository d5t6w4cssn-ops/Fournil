# Rapport de la nuit (25 → 26 novembre 2026) — rôle « équipe »

Branche de sauvegarde : `avant-equipe` (état de `nuit-2` au départ, poussée).
Branche de travail : `nuit-equipe` (poussée régulièrement). `main` n'a pas été touchée.
Aucune action sur le vrai Firebase.

## Avancement

| Étape | État |
|---|---|
| 0. Branches `avant-equipe` et `nuit-equipe` | fait |
| 1. Supprimer la fenêtre « plusieurs jours » | fait |
| 2. Rôle « équipe » + règles + migration | fait : appli, règles et migration testées (émulateur) ; **publication et migration réelles : à toi de les lancer** |
| 3. Saisie rapide des calculs | fait |
| 4. Bouton PDF des feuilles de calcul | fait |
| 5. Allergènes | fait |
| 6. Outils levain / produit en croix / température | déjà présents (copies exactes de Grigne) ; ouverts à l'équipe, testés |
| Fin : ESLint, tests, CI, docs | fait (voir « Vérifications finales ») |

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

- **Étape 3, saisie rapide des calculs** (en haut de Recettes → Calcul, texte ou micro) :
  - formats compris : « 30 pains sportifs à 400 g », « 8 × 1,2 kg de pain de campagne »,
    « 10 brioches de 250g », nombres en lettres, dictée sans virgules ;
  - une **feuille par recette** (deux lignes de la même recette vont sur la même feuille),
    **aucun total global** ;
  - recette reprise seulement si le nom est **identique** (sans tenir compte des accents,
    majuscules, pluriels et petits mots « de, du, au… ») ; sinon la ligne est en rouge et
    l'appli **demande** : les recettes proches sont proposées en tête de liste, mais rien
    n'est choisi tout seul. Ligne sans poids ou sans unité (« à 400 ») : demandé aussi ;
  - mêmes calculs que l'écran Calcul de Grigne (mode « pièces × poids ») ;
  - **poids non arrondis** : affichés au gramme près avec les décimales (« 5 406,797 g »).
    Seules les traces de calcul de l'ordinateur au-delà du milligramme sont ôtées ;
  - « Enregistrer » ajoute la feuille aux calculs enregistrés (avec le détail des pièces).
- **Étape 4, PDF** : bouton « PDF » sur la feuille en cours de Grigne, sur chaque feuille de
  la saisie rapide et dans le détail de chaque calcul enregistré.
  - Le modèle est la photo `Feuille de recettes.PNG`, copiée dans `reference/` à la racine
    du projet. Ce dossier est **ignoré par git** : il n'est ni envoyé sur GitHub ni publié.
  - Style repris : page blanche, **pastille dorée** en haut au centre avec les initiales,
    **deux grands épis** en trait beige derrière le texte (un peu plus clairs que sur la
    photo pour que le texte reste lisible).
  - **Initiales « SB »** dans la pastille (tu parles de « ta fiche SB » ; sur la photo, les
    lettres manuscrites sont difficiles à lire). À changer facilement : constante
    `INITIALES` dans `assets/js/fiche-pdf.js`.
  - **Logo des épis redessiné** en SVG propre : `assets/img/epis.svg`, fait des mêmes tracés
    que le PDF (`node tools/dessiner-epis.cjs` le régénère ; un test vérifie qu'ils sont égaux).
  - Le PDF est fabriqué **dans le téléphone, sans bibliothèque** (polices standard des PDF :
    Helvetica, Times) et **téléchargé** ; rien n'est envoyé ni stocké en ligne.
  - Contenu : nom de la recette, nom du calcul et date, pièces (« 20 campagnes × 500 g =
    10 000 g »), coefficient, ingrédients (farines en premier, en gras), total de pâte crue,
    allergènes, étapes de la recette, pied « Fournil · prénom · date ». Plusieurs pages si
    la recette est longue.
- **Étape 5, allergènes** : les **14 allergènes** de la réglementation européenne (INCO),
  repérés d'après les noms des ingrédients, affichés sur la feuille en cours, chaque feuille
  de la saisie rapide, le détail des calculs enregistrés, **chaque recette de la
  Bibliothèque**, et dans le PDF (avec les ingrédients en cause). Détection **prudente** :
  « farine de riz », « lait de coco », « beurre de cacao », « noix de coco »… ne déclenchent
  rien ; « chocolat » sans précision n'est pas deviné (« chocolat au lait » → lait). Une
  phrase rappelle de vérifier les étiquettes des fournisseurs.
- **Étape 6** : calcul du levain, produit en croix et température de l'eau de coulage
  (« Température de base » : eau = base − labo − farine) **existaient déjà** dans Fournil :
  ce sont les fichiers de Grigne copiés à l'identique (vérifié fichier par fichier, et par
  `tests/test_recettes_grigne.js`). Rien à réécrire ; l'équipe y a accès (test ajouté).
- **✏️ du Stock pour l'équipe** : elle peut ajouter une production, mais le champ « seuil »
  est caché et le seuil ne change pas.

## Vérifications finales

- ESLint : aucune erreur.
- Tests : **172 / 172** (`npm test`), dont les nouveaux : `test_equipe.js` (rôle équipe dans
  l'appli), `test_equipe_donnees.js`, `test_feuilles.js`, `test_saisie_calculs.js`,
  `test_allergenes.js`, `test_fiche_pdf.js`, `test_outils.js`, et l'échappement étendu.
- Règles et migration sur l'émulateur : **10 / 10** (`npm run test:regles`) ; essai de
  migration sur copie : 7 / 7 vérifications (`npm run migration:essai`).
- CI GitHub (branche `nuit-equipe`) : voir ci-dessous.

## Ce qui bloque

Rien de bloquant. Limites connues, notées pour plus tard :

- **Stock = un seul document** : les règles vérifient sa forme, pas son contenu. Un membre de
  l'équipe qui contournerait l'appli (outils de développeur) pourrait modifier tout le stock
  ou effacer son historique — mais jamais les tâches, le Labo, le Bureau ni les recettes.
  Pour aller plus loin : un document Firestore par mouvement de stock (gros chantier).
- **Hors ligne** : un enregistrement du stock fait sans réseau remplace la version du serveur
  à son retour (les autres enregistrements fusionnent). Rare avec le temps réel.
- **Migration testée sur les données de démonstration**, pas sur une copie de tes vraies
  données (les lire aurait été une action sur le vrai Firebase). Si tu veux l'essayer sur
  une copie : exporte tes trois documents dans un fichier JSON, puis
  `firebase emulators:exec --only firestore --project demo-fournil "node tools/migration-equipe.mjs copie.json"`
  (l'outil refuse de tourner ailleurs que sur l'émulateur).
- **Java 21** pour l'émulateur : installé en portable dans `~/.local/jdk21` (l'ordinateur a
  Java 17). Sans lui, `npm run test:regles` refuse de démarrer. Dans la CI, Java 21 est
  installé automatiquement.

## Ce que tu dois valider le matin (dans cet ordre)

Rien de tout cela n'a été fait cette nuit. L'ordre compte : chaque étape est sans risque
pour la suivante.

1. **Relire et essayer** la branche `nuit-equipe` (demande de fusion vers `main` sur GitHub,
   ou en local). Sans migration, l'appli marche comme avant pour toi (seules différences :
   plus de fenêtre « plusieurs jours », et les nouvelles lignes d'historique gardent ton
   prénom et l'heure). Attention : ouverte en local, elle utilise tes vraies données.
2. **Publier les règles** (elles laissent tout faire à ton compte, comme avant, donc l'appli
   actuelle continue de marcher) :
   `firebase deploy --only firestore:rules --project fournils-5e5d1`
   (retour en arrière possible : remettre `firebase/firestore-avant-equipe.rules`).
3. **Fusionner `nuit-equipe` dans `main`** (le site se met à jour tout seul).
4. **Préparer les données** (la migration) : ferme Fournil sur tes autres appareils, puis
   sur un seul : Réglages → Équipe → « Préparer les données pour l'équipe… ». Une copie
   complète est faite avant (`sauvegardes/avant-equipe-…`). Ensuite, **recharge** Fournil sur
   tes autres appareils. Retour possible : même carte → « Revenir à l'ancien format… ».
   (Si les règles ne sont pas publiées, la préparation échoue sans rien changer.)
5. **Créer les comptes de l'équipe** (2 ou 3) dans la console Firebase → Authentication →
   « Ajouter un utilisateur » (e-mail + mot de passe que tu leur donnes). Copie l'**UID** de
   chaque compte.
6. Dans Fournil : Réglages → Équipe → colle l'UID + le prénom → « Ajouter », pour chacun.
   Mets aussi **ton prénom** (sinon tu apparais comme « Responsable »).
7. **Essai** : connecte-toi avec un compte de l'équipe sur un téléphone (Stock, Historique,
   Recettes, Calcul, PDF) et vérifie qu'il ne voit ni les tâches, ni le Labo, ni le Bureau.
8. Choix à confirmer : les initiales **« SB »** de la pastille du PDF, et le retrait d'**un
   seul jour** de sorties quand l'appli n'a pas été ouverte pendant plusieurs jours.

