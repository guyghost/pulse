# Modèle — présentation alphabétique des notes de mission

## Intention

L'extension conserve un score numérique `0–100` comme donnée métier interne
(calcul, tri, filtres et seuils d'alerte), mais toute note présentée pour une
mission est une lettre.

Ce changement est une projection de présentation pure. Il ne modifie ni le
cycle de vie d'une mission, ni le pipeline de candidature, ni le calcul du
score.

## Source canonique

Pour une mission, la valeur numérique interne utilisée pour dériver la note est
la première valeur disponible dans cet ordre :

1. `scoreBreakdown.total` ;
2. `semanticScore` pour les données historiques enrichies sans breakdown ;
3. `score` pour les données historiques restantes ;
4. aucune valeur.

Une valeur non finie est traitée comme absente. La lettre est toujours recalculée
depuis cette valeur canonique ; l'UI ne fait pas confiance à une éventuelle
lettre historique contradictoire.

## États de présentation

| État      | Condition interne | Présentation                                                       |
| --------- | ----------------- | ------------------------------------------------------------------ |
| `grade-A` | score `80–100`    | `A`                                                                |
| `grade-B` | score `60–79`     | `B`                                                                |
| `grade-C` | score `40–59`     | `C`                                                                |
| `grade-D` | score `20–39`     | `D`                                                                |
| `grade-F` | score `0–19`      | `F`                                                                |
| `unrated` | aucun score fini  | aucune lettre, ou libellé `Non notée` quand une valeur est requise |

Les scores hors bornes issus de données historiques restent projetés par les
bornes extrêmes : supérieur à `100` → `A`, inférieur à `0` → `F`.

## Événements et transitions

Cette projection n'a pas de machine d'état persistante.

| Événement                  | État suivant                                        |
| -------------------------- | --------------------------------------------------- |
| mission chargée            | note recalculée depuis la source canonique          |
| mission rescannée/rescorée | note recalculée depuis la nouvelle source canonique |
| enrichissement sémantique  | note recalculée depuis la nouvelle source canonique |
| score supprimé ou invalide | `unrated`                                           |

Toutes les transitions sont déterministes et sans effet de bord.

## Surfaces concernées

- cartes du feed ;
- liste et détail du pipeline de candidatures ;
- comparaison de missions ;
- tiroir d'analyse d'une mission ;
- exemples de mission dans l'onboarding ;
- résumés du feed qui décrivent une classe de score.

Les réglages de seuil, les données persistées, les exports structurés et les
prompts internes peuvent conserver les valeurs numériques : ils ne constituent
pas la note affichée d'une mission.

## Invariants

1. Une mission notée n'affiche jamais son score brut, `/100` ou un écart en
   points sur une surface utilisateur.
2. Le badge, le détail et la comparaison utilisent la même projection
   canonique.
3. Les sous-critères visibles utilisent eux aussi uniquement des lettres.
4. Les nombres restent disponibles en interne pour le tri et les décisions
   déterministes ; aucun texte libre et aucun LLM ne choisit la lettre.
5. Une mission sans score n'est jamais assimilée à une mission `F`.
6. La note accessible est annoncée sous la forme `Note A`, `Note B`, etc. ;
   la couleur n'est jamais l'unique information.

## Revue des cas

| Cas                      | Résultat attendu                                                       |
| ------------------------ | ---------------------------------------------------------------------- |
| nominal                  | score fini → lettre conforme aux bornes                                |
| bornes                   | `80/60/40/20/0` donnent respectivement `A/B/C/D/F`                     |
| donnée legacy            | fallback `semanticScore`, puis `score`                                 |
| contradiction            | la lettre est recalculée depuis le total canonique                     |
| absence / `NaN` / infini | état `unrated`, jamais `F` par défaut                                  |
| rescoring / retry        | nouvelle lettre à partir du résultat effectivement reçu                |
| erreur / annulation      | la dernière mission valide reste affichable ; aucune transition métier |
| permissions              | aucune permission supplémentaire                                       |
| état terminal            | sans objet : projection pure et réévaluable                            |
