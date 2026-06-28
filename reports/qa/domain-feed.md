# QA Report — Feed Domain (domain-feed)

Agent: `domain-feed` · Mode: code-level analysis + unit tests (no Vite/Playwright)
Scope: `src/ui/pages/FeedPage.svelte`, `src/ui/organisms/{MissionFeed,VirtualMissionFeed,FilterBar,MissionComparison,MissionInvestigationDrawer,ScanProgress}.svelte`, `src/ui/molecules/{MissionCard,SearchInput}.svelte`, `src/lib/state/{feed-page,feed}.svelte.ts`, `src/lib/shell/facades/feed-controller.svelte.ts`, `src/lib/shell/scan/{scanner,rescore}.ts`, `src/lib/core/scoring/*`.
Repo: `/Users/guy/Developer/dev/pulse` (extension at `apps/extension/`). All paths below are relative to `apps/extension/` unless absolute.

---

## 1. Inventory

### Routes / pages

| Feature | Role     | Route                                 | Notes                                                |
| ------- | -------- | ------------------------------------- | ---------------------------------------------------- |
| Feed    | **Free** | `src/sidepanel/index.html` → FeedPage | Default landing after onboarding. Not Premium-gated. |

### Components in scope

- `FeedPage.svelte` — page orchestrator. Owns `feed` (store), `controller` (scan orchestration), `page` (UI state), `tracking`. Renders hero (compact/full), action queue, operational story, scan progress, source health, filter toolbar, presets, saved views, mission feed, comparison bar + modal, investigation drawer, tour overlay.
- `VirtualMissionFeed.svelte` — **active** feed renderer (lazy batched, IntersectionObserver). Used by FeedPage (`FeedPage.svelte:14`).
- `MissionFeed.svelte` — **DEAD CODE**. Not imported anywhere (only `VirtualMissionFeed` is imported). Divergent sort logic (see bug #6).
- `FilterBar.svelte` — saved views, source/remote/seniority/stack chips.
- `MissionComparison.svelte` — bottom-sheet modal comparing 2–3 missions + recommendation.
- `MissionInvestigationDrawer.svelte` — full-screen mission detail drawer.
- `ScanProgress.svelte` — progress bar + per-connector status grid.
- `MissionCard.svelte` — card with expand, "Pourquoi ce score ?", actions.
- `SearchInput.svelte` — debounced search (300ms).

### Buttons / inputs

- Scan: hero radar button (`FeedPage.svelte:859,957`), stop button (`:936`), pull-to-refresh (`:769`), keyboard `r` (`feed-page.svelte.ts:884`).
- Filters: favorites pill (`:1148`), hidden pill (`:1176`), sort `<select>` (`:1198`), filters toggle (`:1213`), shortcuts help (`:1234`).
- Presets: priority / remote-compatible / tjm-negotiation / new (`:1260`).
- Card actions: favorite (`MissionCard.svelte:481`), hide (`:500`), compare (`:514`), copy-link (`:532`), open (`:548`), investigate (`:557`), status transitions (`:566`), "Pourquoi ce score ?" toggle (`:319`).
- Comparison: bottom bar "Comparer"/"Annuler" (`FeedPage.svelte:1485,1492`).
- Saved views: save/apply/delete (`FilterBar.svelte:104,125,135`).

### Modals / overlays

- `MissionComparison` (bottom sheet, `{#key}` recreated on set change — `FeedPage.svelte:1502`).
- `MissionInvestigationDrawer` (full-screen).
- `FeedTourOverlay` (4 steps).
- `KeyboardShortcutsHelp`.

### States

- Feed store: `'empty' | 'loading' | 'loaded' | 'error'` (`feed.svelte.ts:3`).
- Feed rendering precedence in `VirtualMissionFeed`: skeleton → error-empty → empty(filter/first-scan) → list(+optional error banner) (`VirtualMissionFeed.svelte:138-252`).
- Scan lifecycle: `controller.isScanning`, `hasPendingMissions` (partial/final), `scanCompleted` (`feed-controller.svelte.ts:185-204`).
- `feedIsColdLoading = isLoading && !hasVisibleFeedMissions` (`FeedPage.svelte:174`) — skeleton only when nothing visible.

### Workflow steps

1. Mount → `controller.init()` → smartLoad (persisted if fresh, else scan) + checkSourceSessions + health snapshots (`feed-controller.svelte.ts:664-697`).
2. `startScan` → `feedStore.load()` (keeps old missions) → `SCAN_START` bridge → SW runs `runScan` (mutex, concurrency 3, dedup, score, optional semantic) → `SCAN_COMPLETE`/`SCAN_PARTIAL_RESULT`/`SCAN_PROGRESS`/`SCAN_ERROR` (`scanner.ts`, `feed-controller.svelte.ts:594-658`).
3. Partial results staged as "pending" until user clicks "Afficher" OR applied immediately if feed empty (`feed-controller.svelte.ts:370-421`).
4. Missions filtered (enabled sources, favorites, hidden, remote/stack/seniority, score bucket, new-only, preset) then sorted (`feed-page.svelte.ts:276-477`).

---

## 2. Acceptance Criteria (testable)

- **AC-FEED-01 Scan trigger**: Given online + enabled connectors, When user clicks radar/`r`/pull-to-refresh, Then `isScanning=true`, progress bar appears, old missions stay visible (no cold-load skeleton if missions exist).
- **AC-FEED-02 States precedence**: Given `error` set + 0 missions, VirtualMissionFeed shows critical error card with "Réessayer". Given `error` + N>0 missions, shows list + small error banner (no full-screen error). Given 0 missions + no error + no filter → "Lancer le scan" empty state. Given 0 missions + filterActive → "Filtre trop strict" empty state.
- **AC-FEED-03 Cold vs warm load**: Skeleton (3 placeholders) renders iff `isLoading && visibleMissions.length===0`. During re-scan with existing missions, feed stays interactive.
- **AC-FEED-04 Card actions**: favorite toggles + toast w/ undo; hide toggles + toast w/ undo; compare caps at 3 (4th disabled); copy-link copies `mission.url` + 1.5s "copié"; open calls `openExternalUrl`; investigate opens drawer.
- **AC-FEED-05 "Pourquoi ce score ?"**: disclosure shows criteria grades (stack/tjm/location/remote) + semantic grade when present; degrades gracefully for legacy missions without `scoreBreakdown`.
- **AC-FEED-06 Filters**: source/remote/seniority/stack chips toggle (single-select source/remote/seniority, multi-select stack); clear-all resets; filterActive dot appears.
- **AC-FEED-07 Sort**: score (desc by `scoreBreakdown.total`), date (newest `scrapedAt`), tjm (desc). Persisted via `setFeedSortBy`.
- **AC-FEED-08 Saved views**: save (≤12), apply restores all filters+sort+search, delete w/ undo toast.
- **AC-FEED-09 Search**: debounced 300ms; matches title/client/description/location/source/stack; empty clears immediately.
- **AC-FEED-10 Presets**: priority(80+), remote-compatible(full/hybrid), tjm-negotiation(<profile min), new(unseen); counts shown; clicking applies filter.
- **AC-FEED-11 Comparison**: requires ≥2 selected; modal ranks by score; recommends best; "Comparer" button only at ≥2.
- **AC-FEED-12 Virtualization @500**: only ~20 cards render initially; IntersectionObserver loads +20 near bottom; filter/sort/search change resets batch to 20.
- **AC-FEED-13 Dedup**: cross-source duplicates collapsed by signature/url/client/title+stack; canonical = highest quality (native source priority).
- **AC-FEED-14 New badge**: mission not in `seenIds` shows "Nouveau" chip; seen tracked via IntersectionObserver (0.5 threshold) batched (120ms flush); badge cleared on mount.
- **AC-FEED-15 Rapid re-scan**: second `startScan` while `isScanning` is a no-op (controller guard); `runScan` throws `MUTEX` (scanner mutex).
- **AC-FEED-16 Filter mid-scan**: toggling filters during scan only re-filters visible (cached) missions; does not corrupt scan.

---

## 3. Edge Cases (bounded, risk-based)

| Case                                                    | Expected                                                                                                                                                               | Evidence / risk                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **0 missions**                                          | Empty state ("Lancer le scan"); hero shows `visibleCount=0`; `formatMissionCount(0)`→"0 mission" (FR singular, correct)                                                | `feed.svelte.ts`, `VirtualMissionFeed.svelte:185`, `FeedPage.svelte:418` |
| **500 missions**                                        | Only 20 cards render, lazy +20; count label "20/500 missions triées"; IntersectionObserver sentinel                                                                    | `VirtualMissionFeed.svelte:78,94-121,246`                                |
| **All-null fields** (client/location/tjm/duration null) | Card omits null blocks (`{#if mission.client}`…); comparison/investigation show "—"/"Non précisé"                                                                      | `MissionCard.svelte:254,430,438`; `MissionComparison.svelte:27-46`       |
| **Duplicate IDs**                                       | Dedup keys cache by id (`dedup.ts:418`); favorites/hidden/comparison use id as key → duplicate ids conflate state. Scanner generates unique ids so low real-world risk | `dedup.ts:418`, `feed-page.svelte.ts:539-543,790`                        |
| **Rapid re-scan**                                       | Controller `if(isScanning) return` + scanner mutex `ScanError('MUTEX')`                                                                                                | `feed-controller.svelte.ts:235`, `scanner.ts:124-126`                    |
| **Toggling filters mid-scan**                           | Safe — filters are pure UI over cached missions; scan runs in SW                                                                                                       | `feed-page.svelte.ts:276-315`, `scanner.ts`                              |
| **Offline**                                             | Scan button disabled; `feedStory` → "Hors ligne" (cache mode); `isOffline` gates shortcuts                                                                             | `FeedPage.svelte:862,965,330-342`, `feed-page.svelte.ts:247,886`         |
| **Premium on/off**                                      | Feed is **free** — no premium gating in this domain. CV/Applications/TJM are gated elsewhere                                                                           | N/A                                                                      |
| **Long strings**                                        | Stack badges capped at 3+`+N` (`MissionCard.svelte:292-297`); saved-view name sliced to 48 (`feed-page.svelte.ts:718`); description `line-clamp-2` when collapsed      | `MissionCard.svelte:308`                                                 |
| **Extremes 0/100 score**                                | Bucket: ≥80 strong, ≥60 good, else weak; grade via `scoreToGrade`; bar min width 5%                                                                                    | `feed-page.svelte.ts:105-119`, `ScanProgress.svelte:72`                  |
| **Empty search vs no-match**                            | Empty → clear immediately; no-match → 0 missions + (if filterActive) filter-empty-state                                                                                | `feed-page.svelte.ts:578-584`, `feed.svelte.ts:6-18`                     |

---

## 4. Test Results

Command: `cd apps/extension && pnpm exec vitest run <10 files>`

| File                                         | Tests   | Result                   |
| -------------------------------------------- | ------- | ------------------------ |
| `tests/unit/state/feed-page.test.ts`         | 9       | ✅ pass                  |
| `tests/unit/state/feed.test.ts`              | 11      | ✅ pass                  |
| `tests/unit/scoring/relevance.test.ts`       | 21      | ✅ pass                  |
| `tests/unit/scoring/dedup.test.ts`           | 19      | ✅ pass                  |
| `tests/unit/scoring/sort-missions.test.ts`   | 8       | ✅ pass                  |
| `tests/unit/scoring/final-score.test.ts`     | 27      | ✅ pass                  |
| `tests/unit/scoring/contract-filter.test.ts` | 12      | ✅ pass                  |
| `tests/unit/scan/scanner.test.ts`            | 13      | ✅ pass                  |
| `tests/unit/scan/rescore.test.ts`            | 3       | ✅ pass                  |
| `tests/unit/ui/MissionCard.test.ts`          | 15      | ✅ pass                  |
| **Total**                                    | **138** | **10 files, 0 failures** |

Duration ~2.9s. Scanner tests confirm: mutex (`MUTEX`), dedup across connectors, partial `onConnectorResult`, unknown-connector error reporting, all-fail → 0 missions + errors.

### Coverage gaps (no behavioral unit tests)

- `VirtualMissionFeed` (batch reset, IntersectionObserver loadMore, count label) — only static string checks in sibling `operational-ui-constraints.test.ts`.
- `MissionComparison` (ranking, score render, recommendation) — no test. **Bug #1 lives here.**
- `MissionInvestigationDrawer`, `ScanProgress`, `FilterBar`, `SearchInput` — no behavior tests.
- `feed-controller.svelte.ts` (partial-scan staging, pending apply, bridge wiring) — no test (Shell; scanner is tested in isolation).

---

## 5. Suspected Bugs

### BUG #1 — MissionComparison "Score" row shows wrong value (semantic instead of fused total)

- **Severity**: medium
- **Evidence**: `src/ui/organisms/MissionComparison.svelte:40-44` (table "Score" render) vs `:49-51` (`getScore`) and `:96-102` (`decisionEvidence`).
  - Table render: `const s = m.semanticScore ?? m.score; return s !== null ? \`${s}/100\` : '—'`
  - `getScore` (used for ranking + evidence): `m.scoreBreakdown?.total ?? m.semanticScore ?? m.score ?? 0`
- **Impact**: When semantic scoring ran (Gemini Nano), a mission with `scoreBreakdown.total=85` (fused from det 90 / sem 78), `semanticScore=78`, `score=85` is **ranked/recommended as 85** (evidence card shows "85/100") but the **comparison table "Score" cell shows "78/100"**. Same mission, two different scores in the same modal. Confusing for the decision the modal exists to support.
- **Root cause**: render omits `scoreBreakdown.total`. Should use `getScore(m)` like everything else.
- **Reproduction concept**: compare 2 missions post-scan with semantic enabled; recommended mission's evidence score ≠ its table score.
- **Needs interactive confirmation**: yes (requires semantic scoring active; in pure dev/mock without Gemini Nano, `semanticScore` is null so it falls back to `score` and the bug is masked).

### BUG #2 — dashboardSummary.newCount / highScoreCount ignore score-bucket filter, can exceed visibleCount

- **Severity**: medium
- **Evidence**: `src/lib/state/feed-page.svelte.ts:317-347` (`dashboardScopeMissions` applies source/remote/stack/seniority/favorites/hidden but **not** `selectedScoreBucket`/`decisionPreset`/`showNewOnly`) vs `:470-487` (`displayMissions`/`visibleCount` apply all filters). `newCount`/`highScoreCount` computed over `dashboardScopeMissions` at `:374-381`.
- **Impact**: With `selectedScoreBucket='strong'`, `visibleCount` may be 2 while `newCount` (total new in the broader scope) is 5. The action queue (`FeedPage.svelte:238-248`) then offers "Qualifier 5" but clicking it (`showNewMissions`→`toggleNewOnly`, `feed-page.svelte.ts:501-506,650-656`) does **not** clear the score bucket, so the user still sees only the strong+new subset — the "5" is misleading.
- **Reproduction concept**: 5 new missions, 2 with score≥80; select "Prioritaires" bucket; dashboard/action-queue still advertises 5 new.
- **Needs interactive confirmation**: yes (visual count mismatch).

### BUG #3 — Hero "visible" count diverges from feed count under alert-only view

- **Severity**: low
- **Evidence**: `FeedPage.svelte:833` (compact hero) and `:1077` (stats grid "Visibles") show `page.visibleCount` (= `displayMissions.length`), while the feed header at `:1386` shows `visibleFeedMissionCount` = `showAlertOnly ? alertMissions : displayMissions` (`FeedPage.svelte:171-172`).
- **Impact**: When "Traiter en alerte" is active (`showAlertOnly=true`), hero says e.g. "10 missions" while feed header says "3 missions". Mildly contradictory counts on the same screen.
- **Needs interactive confirmation**: yes.

### BUG #4 — feedStory critical "Impossible de récupérer les missions" title while cached missions are visible

- **Severity**: low (messaging/cosmetic; relates to prior-audit "contradictory empty-vs-error state")
- **Evidence**: `FeedPage.svelte:317-328`. When `page.error` is set, `feedStory` returns severity `critical`, statusLabel "Incident", title "Impossible de récupérer les missions" **regardless of whether missions are visible**. The VirtualMissionFeed below correctly shows the cached list + a small error banner (`VirtualMissionFeed.svelte:199-206`).
- **Impact**: Top story screams "Impossible to retrieve" while the feed shows data. The description ("Les dernières données restent disponibles") mitigates it, but the title/severity is alarmist when data exists. The VirtualMissionFeed empty-vs-error precedence itself is **correct/resolved**; this is a residual messaging mismatch in the hero story.
- **Needs interactive confirmation**: yes (trigger a scan error with cached missions present).

### BUG #5 — VirtualMissionFeed resets batch count on filter change but not scroll position

- **Severity**: low (UX)
- **Evidence**: `VirtualMissionFeed.svelte:81-92` — when `resetKey` changes, `visibleCount` resets to `BATCH_SIZE` (20), but the parent `feedScrollContainer` scroll offset is not reset.
- **Impact**: User scrolled deep (e.g. viewing items 200–220) changes a filter → list shrinks back to 20 items but viewport stays low → user sees blank space below the shortened list; the IntersectionObserver sentinel may not be in view to auto-load. Not a data bug, but a jarring scroll-restore gap.
- **Needs interactive confirmation**: yes.

### BUG #6 — Dead `MissionFeed.svelte` has divergent score-sort (re-wiring hazard)

- **Severity**: low (latent)
- **Evidence**: `src/ui/organisms/MissionFeed.svelte` is **not imported** anywhere (FeedPage uses `VirtualMissionFeed`). Its sort at `:53-61` uses `(b.score ?? 0) - (a.score ?? 0)` — **legacy `score` only**, ignoring `scoreBreakdown.total` and `semanticScore`, unlike the canonical `sort-missions.ts:9-10` (`scoreBreakdown?.total ?? semanticScore ?? score ?? 0`) used by the live path (`feed-page.svelte.ts:476`).
- **Impact**: No current functional impact (dead code), but if someone re-wires `MissionFeed` (e.g. for a non-virtual fallback), sorting would silently differ from the rest of the app. Recommend delete or align.
- **Needs interactive confirmation**: no (static).

### BUG #7 — SearchInput `export function focus()/clear()/getValue()` are invalid/no-op in Svelte 5 runes

- **Severity**: low (dead exports, no functional break)
- **Evidence**: `src/ui/molecules/SearchInput.svelte:35-45`. In Svelte 5 runes mode, instance-level `export function` does **not** expose callable methods to the parent (no module context). The keyboard shortcut instead uses the bound `inputRef` directly (`feed-page.svelte.ts:906` `searchInputRef?.focus()`), which works because `inputRef` is the real `<input>` element.
- **Impact**: The three exports are misleading dead code; `clear()`/`getValue()` are never effectively callable from a parent. No current breakage. Recommend remove or convert to a proper API.
- **Needs interactive confirmation**: no (static).

### BUG #8 — comparisonMissions sourced from search-filtered missions, ignoring hide/source filters

- **Severity**: low
- **Evidence**: `feed-page.svelte.ts:479-485` builds `comparisonMissions` from `missions` (= `feedStore.filteredMissions`, search-only). It does **not** pass through `sourceCountBaseMissions`/hidden filtering.
- **Impact**: A mission that was selected for comparison then **hidden** (or excluded by a later source/stack filter) still appears in the comparison modal. Minor consistency gap; arguably acceptable (comparison is an explicit selection).
- **Needs interactive confirmation**: yes.

### BUG #9 — Inconsistent `getMissionScore` resolution across sort vs display/bucket for legacy missions

- **Severity**: low (theoretical for scanner output)
- **Evidence**: `sort-missions.ts:9-10` resolves `scoreBreakdown?.total ?? semanticScore ?? score ?? 0`; `feed-page.svelte.ts:101-103` and `MissionCard.svelte:71` resolve `scoreBreakdown?.total ?? score ?? 0` (no `semanticScore` fallback).
- **Impact**: For a mission with **no `scoreBreakdown`** but a non-null `semanticScore` (not produced by the current scanner, which only sets `semanticScore` alongside a breakdown — `scanner.ts:511`), sort order would rank it by `semanticScore` while the displayed score / score-bucket treat it as 0. Consistency hazard for hand-crafted/legacy data. Low real-world likelihood.
- **Needs interactive confirmation**: no (static; data-shape dependent).

---

## 6. Notes / positives

- Empty-vs-error-loading precedence in `VirtualMissionFeed` is **correct and well-ordered** (the prior-audit contradiction is resolved at the feed-list level; residual is only the hero story title — BUG #4).
- Rapid re-scan is doubly guarded (controller `isScanning` + scanner mutex `MUTEX`) — AC-FEED-15 satisfied.
- Seen-id writes are batched (120ms) and tested (`feed-page.test.ts:415-445`).
- Dedup uses an inverted-token index (not naive O(n²)) and is well tested (19 tests); cross-source canonical priority is explicit (`dedup.ts:26-32`).
- Semantic scoring is correctly non-blocking and gated by `usingDefaultProfile` (`scanner.ts:502`).
- `init()` failures are surfaced (`feed-controller.svelte.ts:702-705`) — avoids the "isScanning never resets" silent-failure trap noted in the code comment.
