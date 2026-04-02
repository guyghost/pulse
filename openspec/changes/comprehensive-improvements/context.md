# Context: MissionPulse - Améliorations Complètes

## Objective

Améliorer l'extension MissionPulse sur tous les fronts identifiés lors de l'audit initial.

## Améliorations identifiées

### 1. Infrastructure & Qualité de code

- [x] Configuration ESLint v9 (flat config intégrée)
- [ ] Vérification des règles Prettier

### 2. Intelligence & Scoring

- [x] Activation et optimisation du scoring sémantique Gemini Nano
- [x] Vérification de l'intégration dans le flux de scan
- [x] Cache des scores sémantiques

### 3. Tests

- [x] Complétion des tests E2E critiques — 58 nouveaux tests E2E ajoutés (5 fichiers)
- [ ] Vérification de la couverture des connecteurs

### 4. Documentation

- [x] README.md complet
- [ ] Guide de contribution
- [ ] Documentation API interne

### 5. Connecteurs

- [x] Système de health checks intégré (runner + validations parser)
- [x] Mise à jour des vérifications parser health check

### 6. Performance

- [x] Lazy loading des icônes/favicons — `loading="lazy"` + `decoding="async"` + `fetchpriority="low"`
- [x] Optimisation du virtual scroll — CSS `content-visibility: auto` + single-pass filtering

### 7. Fonctionnalités UX

- [x] Alertes intelligentes (notifications push)
- [x] Historique TJM
- [ ] Mode comparaison missions

## Constraints

- **Platform**: Chrome Extension Manifest V3
- **Stack**: Svelte 5, TypeScript, TailwindCSS 4
- **Architecture**: Functional Core & Imperative Shell
- **Tests**: 617 tests existants, maintenir la couverture
- **Offline-first**: Toutes les fonctionnalités doivent fonctionner offline

## Technical Decisions

### Semantic scorer returns diagnostics alongside scores

Enables observability (cache hits, AI scored, failures, timing) without breaking existing flow. The `SemanticScoringResult` type wraps the scores map with a `SemanticScoringDiagnostics` object. — @codegen

### Notification filter uses best available score (semantic ?? basic)

Semantic scores are more accurate. Missions with high AI scores should trigger notifications even if basic score is lower. Uses `semanticScore ?? score` for threshold check and sort. — @codegen

### Scanner uses immutable pattern for semantic enrichment

Uses `.map()` with spread instead of in-place mutation, consistent with FC&IS architecture. Creates new Mission objects with semantic fields merged in. — @codegen

### MissionCard prefers semantic score display

Shows the more accurate AI-evaluated score when available, with a `title` tooltip indicating "Score sémantique (IA)". Falls back to basic score when semantic is null. — @codegen

### Semantic metrics recorded via metricsCollector

Dev-only metrics for `semantic.duration`, `semantic.cache_hits`, `semantic.ai_scored`, `semantic.ai_failed` — all tree-shaken in production via `import.meta.env.DEV` guard. — @codegen

### Favicon lazy loading via browser-native APIs

Used `loading="lazy"` + `decoding="async"` + `fetchpriority="low"` instead of IntersectionObserver. Rationale: only 3-5 connector favicons (14×14px), IO overhead exceeds benefit. Browser-native lazy loading handles off-screen deferral for free. — @codegen

### CSS content-visibility for browser-native virtualization

`content-visibility: auto` with `contain-intrinsic-size: 0 320px` on each MissionCard wrapper. Browser skips layout, paint, and render for off-screen cards — zero-JS virtualization. The 320px intrinsic size estimate matches the average collapsed card height, minimizing layout shift. More robust than a JS-based virtual list for the side panel context (variable card heights, narrow viewport, typically <200 items). — @codegen

### Single-pass displayMissions filter

Replaced 5+ chained `.filter()` calls in FeedPage with a single for-loop that evaluates all conditions per mission. Eliminates intermediate array allocations and passes. ~5x fewer array copies for 100 missions with all filters active. — @codegen

### Search index pre-computation

`buildSearchIndex()` pre-computes a single lowercase searchable string per mission (title + stack + description joined). Single `String.includes()` check replaces 3 separate `.toLowerCase()` + `.includes()` calls per field. Reduces per-mission string operations from O(3 fields × 2 ops) to O(1 concatenation + 1 check). — @codegen

### Sort comparator prefers semantic score

Default sort comparator now uses `semanticScore ?? score` instead of just `score`, consistent with the notification filter and MissionCard display logic. Missions with AI scores sort by their more accurate evaluation. — @codegen

### Search debounce reduced to 150ms

Changed from 300ms to 150ms for snappier search feel. Still prevents excessive re-computation on fast typing, but 150ms feels near-instant while avoiding layout thrashing. — @codegen

### AppSettings moved to core-owned type

Extracted `AppSettings` into `src/lib/core/types/app-settings.ts` and re-exported it from shell storage. This removes a Core → Shell type import in backup logic and restores FC&IS compliance. — @integrator

### Feed UI labels aligned to existing E2E contract

Normalized feed labels/ARIA (`Rafraichir`, `Voir favoris`, `Voir toutes`, `Rechercher...`, `Missions`) so worker changes remain compatible with the established Playwright selectors and accessibility assertions. — @integrator

### E2E count normalized to 58 new tests

The prior summary mixed `48`, `58`, and inconsistent totals. Integration uses the authoritative per-file counts from worker artifacts: 10 + 10 + 16 + 10 + 12 = 58 new tests. — @integrator

## Test Coverage Summary

| Flow                | Before | After   | File                                      |
| ------------------- | ------ | ------- | ----------------------------------------- |
| Onboarding          | 4      | 4       | `onboarding.test.ts`                      |
| Feed                | 10     | 10      | `feed.test.ts`                            |
| Navigation          | 3      | 3       | `navigation.test.ts`                      |
| DevPanel            | 6      | 6       | `devpanel.test.ts`                        |
| Full User Journey   | 5      | 5       | `flows/full-user-journey.test.ts`         |
| **Favorites**       | **0**  | **10**  | **`favorites.test.ts`** ✨ NEW            |
| **Hidden Missions** | **0**  | **10**  | **`hidden-missions.test.ts`** ✨ NEW      |
| **Settings**        | **0**  | **16**  | **`settings.test.ts`** ✨ NEW             |
| **Export**          | **0**  | **10**  | **`export.test.ts`** ✨ NEW               |
| **Scan Lifecycle**  | **0**  | **12**  | **`flows/scan-lifecycle.test.ts`** ✨ NEW |
| Offline             | 9      | 9       | `offline/offline-mode.test.ts`            |
| Resilience          | 6      | 6       | `resilience/connector-failure.test.ts`    |
| Accessibility       | 14     | 14      | `accessibility/a11y.test.ts`              |
| Performance         | 8      | 8       | `performance/virtual-list.test.ts`        |
| **Total**           | **65** | **126** | **14 files**                              |

**Note**: Pre-existing E2E tests fail in CI/headless due to Chrome stub initialization race condition (baseline confirmed by running existing tests before changes). New tests follow the same patterns and selectors.

## Artifacts Produced

- `src/lib/shell/ai/semantic-scorer.ts` — @codegen — Enhanced: diagnostics return type, metrics recording
- `src/lib/core/scoring/notification-filter.ts` — @codegen — Fixed: uses best available score
- `src/lib/shell/scan/scanner.ts` — @codegen — Refactored: immutable semantic enrichment, diagnostics logging
- `src/ui/molecules/MissionCard.svelte` — @codegen — Enhanced: prefers semantic score display
- `tests/unit/ui/MissionCard.test.ts` — @codegen — Updated: 2 tests fixed, 2 new tests added
- `tests/e2e/favorites.test.ts` — @tests — NEW: 10 tests for favorites flow
- `tests/e2e/hidden-missions.test.ts` — @tests — NEW: 10 tests for hidden missions flow
- `tests/e2e/settings.test.ts` — @tests — NEW: 16 tests for settings page
- `tests/e2e/export.test.ts` — @tests — NEW: 10 tests for export functionality
- `tests/e2e/flows/scan-lifecycle.test.ts` — @tests — NEW: 12 tests for scan lifecycle
- `src/ui/molecules/ConnectorStatus.svelte` — @codegen — Optimized: lazy favicon loading with `loading="lazy"`, `decoding="async"`, `fetchpriority="low"`
- `src/ui/organisms/VirtualMissionFeed.svelte` — @codegen — Optimized: CSS `content-visibility: auto` virtualization, sort comparator prefers semantic score
- `src/ui/molecules/SearchInput.svelte` — @codegen — Optimized: search debounce reduced from 300ms to 150ms
- `src/lib/state/feed.svelte.ts` — @codegen — Optimized: pre-computed search index, single-string matching
- `src/ui/pages/FeedPage.svelte` — @codegen — Optimized: single-pass displayMissions filter, removed unused imports

## Inter-Agent Notes

[@codegen → @tests] Semantic scorer API changed: `scoreMissionsSemantic` now returns `SemanticScoringResult { scores, diagnostics }` instead of `Map<string, SemanticResult>`. Scanner updated to destructure the new return type. Notification filter now uses `semanticScore ?? score`. MissionCard tests updated with 2 new tests for semantic score preference.

[@tests → @review] Added 48 new E2E tests covering 5 critical flows that had zero dedicated coverage: Favorites (10 tests), Hidden Missions (10 tests), Settings (16 tests), Export (10 tests), and Scan Lifecycle (12 tests). Total E2E test count: 126 across 14 files. Pre-existing baseline tests fail in headless CI environment (Chrome stub initialization race condition), confirmed independently before adding new tests. All new tests follow existing patterns (helpers.ts, DevPanel injection, French UI text, AAA structure).

## Integration Report

### Summary

All worker deliverables were integrated and harmonized across ESLint, semantic scoring, smart alerts, TJM history, health checks, performance, E2E coverage, and README updates. Two integration conflicts were resolved: one FC&IS type-boundary violation and one UI/E2E selector drift.

### Files

| File                                                 | Action             | Status |
| ---------------------------------------------------- | ------------------ | ------ |
| `eslint.config.js`                                   | Created            | ✅     |
| `tsconfig.eslint.json`                               | Created            | ✅     |
| `src/lib/shell/ai/semantic-scorer.ts`                | Modified + refined | ✅     |
| `src/lib/core/scoring/notification-filter.ts`        | Modified           | ✅     |
| `src/lib/core/scoring/notification-rate-limit.ts`    | Created            | ✅     |
| `src/lib/shell/scan/scanner.ts`                      | Modified           | ✅     |
| `src/lib/shell/notifications/notify-missions.ts`     | Modified           | ✅     |
| `src/lib/core/types/tjm.ts`                          | Created            | ✅     |
| `src/lib/core/tjm-history/index.ts`                  | Created            | ✅     |
| `src/lib/shell/storage/tjm-history.ts`               | Created            | ✅     |
| `src/lib/shell/storage/index.ts`                     | Modified           | ✅     |
| `src/lib/core/types/app-settings.ts`                 | Created            | ✅     |
| `src/lib/core/backup/backup.ts`                      | Modified           | 🔧     |
| `src/ui/molecules/MissionCard.svelte`                | Modified           | ✅     |
| `src/ui/molecules/SearchInput.svelte`                | Modified + aligned | 🔧     |
| `src/ui/molecules/ConnectorStatus.svelte`            | Modified           | ✅     |
| `src/ui/organisms/VirtualMissionFeed.svelte`         | Modified           | ✅     |
| `src/ui/pages/FeedPage.svelte`                       | Modified + aligned | 🔧     |
| `README.md`                                          | Modified           | ✅     |
| `tests/e2e/favorites.test.ts`                        | Created            | ✅     |
| `tests/e2e/hidden-missions.test.ts`                  | Created            | ✅     |
| `tests/e2e/settings.test.ts`                         | Created            | ✅     |
| `tests/e2e/export.test.ts`                           | Created            | ✅     |
| `tests/e2e/flows/scan-lifecycle.test.ts`             | Created            | ✅     |
| `tests/unit/scoring/notification-rate-limit.test.ts` | Created            | ✅     |
| `tests/unit/tjm-history/tjm-history.test.ts`         | Created            | ✅     |
| `tests/health/connectors/*.health.ts`                | Modified           | ✅     |
| `tests/health/run-health-checks.ts`                  | Modified           | ✅     |

### Conflicts Resolved

| Conflict                                   | Source                                                           | Resolution                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Core importing Shell type                  | `src/lib/core/backup/backup.ts` → `shell/storage/chrome-storage` | Extracted `AppSettings` to `src/lib/core/types/app-settings.ts` and re-exported from shell         |
| UI selector/name drift vs Playwright suite | Feed UI vs existing/new E2E tests                                | Restored stable labels/ARIA for refresh, favorites toggle, search placeholder, and section heading |
| E2E test-count mismatch in docs            | Worker summary vs context table                                  | Normalized report to 58 new tests from per-file counts                                             |

### Simplifications Applied

| File                                  | Simplification                             | Reason      |
| ------------------------------------- | ------------------------------------------ | ----------- |
| `src/lib/shell/ai/semantic-scorer.ts` | Removed unused cached-return timing local  | Clarity     |
| `src/ui/pages/FeedPage.svelte`        | Normalized button labels/ARIA in one place | Consistency |

### Verification

- `pnpm typecheck` ✅
- `pnpm test` ✅ (41 files, 658 tests)
- `pnpm test:e2e` ⚠️ Fails in headless baseline; current failures match the pre-existing Playwright/dev-stub initialization issue noted by workers
- `pnpm lint` ⚠️ Fails repo-wide under newly introduced ESLint v9 rules; configuration is integrated, but the codebase is not yet lint-clean

### Architecture Notes

- Verified the integrated changes respect FC&IS for the touched work after moving `AppSettings` into Core.
- One unrelated pre-existing violation remains in repository history only if stale references are reintroduced; no touched integrated files now import Shell from Core.
- No duplicate exports found in the integrated surface area reviewed.

### Dependency Graph

`shell/scan/scanner` → `core/scoring/*`, `shell/ai/semantic-scorer`, `shell/storage/tjm-history`  
`shell/notifications/notify-missions` → `core/scoring/notification-filter`, `core/scoring/notification-rate-limit`  
`ui/pages/FeedPage` → `state/feed`, `shell/facades/*`, `ui/organisms/VirtualMissionFeed`  
`ui/molecules/MissionCard` → `core/types/mission`, `core/types/tjm`

### Next Step

→ `@validator` for FC&IS and overall coherence verification, with follow-up work recommended for repo-wide ESLint cleanup and the known headless E2E bootstrap issue.

---

### Machine-Readable Summary

```json
{
  "files_touched": [
    { "path": "eslint.config.js", "action": "created" },
    { "path": "tsconfig.eslint.json", "action": "created" },
    { "path": "src/lib/core/types/app-settings.ts", "action": "created" },
    { "path": "src/lib/core/backup/backup.ts", "action": "modified" },
    { "path": "src/ui/molecules/SearchInput.svelte", "action": "modified" },
    { "path": "src/ui/pages/FeedPage.svelte", "action": "modified" },
    { "path": "src/lib/shell/ai/semantic-scorer.ts", "action": "modified" }
  ],
  "conflicts_resolved": [
    {
      "type": "architecture_boundary",
      "files": ["src/lib/core/backup/backup.ts", "src/lib/core/types/app-settings.ts"],
      "resolution": "moved_shared_type_to_core"
    },
    {
      "type": "ui_test_contract",
      "files": ["src/ui/pages/FeedPage.svelte", "src/ui/molecules/SearchInput.svelte"],
      "resolution": "aligned_labels_and_aria"
    },
    {
      "type": "documentation_mismatch",
      "files": ["openspec/changes/comprehensive-improvements/context.md"],
      "resolution": "normalized_to_58_new_e2e_tests"
    }
  ],
  "simplifications": [
    { "file": "src/lib/shell/ai/semantic-scorer.ts", "type": "remove_unused_local" }
  ],
  "verification": {
    "typecheck": true,
    "unit_tests": true,
    "e2e_tests": false,
    "lint": false
  },
  "flags_for_review": [
    "Repo-wide ESLint violations remain after flat-config integration.",
    "Playwright E2E suite still fails in headless baseline due to existing bootstrap/dev-stub issue.",
    "openspec/changes/ci-health-checks/context-log.jsonl contains malformed historical content."
  ]
}
```
