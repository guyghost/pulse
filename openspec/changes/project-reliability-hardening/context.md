# Context: Project Reliability Hardening

## Objective

Fiabiliser MissionPulse en corrigeant les bugs critiques de scan, notification, et en rendant les données stockées dans IndexedDB plus saines (via `fetchMissions`, `chrome-storage.ts`).

- Valider les settings stockés et fallback vers les defaults si champs invalides/manquants
- Unknown fields strippés (comportement Zod par défaut)
- Rendre les parsers résilients aux changements de DOM des plateformes

---

## Reliability Improvements (by @codegen)

| Area | Change | File |
|------|--------|------|
| Notification filtering | Pass seenIds to filter (was passing `[]`) | `src/background/index.ts` |
| Result-aware retry | `withResultRetry` helper for `Result<T, AppError>` | `src/lib/shell/utils/retry-strategy.ts` |
| Scanner resilience | Use `withResultRetry`, track parser health | `src/lib/shell/scan/scanner.ts` |
| Parser health | Detect anomalies (empty results, low extraction rate) | `src/lib/shell/scan/parser-health.ts` |
| Settings validation | Zod validation with fallback to defaults | `src/lib/shell/storage/chrome-storage.ts` |
| Parser output validation | Runtime validation of parser outputs | `src/lib/core/connectors/validate-parser-output.ts` |
| Collective parser hardening | Defensive `__NEXT_DATA__` navigation | `src/lib/core/connectors/collective-parser.ts` |
| Seen IDs pruning | Limit to 2000 IDs in chrome.storage, aligned with core | `src/lib/shell/storage/seen-missions.ts`, `src/lib/core/seen/mark-seen.ts` |
| Semantic cache cleanup | Trigger on service worker startup | `src/lib/shell/storage/semantic-cache.ts` |
| Dead code removal | Removed Comet connector (unused) | `src/lib/shell/connectors/comet.connector.ts` |

---

## Test Coverage Summary (by @tests)

### Files Created/Updated

| File | Type | Tests | Coverage |
|------|------|-------|----------|
| `tests/unit/errors/app-error.test.ts` | NEW | 17 | `isRetryable()`, `isFatal()`, `serializeError()`, `deserializeError()` |
| `tests/unit/types/type-guards.test.ts` | NEW | 41 | `isMission()`, `isUserProfile()`, `isSemanticResult()`, `parseMission()`, `parseUserProfile()` |
| `tests/unit/storage/chrome-storage.test.ts` | UPDATED | 9 | Settings Zod validation, fallback to defaults on invalid input |
| `tests/unit/seen/mark-seen.test.ts` | UPDATED | 12 | MAX_SEEN_IDS=2000 boundary tests, pruning behavior |
| `tests/unit/machines/connector-actor.test.ts` | UPDATED | - | Non-retryable error behavior (no retries on 403) |
| `tests/unit/connectors/collective.test.ts` | UPDATED | 33 | Malformed data handling, entry validation |

### Test Coverage by Area

| Area | Status | Notes |
|------|--------|-------|
| **Notification filtering** | ✅ Existing coverage | `notification-filter.test.ts` already has 12+ tests |
| **Result-aware retry** | ✅ Tested via `isRetryable()` | `app-error.test.ts` covers retryable vs non-retryable |
| **Settings validation** | ✅ Tested | `chrome-storage.test.ts` covers Zod fallback |
| **Seen IDs pruning** | ✅ Tested | `mark-seen.test.ts` covers 2000 limit boundary |
| **Parser hardening** | ✅ Tested | `collective.test.ts` covers malformed input |
| **Type guards** | ✅ Tested | `type-guards.test.ts` covers all runtime guards |

### Not Tested (Shell layer, requires mocks)

- `parser-health.ts` - Requires `chrome.storage` mock

---

## Inter-Agent Notes

### From @codegen to @tests
- `withResultRetry` in retry-strategy.ts - tests for Result-aware retry would be valuable
- `validate-parser-output.ts` in core - can be tested without mocks
- `parser-health.ts` in shell - needs chrome.storage mock for tests

### From @tests to @codegen
- (Resolved in run 2) `purgeOldMissions()` was implemented in `db.ts` at lines 170-209

### From @codegen (Run 4 corrections)
- `validate-parser-output.ts` is now pure (no console) and correctly validates `scrapedAt: Date`
- `collective-parser.ts` is now pure (no console) - callers handle logging
- `MAX_SEEN_IDS` is 2000 in both core and shell layers

### From @codegen (Run 5 corrections)
- `validate-parser-output.ts` now correctly validates `description` as required string (was accepting null, violating Mission type)
- Removed unused `parserId` parameter from `validateParserOutput()`

---

## Run History

| Run | Agent | Summary |
|-----|-------|---------|
| 1 | @orchestrator | Context files created |
| 2 | @codegen | Reliability hardening implementation |
| 3 | @tests | Test coverage for hardening work |
| 4 | @codegen | Core purity fixes: removed console side effects, aligned types, fixed retention consistency |
| 5 | @codegen | Type safety fix: description now required in validateMission, removed dead parserId param |
| 6 | @integrator | Verified post-correction coherence, removed duplicate collective parser test, refreshed context summary |
| 7 | @validator | Pre-existing violations noted (out of scope) |
| 8 | @tests | Hiway disabled state tests added |
| 9 | @codegen | Hiway JSON parser implementation, connector updated, tests rewritten |
| 10 | @tests | Hiway enabled state tests updated |
| 11 | @review | Approved Hiway implementation |
| 12 | @codegen | Removed obsolete HTML parser, cleaned up stale reference |

---

## Integration Summary

- Post-correction review found the hardening changes coherent across core, shell, and targeted tests.
- Minor integration cleanup removed a duplicated `collective.test.ts` case and aligned this context file with the final file paths and 2000-ID retention limit.
- Remaining non-feature risks are pre-existing validator notes outside this change scope (`core/backup`, `core/export`) plus missing shell-level tests for `parser-health.ts`.

---

## Future Work

- [ ] Add tests for `parser-health.ts` with chrome.storage mocks
- [ ] E2E tests for full scan flow with error scenarios

---

## Scope Extension: Hiway JSON Connector

### Implementation Status (Run 10 - @tests)

Hiway is now **ENABLED** with confirmed Supabase credentials.

| Component | Status | File |
|-----------|--------|------|
| JSON Parser | ✅ Ready | `src/lib/core/connectors/hiway-json-parser.ts` |
| HTML Parser | 🗑️ Removed | ~~`src/lib/core/connectors/hiway-parser.ts`~~ (deleted) |
| Connector | ✅ Ready | `src/lib/shell/connectors/hiway.connector.ts` |
| Tests | ✅ 24 tests | `tests/unit/connectors/hiway.test.ts` |
| Registry | ✅ Enabled | `src/lib/shell/connectors/index.ts` |

### Architecture

- **Core**: `parseHiwayJSON()` — pure function that transforms Supabase rows to `Mission[]`
- **Shell**: `HiwayConnector` — fetches from `https://<project>.supabase.co/rest/v1/freelance_posted_missions`
- **Config**: Supabase URL and anon key injected via constants (confirmed values)
- **Guard**: Connector returns error if config uses placeholder values (safe failure mode)

2. **Supabase Anon Key**: Extract from same location
   - This is a public key (designed for client-side use with RLS)
   - Pattern: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

3. **Table Name**: Confirmed as `freelance_posted_missions` (may have additional tables)

### Hiway Test Coverage (by @tests - Run 10)

| File | Type | Tests | Coverage |
|------|------|-------|----------|
| `tests/unit/connectors/hiway.test.ts` | UPDATED | 24 | JSON parser (17) + enabled state (4) + connector instantiation (1) |

**JSON Parser Tests (17 tests):**
- `parseHiwayMissionRow`: field extraction, fallbacks (company→client, skills→stack, daily_rate→tjm, city→location), URL building, HTML stripping, null handling
- `parseHiwayJSON`: array parsing, invalid row filtering, graceful null handling

**Enabled State Tests (4 tests):**
- Verifies Hiway IS in active connector registry
- Verifies Hiway IS in UI metadata with correct name/url
- Confirms JSON parser is available for Supabase row parsing
- Connector can be instantiated via registry (no network calls)

**Status:** Hiway is ENABLED with confirmed Supabase credentials.
