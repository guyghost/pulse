# Spec: MVP Feed Interaction

## Objective

Formalize the five core feed interactions — see, favorite, filter, sort, and search —
with testable acceptance criteria grounded in the actual implementation.

The feed is where users spend the majority of their time. This spec serves as the
canonical reference for these interactions, ensuring future changes don't silently
break expected behavior and providing new contributors a single source of truth.

## Scope

| #    | Interaction                      | Primary state module                                            |
| ---- | -------------------------------- | --------------------------------------------------------------- |
| US-1 | Mark missions as seen            | `feed-page.svelte.ts` → `seen-missions.ts`                      |
| US-2 | Favorite / hide missions         | `feed-page.svelte.ts` → `favorites.ts`                          |
| US-3 | Filter missions (multi-criteria) | `feed-page.svelte.ts`                                           |
| US-4 | Sort missions                    | `feed-page.svelte.ts` → `sort-missions.ts` / `rank-missions.ts` |
| US-5 | Search missions                  | `feed.svelte.ts`                                                |

**Out of scope:** mission detail panel, comparison, keyboard shortcuts, saved views,
scan triggering, onboarding. These are documented elsewhere or are secondary to the
core feed loop.

## Architecture Context

- **State:** Svelte 5 runes (`$state`, `$derived`) in `src/lib/state/`.
- **Persistence:** `chrome.storage.local` for seen IDs, favorites, hidden, and sort
  preference. IndexedDB for missions (loaded via `getMissions()`).
- **Core/Shell split:** all filtering and scoring logic lives in pure Core functions
  (`filterFavoritesOnly`, `filterHidden`, `sortMissions`, `rankMissions`,
  `recomputeFilteredMissions`). The state modules orchestrate I/O and delegate
  computation to Core.
- **No direct storage access from UI:** the side panel reads/writes persistence
  through facade functions, never touching `chrome.*` or IndexedDB directly.

---

## US-1: Mark Missions as Seen

**As a** consultant
**I want** missions I've already looked at to be visually distinguished from new ones
**So that** I don't re-read the same opportunities.

### Acceptance Criteria

1. **AC-1.1 — Mark on view:** When a mission card enters the viewport (or is clicked),
   `handleMissionSeen(missionId)` queues it for seen-marking.

2. **AC-1.2 — Debounced persistence:** Seen IDs are flushed to storage in batches with
   a 120 ms debounce (`SEEN_FLUSH_MS`). Rapid scrolling does not produce one write per
   card.

3. **AC-1.3 — Persists across sessions:** Seen IDs are stored in `chrome.storage.local`
   under the key `seenMissionIds` and reloaded on panel mount via `getSeenIds()`.

4. **AC-1.4 — Idempotent:** Re-marking an already-seen mission is a no-op
   (`pendingSeenIds` deduplicates).

5. **AC-1.5 — Flush on unmount:** `dispose()` flushes any pending seen IDs before the
   component unmounts, preventing data loss.

6. **AC-1.6 — "New" count accurate:** `dashboardSummary.newCount` reflects missions not
   in `seenSet`, scoped to the visible/filtered set.

### Implementation Reference

| Component        | Location                                                                         |
| ---------------- | -------------------------------------------------------------------------------- |
| Event handler    | `feed-page.svelte.ts` → `handleMissionSeen`, `scheduleSeenFlush`, `flushSeenIds` |
| Pure computation | `core/seen/mark-seen.ts` → `markAsSeen(seenIds, newIds)`                         |
| Persistence      | `shell/storage/seen-missions.ts` → `getSeenIds`, `saveSeenIds`                   |

### Edge Cases

- **Storage unavailable:** `saveSeenIds` failures are swallowed (non-critical). The
  in-memory `seenIds` state is still updated for the current session.
- **Empty flush:** `flushSeenIds` returns early if `pendingSeenIds` is empty.

---

## US-2: Favorite and Hide Missions

**As a** consultant
**I want** to bookmark promising missions and hide irrelevant ones
**So that** I can build a shortlist and reduce noise.

### Acceptance Criteria

1. **AC-2.1 — Toggle favorite:** `handleToggleFavorite(id)` adds/removes the mission
   from the favorites map with an ISO timestamp.

2. **AC-2.2 — Toggle hidden:** `handleHide(id)` adds/removes the mission from the
   hidden map with a timestamp.

3. **AC-2.3 — Persists across sessions:** Favorites stored under `favorites` key,
   hidden under `hidden` key in `chrome.storage.local`. Both reloaded on mount.

4. **AC-2.4 — Undo toast:** Both actions show a toast with an "Annuler" (Undo) button
   that reverts the state and re-persists the previous value.

5. **AC-2.5 — Favorites filter:** Toggling `showFavoritesOnly` filters the feed to
   favorited missions only via `filterFavoritesOnly(result, favorites)`.

6. **AC-2.6 — Hidden filter:** By default, hidden missions are excluded via
   `filterHidden(result, hidden)`. Toggling `showHidden` reveals them.

7. **AC-2.7 — Counts:** `favoriteCount` and `hiddenCount` are derived from the maps
   and reactive.

### Implementation Reference

| Component        | Location                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Event handlers   | `feed-page.svelte.ts` → `handleToggleFavorite`, `handleHide`                                            |
| Pure computation | `core/favorites/favorites.ts` → `toggleFavorite`, `toggleHidden`, `filterFavoritesOnly`, `filterHidden` |
| Persistence      | `shell/storage/favorites.ts` → `getFavorites`, `saveFavorites`, `getHidden`, `saveHidden`               |
| Toast            | `shell/notifications/toast-service.ts` → `showToastAction`                                              |

### Edge Cases

- **Undo after storage failure:** The undo handler re-persists the previous state
  best-effort; if storage is unavailable the in-memory state still reverts for the
  current session.

---

## US-3: Filter Missions (Multi-Criteria)

**As a** consultant
**I want** to narrow the feed by source, remote type, seniority, tech stack, and score
**So that** I can focus on missions matching my criteria.

### Acceptance Criteria

1. **AC-3.1 — Source filter:** `setSelectedSource(source)` filters to a single
   connector source (`free-work`, `lehibou`, `hiway`, `collective`, `cherry-pick`,
   `malt`). `null` clears it.

2. **AC-3.2 — Remote filter:** `setSelectedRemote(remote)` filters by work mode
   (`full`, `hybrid`, `onsite`). `null` clears it.

3. **AC-3.3 — Seniority filter:** `setSelectedSeniority(level)` filters by
   `junior`, `confirmed`, or `senior`. `null` clears it.

4. **AC-3.4 — Stack filter (multi-select):** `toggleStack(stack)` toggles individual
   stacks. A mission passes if it contains **at least one** of the selected stacks.
   Empty selection = no stack filtering.

5. **AC-3.5 — Score bucket filter:** `setSelectedScoreBucket(bucket)` filters by
   score band:
   - `strong`: score ≥ 80
   - `good`: 60 ≤ score < 80
   - `weak`: score < 60

6. **AC-3.6 — Decision presets:** `applyDecisionPreset(preset)` applies a quick-filter:
   - `priority`: score ≥ 80
   - `remote-compatible`: `remote === 'full' \|\| 'hybrid'`
   - `tjm-negotiation`: TJM below profile minimum
   - `new`: not in seen set
     Toggling the active preset clears it.

7. **AC-3.7 — New-only toggle:** `toggleNewOnly()` filters to unseen missions.

8. **AC-3.8 — Composable:** All filters combine with AND logic. A mission must pass
   every active filter to appear.

9. **AC-3.9 — Clear all:** `clearAllFilters()` resets every filter to its default
   (null/empty) state.

10. **AC-3.10 — Filter indicator:** `filterActive` is `true` when any filter is
    engaged, enabling a "clear" affordance in the UI.

11. **AC-3.11 — Performance:** Combined filtering of ≤ 500 missions completes in
    < 100 ms (in-memory `$derived` recomputation, no I/O in the hot path).

### Implementation Reference

| Component               | Location                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Filter state + handlers | `feed-page.svelte.ts` → `sourceCountBaseMissions` derived, `setSelected*`, `toggleStack`, `applyDecisionPreset`, `clearAllFilters` |
| Score bucket helper     | `feed-page.svelte.ts` → `getScoreBucket(score)`                                                                                    |
| Facet counts            | `feed-page.svelte.ts` → `feedAggregates` derived (score distribution, preset counts)                                               |

### Edge Cases

- **Null mission fields:** Missions with `remote === null` or `seniority === null` are
  excluded when the corresponding filter is active (they don't match any specific
  value).
- **Preset vs explicit filter:** Applying `priority` preset clears an active
  `selectedScoreBucket`, and vice versa, to avoid conflicting states.

---

## US-4: Sort Missions

**As a** consultant
**I want** to order the feed by relevance, recency, or daily rate
**So that** the most actionable missions are at the top.

### Acceptance Criteria

1. **AC-4.1 — Sort modes:** `sortBy` accepts three values: `score` (default), `date`,
   `tjm`.

2. **AC-4.2 — Score (composite ranking):** When `sortBy === 'score'`, missions are
   ordered by `rankMissions()` — a composite of relevance (existing score) and
   freshness (publication recency), with source diversity interleaving. See
   `rank-missions.ts`.

3. **AC-4.3 — Date:** When `sortBy === 'date'`, missions are sorted newest-first by
   `scrapedAt` timestamp via `sortMissions(missions, 'date')`.

4. **AC-4.4 — TJM:** When `sortBy === 'tjm'`, missions are sorted highest-TJM-first.
   Null TJM is treated as 0.

5. **AC-4.5 — Persists across sessions:** The selected sort mode is stored in
   `chrome.storage.local` via `setFeedSortBy()` and restored on mount via
   `getFeedSortBy()`.

6. **AC-4.6 — No mutation:** Sorting returns a new array; the input is not mutated.

7. **AC-4.7 — Sort applies post-filter:** Sorting is applied to the filtered set
   (`displayMissions`), not the raw mission list.

### Implementation Reference

| Component         | Location                                                             |
| ----------------- | -------------------------------------------------------------------- |
| Sort dispatch     | `feed-page.svelte.ts` → `displayMissions` derived                    |
| Composite ranking | `core/scoring/rank-missions.ts` → `rankMissions`                     |
| Single-key sort   | `core/scoring/sort-missions.ts` → `sortMissions`                     |
| Persistence       | `shell/storage/chrome-storage.ts` → `getFeedSortBy`, `setFeedSortBy` |

### Edge Cases

- **Null scores:** Treated as 0 for ranking purposes.
- **Equal scores:** Stable within source group (round-robin preserves bucket order).
- **Future-dated missions:** Freshness score caps at 100.

---

## US-5: Search Missions

**As a** consultant
**I want** to free-text search across mission details
**So that** I can quickly find missions mentioning a specific technology or client.

### Acceptance Criteria

1. **AC-5.1 — Searchable fields:** The query matches against a concatenated string of:
   `title`, `client`, `description`, `location`, `source`, and all `stack` entries.

2. **AC-5.2 — Case-insensitive:** Both the query and the searchable text are
   lowercased before matching.

3. **AC-5.3 — Substring match:** A mission matches if the lowercased query appears as
   a substring anywhere in the searchable text.

4. **AC-5.4 — Debounced:** Non-empty queries are debounced with a 300 ms delay
   (`SEARCH_DEBOUNCE_MS`) to avoid recomputing on every keystroke.

5. **AC-5.5 — Instant clear:** An empty query clears the search immediately (no debounce
   wait).

6. **AC-5.6 — Composable with filters:** Search is applied first (in the feed store),
   then filters and sort are applied to the search-filtered set.

7. **AC-5.7 — No match:** If no missions match, the feed shows an empty state (not an
   error).

8. **AC-5.8 — Performance:** Search over ≤ 500 missions completes in < 100 ms
   (single-pass filter, no I/O).

### Implementation Reference

| Component            | Location                                                     |
| -------------------- | ------------------------------------------------------------ |
| Search input handler | `feed-page.svelte.ts` → `handleSearch` (debounce)            |
| Search filter (pure) | `feed.svelte.ts` → `recomputeFilteredMissions`               |
| Feed store state     | `feed.svelte.ts` → `searchQuery`, `filteredMissions` derived |

### Edge Cases

- **Whitespace-only query:** Treated as empty (`.trim()` guard) → clears search.
- **Special characters:** No regex or wildcard support; plain substring match.

---

## Non-Functional Requirements

| Requirement                            | Target                               | Rationale                                                       |
| -------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| Filter + sort latency (≤ 500 missions) | < 100 ms                             | Feed must feel instant; all computation is in-memory `$derived` |
| Search debounce                        | 300 ms                               | Balance responsiveness vs recomputation cost                    |
| Seen-mark debounce                     | 120 ms                               | Batch writes without visible lag                                |
| Persistence                            | `chrome.storage.local`               | Survives browser restarts; isolated per-extension               |
| Immutability                           | All Core functions return new arrays | No mutation of input state                                      |

## Test References

| Interaction               | Test file                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Sort (single-key)         | `tests/unit/scoring/sort-missions.test.ts`                                                         |
| Rank (composite)          | `tests/unit/scoring/rank-missions.test.ts`                                                         |
| Mark as seen              | `tests/unit/scoring/dedup.test.ts` (mark-seen pattern), `tests/unit/storage/seen-missions.test.ts` |
| Favorites                 | `tests/unit/storage/favorites.test.ts`                                                             |
| Smart notification filter | `tests/unit/scoring/smart-notification.test.ts`                                                    |

## Change Log

| Date       | Change                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| 2026-07-02 | Initial spec (#59). Documents existing implementation as canonical reference. |
