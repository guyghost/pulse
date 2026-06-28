# QA Report — Applications Pipeline + TJM Radar

- **Domain:** Applications (tracking pipeline) + TJM radar
- **Agent:** `domain-applications-tjm`
- **Scope (source):** `ApplicationsPage.svelte`, `TJMPage.svelte`, `ApplicationPipelineSummary.svelte`, `TJMDashboard.svelte`, `TJMGauge.svelte`, `TrendBadge.svelte`, `src/lib/core/tracking/*`, `src/lib/core/tjm-history/*`, `src/lib/core/types/{tracking,tjm}.ts`, `src/lib/state/tracking.svelte.ts`, `src/lib/shell/facades/tjm.facade.ts`, dev stubs (`GET_TJM_ANALYSIS` / `GET_TRACKINGS` / `UPDATE_TRACKING` / `UPDATE_TRACKING_DETAILS`), `@pulse/domain` transition map.
- **Base branch:** `main`
- **Method:** code-level analysis + unit tests only (no dev server, no Playwright).

---

## 1. Inventory

### 1.1 Applications page (`src/ui/pages/ApplicationsPage.svelte`)

- **Role:** Premium-gated (`App.svelte:441` renders only `&& premium.isPremium`; lock screen `App.svelte:48-54`).
- **Route:** `applications` (nav item).
- **Buttons / inputs:**
  - Story primary action (`handleApplicationStoryAction`, `:475`) — context-dependent (open recommended dossier / go to feed).
  - "Dossier recommandé" open button (`openRecommendedDossier`, `:528`).
  - Status transition buttons (`transitionTo`, `:695`) — driven by `VALID_TRANSITIONS[selectedStatus]`.
  - "Prochaine action" `datetime-local` input (`:711`) + Save (`saveNextAction`, `:720`) + Clear (`clearNextAction`, `:728`, shown only when `nextActionAt` set).
  - Kit generation buttons: pitch / cover-message / cv-summary (`generate`, `:793`).
  - Copy-asset button (`copyAsset`, `:836`).
  - External mission link (`:680`).
- **States:** loading skeleton (`:539`), load error (`:580`), empty feed (`:597`), loaded (`:612`).
- **Workflow steps:** detected → selected → application_prepared → applied → interview → offer → accepted | rejected | archived (archived → detected). See §2.1.

### 1.2 Pipeline summary (`src/ui/organisms/ApplicationPipelineSummary.svelte`)

- 4 insight cards: Actives, Relances (dueFollowUps), Prêtes (preparedNotApplied), Conversion (acceptanceRate).
- "Avancement" stage bars for the 7 pipeline statuses; "Goulot" (bottleneck) label when present.

### 1.3 TJM page (`src/ui/pages/TJMPage.svelte`)

- **Role:** Premium-gated (`App.svelte:345` `&& premium.isPremium`; lock `App.svelte:55-61`).
- **Route:** `tjm`.
- Refresh button (`loadAnalysis`, `:221`), story card, `TJMDashboard`.
- Subscribes to `SCAN_COMPLETE` / `PROFILE_UPDATED` to reload (`:151-161`).

### 1.4 TJM dashboard (`src/ui/organisms/TJMDashboard.svelte`)

- Pricing decision story (confidence, missions analysées, écart vs médiane).
- Trend overview + confidence bar; user positioning card (cible vs marché bas/médiane/haut); 3 seniority level cards (junior/confirmed/senior); top stacks; region insights (top 8); recommendation.
- Empty state with 3 setup steps when no analysis.

### 1.5 Molecules

- `TrendBadge.svelte` — up/stable/down badge. **Used** by `TJMDashboard`.
- `TJMGauge.svelte` — mission-vs-range gauge. **Dead code** (no imports anywhere in `src/`; only referenced in docs/README). See bug #4.

### 1.6 Core

- `tracking/pipeline-summary.ts` — `summarizeApplicationPipeline(trackings, now)`.
- `tracking/transitions.ts` — `transitionStatus`, `isValidTransition`, `addGeneratedAssetAndMarkPrepared`, etc.
- `tracking/migration.ts` — legacy record normalization.
- `tjm-history/index.ts` — `extractRecords`, `analyzeTJMHistory`, region/seniority builders.
- `tjm-history/normalize-region.ts` — location → canonical region.

---

## 2. Acceptance criteria

### 2.1 Status transitions (state machine — `packages/domain/src/index.ts:46-56`)

Valid next statuses surfaced as buttons:

- detected → selected, archived
- selected → application_prepared, applied, archived
- application_prepared → applied, archived
- applied → interview, offer, rejected, archived
- interview → offer, rejected, archived
- offer → accepted, rejected, archived
- accepted → archived
- rejected → archived
- archived → detected

- **AC-T1:** Buttons rendered == `VALID_TRANSITIONS[selectedStatus]` (`ApplicationsPage.svelte:92`, `:692`). ✔ at code level.
- **AC-T2:** Invalid transition returns `null` and is rejected by background (`background/index.ts:952-958` returns unchanged tracking). ✔

### 2.2 Pipeline summary metrics (`pipeline-summary.ts`)

- **AC-P1:** `trackedCount` excludes `detected` + `archived` (`:62`). ✔
- **AC-P2:** `activeCount` counts only active statuses (selected/application_prepared/applied/interview/offer) (`:69`). ✔
- **AC-P3:** `dueFollowUps` = missions with `nextActionAt <= now`. ✘ **See bug #1** — currently counts terminal (accepted/rejected) missions too.
- **AC-P4:** `preparedNotApplied` = count of `application_prepared`. ✔
- **AC-P5:** `acceptanceRate` = `round(accepted/(accepted+rejected)*100)`, `null` when no outcomes (`:108`). ✔
- **AC-P6:** `bottleneck` = active stage with the highest count (`:84-93`); ties resolved to earliest active stage (strict `>`). ✔

### 2.3 Recommended follow-up card (`ApplicationsPage.svelte:105-120`)

- **AC-R1:** If any due mission exists, recommend the earliest-due one. ✔ (logic) — **but includes terminal missions, bug #1.**
- **AC-R2:** Else if a `application_prepared` mission exists, recommend it. ✔
- **AC-R3:** Else recommend the first tracked mission. ✔

### 2.4 Overdue relance ("Relance à faire")

- **AC-O1:** When `dueFollowUps > 0`, story severity = attention, statusLabel "Relance à faire", pluralized title (`:144-154`). ✔
- **AC-O2:** `isTrackingDue` uses `getNextActionTimestamp <= now`; missions with no `nextActionAt` → `Infinity` → never due (`:204-215`). ✔

### 2.5 Next-action date

- **AC-N1:** Input bound to `datetime-local`; ISO↔local conversion via `isoToDateTimeLocal` / `dateTimeLocalToIso` (`:257-279`). ✔
- **AC-N2:** Empty input → `null` → clears next action. ✔
- **AC-N3:** Persisted via `UPDATE_TRACKING_DETAILS` (`tracking.svelte.ts:77-95`). ✘ **See bug #3** (toast lies on failure).

### 2.6 TJM analysis (`tjm-history/index.ts`)

- **AC-J1:** `analyzeTJMHistory` returns `null` for empty history (`:577`). ✔
- **AC-J2:** `junior.median ≤ confirmed.median ≤ senior.median` enforced (`:454-470`). ✔
- **AC-J3:** Region insights sorted by average desc; `other` excluded unless ≥2 samples (`:560-563`). ✔
- **AC-J4:** Median computed (rounded) per range (`medianOf`, `:321-331`). ✔

### 2.7 Gauge vs profile target / écart sign (`TJMDashboard.svelte`)

- **AC-G1:** `userTargetDelta = userTargetMedian - selectedMarketRange.median` (`:56-60`); positive = above market, negative = below. ✔
- **AC-G2:** Positioning card shown only when both target range and selected seniority range exist (`:260`). ✔
- **AC-G3:** Pricing story thresholds: delta > 80 "À justifier"; delta < -80 "Sous-positionné"; |delta| ≤ 50 success. ✔
- **Note:** The real positioning UI is the delta card. `TJMGauge.svelte` is **not** used (dead code).

### 2.8 Seniority / region breakdowns

- **AC-S1:** `selectedMarketRange = analysis[userSeniority ?? 'confirmed']` (`:52`). Falls back to confirmed when no seniority. ✔ (assumes seniority ∈ {junior,confirmed,senior}).
- **AC-S2:** Region list rendered top 8 (`:379`). ✔

### 2.9 Premium gating

- **AC-PR1:** Applications + TJM render only when `premium.isPremium`; otherwise a Premium lock empty-state with CTA to settings (`App.svelte:40-72`, `323-344`). ✔

---

## 3. Edge cases (bounded, risk-based)

| #   | Case                                                 | Expected                                                                                              | Observed                                                                                                      | Risk |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---- |
| E1  | No trackings                                         | `trackedCount=0`, story "Aucun suivi", list falls back to `missions.slice(0,20)` with status detected | OK (`:620`)                                                                                                   | low  |
| E2  | All active overdue                                   | dueFollowUps = activeCount; recommended = most-overdue                                                | OK, but **terminal missions also counted** (bug #1)                                                           | high |
| E3  | `nextActionAt` in past, status `accepted`/`rejected` | should NOT be a relance                                                                               | **counted as due** (bug #1)                                                                                   | high |
| E4  | Empty TJM history                                    | analysis null → dashboard empty state + 3 steps                                                       | OK (`TJMDashboard.svelte:435`)                                                                                | low  |
| E5  | 1 TJM data point                                     | junior=confirmed=senior identical (fallback)                                                          | OK (`sliceIntoThirds` ≤2 → duplicates)                                                                        | low  |
| E6  | Region filter                                        | facade/stub support it                                                                                | **not wired in TJMPage** (bug #5)                                                                             | med  |
| E7  | Profile stack not in any mission                     | filtered history empty → null analysis → "Données absentes"                                           | OK (correct, possibly confusing)                                                                              | low  |
| E8  | `tjmMin > tjmMax` (inverted target)                  | validation error                                                                                      | **not validated** (bug #6)                                                                                    | low  |
| E9  | `userSeniority` absent                               | defaults to confirmed range                                                                           | OK (`:52`)                                                                                                    | low  |
| E10 | Invalid `nextActionAt` string                        | `Date.parse` NaN → treated as not due / input clears                                                  | OK (`:209-210`, `:262-265`)                                                                                   | low  |
| E11 | Rapid transition clicks                              | transition while in-flight                                                                            | `transitionTo` has no guard; dev stub returns degraded record (bug #2)                                        | med  |
| E12 | Premium off                                          | lock screen                                                                                           | OK (`App.svelte`)                                                                                             | low  |
| E13 | `acceptanceRate` with 0 outcomes                     | null → "—"                                                                                            | OK (`pipeline-summary.ts:108`)                                                                                | low  |
| E14 | Very large mission list                              | list capped?                                                                                          | missions list has no virtualization; `max-h-[32rem] overflow-y-auto` (`:619`) — DOM-heavy but bounded by feed | low  |
| E15 | Duplicate stack names (case/spaces)                  | normalized lowercase+trim                                                                             | OK (`extractRecords`, stub filter)                                                                            | low  |

---

## 4. Test results

Command:

```
cd /Users/guy/Developer/dev/pulse/apps/extension && pnpm exec vitest run \
  tests/unit/tracking/pipeline-summary.test.ts \
  tests/unit/tracking/transitions.test.ts \
  tests/unit/tjm-history/analyze.test.ts \
  tests/unit/tjm-history/normalize-region.test.ts \
  tests/unit/tjm-history/tjm-history.test.ts \
  tests/unit/storage/tracking.test.ts \
  tests/unit/ui/AlertBuilderCard.test.ts
```

**Result: 7 files, 134 tests, all PASSING (2.22s).**

| File                                   | Tests | Status |
| -------------------------------------- | ----- | ------ |
| `tracking/pipeline-summary.test.ts`    | 2     | pass   |
| `tracking/transitions.test.ts`         | 38    | pass   |
| `tjm-history/analyze.test.ts`          | 7     | pass   |
| `tjm-history/normalize-region.test.ts` | 38    | pass   |
| `tjm-history/tjm-history.test.ts`      | 45    | pass   |
| `storage/tracking.test.ts`             | 2     | pass   |
| `ui/AlertBuilderCard.test.ts`          | 2     | pass   |

**Coverage gaps (relevant to this domain):**

- `pipeline-summary.test.ts` has only **2** tests. It does NOT cover: terminal-status (accepted/rejected) missions with a past `nextActionAt` (bug #1), bottleneck tie-breaking, or `detected`/`archived` exclusion explicitly for dueFollowUps.
- No component-level tests for `ApplicationsPage.svelte`, `TJMPage.svelte`, `TJMDashboard.svelte`, `ApplicationPipelineSummary.svelte` (pure rendering/derived logic untested).
- No test asserting `UPDATE_TRACKING_DETAILS` / `RESTORE_TRACKING` dev-stub behavior (bug #2).

---

## 5. Suspected bugs

### BUG 1 — Terminal-status missions inflate "Relance à faire" and can be recommended as the dossier to relance

- **Severity: HIGH**
- **Evidence:**
  - `src/lib/core/tracking/pipeline-summary.ts:61-74` — `dueFollowUps` increments via `isDue(...)` for **every** tracking that is not `detected`/`archived`, i.e. including `accepted` and `rejected`.
  - `src/ui/pages/ApplicationsPage.svelte:105-120` — `recommendedTrackedMission` selects the earliest-due mission from `trackedMissions`, which (`:76-79`) only excludes `detected`; terminal missions are eligible.
  - `src/ui/pages/ApplicationsPage.svelte:316-319` — `getRecommendedDossierReason` emits "Relance échue: reprenez ce dossier…" for any due record, including an accepted/rejected one.
  - `src/background/index.ts:952` — transitioning to `accepted`/`rejected` preserves `nextActionAt` (spread in `transitionStatus`), so a stale date survives.
- **Reproduction concept:** Mission with `currentStatus: 'accepted'` and `nextActionAt` in the past (e.g. set a follow-up, then accept). → `pipelineSummary.dueFollowUps` ≥ 1 → header story shows "Relance à faire" (`ApplicationsPage.svelte:144`) and the recommended dossier may be the **accepted** mission with reason "Relance échue".
- **Fix direction:** exclude terminal statuses (`accepted`, `rejected`) from `dueFollowUps` (gate `isDue` behind `ACTIVE_STATUSES`), and/or clear `nextActionAt` on transition to a terminal status; also exclude terminal from `recommendedTrackedMission`.
- **Needs interactive confirmation:** Logic is clear from code; confirm visually that the banner/recommended card renders for an accepted mission with a stale date.

### BUG 2 — Dev stubs degrade Applications transitions and break undo (blocks dev QA)

- **Severity: MEDIUM (dev-only, but blocks functional QA of this domain)**
- **Evidence:**
  - `src/dev/chrome-stubs.ts:450-464` — `UPDATE_TRACKING` returns `history: []`, `nextActionAt: null`, losing the decision history and any saved next-action.
  - `src/dev/chrome-stubs.ts:465-479` — `UPDATE_TRACKING_DETAILS` returns `currentStatus: 'detected'` with empty history, so saving a next action in dev resets the visible status to "Détectée".
  - No `RESTORE_TRACKING` case → falls through to `default` (`:498-500`) returning `null`; `tracking.svelte.ts:107` reads `response.type` on `null` → throws → caught → `error` set, undo silently fails.
- **Reproduction concept (dev):** open Applications → transition any mission → "Historique des décisions" disappears and next-action clears; click "Annuler" in the toast → nothing reverts.
- **Fix direction:** make the dev stubs persist trackings in `localStorage` (mirror `GET_TRACKINGS`) and return the real `transitionStatus`/`{...tracking, nextActionAt}` result; add a `RESTORE_TRACKING` stub.
- **Needs interactive confirmation:** Yes — confirm in the running dev app.

### BUG 3 — Success toast shown even when next-action / clear persists fails

- **Severity: LOW**
- **Evidence:** `src/ui/pages/ApplicationsPage.svelte:362-379` — `saveNextAction` and `clearNextAction` always `await showToast('…', 'success')` after calling `tracking.updateNextActionAt`, which only sets `error` in the store on failure (`src/lib/state/tracking.svelte.ts:89-94`) without throwing.
- **Reproduction concept:** force `UPDATE_TRACKING_DETAILS` to fail (real error path) → user sees "Prochaine action mise à jour" while nothing persisted.
- **Fix direction:** surface `tracking.error` / throw on failure and show an error toast.
- **Needs interactive confirmation:** Only on error injection.

### BUG 4 — `TJMGauge.svelte` is dead code with rendering defects

- **Severity: LOW**
- **Evidence:**
  - Not imported anywhere in `src/` (repo-wide grep finds references only in `docs/`/`README.md`).
  - `src/ui/molecules/TJMGauge.svelte:47,49,65` — literal `\u20ac` placed in template **text** (outside JS strings). Svelte does not interpret `\u` escapes in HTML text, so it renders the literal characters `\u20ac` instead of `€`.
  - `:28-34` — `statusColor` returns `'bg-blueprint-blue'` for all three states (within/below/above), so the marker color never reflects status.
- **Fix direction:** either delete the component or fix the euro glyphs (use `€` directly) and differentiate colors; wire it in if intended.
- **Needs interactive confirmation:** No (currently unreachable).

### BUG 5 — Region filter is supported by facade/stub but not exposed in the TJM page

- **Severity: LOW–MEDIUM** (acceptance gap if region filtering was intended)
- **Evidence:**
  - `src/lib/shell/facades/tjm.facade.ts:10-22` accepts a `region` param; `src/dev/chrome-stubs.ts:277-279` filters records by region.
  - `src/ui/pages/TJMPage.svelte:36` only passes `profileStacks` (stack filter); there is no region selector in `TJMPage` or `TJMDashboard`.
- **Fix direction:** add a region control, or remove the unused branch if out of scope.
- **Needs interactive confirmation:** No.

### BUG 6 — Inverted TJM target (`tjmMin > tjmMax`) is not validated

- **Severity: LOW**
- **Evidence:** `src/ui/organisms/TJMDashboard.svelte:53-62` — `userTargetMedian` and `hasTjmTarget` only check `> 0`, never that `min ≤ max`. An inverted range yields a valid-looking median and écart.
- **Reproduction concept:** profile `tjmMin=700, tjmMax=400` → median 550, delta vs market computed and shown as if coherent.
- **Fix direction:** validate in Profile (or clamp/skip the positioning card when inverted).
- **Needs interactive confirmation:** No.

### BUG 7 — "Overdue" status does not refresh as time passes while the page is idle

- **Severity: LOW**
- **Evidence:** `src/ui/pages/ApplicationsPage.svelte:101-103` computes `pipelineSummary` with `Date.now()` captured at derived-recompute time; nothing schedules a periodic re-evaluation. A mission whose `nextActionAt` becomes due while the panel is open stays "not due" until trackings change.
- **Fix direction:** add a low-frequency timer (e.g. 60s) to retrigger the derived, or accept the staleness.
- **Needs interactive confirmation:** Yes (time-based).

---

## 6. Notes / non-bugs

- `Date.parse` is used inside Core (`pipeline-summary.ts:44`, `transitions.ts:98`) — this is a pure parser (no clock read), consistent with the "no `Date.now()`/`new Date()` in Core" rule.
- Manual note editing is **not exposed** in the Applications UI; `MissionTracking.notes` is only displayed in the decision history (auto-generated notes from `addGeneratedAssetAndMarkPrepared`). `setTrackingNotes` has no UI surface in this page.
- Kit generation (`generate`) always returns no asset in both dev (`chrome-stubs.ts:480-483`) and the real background (`background/index.ts:1055-1061`, `error: 'GENERATION_UNAVAILABLE'`), so the "Kit de candidature" never produces content in any current environment — appears by-design (premium/connected feature not yet shipped). Worth confirming with PM.
- Dev `GET_TRACKINGS` returns hardcoded `mock-0/1/2` (`chrome-stubs.ts:375-449`) independent of `localStorage`; the Applications join relies on mock mission ids matching `mock-N`. DevPanel-injected missions with other ids will not join to trackings.
