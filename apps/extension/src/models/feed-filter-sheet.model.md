# Feed Filter Sheet Model

Source of truth for the Mission feed filter-sheet interaction selected in the
MissionPulse option-1 visual. Existing feed filtering remains authoritative for
which missions match. This model owns only opening the sheet, editing a local
draft, applying it atomically, and cancelling it without leaking partial edits.

The workflow is synchronous and UI-local. It does not require an XState actor:
there is no I/O, retry timer, concurrent worker, persistence acknowledgement or
long-running effect. A pure transition function is the executable projection
consumed by the Svelte page.

## State and context

```ts
type FeedFilterSheetValue = 'closed' | 'editing' | 'disposed';

interface FeedFilterDraft {
  decisionPreset: 'priority' | 'remote-compatible' | 'tjm-negotiation' | 'new' | null;
  selectedScoreBucket: 'strong' | 'good' | 'weak' | null;
  selectedSource: MissionSource | null;
  selectedRemote: RemoteType | null;
  selectedSeniority: SeniorityLevel | null;
  selectedStacks: string[];
}

type FeedFilterSheetState =
  | { value: 'closed' }
  | { value: 'editing'; baseline: FeedFilterDraft; draft: FeedFilterDraft }
  | { value: 'disposed' };
```

`baseline` and `draft` are independent immutable snapshots. Arrays are copied
at every boundary so a cancelled sheet cannot mutate the committed page state.

## Events

```ts
type FeedFilterSheetEvent =
  | { type: 'OPEN'; committed: FeedFilterDraft }
  | { type: 'TOGGLE_PRESET'; preset: NonNullable<FeedFilterDraft['decisionPreset']> }
  | { type: 'SET_SCORE_BUCKET'; bucket: FeedFilterDraft['selectedScoreBucket'] }
  | { type: 'SET_SOURCE'; source: FeedFilterDraft['selectedSource'] }
  | { type: 'SET_REMOTE'; remote: FeedFilterDraft['selectedRemote'] }
  | { type: 'SET_SENIORITY'; seniority: FeedFilterDraft['selectedSeniority'] }
  | { type: 'TOGGLE_STACK'; stack: string }
  | { type: 'RESET_DRAFT' }
  | { type: 'DISMISS'; reason: 'button' | 'scrim' | 'escape' | 'page-hidden' }
  | { type: 'APPLY' }
  | { type: 'DISPOSE' };
```

## Commands

```ts
type FeedFilterSheetCommand =
  { type: 'NONE' } | { type: 'COMMIT_FILTERS'; filters: FeedFilterDraft };
```

Only `APPLY` can emit `COMMIT_FILTERS`. The page state consumes that command in
one synchronous action and then recomputes the visible mission projection.

## Transition table

| From       | Event                                        | Guard                       | To         | Command / effect                                   |
| ---------- | -------------------------------------------- | --------------------------- | ---------- | -------------------------------------------------- |
| `closed`   | `OPEN(committed)`                            | draft is structurally valid | `editing`  | Copy committed filters into baseline and draft.    |
| `closed`   | edit / reset / dismiss / apply               | —                           | `closed`   | None.                                              |
| `editing`  | preset / score / source / remote / seniority | payload is canonical        | `editing`  | Replace only that draft field.                     |
| `editing`  | `TOGGLE_STACK(stack)`                        | trimmed stack is non-empty  | `editing`  | Add/remove one unique stack in stable order.       |
| `editing`  | `RESET_DRAFT`                                | —                           | `editing`  | Replace draft with the empty canonical filter set. |
| `editing`  | `DISMISS(*)`                                 | —                           | `closed`   | Discard baseline and draft; emit no command.       |
| `editing`  | `APPLY`                                      | —                           | `closed`   | Emit one copied `COMMIT_FILTERS(draft)` command.   |
| any live   | `DISPOSE`                                    | —                           | `disposed` | Drop all draft data and accept no later event.     |
| `disposed` | any                                          | —                           | `disposed` | None.                                              |

Preset normalization is deterministic:

- selecting the already selected preset clears it;
- selecting `priority` clears a score bucket so two score authorities do not
  conflict;
- selecting `remote-compatible` clears an explicit remote mode;
- `tjm-negotiation` remains available in the detailed TJM row so an existing
  saved or committed feed filter is never silently discarded;
- selecting `new` is represented only by the preset in this sheet;
- selecting an explicit score bucket or remote mode clears the conflicting
  preset when required.

## Presentation projection

- `closed`: no scrim or sheet exists; the trigger reports
  `aria-expanded="false"`.
- `editing`: the trigger reports `aria-expanded="true"`; a fixed scrim covers
  the Feed page and a bottom sheet rises above it. The sheet exposes the
  existing `Options de filtrage` accessible group.
- The sheet CTA previews the mission count produced by the draft without
  mutating the committed feed. Resetting or editing therefore updates the CTA
  immediately while the background list remains unchanged until `APPLY`.
- Initial focus moves to the sheet heading/close control. Closing returns focus
  to the trigger when it is still connected.
- `Escape`, the explicit close button, a scrim click and a hidden Feed page all
  dispatch `DISMISS`; none commits.
- Reduced motion removes the translation/fade duration but not the final state.

## Side effects and ownership

- Opening, editing, resetting and dismissing perform no I/O and do not change
  the visible mission set.
- Applying emits one typed command. `feed-page.svelte.ts` owns the atomic update
  to the existing filter fields and stable-new-queue projection.
- Saved views, search, favorites, hidden missions and sort order are outside
  this sheet revision and remain owned by their existing controls.
- The sheet never starts a scan, changes a connector, persists a view or opens
  an external URL.

## Error, cancellation, retry and permission review

- **Invalid/unknown event:** ignored with `NONE`; state remains unchanged.
- **Invalid stack text:** empty/whitespace-only values are ignored.
- **Cancellation:** every dismiss reason drops the draft without a commit.
- **Rapid open/close:** `OPEN` while already editing is ignored, so a second
  trigger cannot overwrite an in-progress draft.
- **Apply after dismiss:** ignored because `closed` cannot emit a commit.
- **Page navigation:** `page-hidden` dismisses before the Feed becomes inert;
  returning to Missions starts closed from the latest committed values.
- **Offline:** filtering local missions remains available; no network retry is
  introduced.
- **Permissions:** no permission is requested or interpreted by this workflow.
- **Retry:** there is no asynchronous operation to retry. The user can reopen
  after any dismissal.
- **Terminal state:** `disposed` is terminal and contains no filter snapshot.

## Forbidden transitions

- No filter mutation before `APPLY`.
- No commit from a close button, scrim, Escape, route change or unmount.
- No unknown preset, source, remote value, seniority or score bucket.
- No duplicated stack in a draft.
- No callback, animation completion, rendered copy or LLM output chooses a
  filter transition.

## Invariants

1. At most one filter sheet is editing for a Feed page instance.
2. Closed and disposed states retain no draft data.
3. Draft arrays never alias committed arrays or emitted command arrays.
4. Exactly one `COMMIT_FILTERS` command is emitted per accepted `APPLY`.
5. Every cancellation path emits `NONE`.
6. Conflicting preset and explicit-filter authorities are normalized.
7. Hidden background controls cannot receive pointer input while the sheet is
   presented.
8. The model, not the component copy or an LLM, decides whether filters commit.

## Review result

- [x] Nominal open, edit, reset and apply paths are explicit.
- [x] Close button, scrim, Escape, route change and disposal cancellation are
      explicit and non-committing.
- [x] Re-open, duplicate open, apply-after-close and invalid input are covered.
- [x] Offline, permissions, errors, retry absence and terminal disposal are
      covered.
- [x] Conflicting presets and explicit fields cannot create implicit authority.
- [x] Every visible mission change remains owned by the existing deterministic
      Feed page state.
