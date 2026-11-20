# Format du fichier d'export Grigne (version 2)

Ce document décrit le fichier produit par « Mes données → Exporter mes recettes ». Il sert à trois choses :

- garder une sauvegarde de ses recettes ;
- les remettre dans Grigne (« Importer un fichier Grigne »), sur le même appareil ou sur un autre ;
- **les importer plus tard dans Fournil**, qui peut s'appuyer sur ce document.

Le code de référence est `src/js/core/export.js` (fabrication, lecture, fusion), testé par `tests/unit/export.test.js`.

## Le fichier

- Nom : `grigne-recettes-AAAA-MM-JJ.json` (date de l'appareil au moment de l'export).
- Encodage : JSON en UTF-8, indenté de 2 espaces.
- Fabriqué entièrement dans le navigateur : aucune requête réseau, rien n'est envoyé nulle part.

## En-tête

| Champ | Type | Contenu |
|---|---|---|
| `app` | texte | Toujours `"grigne"`. Un fichier sans ce champ est refusé. |
| `version` | nombre entier | Version du format : `2`. |
| `exportedAt` | texte | Date et heure de l'export, en ISO 8601 UTC (`2026-11-17T08:30:00.000Z`). |
| `recipeCount` | nombre entier | Nombre de recettes dans `recipes` (pratique pour vérifier un import). |
| `recipes` | liste | Les recettes, détaillées ci-dessous. |
| `history` | liste | Historique des calculs enregistrés (20 au plus). Facultatif pour Fournil. |

## Une recette (`recipes[]`)

| Champ | Type | Contenu |
|---|---|---|
| `id` | texte (64 car. max) | Référence de la recette, unique dans le fichier. Stable : la même recette garde le même `id` d'un export à l'autre. |
| `name` | texte (200 car. max) | Nom de la recette, tel que saisi. |
| `ingredients` | liste (au moins 1) | Ingrédients, dans l'ordre de la recette. |
| `notes` | texte (10 000 car. max) | Étapes et temps, texte libre, retours à la ligne en `\n`. Chaîne vide s'il n'y en a pas. |
| `tb` | nombre ou `null` | Température de base en °C (par exemple `56`). `null` si la recette n'en a pas. |

## Un ingrédient (`recipes[].ingredients[]`)

| Champ | Type | Contenu |
|---|---|---|
| `id` | texte (64 car. max) | Référence de l'ingrédient, unique dans sa recette (pas dans tout le fichier). |
| `name` | texte (200 car. max) | Nom de l'ingrédient. |
| `qtyG` | nombre ≥ 0 | Quantité, **toujours en grammes**, avec décimales possibles (point décimal, comme en JSON). |
| `unit` | texte | Toujours `"g"` dans la version 2 : l'unité de `qtyG`, écrite pour qu'aucun lecteur n'ait à la deviner. |

Bon à savoir pour l'import dans Fournil :

- Grigne convertit tout en grammes dès la saisie : kg × 1 000, cl × 10, l × 1 000, et **1 ml compte pour 1 g**. L'unité tapée à l'origine n'est pas conservée.
- Grigne repère les farines par leur nom : tout ingrédient dont le nom contient « farine » (majuscules ou non) compte dans le poids de farine, base des pourcentages du boulanger.
- Les textes sont enregistrés tels que saisis, **sans échappement HTML** : c'est au moment de l'affichage qu'il faut les échapper. Un nom peut donc contenir `<`, `&` ou des guillemets.

## Un calcul de l'historique (`history[]`)

| Champ | Type | Contenu |
|---|---|---|
| `id` | texte | Référence du calcul. |
| `timestamp` | nombre | Date du calcul, en millisecondes depuis le 1er janvier 1970 (UTC). |
| `recipeName` | texte | Nom de la recette au moment du calcul. |
| `label` | texte ou `null` | Libellé facultatif (« Fournée du samedi »). |
| `targetG` | nombre | Poids de pâte visé, en grammes. |
| `coefficient` | nombre ou `null` | Multiplicateur appliqué à la recette, tel qu'affiché par le Calculateur. |
| `basis` | `"farine"` ou `"total"` | Base du calcul : 1 kg de farine, ou poids total (recette sans farine repérée). |
| `breakdown` | liste de `{ name, grams }` | Quantité de chaque ingrédient pour ce calcul, en grammes. |

## Exemple

```json
{
  "app": "grigne",
  "version": 2,
  "exportedAt": "2026-11-17T08:30:00.000Z",
  "recipeCount": 2,
  "recipes": [
    {
      "id": "k3f9a21",
      "name": "Pain de campagne",
      "ingredients": [
        {
          "id": "a1",
          "name": "Farine T80",
          "qtyG": 800,
          "unit": "g"
        },
        {
          "id": "a2",
          "name": "Farine de seigle T130",
          "qtyG": 200,
          "unit": "g"
        },
        {
          "id": "a3",
          "name": "Eau",
          "qtyG": 700,
          "unit": "g"
        },
        {
          "id": "a4",
          "name": "Levain liquide",
          "qtyG": 200,
          "unit": "g"
        },
        {
          "id": "a5",
          "name": "Sel",
          "qtyG": 20,
          "unit": "g"
        }
      ],
      "notes": "Autolyse 1 h\nPointage 3 h, 2 rabats\nCuisson 45 min à 240 °C",
      "tb": 56
    },
    {
      "id": "p8x2m4",
      "name": "Pâte à pizza",
      "ingredients": [
        {
          "id": "b1",
          "name": "Farine T00",
          "qtyG": 1000,
          "unit": "g"
        },
        {
          "id": "b2",
          "name": "Eau",
          "qtyG": 650,
          "unit": "g"
        },
        {
          "id": "b3",
          "name": "Levure fraîche",
          "qtyG": 2.5,
          "unit": "g"
        },
        {
          "id": "b4",
          "name": "Sel",
          "qtyG": 25,
          "unit": "g"
        }
      ],
      "notes": "",
      "tb": null
    }
  ],
  "history": [
    {
      "id": "h1",
      "timestamp": 1795420800000,
      "recipeName": "Pain de campagne",
      "label": "Fournée du samedi",
      "targetG": 12000,
      "coefficient": 6.25,
      "basis": "farine",
      "breakdown": [
        {
          "name": "Farine T80",
          "grams": 5000
        },
        {
          "name": "Farine de seigle T130",
          "grams": 1250
        },
        {
          "name": "Eau",
          "grams": 4375
        },
        {
          "name": "Levain liquide",
          "grams": 1250
        },
        {
          "name": "Sel",
          "grams": 125
        }
      ]
    }
  ]
}
```

## Lecture d'un fichier (règles suivies par Grigne)

Un lecteur (Grigne aujourd'hui, Fournil demain) devrait suivre les mêmes règles :

1. Refuser le fichier si ce n'est pas du JSON, si `app` n'est pas `"grigne"` ou si `recipes` n'est pas une liste.
2. Lire `version` (absente = `1`). Refuser une version plus récente que celle qu'on connaît, avec un message invitant à mettre l'application à jour.
3. Nettoyer chaque recette comme `sanitizeRecipes` (`src/js/core/sanitize.js`) :
   - écarter une recette sans nom ou sans aucun ingrédient valide ;
   - écarter un ingrédient sans nom ou dont la quantité n'est pas un nombre positif ;
   - couper les textes trop longs ;
   - 500 recettes au plus, 500 ingrédients au plus par recette ;
   - donner un nouvel `id` à une recette qui n'en a pas ou dont l'`id` est déjà pris dans le fichier.
4. Fichier de 5 Mo au plus.

## Import dans Grigne : jamais d'écrasement

« Importer un fichier Grigne » **ajoute** les recettes du fichier à celles qui existent, sans en remplacer aucune :

- une recette identique à une recette existante (même nom, mêmes ingrédients et quantités, mêmes étapes, même TB, quel que soit son `id`) est ignorée : importer deux fois le même fichier ne crée pas de doublon ;
- une recette dont l'`id` est déjà pris reçoit un nouvel `id` ;
- une recette différente dont le nom est déjà pris est renommée « Nom (importée) », puis « Nom (importée 2) », etc. ;
- les calculs de l'historique sont ajoutés (sans doublon d'`id`), du plus récent au plus ancien, 20 au plus.

L'application affiche ensuite le bilan, par exemple : « Import terminé : 2 recettes ajoutées, 1 déjà présente (ignorée). »

## Versions du format

- **Version 1** (avant le 17 novembre 2026, fichiers `grigne-sauvegarde-AAAA-MM-JJ.json`) : mêmes recettes, sans `recipeCount` ni `unit`, et `tb` vaut `""` (chaîne vide) au lieu de `null` quand il n'y en a pas. Toujours acceptée à l'import.
- **Version 2** (17 novembre 2026) : format décrit ici.

Toute évolution future doit rester lisible par les versions précédentes autant que possible : ajouter des champs plutôt qu'en renommer, et augmenter `version` seulement si un ancien lecteur risquait de mal comprendre le fichier.
