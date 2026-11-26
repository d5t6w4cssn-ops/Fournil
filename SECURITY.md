# Sécurité

## Signaler une faille

Si tu penses avoir trouvé une faille de sécurité dans Fournil (accès aux données sans
compte, injection de code, fuite d'information…) :

1. **Ne l'ouvre pas en ticket public** et ne la publie pas avant sa correction.
2. Écris au propriétaire du dépôt par le signalement privé de GitHub :
   onglet **Security** du dépôt → **Report a vulnerability**.
3. Décris le problème, comment le reproduire, et ce qu'il permet. N'essaie pas d'accéder à
   des données réelles ni de les modifier pour le démontrer.

Tu recevras une réponse dès que possible. Une faille confirmée est corrigée en priorité,
puis mentionnée dans le [CHANGELOG](CHANGELOG.md) une fois la correction en ligne.

## Ce qui protège les données

- Règles Firestore (`firebase/firestore-fournil.rules`), testées sur l'émulateur
  (`npm run test:regles`, aussi dans l'intégration continue) :
  - **administrateur** (compte du propriétaire) : lit et écrit tout ;
  - **équipe** (compte avec une fiche `membres/{uid}` créée par l'administrateur) : lit les
    recettes sans pouvoir les modifier, lit et met à jour le stock du Fournil, lit tous les
    calculs enregistrés, crée les siens (à son propre prénom) et ne supprime que les siens ;
    aucun accès aux tâches, au Labo, au Bureau ni aux sauvegardes ; ne peut ni s'ajouter à
    l'équipe ni changer son rôle ;
  - tout autre compte, ou un visiteur non connecté : aucun accès.
- Limite connue : le stock est un seul document texte, dont les règles vérifient la forme
  mais pas le contenu (voir ARCHITECTURE.md, section Sécurité).
- Inscription libre désactivée dans Firebase Authentication : les comptes de l'équipe se
  créent à la main dans la console, par le propriétaire.
- Fiches PDF fabriquées sur l'appareil et téléchargées : rien n'est envoyé en ligne.
- Échappement de tout texte affiché, vérifié par les tests.
- **Content-Security-Policy** (balise `<meta>` en tête de `index.html`, car GitHub Pages ne
  permet pas d'en-têtes) : la page ne charge que ses propres fichiers et le code Firebase
  9.23 de gstatic ; elle ne contacte que Firestore, Firebase Auth, Open-Meteo et Nominatim
  (météo) ; pas d'`eval`, pas d'objets (`object-src 'none'`), pas de changement de `<base>`,
  formulaires vers la page seulement. Exceptions limitées à leur adresse exacte : l'iframe
  d'authentification `fournils-5e5d1.firebaseapp.com` et l'image de test réseau de Firestore
  (`www.google.com/images/cleardot.gif`). Vérifié par `tests/test_csp.js` (tous les écrans,
  PDF, messages avec son ; un script étranger est refusé) et par `npm run test:emulateur`
  (vrai code Firebase sur les émulateurs : connexion, synchro, hors ligne).
  - Limite connue : `'unsafe-inline'` reste autorisé pour les scripts et les styles. Le script
    principal est écrit dans la page et environ 140 boutons utilisent `onclick="…"`, dont
    certains fabriqués avec les données. Retirer `'unsafe-inline'` demande de remplacer tous
    ces `onclick` par des écouteurs dans le JavaScript et de sortir le script principal dans
    un fichier : gros chantier, à faire écran par écran. En attendant, l'échappement
    systématique (`esc`, `escJ`, testé) est la protection contre l'injection de code, et la
    CSP empêche tout chargement ou envoi vers un autre site.
  - Pas de `frame-ancestors` (ignoré dans une balise `<meta>`) : la page peut être affichée
    dans un cadre par un autre site ; seul un en-tête HTTP l'empêcherait.
- Aucun secret dans le dépôt : la configuration Firebase de `index.html` est publique par
  nature. Ne jamais ajouter de clé privée, de compte de service ni de mot de passe dans le
  dépôt (voir `.gitignore`).

Détails : [ARCHITECTURE.md](ARCHITECTURE.md), section Sécurité.
