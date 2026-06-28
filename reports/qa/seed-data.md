# QA Seed — Phase 0 deliverable (`seed-data` agent)

Deterministic, production-scale dev dataset for the MissionPulse QA campaign.
Makes every feed / profile / cv / applications / tjm / settings state and edge
case reachable in dev mode, with zero non-determinism in payload values.

## Deliverables

| #   | Path                                                                      | Role                                                                                                                                        |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/extension/src/dev/qa-seed.ts`                                       | Pure `buildQaSeed(now)` + Imperative-Shell writer `applyQaSeedToLocalStorage(now, variant, sink?)` + `QA_LOCALSTORAGE_KEYS` + `QaSeed` type |
| 2   | `apps/extension/src/dev/chrome-stubs.ts` (edited, additive + DEV-guarded) | `hidden`/`seen`/`trackings`/`health` now read from `window.localStorage` when present, falling back to the previous hardcoded values        |
| 3   | `apps/extension/src/dev/DevPanel.svelte` (edited)                         | Self-contained **`Inject QA seed (500)`** button                                                                                            |
| 4   | `apps/extension/tests/fixtures/qa-seed.ts`                                | Playwright helpers: `buildQaSeedInitScript()` + `buildQaSeedStorageState()`                                                                 |
| 5   | `apps/extension/tests/unit/dev/qa-seed.test.ts`                           | Vitest: determinism, counts, edges, reuse-consistency, tracking/health coverage, writer                                                     |

All new code is DEV-only (under `src/dev/` / `tests/`); only `DevPanel.svelte` and
`chrome-stubs.ts` were edited, as permitted.

## Seeder module

- **Pure builder:** `buildQaSeed(now = new Date()): QaSeed` — no I/O, no
  `Date.now()`, no `Math.random()`, no async. Same `now` ⇒ byte-identical output
  (asserted). All dates are derived from the injected `now`.
- **Writer:** `applyQaSeedToLocalStorage(now, variant='complete', sink?)` writes
  the seed into the same `window.localStorage` keys the chrome stubs read, then
  returns the in-memory seed. `variant='incomplete'` seeds the incomplete
  profile (completeness banner). Optional `sink` enables isolated unit testing.

## Exact localStorage keys written

Confirmed by reading `src/dev/chrome-stubs.ts` before writing:

| Key                                    | Shape                       | Pre-existing stub read?        |
| -------------------------------------- | --------------------------- | ------------------------------ |
| `__missionpulse_dev_missions`          | `Mission[]`                 | yes                            |
| `__missionpulse_dev_favorites`         | `Record<string, number>`    | yes                            |
| `__missionpulse_dev_saved_views`       | `SavedFeedView[]`           | yes                            |
| `__missionpulse_dev_alert_preferences` | `ConnectedAlertPreferences` | yes                            |
| `__missionpulse_dev_profile`           | `UserProfile`               | yes                            |
| `__missionpulse_dev_hidden`            | `Record<string, number>`    | **new** (was in-memory `{}`)   |
| `__missionpulse_dev_seen`              | `string[]`                  | **new** (was in-memory `[]`)   |
| `__missionpulse_dev_trackings`         | `MissionTracking[]`         | **new** (was hardcoded inline) |
| `__missionpulse_dev_health`            | `ConnectorHealthSnapshot[]` | **new** (was hardcoded inline) |

The 4 new keys are additive: when absent, the stubs fall back to the exact
previous behavior, so no existing test or flow regresses.

## What the seed covers

- **~500 missions** across all 5 sources (`free-work`, `lehibou`, `hiway`,
  `collective`, `cherry-pick`), complete `Mission` objects (incl. `publishedAt`,
  `startDate`, `seniority`, `scoreBreakdown`).
- **Edge variants:** score `0` and `100`, empty title, `null` client/location/
  duration, a **duplicate id** (exact copy of mission 0), and a ~30-day
  `publishedAt` spread.
- **favorites / hidden / seen** referencing real seed mission ids (seen is a
  mixed partial slice).
- **saved feed views** (2) matching the strict `SavedFeedView` schema.
- **connected alert preferences** normalized via
  `normalizeConnectedAlertPreferences`.
- **profile:** complete variant + incomplete variant (empty stack/jobTitle ->
  completeness banner reachable).
- **tracking pipeline:** one mission per application status (all 9: `detected`
  ... `archived`) with valid transition histories, plus one **overdue relance**
  (`application_prepared`, `nextActionAt` in the past).
- **connector health:** snapshots that derive to `healthy`, `degraded`
  (half-open) and `broken` (open), across all 5 connectors.

## DevPanel button

Open the DevPanel with `Ctrl+Shift+D` (dev mode only), then click
**`Inject QA seed (500)`**. It calls `applyQaSeedToLocalStorage()` and reloads
the page so the chrome stubs re-read the seeded `localStorage`. The button is
self-contained (no new callback prop), so `App.svelte` was not touched.

For the incomplete-profile variant from code:
`applyQaSeedToLocalStorage(new Date(), 'incomplete')`.

## Playwright fixture

`tests/fixtures/qa-seed.ts` exports:

- `buildQaSeedInitScript(now?, variant?)` -> JS string to pass to
  `page.addInitScript({ content })`. It seeds `localStorage` **before** the app
  (and chrome-stubs) initialize.
- `buildQaSeedStorageState(now?, origin?, variant?)` -> `storageState`-compatible
  object for `browser.newContext({ storageState })`.

```ts
import { buildQaSeedInitScript } from '../../../tests/fixtures/qa-seed';
await page.addInitScript({ content: buildQaSeedInitScript(new Date('2026-06-15T12:00:00Z')) });
await page.goto('http://localhost:5176/src/sidepanel/index.html');
```

## Validation (all green)

```bash
cd apps/extension
pnpm exec vitest run tests/unit/dev/qa-seed.test.ts   # 18 passed (18)
pnpm exec tsc --noEmit                                  # 0 errors
pnpm exec eslint <the 5 files>                          # 0 errors
```

- `vitest`: 18/18 (determinism x2, missions x6 incl. fixture cross-check,
  favorites/views/profile x3, tracking x2, health x2, writer x3).
- `tsc --noEmit`: 0 errors (strict + `verbatimModuleSyntax`).
- `eslint`: 0 errors.

## Reuse note (important)

`buildQaSeed` does **not** import `tests/fixtures/large-dataset.ts`. That fixture
has a **latent strict-type error** (`TS2739` at `large-dataset.ts:159`):
`generateMockMission` returns a `Mission` literal missing `startDate`,
`publishedAt`, `seniority` and `scoreBreakdown`. It only compiles today because
`tests/**` is outside the `src/` `tsc` program. Importing it into `src/dev/`
would break `tsc --noEmit`, and the fixture cannot be edited under this batch's
constraints. Instead, `qa-seed.ts` reproduces the fixture's deterministic
algorithm verbatim (same `SOURCES`/`STACKS`/`TITLES`/`CLIENTS`/`LOCATIONS`/
`REMOTES`/`DURATIONS` cycling and the same tjm/score formulas) but emits
**complete** `Mission` objects. Reuse is proven by a unit test that cross-checks
the first 20 base missions against `generateMockMissions(20, now)` for
`id/source/client/tjm/score/title/scrapedAt` (byte-equal).

## Findings / suspected bugs (for analysts)

1. **`tests/fixtures/large-dataset.ts:159` -- incomplete `Mission` literals (med).**
   `generateMockMission` omits `startDate`, `publishedAt`, `seniority`,
   `scoreBreakdown`. Latent under strict TS; surfaces the moment any `src/` file
   imports the fixture. Recommend fixing the fixture (add the 4 fields) and
   having it re-export the canonical src generator to remove duplication.
   Needs no interactive confirmation (static).

2. **Vitest jsdom env exposes no `localStorage` (low).** In this repo's jsdom
   setup `globalThis.window`/`document` exist but `globalThis.localStorage` is
   `undefined` (Node prints
   `ExperimentalWarning: localStorage is not available`). Any unit test that
   touches real `localStorage` must inject a sink. The QA-seed writer now
   accepts an optional `sink` param for exactly this reason. (Dev app is
   unaffected -- the browser provides `localStorage`.)
