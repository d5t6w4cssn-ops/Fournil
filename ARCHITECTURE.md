# Architecture de Fournil

## Vue d'ensemble

Fournil est une seule page web (`index.html`), servie telle quelle par GitHub Pages, sans
étape de construction. Le navigateur charge :

1. `assets/js/theme.js` et `assets/js/date.js` dans `<head>` (thème et date de Paris dès le
   premier rendu) ;
2. Firebase 9.23 « compat » (bibliothèque de Google, chargée depuis gstatic) ;
3. le **script principal**, en fin de `index.html` : état, écrans, enregistrement ;
4. les modules ajoutés autour de lui, sans modifier ses fonctions :
   `assets/js/saisie-calculs.js`, `assets/js/allergenes.js`, `assets/js/fiche-pdf.js`,
   `recettes/recettes.js`, `assets/js/synchro.js`, `assets/js/equipe-donnees.js`,
   `assets/js/acces.js`, `assets/js/jour.js`, `assets/js/saisie-rapide.js`,
   `assets/js/stock.js`, `assets/js/donnees.js`, `assets/js/navigation.js`.

Ces modules se branchent sur les fonctions existantes (`openModule`, `sw`, `swL`, `swB`,
`renderStock`, `initFirebase`…) en les enveloppant : la logique d'origine reste en place.

## Modules (ce que voit l'utilisateur)

| Module | Écrans | Fonctions principales |
|---|---|---|
| Fournil | Stock, Magasin, Recettes, Tâches, Historique, Calendrier, Réglages | `sw(onglet)`, `renderStock`, `renderMagasin`, `renderTasks`… |
| Labo pâtisserie | ses propres onglets (stock, magasin, recettes, tâches, historique, calendrier, réglages) | `swL(onglet)`, `renderLabo…` |
| Bureau | Matières premières, Fournisseurs, Tournée (commandes clients), Journal, Stats | `swB(onglet)`, `renderMatieres`, `renderCmdClients`… |
| Recettes | Bibliothèque, Calcul, Température, Levain, Hydratation, Produit en croix (écrans de Grigne) | `recettes/recettes.js` |

Navigation : barre du bas sur mobile (Stock, Recettes, Tâches, Labo, Plus), barre latérale
sur ordinateur (`assets/js/navigation.js`) ; le bouton retour du téléphone revient à l'écran
précédent.

## Rôle de chaque fichier

| Fichier | Rôle |
|---|---|
| `index.html` | page unique : CSP (balise `<meta>`), HTML des écrans, script principal |
| `assets/css/fournil-base.css` | styles d'origine de Fournil (sortis de `index.html` le 27 novembre 2026, sans modification) |
| `assets/css/fournil-grigne.css` | style de Grigne (palette claire et sombre, Lecture facile), chargé après `fournil-base.css` |
| `assets/css/fonts.css`, `assets/fonts/` | polices hébergées avec le site (Young Serif, Hanken Grotesk, OpenDyslexic) |
| `assets/img/encre*.svg` | masques d'usure du tampon des recettes |
| `assets/js/theme.js` | thème clair / sombre et Lecture facile, mémorisés sur l'appareil |
| `assets/js/date.js` | date du jour à l'heure de Paris, jours précédent / suivant |
| `assets/js/navigation.js` | barre du bas / barre latérale, menu « Plus », bouton retour |
| `assets/js/synchro.js` | état réel de l'enregistrement, bandeau d'erreur, « Réessayer » |
| `assets/js/jour.js` | passage au jour suivant (sorties de la veille, plusieurs jours manqués) |
| `assets/js/stock.js` | remise à zéro, − / +, retrait avec motif, saisie rapide (interface) |
| `assets/js/acces.js` | rôles (administrateur / équipe), lecture et enregistrement des données, stock partagé, alertes de seuil bas, Réglages → Équipe |
| `assets/js/equipe-donnees.js` | séparation du stock, fusion, calculs partagés, migration (fonctions de données, sans la page) |
| `assets/js/saisie-calculs.js` | reconnaissance du texte de la saisie rapide des calculs (fonctions pures) |
| `assets/js/allergenes.js` | les 14 allergènes réglementaires, déduits des noms d'ingrédients (fonctions pures) |
| `assets/js/fiche-pdf.js` | fiche PDF d'une feuille de calcul et logo des épis, sans bibliothèque (fonctions pures) |
| `assets/img/epis.svg` | logo des épis, produit par `tools/dessiner-epis.cjs` |
| `assets/js/saisie-rapide.js` | reconnaissance du texte de la saisie rapide (fonctions pures) |
| `recettes/src/` | fichiers de Grigne copiés **sans modification** (vérifié par un test) |
| `recettes/adaptation/` | ce qui est propre à Fournil : lecture / écriture de `boulangerie/recettes` et des calculs partagés, import PDF, export / import, feuilles de calcul (`fiche.js` : auteur, allergènes, bouton PDF ; `saisie-calculs.js` : saisie rapide), styles |
| `recettes/recettes.js`, `recettes/recettes.css` | **générés** par `tools/importer-grigne.mjs` (ne pas modifier à la main) |
| `vendor/pdfjs/` | PDF.js 3.11.174 (fichiers officiels), chargé seulement au premier import de PDF |
| `firebase.json`, `firebase/` | règles de sécurité Firestore (actuelles et précédentes) |
| `reference/` | modèles personnels (photo de la fiche « SB ») : **ignoré par git**, jamais publié |
| `tests/` | tests (jsdom et Chromium) avec un faux Firebase ; `tests/regles/` et `tests/emulateur/` sur les émulateurs |
| `tools/` | outils : captures, audit d'accessibilité, vérification du site, import de Grigne |
| `docs/` | format d'échange des recettes, héritage du style de Grigne, code mort |

## Données dans Firestore

Projet `fournils-5e5d1`. Les documents de `boulangerie` rangent leur contenu sous forme de
**texte JSON** dans un seul champ.

**Avant la migration « équipe »** (format d'origine) :

| Document | Champ | Contenu |
|---|---|---|
| `boulangerie/state` | `state` | l'état du Fournil et du Bureau (`S`) |
| `boulangerie/labo` | `state` | l'état du Labo (`L`) |
| `boulangerie/recettes` | `recipes`, `calcHistory` | recettes et historique des calculs (partagés Fournil et Labo) |

**Après la migration « équipe »** (Réglages → Équipe → « Préparer les données pour
l'équipe », administrateur seul ; `migrerBase` dans `assets/js/equipe-donnees.js`) : le stock
est rangé à part, pour que les règles puissent l'ouvrir à l'équipe sans ouvrir le reste.

| Document | Champ | Contenu | Qui |
|---|---|---|---|
| `boulangerie/state` | `state`, `migreEquipe` | `S` **sans** `products`, `history`, `lastDate` | administrateur |
| `boulangerie/stock` | `state` | `{ products, history, lastDate }` du Fournil | administrateur + équipe |
| `boulangerie/labo` | `state` | inchangé | administrateur |
| `boulangerie/recettes` | `recipes` (+ `calcHistory` gardé en secours, plus utilisé) | recettes | lecture : tous ; écriture : administrateur |
| `calculs/{id}` | `auteurUid`, `auteurPrenom`, `timestamp`, `calcul` (texte JSON) | un calcul enregistré, partagé | lecture : tous ; création : chacun les siens ; suppression : les siens, ou tout pour l'administrateur |
| `membres/{uid}` | `prenom`, `role` (`'equipe'`) | membres de l'équipe | écrit par l'administrateur ; chacun lit le sien |
| `sauvegardes/{id}` | copies des documents | copie complète faite juste avant la migration | administrateur |

L'appli recompose `S` à partir de `state` et `stock` (`assets/js/acces.js`) : le reste du
code ne voit pas la différence. La migration peut être annulée (Réglages → Équipe →
« Revenir à l'ancien format… », `annulerMigration`).

Contenu de `S` (Fournil et Bureau) :

```text
products[]     { id, name, emoji, stockReel, base, commande, seuil, recipeUrl? }
tasks[]        { id, text, done, auto, cat, pid?, fromGestion?, cmdId? }
lastDate       "AAAA-MM-JJ" : dernier passage au jour suivant (heure de Paris)
history[]      { id, date, type, pid, name, emoji, qty, par?, parUid?, t?, … }  630 lignes au plus
                 par / parUid / t : prénom, compte et heure (ms) de qui a fait le mouvement
                 type : sortie, recharge, ajustement (delta), retrait (motif, note),
                        raz (remise à zéro), saisie (lignes[] de la saisie rapide)
notes[]        { id, author, text, time, isVocal?, transcription?, audioUrl? }
                 message vocal : texte dicté seulement ; audioUrl = son des anciens messages
boulangers[], freeNotes
journal        { "AAAA-MM-JJ": { obs, produits: { idProduit: quantité } } }
histoTaches[]  { id, text, cat, date, time }  200 lignes au plus
matieres[]     { id, name, emoji, unit, stock, seuil, conso, dlc, consoDuJour? }
cmdClients[]   { id, nom, adresse, date, heure, detail, status, createdAt }
seuilsCharge   { low, mid }
thermos[]      ancienne fonction (retirée), gardée pour ne pas changer le format
```

`L` (Labo) : `products[]`, `tasks[]`, `lastDate`, `history[]`, `histoTaches[]`, mêmes formes.

Recettes : `{ id, name, ingredients: [{ id, name, qtyG }], notes, tb }`, quantités en
grammes ; format d'échange avec Grigne dans [docs/format-export.md](docs/format-export.md).

Limite à surveiller : un document Firestore ne peut pas dépasser 1 Mo ; estimation et
propositions dans [docs/taille-des-donnees.md](docs/taille-des-donnees.md).

## Synchronisation et hors ligne

- **Lecture** : écoute en temps réel des trois documents (`onSnapshot`) ; chaque nouvelle
  version remplace l'état en mémoire et redessine l'écran ouvert.
- **Écriture** : `save()` (Fournil), `saveL()` (Labo) et `recettes/adaptation/state.js`
  envoient le document entier. Chaque envoi est suivi jusqu'à la confirmation du serveur
  par `assets/js/synchro.js`.
- **Hors ligne** : la persistance de Firestore est activée (`enablePersistence`, onglets
  synchronisés). Une saisie faite sans réseau est gardée sur l'appareil, même après
  fermeture, puis envoyée au retour du réseau.
- **État affiché** dans chaque en-tête : « Synchronisé » (tout est arrivé), « Pas encore
  envoyé », « Hors ligne », « Erreur d'envoi » (bandeau avec la cause et « Réessayer »).
- **Passage au jour suivant** (`assets/js/jour.js`) : sur les données reçues, dans une
  transaction Firestore pour ne jamais retirer deux fois les sorties si deux appareils
  s'ouvrent en même temps ; hors ligne, appliqué sur l'appareil.
- **Stock à plusieurs** (après la migration) : chaque enregistrement du stock se fait dans
  une transaction qui **fusionne** la version du serveur avec mes changements
  (`fusionnerStock` : stock du serveur + mon écart, jamais sous 0 ; mes lignes d'historique
  devant les autres). Les envois partent l'un après l'autre. Hors ligne, la version de
  l'appareil part au retour du réseau (dernier écrit gagnant, cas rare).
- **Dernier écrit gagnant** pour les autres documents (tâches, Labo, recettes) : deux
  appareils qui modifient le même document au même moment peuvent s'écraser, puisque le
  document est envoyé en entier. Le temps réel rend ce cas rare.

## Sécurité

- **Rôles** : l'**administrateur** (le compte du propriétaire, identifiant précis) a tout ;
  l'**équipe** (compte avec une fiche `membres/{uid}`, rôle `equipe`) voit le Stock,
  l'Historique du stock et les Recettes (consultation et calculs). Tâches, Labo, Bureau,
  Magasin, Calendrier, Réglages : cachés dans l'appli (`acces.js`) **et** refusés par les
  règles. Un compte connecté sans fiche ne voit rien.
- **Règles Firestore** (`firebase/firestore-fournil.rules`, testées sur l'émulateur par
  `tests/regles/test_regles.mjs`) : voir le tableau des données ci-dessus ; tout le reste
  est refusé. Version précédente (un seul compte) : `firebase/firestore-avant-equipe.rules`.
- **Limite connue** : le stock est un seul document texte ; les règles vérifient sa forme
  (un champ `state` texte) mais pas son contenu. Un membre de l'équipe qui contournerait
  l'appli pourrait donc modifier tout le stock ou son historique (pas les tâches, le Labo,
  le Bureau ni les recettes). Pour aller plus loin : un document par mouvement de stock.
- **Comptes** : connexion par e-mail et mot de passe (Firebase Auth). L'inscription libre
  est désactivée ; un compte se crée à la main dans la console.
- **Configuration Firebase** dans `index.html` : publique par nature (clé web), la
  protection vient des règles. Bonne pratique conseillée : restreindre la clé aux adresses
  du site dans la console Google Cloud.
- **Échappement à l'affichage** : tout texte venu des données passe par `esc()` avant
  d'entrer dans du HTML, et tout identifiant mis dans un `onclick` par `escJ()`.
  `tests/test_echappement.js` piège toutes les données et ouvre tous les écrans.
- **CSP** (Content-Security-Policy, balise `<meta>` en tête de `index.html`) : seuls les
  fichiers du site et Firebase 9.23 (gstatic) peuvent être chargés ; seuls Firestore,
  Firebase Auth, Open-Meteo et Nominatim peuvent être contactés ; pas d'`eval` ni
  d'objets. `'unsafe-inline'` reste nécessaire tant que le code utilise des `onclick` et des
  styles écrits dans le HTML (détail et limites : `SECURITY.md`). Vérifiée par
  `tests/test_csp.js` et `tests/emulateur/test_appli_emulateur.mjs` (vrai Firebase sur les
  émulateurs Auth et Firestore : connexion, synchro, hors ligne ; `npm run test:emulateur`).
- **Dépendances** : aucune à l'exécution, à part Firebase (Google) et PDF.js (hébergé avec
  le site). `node_modules` ne sert qu'aux tests.
- **Accessibilité** : aucune violation axe (WCAG 2.1 A et AA) sur tous les écrans, en clair,
  en sombre et en Lecture facile (`tools/audit-accessibilite.cjs`).
