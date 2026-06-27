# Context: TJM Seniority Scraping

## Objective

Extraire le niveau d'expérience (seniority) depuis l'API FreeWork, le propager dans les types Mission et TJMRecord, et segmenter le radar marché TJM par séniorité réelle plutôt que par tiers statistiques.

## Problème actuel

Le radar marché TJM affiche 474€ pour les 3 niveaux (Junior, Confirmé, Senior) car :

1. `FreeWorkJobPosting` n'inclut pas `experienceLevel` (bien que l'API le renvoie)
2. `Mission` n'a pas de champ seniority
3. `TJMRecord` est indexé uniquement par `stack + date` (pas de dimension seniority)
4. `analyzeTJMHistory()` utilise `sliceIntoThirds()` — un découpage statistique fictif

## Contraintes

- Platform: Chrome Extension MV3
- Architecture: FC&IS strict (Core pur, Shell I/O)
- Rétrocompatibilité: le champ seniority est nullable (autres connecteurs ne le fournissent pas)
- Le mapping FreeWork `intermediate` → `confirmed` est fait dans le parser pur

## Technical Decisions

| Decision                                                      | Justification                                  | Agent         |
| ------------------------------------------------------------- | ---------------------------------------------- | ------------- |
| Ajouter `seniority: SeniorityLevel \| null` à `Mission`       | FreeWork le fournit, les autres non → nullable | @orchestrator |
| Ajouter `seniority: SeniorityLevel \| null` à `TJMRecord`     | Permettre la segmentation TJM par seniority    | @orchestrator |
| Mapper `experienceLevel` dans le parser pur                   | Respect FC&IS: le mapping est un calcul pur    | @orchestrator |
| Groupement par seniority réelle avec fallback statistique     | Rétrocompat données existantes sans seniority  | @orchestrator |
| Clé TJMRecord: `stack:date:seniority` au lieu de `stack:date` | Segmentation fine par niveau d'expérience      | @orchestrator |

## Artifacts Produced

| File                                         | Agent    | Status                                                                                |
| -------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `tests/unit/tjm-history/tjm-history.test.ts` | @tests   | ✅ 43 tests (all pass)                                                                |
| `src/lib/core/types/tjm.ts`                  | @codegen | ✅ Added `seniority: SeniorityLevel \| null` to `TJMRecord`                           |
| `src/lib/core/types/schemas.ts`              | @codegen | ✅ Added `seniority` to `MissionSchema` and `MissionSerializedSchema`                 |
| `src/lib/core/tjm-history/index.ts`          | @codegen | ✅ Updated `extractRecords`, `addRecords`, `analyzeTJMHistory` for seniority grouping |
| `src/lib/shell/storage/tjm-history.ts`       | @codegen | ✅ Migration: old records get `seniority: null`                                       |
| `src/ui/organisms/TJMDashboard.svelte`       | @codegen | ✅ Added `userSeniority` prop + ring highlight                                        |
| `src/ui/pages/TJMPage.svelte`                | @codegen | ✅ Passes `userSeniority` from profile                                                |
| `src/dev/mocks.ts`                           | @codegen | ✅ Added `seniority` to mock missions and TJM records                                 |
| `tests/unit/types/type-guards.test.ts`       | @codegen | ✅ Updated `makeValidMission` with `seniority` field                                  |

## Test Coverage

| Domain             | Tests | Passing | Notes                                                                            |
| ------------------ | ----- | ------- | -------------------------------------------------------------------------------- |
| extractRecords     | 10    | 10/10   | Seniority grouping works: missions with null seniority produce records with null |
| addRecords         | 7     | 7/7     | Upsert key now `stack:date:seniority` — different seniorities kept separate      |
| analyzeTJMHistory  | 4     | 4/4     | Real seniority-based grouping with sliceIntoThirds fallback                      |
| emptyHistory       | 1     | 1/1     |                                                                                  |
| determineTrend     | 6     | 6/6     |                                                                                  |
| getStatsForStack   | 5     | 5/5     |                                                                                  |
| getAllStats        | 2     | 2/2     |                                                                                  |
| getTrend           | 2     | 2/2     |                                                                                  |
| getStatsForMission | 2     | 2/2     |                                                                                  |
| getDominantTrend   | 3     | 3/3     |                                                                                  |

## Inter-Agent Notes

<!-- Format: [@source → @destination] Message -->

- **@tests → @codegen**: `src/dev/mocks.ts` (line 57) and `tests/fixtures/large-dataset.ts` (line 149) are missing `seniority` and `startDate` fields on `Mission` objects. `src/dev/mocks.ts` (line 100) is missing `seniority` on `TJMRecord` objects. These cause TypeScript errors after the Phase 1 type changes.
