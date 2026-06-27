# Context: Ralph Hardening

## Objective

Fix critical bugs, improve architecture, add features, and improve DX across MissionPulse codebase. Full autonomous loop (Ralph mode) iterating P0 → P1 → P2 → P3.

## Constraints

- Platform: Chrome Extension Manifest V3
- Framework: Svelte 5 (runes only)
- State: XState 5 (setup API)
- Architecture: Functional Core / Imperative Shell
- Styling: TailwindCSS 4 (CSS-first @theme)
- Tests: Vitest (unit) + Playwright (E2E)
- **Core rules**: Zero I/O, zero async, zero impurity, injection for Date/IDs

## Sprint Plan

### P0 — Critical Bugs ✅

| #   | Issue                                | Files                                                              | Status |
| --- | ------------------------------------ | ------------------------------------------------------------------ | ------ |
| 0.1 | `(self as any).ai` untyped Chrome AI | `shell/ai/chrome-ai.d.ts`, `capabilities.ts`, `semantic-scorer.ts` | ✅     |
| 0.2 | `parseSemanticResult` fragile regex  | `core/scoring/semantic-scoring.ts`                                 | ✅     |
| 0.3 | No retry on semantic scoring         | `shell/ai/semantic-scorer.ts`                                      | ✅     |
| 0.4 | Feed machine search+filter exclusive | `machines/feed.machine.ts`                                         | ✅     |

### P1 — Architecture ✅

| #   | Issue                     | Files                                                            | Status |
| --- | ------------------------- | ---------------------------------------------------------------- | ------ |
| 1.1 | No finalScore fusion      | `core/scoring/final-score.ts` (new)                              | ✅     |
| 1.2 | Hardcoded scoring weights | `core/scoring/relevance.ts`, `core/types/profile.ts`             | ✅     |
| 1.3 | MAX_PER_SCAN hardcoded    | `shell/ai/semantic-scorer.ts`, `shell/storage/chrome-storage.ts` | ✅     |
| 1.4 | O(n²) deduplication       | `core/scoring/dedup.ts`                                          | ✅     |

### P2 — Features ✅

| #   | Issue                                      | Files                                                                                                  | Status |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------ |
| 2.1 | Push notifications for high-score missions | `core/scoring/notification-filter.ts`, `shell/notifications/notify-missions.ts`, `background/index.ts` | ✅     |
| 2.2 | Semantic score cache (7-day TTL)           | `shell/storage/semantic-cache.ts`, `shell/ai/semantic-scorer.ts`                                       | ✅     |
| 2.3 | Missing dedup tests                        | `tests/unit/scoring/dedup.test.ts`                                                                     | ✅     |

### P3 — DX ✅

| #   | Issue                                             | Files                                                         | Status |
| --- | ------------------------------------------------- | ------------------------------------------------------------- | ------ |
| 3.1 | CI/CD GitHub Actions                              | `.github/workflows/ci.yml`                                    | ✅     |
| 3.2 | TS errors (ImportMeta.env, onUserSettingsChanged) | `src/types/vite-env.d.ts`, `src/types/chrome-extensions.d.ts` | ✅     |

### Runtime Bug Fix ✅

| #    | Issue                                                       | Files                                                                                                                           | Status |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ |
| BF.1 | `.toLowerCase()` crash on undefined stack/title/description | `parser-utils.ts`, `relevance.ts`, `dedup.ts`, `feed.machine.ts`, `aggregator.ts`, `collective-parser.ts`, `freework-parser.ts` | ✅     |

## Technical Decisions

| Decision                                                         | Justification                                                                                                                                         | Agent    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Feed machine: single `loaded` state with `ActiveFilters` context | Previous `searching`/`filtered` states were mutually exclusive; new design stores filter criteria in context, uses pure `recomputeFilteredMissions()` | @codegen |
| Brace-counting parser for semantic results                       | Regex was fragile with markdown fences, nested JSON, score-as-string                                                                                  | @codegen |
| Two-phase dedup: exact match + inverted token index              | O(n×k) instead of O(n²), exact match handles common case                                                                                              | @codegen |
| Semantic cache via `chrome.storage.local` with 7-day TTL         | Simpler than IndexedDB for key-value, longer TTL than TJM (less volatile)                                                                             | @codegen |
| Notification filter as Core pure function                        | Keeps filtering logic testable without mocks, Shell handles `chrome.notifications`                                                                    | @codegen |
| `getSettings()` merges with defaults via spread                  | Forward-compatible when new settings are added — old stored settings get defaults                                                                     | @codegen |
| Type augmentations for Chrome 130+ APIs                          | `@types/chrome` doesn't cover `onUserSettingsChanged` yet                                                                                             | @codegen |
| Vite client types via triple-slash reference                     | Standard Vite pattern for `import.meta.env` typing                                                                                                    | @codegen |
| Defense-in-depth for `.toLowerCase()` crash                      | 3-layer defense: (1) `createMission` sanitizes at boundary, (2) parsers filter invalid stack entries, (3) consumers guard all `.toLowerCase()` calls  | @codegen |

## Artifacts Produced

| File                                             | Agent    | Status                              |
| ------------------------------------------------ | -------- | ----------------------------------- |
| `src/lib/shell/ai/chrome-ai.d.ts`                | @codegen | ✅ Chrome AI type declarations      |
| `src/lib/core/scoring/final-score.ts`            | @codegen | ✅ Score fusion function            |
| `src/lib/core/scoring/notification-filter.ts`    | @codegen | ✅ Pure notification filtering      |
| `src/lib/shell/notifications/notify-missions.ts` | @codegen | ✅ Chrome notifications Shell       |
| `src/lib/shell/storage/semantic-cache.ts`        | @codegen | ✅ 7-day TTL semantic cache         |
| `src/types/chrome-extensions.d.ts`               | @codegen | ✅ Chrome 130+ type augmentations   |
| `src/types/vite-env.d.ts`                        | @codegen | ✅ Vite client types                |
| `.github/workflows/ci.yml`                       | @codegen | ✅ CI/CD pipeline                   |
| `tests/unit/scoring/final-score.test.ts`         | @tests   | ✅ 27 tests                         |
| `tests/unit/scoring/notification-filter.test.ts` | @tests   | ✅ 13 tests                         |
| `tests/unit/scoring/dedup.test.ts`               | @tests   | ✅ 11 tests                         |
| `src/machines/feed.machine.ts`                   | @codegen | ✅ Combined search+filter redesign  |
| `src/lib/core/scoring/semantic-scoring.ts`       | @codegen | ✅ Brace-counting parser            |
| `src/lib/core/scoring/dedup.ts`                  | @codegen | ✅ Inverted token index             |
| `src/lib/core/scoring/relevance.ts`              | @codegen | ✅ Configurable weights             |
| `src/lib/core/types/profile.ts`                  | @codegen | ✅ ScoringWeights interface         |
| `src/lib/shell/ai/semantic-scorer.ts`            | @codegen | ✅ Retry + cache integration        |
| `src/lib/shell/storage/chrome-storage.ts`        | @codegen | ✅ New settings fields              |
| `src/background/index.ts`                        | @codegen | ✅ Notification integration         |
| `tests/unit/connectors/parser-utils.test.ts`     | @tests   | ✅ 15 parser-utils regression tests |

## Test Results

- **222 tests passing** (25 test files, 0 failures)
- **0 TypeScript errors** (`pnpm tsc --noEmit` clean)
- Test growth: 140 → 157 → 184 → 197 → 222

## Inter-Agent Notes

[@codegen → @tests] Feed machine tests need updates: (1) SEARCH stays in `loaded` state, no `searching` state, (2) `FILTER` event → `SET_FILTERS` with `Partial<ActiveFilters>`, (3) no `filtered` state.
[@orchestrator → all] ALL P0-P3 ITEMS COMPLETE. Ralph hardening sprint finished.
[@orchestrator → all] Runtime bug fixed: `.toLowerCase()` crash resolved with defense-in-depth across 7 files + 25 regression tests. 222 tests passing.
