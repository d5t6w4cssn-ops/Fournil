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
- Aucun secret dans le dépôt : la configuration Firebase de `index.html` est publique par
  nature. Ne jamais ajouter de clé privée, de compte de service ni de mot de passe dans le
  dépôt (voir `.gitignore`).

Détails : [ARCHITECTURE.md](ARCHITECTURE.md), section Sécurité.
