# Héritage Grigne → Fournil

Note pour une session Claude Code qui travaille sur **Fournil** et doit reprendre le style de **Grigne**.
Source : `~/grigne` (dossier Linux). **On lit Grigne, on n'y écrit rien.** On copie les fichiers dans Fournil.
Rédigé le 18 novembre 2026.

---

## 1. Système de design

### Fichiers à copier (depuis `~/grigne/`)

| Fichier | Rôle |
|---|---|
| `assets/css/base.css` | toutes les variables de couleur (clair + sombre), polices, bouton thème, Lecture facile |
| `assets/css/fonts.css` | les `@font-face` (chemins relatifs `../fonts/`) |
| `assets/css/app.css` | composants : onglets (l. 50), boutons (l. 82), tampon (l. 190), cartes (l. 282), grand champ (l. 369) |
| `assets/fonts/*.woff2` + `LICENSE-*.txt` | Young Serif 400, Hanken Grotesk 400/500/600, `grigne-espace-fine.woff2`, OpenDyslexic Regular/Bold |
| `assets/img/encre.svg`, `encre-legere.svg` | masques d'usure du tampon |
| `src/js/theme.js` | thème clair/sombre + Lecture facile (script classique dans `<head>`, sans `defer`) |
| `src/js/core/units.js` | `formatGrams`, `fixed`, `fmtNum`, `NNBSP` |
| `src/js/ui/dom.js` (`amount`, `stamp`, l. 62-95) | nombre + unité en petit, et le HTML du tampon |
| `maquettes/` | maquettes de la refonte et leurs captures (`captures/`, `captures-v2/`) |

Règle d'or : **aucune couleur en dur dans un composant**, tout passe par les variables de `base.css`.

### Couleurs

| Variable | Clair | Sombre | Usage |
|---|---|---|---|
| `--cream` | `#F5F0E6` | `#17130F` | fond de page |
| `--paper` | `#FFFCF6` | `#26211C` | cartes, champs |
| `--surface-2` | `#EDE6D8` | `#322B24` | boutons doux, onglet actif |
| `--row-alt` | `#F0EADD` | `#211C17` | lignes alternées |
| `--total-bg` | `#E9E1D0` | `#2E2620` | ligne de total |
| `--ink` | `#26211C` | `#F5F0E6` | texte |
| `--ink-hover` | `#3A332C` | `#E4DACB` | survol bouton sombre |
| `--muted` / `--muted2` / `--faint` | `#5C5348` / `#685E51` / `#766C5F` | `#C9BEAC` / `#BDB19F` / `#A89C8A` | texte secondaire |
| `--accent` | `#8F4F26` | `#E2A577` | croûte : liens, bande de carte, icône active |
| `--accent-deep` | `#6E3A1B` | `#EDBF98` | texte sur fond accent doux |
| `--accent-soft` / `--accent-line` | `#F3E6D8` / `#E6D3C0` | `#3A2C21` / `#4E3A2A` | bouton doux |
| `--on-accent` | `#FFFCF6` | `#1E1914` | texte sur accent |
| `--err` / `--err-bg` | `#A3301A` / `#F1E1D5` | `#F08A72` / `#3A221B` | erreurs |
| `--ok` / `--ok-bg` | `#46602C` / `#E8EBD8` | `#A9C98A` / `#26301C` | succès |
| `--line` / `--line2` | `#D9D0BE` / `#E4DCCB` | `#43392F` / `#382F27` | filets |
| `--stamp` / `--stamp-bg` | `#8F4F26` / `#FFFCF6` | `#E8B48A` / `#26211C` | tampon (fond **opaque**) |

Aussi : `--radius: 18px`, `--shadow` (douce, deux couches), `--shadow-up` (barre du bas), `--backdrop`.
Le sombre est défini **deux fois** dans `base.css` : sous `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` et sous `:root[data-theme="dark"]`. Toute nouvelle variable doit être ajoutée aux trois endroits.
Contraste ≥ 4,5 vérifié par axe dans les deux thèmes.

### Polices

- `--serif` : Young Serif → titres, grands chiffres, valeur du tampon.
- `--sans` : Hanken Grotesk → texte, boutons, texte en arc du tampon.
- Les deux piles commencent par `'Grigne Espace fine'` (voir § 3).
- `body { font-variant-numeric: lining-nums tabular-nums; }` : chiffres alignés.

### Tampon (signature)

Structure (générée par `stamp(label, top, value)` dans `dom.js`) :

```
.tampon [.tampon--3/4/5 selon la longueur | .tampon--vide]
  .sr-only            libellé lu par les lecteurs d'écran
  .tampon-v           la valeur, en Young Serif, unité en <small> — AUCUNE usure
  .tampon-fond        disque opaque (--stamp-bg) qui cache ce qu'il recouvre
  svg.tampon-anneaux  3 cercles (r 57 épais 3, r 53,5, r 38) + 2 points — masque encre.svg (usure franche)
  svg.tampon-texte    texte en arc : haut = libellé en MAJUSCULES, bas = « GRIGNE » — masque encre-legere.svg (usure légère)
```

- Taille `--size: 124px` (108 px petit écran, 156 px ordinateur), posé sur le coin de la carte : `top: -30px; right: -8px; rotate(-8deg)`, couleur `--stamp`.
- Animation « tamponne » (0,4 s, rebond) seulement si `prefers-reduced-motion: no-preference`.
- **Lisibilité** : l'usure ne touche jamais le chiffre ; le chiffre rétrécit avec le nombre de caractères (≤ 2 : 29 % de la taille, 3 : 25 %, 4 : 20 %, 5+ : 17 %) pour rester dans l'anneau intérieur ; texte en arc 9,5 px, gras 600, `letter-spacing: 2.2px` (gardé même en Lecture facile).
- Le tampon déborde de sa carte : couper le débordement sur `.page` (`overflow-x: clip`), **jamais** sur `#main`.
- Variante `.tampon--hero` sur l'écran de connexion (« PÉTRIS MOINS / CALCULE MIEUX », épis au centre).

### Barre d'onglets

- Mobile : fixe en bas, `grid` de N colonnes égales, fond `--paper`, filet haut + `--shadow-up`, `env(safe-area-inset-bottom)`. Onglet : icône SVG 24 px + libellé court 12 px gras, hauteur ≥ 58 px, rayon 14 px.
- Actif (`aria-selected=true`) : fond `--surface-2`, texte `--ink`, icône `--accent`.
- Deux libellés par onglet : `.tab-short` (mobile) et `.tab-long` (lu par les lecteurs d'écran, affiché sur ordinateur).
- Ordinateur (≥ 860 px) : barre latérale gauche de 104 px, onglets de 72 px.
- `body` reçoit un `padding-bottom` pour que rien ne passe sous la barre.

### Boutons et cartes

- `.btn-dark` : fond `--ink`, texte `--cream`, rayon 14 px, ≥ 48 px de haut (54 px pour l'action principale), 15 px gras 600.
- `.btn-soft` : fond `--accent-soft`, bordure `--accent-line`, texte `--accent-deep`, rayon 12 px, ≥ 44 px.
- `.btn-link` (accent, souligné au survol), `.btn-ghost` (`--muted2`), `.btn-danger` (bordure `--err`).
- `.card` : fond `--paper`, filet `--line`, rayon 18 px, `--shadow`, et une **bande accent de 6 px en haut** (`::before`). Actions séparées par un filet pointillé.
- Grand champ `.field-box` : petite étiquette en capitales espacées, valeur en Young Serif 34 px, unité à droite.
- Cibles tactiles ≥ 32 px partout (promesse de `accessibilite.html`), affichage à 320 px sans défilement horizontal.

### Nombres

- Virgule décimale et **espace fine insécable U+202F** entre nombre et unité : `formatGrams(1250)` → « 1,25 kg », `formatGrams(350)` → « 350 g » ; `fixed(n, dec)`, `fmtNum(n, dec)` (« — » si absent).
- La conversion ne se fait **qu'à l'affichage** ; les données restent en nombres (grammes).
- Saisie : `numVal` accepte virgule ou point.
- « Mini-police » de l'unité : `amount(text)` coupe au dernier U+202F et met l'unité dans `<small>` (Hanken Grotesk, 0,5 em dans le tampon, 15 px gras `--muted` dans les listes de pesée).

### Bouton thème et Lecture facile

- Deux boutons ronds de 48 px (42 px sous 480 px) dans la barre du haut : `#themeToggle` (lune / soleil, `aria-pressed` = sombre) et `#readToggle` (« Aa », plein en `--ink` quand actif).
- Thème : suit le téléphone ; un clic impose un choix mémorisé (`localStorage`, clé `grigne-theme` → prendre `fournil-theme`), posé dans `data-theme` sur `<html>` avant le premier rendu. Met aussi à jour `<meta name="theme-color">`.
- Lecture facile : `data-lecture="facile"`, clé `grigne-lecture`. Bascule les deux piles sur OpenDyslexic, `word-spacing: -.3em` (OpenDyslexic a une espace énorme), `line-height: 1.6`, `letter-spacing: 0` sauf dans le SVG du tampon. Les onglets passent à 10 px pour tenir.
- `localStorage` toujours dans un `try/catch`.

---

## 2. Format d'export des recettes (échange Fournil ↔ Grigne)

Détail complet : `format-export.md` (copié à côté de ce fichier). Code de référence : `~/grigne/src/js/core/export.js` et `core/sanitize.js`, tests `tests/unit/export.test.js`.

- Fichier `grigne-recettes-AAAA-MM-JJ.json`, JSON UTF-8 indenté 2 espaces, fabriqué dans le navigateur.
- En-tête : `app: "grigne"` (obligatoire), `version: 2`, `exportedAt` (ISO UTC), `recipeCount`, `recipes[]`, `history[]` (facultatif, 20 max).
- Recette : `id` (stable, 64 car.), `name` (200), `ingredients[]` (≥ 1), `notes` (texte libre, `\n`, 10 000), `tb` (°C ou `null`).
- Ingrédient : `id` (unique dans la recette), `name`, `qtyG` (nombre ≥ 0, **toujours en grammes**), `unit: "g"`.
- Grigne convertit tout en grammes (1 ml = 1 g) ; une farine = ingrédient dont le nom contient « farine ».
- Textes **non échappés** dans le fichier : échapper à l'affichage.
- Lecture : refuser si pas JSON / `app` ≠ `"grigne"` / `recipes` pas une liste / version plus récente ; version absente = 1 (`tb: ""` au lieu de `null`) ; 5 Mo, 500 recettes, 500 ingrédients max ; écarter recettes sans nom ou sans ingrédient valide.
- Import = **ajout, jamais d'écrasement** : doublon exact ignoré, `id` pris → nouvel `id`, nom pris → « Nom (importée) », « (importée 2) »… Bilan affiché.
- Pour Fournil : choisir s'il exporte avec `app: "fournil"` (et Grigne devra l'accepter) ou dans le même format. Toute évolution : ajouter des champs plutôt qu'en renommer, mettre à jour le document **et** `version` des deux côtés.

---

## 3. Pièges rencontrés

- **Mémoire du Chromebook** (2,7 Go, CPU partagé avec ChromeOS) : `workers: 1` dans `playwright.config.js`, toujours. Ne **pas** lancer toute la suite e2e après chaque étape (10 à 26 min, échecs par délai dépassé) : lint + unitaires + `npx playwright test -g "…"` sur les écrans touchés ; la suite complète une seule fois à la fin. Un test qui échoue sur un délai : le relancer seul avant de conclure.
- **flatten** : GitHub web n'accepte pas les dossiers, d'où `tools/flatten.mjs` → `dist-flat/` (tout à la racine). Il réécrit les chemins (`assets/css/x.css` → `x.css`, `src/js/core/a.js` → `core-a.js`, `url('../fonts/…')` → `url('…')`). Tout **nouveau fichier** (police, image, module) doit être ajouté à la table de `flatten.mjs`, sinon il manque en ligne ou l'outil s'arrête sur « import introuvable ». Tester aussi la version à plat (`FLAT=1`).
- **CSP stricte** en `<meta>` : ni `<script>` ni `style=""` en ligne, ni `on…=` ; rien de tiers (pas de CDN, pas de Google Fonts). Un `style` en ligne est refusé silencieusement : passer par une classe ou `el.style.x` en JS. Seuls appels réseau : identitytoolkit, securetoken, firestore.googleapis.com.
- **Espaces insécables** : U+202F (fine) entre nombre et unité, toujours via `formatGrams`/`NNBSP`, jamais tapée à la main. Invisible à l'œil : un test e2e ou une recherche qui compare « 350 g » avec une espace normale échoue ; écrire le vrai caractère U+202F (`\u202f` en JS) dans les attendus.
- **Polices sans espace fine** : ni Young Serif ni Hanken Grotesk ne dessinent U+202F ; chaque appareil la remplaçait à sa façon (parfois par rien, « 350g »). Solution : `grigne-espace-fine.woff2`, un seul glyphe vide de 0,2 em, `unicode-range: U+202F`, `font-display: block`, placée **en tête** des piles `--serif`/`--sans`. Une police dont tous les glyphes sont vides est refusée (« glyf: zero-length table ») : le `.notdef` doit avoir un contour.
- **Extension OpenDyslexic du Chrome de l'utilisateur** : elle impose OpenDyslexic sur toutes les pages. Ses captures ou impressions peuvent donc montrer OpenDyslexic alors que « Lecture facile » est éteinte, ou des débordements qui ne viennent pas du site. Avant de « corriger » un problème de police ou de largeur signalé par l'utilisateur, vérifier avec une capture Playwright (Chromium sans extension) ou demander de désactiver l'extension.
- Autres : une animation CSS sur un élément SVG écrase son attribut `transform` ; captures nettes en `deviceScaleFactor: 3`.

---

## 4. Façon de travailler de l'utilisateur

- **Maquettes d'abord** : des pages HTML + CSS autonomes dans `maquettes/` (hors site, exclues du flatten), plusieurs directions à comparer, avant de toucher l'application.
- **Captures dans Téléchargements** (`/mnt/chromeos/MyFiles/Downloads/`), en mobile 390 px **et** ordinateur, clair **et** sombre, `deviceScaleFactor: 3`. C'est ainsi que l'utilisateur regarde le travail.
- **Attendre son accord** sur la maquette avant de l'appliquer, puis **écran par écran** : un écran, captures, tests ciblés, accord, écran suivant.
- Tout en **français**, l'interface **tutoie**.
- Lancer les tests après chaque changement ; ne jamais dire « fini » tant qu'ils ne passent pas.
- Ne pas toucher aux autres dossiers (Grigne, la vidéo) depuis la session Fournil.
