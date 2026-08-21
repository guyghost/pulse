# Feed Filter Popover Model

Source of truth for the Mission feed filter popover selected in the revised
MissionPulse option-1 visual. Existing deterministic feed filtering remains
authoritative for which missions match. This model owns opening the popover,
changing the live filter projection, resetting it, and closing the popover.

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
while the popover remains open. Closing never replays or rolls back filters.

## Transition table

| From       | Event                                              | Guard                      | To         | Command / effect                                       |
| ---------- | -------------------------------------------------- | -------------------------- | ---------- | ------------------------------------------------------ |
| `closed`   | `OPEN(committed)`                                  | filters structurally valid | `open`     | Copy committed filters into the open state.            |
| `closed`   | edit / reset / dismiss                             | —                          | `closed`   | None.                                                  |
| `open`     | preset / score / TJM / source / remote / seniority | payload is canonical       | `open`     | Normalize, copy and emit `SYNC_FILTERS`.               |
| `open`     | `TOGGLE_STACK(stack)`                              | trimmed stack is non-empty | `open`     | Add/remove one unique stack; emit `SYNC_FILTERS`.      |
| `open`     | `RESET_FILTERS`                                    | —                          | `open`     | Empty every popover-owned filter; emit `SYNC_FILTERS`. |
| `open`     | `DISMISS(*)`                                       | —                          | `closed`   | Close only; current live filters remain committed.     |
| any live   | `DISPOSE`                                          | —                          | `disposed` | Drop filter snapshot and accept no later event.        |
| `disposed` | any                                                | —                          | `disposed` | None.                                                  |

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

- `closed`: the popover and scrim do not exist; the filter trigger reports
  `aria-expanded="false"`.
- `open`: the trigger reports `aria-expanded="true"`; the feed behind the
  floating cluster is softly dimmed and a structured popover rises above it.
  Three quick-filter pills sit above explicit rows for minimum grade, minimum
  TJM and source.
- The bottom controls are a floating capsule centered over the scrolling feed —
  never a full-width shelf: no hairline, no upward shadow wall, no bar
  background. It hosts the search input, the filter trigger and the operational
  details trigger; feed content scrolls beneath it.
- The popover intro and outro share one reversible rise: opacity with a 10px
  lift and a 0.98→1 scale over ~240ms, ease-out. No blur deformation, no tail,
  no directional transform origin.
- Initial focus moves to the outline-free popover container. Closing returns
  focus to the floating filter trigger when it remains connected.
- `Escape`, the explicit `Terminer` action, the close icon, a scrim click and a
  hidden Feed page dispatch `DISMISS`.
- Reduced motion sets the scrim and rise durations to zero without changing
  state, focus or filter results.

## Side effects and ownership

- Opening and closing perform no I/O and do not alter filters.
- Accepted edits and reset emit one typed synchronous command. The existing
  `feed-page.svelte.ts` filter projection owns the resulting mission list.
- The explicit TJM selector filters missions at or above its selected value.
  The existing `tjm-negotiation` preset remains available as a distinct quick
  decision preset and cannot be active at the same time.
- Search is owned by the capsule search input. Operational details are owned by
  the trailing capsule action. Neither is decided by this model.
- The popover never starts a scan, changes a connector, persists a view or opens
  an external URL.

## Error, cancellation, retry and permission review

- **Invalid/unknown event:** ignored with `NONE`; state remains unchanged.
- **Invalid stack text:** empty or whitespace-only values are ignored.
- **Invalid TJM:** non-finite and non-positive values are ignored.
- **Dismissal:** closes the popover without emitting a duplicate sync. Changes
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

1. At most one filter popover is open for a Feed page instance.
2. Closed and disposed states retain no filter snapshot.
3. Open arrays never alias committed arrays or emitted command arrays.
4. Exactly one `SYNC_FILTERS` command is emitted per accepted edit or reset.
5. Every dismissal path emits `NONE`.
6. Conflicting preset and explicit-filter authorities are normalized.
7. The floating capsule remains operable in both states and floats above —
   never divides — the feed content.
8. The model, not component copy, animation timing or an LLM, decides filtering.

## Review result

- [x] Nominal open, live edit, reset and close paths are explicit.
- [x] Close icon, Terminer, scrim, Escape, route change and disposal are explicit.
- [x] Duplicate open, edits while closed and invalid input are covered.
- [x] Offline, permissions, errors, retry absence and terminal disposal are covered.
- [x] Conflicting preset and explicit fields cannot create implicit authority.
- [x] Animation is reversible, presentation-only and reduced-motion safe.
- [x] Every mission change remains owned by deterministic Feed page state.
