# Code mort de Fournil (liste seulement)

Établi le 18 novembre 2026, sur la branche `refonte`. **Rien de cette liste n'a été supprimé** :
seul l'ancien code des recettes, remplacé par les écrans de Grigne, l'a été (commit `15d2a5b`).
Méthode : recherche des fonctions jamais appelées et des classes CSS sans usage dans le HTML
ou le JavaScript (y compris les classes construites, comme `cat-${t.cat}`), puis vérification à la main.

Niveaux : **sûr** (ne s'exécute jamais ou n'est jamais affiché), **probable** (aucun usage trouvé,
mais un usage indirect reste possible), **à vérifier** (encore relié à quelque chose, à décider).

| Élément | Où | Niveau | Pourquoi |
|---|---|---|---|
| Copie locale `window.storage` (`load`, `save`, `saveL`) | `index.html`, `load()` et `save()` | **sûr** | `window.storage` n'est défini nulle part : chaque appel lève une erreur, rattrapée par `try/catch`. Les données viennent toujours de Firestore. Le commentaire « mode dégradé : les données restent en local » est donc faux. |
| Contenu d'attente de Statistiques (`.bureau-placeholder`) | `index.html`, `#bur-stats` | **sûr** | Remplacé par `renderHebdo()` dès qu'on ouvre l'onglet ; jamais visible. |
| Styles `.mat-card`, `.mat-header`, `.mat-badges`, `.mat-stock-row`, `.mat-stock-val`, `.mat-ctrl`, `.mat-btn`, `.mat-in` | `index.html`, `<style>` | **probable** | L'écran Matières n'utilise plus ces classes (`renderMatieres` construit d'autres éléments). |
| Style `.hebdo-card` | `index.html`, `<style>` | **probable** | Aucun élément ne porte cette classe ; les statistiques utilisent `.hebdo-prod-row`. |
| Style `.cal-day.other-month` | `index.html`, `<style>` | **probable** | Le calendrier ne crée pas de jours du mois voisin avec cette classe. |
| Styles d'origine remplacés par la refonte (dégradés de l'accueil `.module-*`, `#homeScreen::before/::after`, couleurs `.hdr*`, `.tab`, `.meteo-*`, `.fab`, `.overlay`…) | `index.html`, `<style>` | **probable** | Toujours chargés, mais entièrement recouverts par `assets/css/fournil-grigne.css`. À retirer une fois la refonte validée, en vérifiant chaque écran. |
| Variables de couleur `--cold`, `--cold-light`, `--bureau-ink`, `--bureau-accent` | styles | **à vérifier** | Gardées comme alias vers la palette de Grigne ; `--cold` n'était défini nulle part avant la refonte. |
| Onglets d'en-tête du Fournil et du Bureau (`#hdrFournil .tabs`, `#hdrBureau .tabs`) | `index.html` | **à vérifier** | Masqués par la nouvelle navigation, mais encore utilisés par `sw()` et `swB()` pour marquer l'onglet actif. À retirer seulement avec ces lignes de `sw()`/`swB()`. |
| Bouton « ‹ Menu » des en-têtes (`.hdr-back`) | `index.html` | **à vérifier** | Doublon de « Accueil » dans la navigation ; masqué sur ordinateur, encore visible sur mobile. |
| Nom de classe `.thermo-add-btn` | styles et Labo | **à vérifier** | Les thermomètres ont été retirés, mais la classe sert encore aux boutons « + Ajouter un produit » du Labo. À renommer. |
| Donnée `S.thermos` | `boulangerie/state` | **à vérifier** | Plus affichée depuis le retrait des thermomètres ; gardée pour ne pas changer le format des données. Les anciennes sondes Tuya y gardent leur « Client Secret ». |
| `recettes/src/core/export.js` et `sanitize.js` | `recettes/src/` | **à vérifier** | Copiés de Grigne pour les tests repris (`tests/grigne/`), mais pas inclus dans `recettes/recettes.js` : l'import / export de Fournil a sa propre version (`recettes/adaptation/echange.js`). |
| Fichier `firebase.json` | racine | **à vérifier** | Sert uniquement à publier les règles Firestore ; publié aussi sur GitHub Pages (sans danger). |

Aucune fonction JavaScript jamais appelée n'a été trouvée dans `index.html`.
