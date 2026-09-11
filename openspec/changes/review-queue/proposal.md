# Proposal: File « À vérifier » (review queue des missions à faible confiance d'extraction)

## Why — Produit

Le scraping dépend du DOM des plateformes : quand un parseur dérive, l'extraction produit
des missions incomplètes (TJM absent, dates ambiguës, champs tronqués, doublons non
fusionnés) qui polluent le feed sans que l'utilisateur comprenne pourquoi. Aucune surface
n'expose aujourd'hui cette dégradation. On ajoute une carte « À vérifier » dans le feed :
la liste des missions flaguées à faible confiance d'extraction, avec action de review
(Garder / Ignorer) par mission.

## Decision

- Confiance d'extraction pure, calculée par mission à partir de 5 signaux (TJM absent,
  date ambiguë, champs incomplets, near-duplicate via `core/scoring/dedup.ts`, parseur
  suspect via `ConnectorHealthRecord`).
- Seuil d'affichage : `confidence < 0.75` → flagué.
- Décisions utilisateur `kept` / `dismissed` persistées dans `chrome.storage.local`,
  immuables, qui retirent définitivement la mission de la file.
- La file est une dérivation pure de `(missions, décisions, relations de dédup, santé
parseurs)`. Aucun effet sur le scoring ni sur le feed principal (périmètre explicite).

## Source de vérité

`apps/extension/src/models/parsing-confidence.model.md` — signaux, formule, seuil, états,
transitions autorisées/interdites, invariants. Cette proposal ne le duplique pas.

## What Changes

### Core (pur)

| Fichier                                 | Changement                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `core/types/parsing-confidence.ts`      | Types signaux, décision, entrée de file.                                                                                                 |
| `core/connectors/parsing-confidence.ts` | `detectFieldSignals`, `computeParsingConfidence`, `deriveReviewQueue`, `collectDuplicateMissionIds`, labels de raison, `FLAG_THRESHOLD`. |

### Shell (I/O)

| Fichier                                | Changement                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `shell/storage/review-decisions.ts`    | `chrome.storage.local` clé `reviewQueueDecisions`, get/save avec cap 2000 (même pattern que `seen-missions.ts`). |
| `shell/facades/review-queue.facade.ts` | API async `getReviewDecisions` / `saveReviewDecisions` pour l'UI.                                                |

### State (runes)

| Fichier                            | Changement                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `lib/state/review-queue.svelte.ts` | Factory runes : décisions chargées, `sync(missions, parserHealthRecords)`, dérivée `entries`, actions `keep`/`dismiss`. |

### UI (Atomic Design)

| Fichier                                | Changement                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ui/atoms/ConfidenceGauge.svelte`      | Jauge segmentée (props only) : segments bleus/gris + valeur 0.xx en mono bleu.                   |
| `ui/molecules/ReviewQueueItem.svelte`  | Item : icône d'état, titre, raison, TJM mono, jauge, boutons Garder/Ignorer (props + callbacks). |
| `ui/organisms/ReviewQueuePanel.svelte` | Carte « À vérifier » : en-tête pastille + badge compte, liste (max 5 visibles).                  |
| `ui/pages/FeedPage.svelte`             | Intégration sobre de la carte (lazy import, sync via `$effect`).                                 |

### Tests

- `tests/unit/connectors/parsing-confidence.test.ts` : tests purs sans mocks (signaux,
  formule + clamp, seuil, dérivation/invariants, near-duplicate, décisions).
- Gate 70% `src/lib/core/**` intact.

## Constraints

- FC&IS strict : la dérivation et la confiance sont pures (`core/`), la persistance et le
  sync sont en `shell/`. Core n'importe jamais shell.
- Svelte 5 runes uniquement ; atomes/molecules en props ; organisms via state/callbacks.
- TailwindCSS 4 CSS-first, tokens existants (`page-canvas`, `surface-white`,
  `blueprint-blue`, `text-muted`, chiffres en mono).
- TypeScript strict, zéro `any`.
- Périmètre : aucune modification des fichiers des 3 features parallèles
  (scan-runs-week, time-to-review, source-health-signals).

## Tests

- `pnpm --filter @pulse/extension typecheck && pnpm --filter @pulse/extension lint`
- `pnpm --filter @pulse/extension exec vitest run tests/unit/connectors/parsing-confidence.test.ts`
- `pnpm ci:check` (pre-push gate, doit être vert)

## Risque

- Faux positifs de flagging (missions légitimement sans TJM) : mitigé par la review
  utilisateur (`Garder` = décision immuable) et par des poids calibrés pour que seul un
  signal isolé suffise à flaguer sans être alarmiste (0.70 < 0.75).
- Coût de la dérivation (dedup sur le catalogue) : exécutée uniquement sur changement de
  missions (sync), pas par frappe clavier.
