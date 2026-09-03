# Feed Filter Bottom Sheet Model

Source of truth for the Mission feed filter bottom sheet, informed by Notion's
mobile filtering and sorting sheets. Existing deterministic feed filtering
remains authoritative for which missions match. This model owns opening the
sheet, changing the live filter projection, resetting it, and closing the
sheet.

The workflow is synchronous and UI-local. It does not require an XState actor:
there is no I/O, retry timer, concurrent worker, persistence acknowledgement or
long-running effect. A pure transition function is the executable projection
consumed by the Svelte page.

## State and context

```ts
interface FeedFilterDraft {
  decisionPreset: 'priority' | 'remote-compatible' | 'tjm-negotiation' | 'new' | null;
  selectedScoreBucket: 'strong' | 'good' | 'weak' | null;
  selectedTjmMin: number | null;
  selectedSource: MissionSource | null;
  selectedRemote: RemoteType | null;
  selectedSeniority: SeniorityLevel | null;
  selectedStacks: string[];
}

type FeedFilterSheetState =
  { value: 'closed' } | { value: 'open'; filters: FeedFilterDraft } | { value: 'disposed' };
```

The open-state filter snapshot is immutable. Arrays are copied at every model
boundary so the page state and emitted command never alias one another.

## Events

```ts
type FeedFilterSheetEvent =
  | { type: 'OPEN'; committed: FeedFilterDraft }
  | { type: 'TOGGLE_PRESET'; preset: NonNullable<FeedFilterDraft['decisionPreset']> }
  | { type: 'SET_SCORE_BUCKET'; bucket: FeedFilterDraft['selectedScoreBucket'] }
  | { type: 'SET_TJM_MIN'; tjmMin: FeedFilterDraft['selectedTjmMin'] }
  | { type: 'SET_SOURCE'; source: FeedFilterDraft['selectedSource'] }
  | { type: 'SET_REMOTE'; remote: FeedFilterDraft['selectedRemote'] }
  | { type: 'SET_SENIORITY'; seniority: FeedFilterDraft['selectedSeniority'] }
  | { type: 'TOGGLE_STACK'; stack: string }
  | { type: 'RESET_FILTERS' }
  | { type: 'DISMISS'; reason: 'button' | 'scrim' | 'escape' | 'page-hidden' }
  | { type: 'DISPOSE' };
```

## Commands

```ts
type FeedFilterSheetCommand = { type: 'NONE' } | { type: 'SYNC_FILTERS'; filters: FeedFilterDraft };
```

Every accepted filter edit emits exactly one `SYNC_FILTERS` command. The page
consumes it synchronously, so the mission list and live result count change
while the sheet remains open. Closing never replays or rolls back filters.

## Transition table

| From       | Event                                              | Guard                      | To         | Command / effect                                     |
| ---------- | -------------------------------------------------- | -------------------------- | ---------- | ---------------------------------------------------- |
| `closed`   | `OPEN(committed)`                                  | filters structurally valid | `open`     | Copy committed filters into the open state.          |
| `closed`   | edit / reset / dismiss                             | —                          | `closed`   | None.                                                |
| `open`     | preset / score / TJM / source / remote / seniority | payload is canonical       | `open`     | Normalize, copy and emit `SYNC_FILTERS`.             |
| `open`     | `TOGGLE_STACK(stack)`                              | trimmed stack is non-empty | `open`     | Add/remove one unique stack; emit `SYNC_FILTERS`.    |
| `open`     | `RESET_FILTERS`                                    | —                          | `open`     | Empty every sheet-owned filter; emit `SYNC_FILTERS`. |
| `open`     | `DISMISS(*)`                                       | —                          | `closed`   | Close only; current live filters remain committed.   |
| any live   | `DISPOSE`                                          | —                          | `disposed` | Drop filter snapshot and accept no later event.      |
| `disposed` | any                                                | —                          | `disposed` | None.                                                |

Preset normalization is deterministic:

- selecting the already selected preset clears it;
- selecting `priority` clears a score bucket so two score authorities do not
  conflict;
- selecting `remote-compatible` clears an explicit remote mode;
- selecting `tjm-negotiation` clears an explicit TJM minimum;
- selecting an explicit score bucket or remote mode clears the conflicting
  preset when required;
- selecting an explicit positive finite TJM minimum clears the conflicting
  `tjm-negotiation` preset; invalid values are ignored and accepted values are
  rounded to whole euros;
- `tjm-negotiation` uses the profile TJM target already owned by the feed;
- selecting `new` uses the existing stable-new queue projection.

## Presentation projection

- `closed`: the sheet and scrim do not exist; the filter trigger reports
  `aria-expanded="false"`.
- `open`: the trigger reports `aria-expanded="true"`; a modal scrim covers the
  complete Feed, including the dock, and a structured sheet is anchored to the
  lower edge. Three quick-filter pills sit above explicit rows for minimum
  grade and minimum TJM, followed by the connector source section.
- The sheet uses a white surface, a large rounded top edge and a centered grab
  handle. It occupies about 70% of the available height, slides vertically from
  the lower edge and leaves enough space above its top edge for a detached
  circular close control.
- The source section shows every connector returned by the build-filtered
  catalog as a real-logo selector. It also projects deterministic mission counts
  into a compact coverage list and proportional native progress indicators.
- Source selection remains canonical and single-valued: `null` means every
  shipped source is included; selecting one logo dispatches `SET_SOURCE` for
  that source; selecting the active logo again dispatches `SET_SOURCE(null)`.
- Connector counts, logo loading and bar widths are presentation signals only.
  They cannot select a source or dispatch a transition.
- The detached close control is outside the sheet surface, remains visually
  associated with the filter trigger, and is the primary way to regain direct
  control of the dimmed Feed. The scrim is a secondary dismissal target.
- The dock remains mounted beneath the scrim in both states so its geometry does
  not jump, but it is not operable while the modal sheet is open.
- Initial focus moves to the outline-free sheet container. Closing returns
  focus to the dock trigger when it remains connected.
- `Escape`, the explicit `Terminer` action, the detached close button, a scrim
  click and a hidden Feed page dispatch `DISMISS`.
- Reduced motion sets the scrim and sheet-slide durations to zero without
  changing state, focus or filter results.

## Side effects and ownership

- Opening and closing perform no I/O and do not alter filters.
- Accepted edits and reset emit one typed synchronous command. The existing
  `feed-page.svelte.ts` filter projection owns the resulting mission list.
- The explicit TJM selector filters missions at or above its selected value.
  The existing `tjm-negotiation` preset remains available as a distinct quick
  decision preset and cannot be active at the same time.
- Source coverage reads the existing deterministic Feed aggregate. A missing
  count is displayed as zero and does not imply a connector error or disabled
  state.
- A failed connector favicon falls back to the connector initials without
  changing selection or count data.
- Search is owned by the center dock input. Operational details are owned by
  the right dock action. Neither is decided by this model.
- The sheet never starts a scan, changes a connector, persists a view or opens
  an external URL.

## Error, cancellation, retry and permission review

- **Invalid/unknown event:** ignored with `NONE`; state remains unchanged.
- **Invalid stack text:** empty or whitespace-only values are ignored.
- **Invalid TJM:** non-finite and non-positive values are ignored.
- **Missing source count:** normalized to zero for presentation.
- **Logo failure:** shows the deterministic initials fallback; no retry or state
  transition is performed by the sheet.
- **Dismissal:** closes the sheet without emitting a duplicate sync. Changes
  already synced remain visible by design.
- **Rapid open/close:** `OPEN` while already open is ignored, so a duplicate
  trigger cannot replace the live snapshot.
- **Page navigation:** `page-hidden` closes before the Feed becomes inert;
  returning to Missions starts closed with the latest live filters.
- **Offline:** local filtering remains available; no network retry exists.
- **Permissions:** no permission is requested or interpreted.
- **Retry:** there is no asynchronous operation to retry.
- **Terminal state:** `disposed` is terminal and contains no snapshot.

## Forbidden transitions

- No filter mutation while closed or disposed.
- No implicit rollback from close, scrim, Escape, navigation or unmount.
- No unknown preset, source, remote value, seniority or score bucket.
- No duplicated stack.
- No animation callback, rendered copy or LLM output chooses a filter state.

## Invariants

1. At most one filter bottom sheet is open for a Feed page instance.
2. Closed and disposed states retain no filter snapshot.
3. Open arrays never alias committed arrays or emitted command arrays.
4. Exactly one `SYNC_FILTERS` command is emitted per accepted edit or reset.
5. Every dismissal path emits `NONE`.
6. Conflicting preset and explicit-filter authorities are normalized.
7. The dock remains mounted and visually separated from feed content; the open
   modal sheet blocks it from interaction.
8. The model, not component copy, animation timing or an LLM, decides filtering.
9. Source counts and logo load outcomes never decide source selection.
10. The source selector exposes only connectors present in the build-filtered
    catalog.

## Review result

- [x] Nominal open, live edit, reset and close paths are explicit.
- [x] Detached close control, Terminer, scrim, Escape, route change and disposal are explicit.
- [x] Duplicate open, edits while closed and invalid input are covered.
- [x] Offline, permissions, errors, retry absence and terminal disposal are covered.
- [x] Conflicting preset and explicit fields cannot create implicit authority.
- [x] Bottom-sheet motion is reversible, presentation-only and reduced-motion safe.
- [x] Source selection, deselection, zero-count and logo-fallback behavior are explicit.
- [x] Every mission change remains owned by deterministic Feed page state.
