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

- Règles Firestore : seul le compte du propriétaire lit et écrit les données
  (`firebase/firestore-fournil.rules`).
- Inscription libre désactivée dans Firebase Authentication.
- Échappement de tout texte affiché, vérifié par les tests.
- Aucun secret dans le dépôt : la configuration Firebase de `index.html` est publique par
  nature. Ne jamais ajouter de clé privée, de compte de service ni de mot de passe dans le
  dépôt (voir `.gitignore`).

Détails : [ARCHITECTURE.md](ARCHITECTURE.md), section Sécurité.
