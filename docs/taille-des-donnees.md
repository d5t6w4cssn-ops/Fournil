# Taille des données dans Firestore (estimation)

Un document Firestore ne peut pas dépasser **1 Mo**. Estimation du 20 novembre 2026, faite à
partir du code et d'une journée type inventée (aucune donnée réelle lue). Taille mesurée de
chaque élément en JSON.

| Élément | Taille | Limite dans le code |
|---|---|---|
| Ligne d'historique « sortie » | ~130 o | 630 lignes au plus |
| Ligne « saisie rapide » (4 produits) | ~525 o | comptée dans les 630 |
| Jour de journal (observation + 5 produits) | ~190 o | **aucune** |
| Note d'équipe écrite | ~160 o | **aucune** |
| Note vocale de 30 s (son en base64) | 156 Ko (32 kbit/s) à 625 Ko (128 kbit/s) | **aucune** |
| Commande client (gardée une fois validée) | ~240 o | **aucune** |
| Ligne d'historique des tâches | ~110 o | 200 (Fournil), **aucune** (Labo) |

## `boulangerie/state` (Fournil et Bureau)

- Partie fixe, une fois l'historique plein : environ **156 Ko**.
- Journée type (1 jour de journal, 3 notes écrites, 5 commandes clients) : environ
  **1,9 Ko par jour**.
- **Sans note vocale** : la limite de 1 Mo serait atteinte dans environ **480 jours
  (16 mois)**.
- **Avec des notes vocales** : chaque note de 30 s pèse de 156 à 625 Ko ; **1 à 5 notes
  vocales suffisent** à remplir le document. C'est le vrai risque.

Si la limite est atteinte, le serveur refuse l'enregistrement : l'appli l'affiche
(« Les données sont trop lourdes… ») mais plus rien du Fournil ne s'enregistre tant que le
document n'a pas été allégé.

## `boulangerie/labo`

- Partie fixe : environ **85 Ko** ; croissance : environ **0,4 Ko par jour**.
- Limite atteinte dans environ **6 ans** : pas de risque à court terme.

## Propositions (à décider, rien n'a été changé)

1. **Tout de suite, sans changer le format** : limiter la durée et la qualité des notes
   vocales (par exemple 16 kbit/s, soit environ 80 Ko pour 30 s) et n'en garder que les
   10 dernières ; ne garder que les commandes validées des 60 derniers jours.
2. **Plus solide, en changeant le format** : sortir les notes, le journal et les commandes
   dans des documents séparés (un document par note, par jour ou par commande). Chaque
   document reste petit, et l'appli ne charge que ce qu'elle affiche. Demande une migration
   des données existantes et une mise à jour de Fournil sur tous les appareils en même temps.
3. **Pour les sons** : Firebase Storage serait l'endroit prévu pour les fichiers, mais il
   demande le forfait payant (Blaze) pour les nouveaux projets.
