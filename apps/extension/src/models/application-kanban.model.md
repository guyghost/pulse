# Application Kanban — Model

> Source de vérité pour la vue pipeline en colonnes de la page « Suivi »
> (`ApplicationsPage`). Proposition Mobbin Grab : kanban horizontal par statut
> avec compteurs et cartes miniatures.

## Contexte

Le pipeline actuel est purement statistique (barres par étape + journal). Il
montre combien, jamais quoi ni où chaque mission en est. Les trackers de
référence (Grab) organisent le suivi en colonnes par statut — lecture
immédiate de l'avancement réel.

## Colonnes (projection pure du state machine existant)

```
PIPELINE_COLUMNS = ['selected', 'application_prepared', 'applied', 'interview', 'offer']
```

- Colonnes issues des statuts **actifs** du cycle (référence :
  `APPLICATION_TRANSITIONS` dans `@pulse/domain`). `detected` (pré-sélection,

> volumétrique) est exclu du kanban et reste couvert par le feed ; les statuts
> terminaux (`accepted`, `rejected`, `archived`) sont exclus et restent dans le
> filtre « Terminés » existant.

- Compteur par colonne = nombre de suivis `currentStatus === colonne`.
- Cartes : titre mission, plateforme, ancienneté du dernier changement
  (relatif, calculé côté shell/state avec `now` injecté).
- Carte orpheline (`missionMissing`) : suivi actif dont la mission source
  n'existe plus dans le feed local. Titre de repli « Dossier suivi », rendu
  désactivé (non focusable, non cliquable) — elle ne peut pas déclencher
  `OPEN_CARD` ni sélectionner une mission par erreur.

## Interactions

| Événement          | Effet                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| `OPEN_CARD(id)`    | Ouvre le dossier existant (drawer détail) — même flux que la liste    |
| `EMPTY_COLUMN_MSG` | Affiche un message d'état vide par colonne, jamais un clone du kanban |

**Pas de drag-and-drop en v1.** Tout changement de statut passe exclusivement
par les flux existants (drawer/ détails) qui appliquent `VALID_TRANSITIONS`.
Le kanban est une **vue** du state machine, jamais un second point de décision.

## Invariants

1. Aucune nouvelle transition : le kanban ne peut pas déplacer une carte vers
   un statut — il ne fait que refléter `currentStatus`.
2. `Σ compteurs = nombre de suivis actifs` affiché dans le header pipeline.
3. Ordre des colonnes fixe = ordre du cycle (aucun re-ordonnancement utilisateur).
4. Colonne vide → état vide explicite ; le rail horizontal reste scrollable
   (`overflow-x-auto`, snap par colonne).
5. `OPEN_CARD` n'est émis que pour une carte dont la mission existe
   (`!missionMissing`) — jamais de repli implicite vers une autre mission.
