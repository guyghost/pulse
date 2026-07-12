# Stable Mission Arrival Stack — Design Specification

**Date:** 2026-07-12

**Status:** validated design; implementation not started

**Behavior source of truth:**
`apps/extension/src/models/mission-arrival-queue.model.md`

## Outcome

MissionPulse must let a freelance read the current mission queue at their own
pace while scan results continue to arrive. No card may disappear merely because
it became visible, and no scan batch may reorder the current reading context.

The approved experience is a **stable Nouvelles queue** plus an **anchored arrival
stack**. The stack opens as a compact, non-modal **A1 docked drawer**. The user can
inspect up to three arriving missions, close the drawer, and resume at the exact
same card. Updating the queue is always explicit.

## Evidence and root cause

The supplied 10.19-second recording showed the new-mission counter decreasing
from 1668 to 1659 while the leading card changed roughly every half-second. Code
tracing found this deterministic cascade:

1. `MissionCard` registers the `onVisible` action.
2. The action fires immediately at 50% intersection.
3. `handleMissionSeen` batches the id for 120ms.
4. The Nouvelles filter removes seen ids from `displayMissions`.
5. The next card moves into the viewport and repeats the cycle.

The defect is therefore functional, not cosmetic: seen status currently mutates
the active queue membership.

## Validated design decisions

### 1. Stable queue

Entering Nouvelles captures the current ordered unseen ids. Cards stay in this
snapshot even after becoming seen. A card becomes seen only after 1.5 seconds of
continuous visibility at 60% or more. Its badge changes from **Nouveau** to **Vu**
without any movement.

Exiting and reopening Nouvelles, or explicitly refreshing the queue, creates a
new snapshot. Search and facets project the snapshot; an explicit sort may
reorder it.

### 2. Anchored stack

Pending scan results appear in a compact layered control directly above the
bottom navigation. The feed reserves space for the collapsed control so mission
actions remain reachable.

The stack uses no decorative glass, gradient, or wide shadow. A maximum of three
solid layers communicates depth; a numeric `+N` communicates actual volume.

### 3. Docked drawer A1

Opening the stack expands a drawer upward without a backdrop or focus trap. It
shows:

- the pending count;
- up to three frozen previews ordered as they would appear in the refreshed
  queue;
- a collapse action;
- **Actualiser la file avec les N missions**.

The feed remains in place behind the drawer. Closing restores focus to the stack
trigger and preserves the exact scroll offset. New batches received while the
drawer is open update the count but do not replace preview content.

### 4. Explicit refresh

The primary drawer action applies the latest complete pending snapshot exactly
once. On success, the stable queue is rebuilt and the feed scrolls to its start.
On failure, current cards and pending arrivals remain intact and the drawer offers
a retry.

## Visual and interaction specification

| Element          | Specification                                                             |
| ---------------- | ------------------------------------------------------------------------- |
| Collapsed height | minimum 44px target; approximately 56px including layered depth           |
| Position         | anchored above existing bottom navigation                                 |
| Layer depth      | maximum three visual slabs                                                |
| Drawer previews  | maximum three compact mission previews                                    |
| Drawer height    | content-driven with a bounded panel-height ceiling; never full screen     |
| Radius           | existing 8–12px design-system scale                                       |
| Color            | page canvas, surface white, border light, Blueprint Blue for action/count |
| Motion           | 160ms count crossfade; 180ms drawer opacity + ≤6px translation            |
| Reduced motion   | instant state changes                                                     |
| Focus            | drawer heading on open; stack trigger on close                            |
| Live regions     | one polite count summary per connector result                             |

The drawer is progressive disclosure, not a new navigation surface. It does not
introduce permanent tabs, a modal, or a second feed route.

## Architecture

### Functional core

A pure reducer owns states, events, guards, and effects described in the model.
Inputs include ordered ids and injected timestamps. Pure helpers deduplicate ids,
validate dwell completion, and select preview ids. Core performs no timing,
storage, DOM, Chrome API, or async operation.

### Imperative shell

The shell owns IntersectionObserver, dwell timers, seen persistence, buffered
scan application, focus restoration, scroll restoration, and error reporting. It
dispatches model events and executes emitted effects.

### UI

The feed renders model-projected membership. Mission cards emit visibility
signals but cannot decide removal. The anchored stack/drawer consumes pending
state and dispatches explicit open, close, refresh, and retry events.

No LLM is involved anywhere in the flow.

## Error, cancellation, and terminal behavior

- Interrupted visibility cancels dwell without marking seen.
- Duplicate seen and arrival ids are ignored.
- A connector error does not clear arrivals already buffered by other connectors.
- Scan cancellation preserves the current queue and follows the controller’s
  existing rule of discarding uncommitted pending results.
- Refresh failure preserves both queues and exposes retry.
- Panel close cancels timers and discards in-memory snapshots; persisted seen ids
  recreate the correct queue on the next mount.
- Notification focus keeps precedence until dismissed.
- No new Chrome permission is required.

## Test strategy

### Model tests — pure, no mocks

- enter/exit stable queue;
- allowed and rejected dwell transitions;
- exact 1500ms guard and interruption;
- seen write without membership removal;
- arrival buffer deduplication;
- frozen drawer previews under new batches;
- successful, failed, retried, and duplicate refresh;
- scan cancellation and panel close;
- invariants I1–I10 from the source model.

### UI/action tests

- IntersectionObserver starts at 60% and requires continuous dwell;
- timers cancel on visibility loss and destroy;
- stack renders only with pending missions and exposes count accessibly;
- drawer focus, Escape, close focus restoration, and keyboard order;
- no card entry transition is triggered by seen/arrival changes;
- reduced-motion CSS removes interpolation.

### End-to-end tests

- reproduce the original Nouvelles cascade and prove the first cards remain in
  place beyond multiple seen flush windows;
- buffer several partial scan batches while scrolling existing missions;
- open/close the drawer and verify scroll stability;
- apply arrivals and verify one intentional queue rebuild;
- fail and retry refresh without losing either queue;
- exercise a large virtualized feed and verify bounded DOM growth.

### Verification gates

- targeted Vitest suites;
- full extension typecheck/lint/test gates required by the repository;
- production build;
- Playwright at side-panel width;
- real browser recording of normal and reduced-motion behavior;
- `git diff --check`.

## Out of scope

- changing connector fetch cadence or scoring;
- a permanent Arrivées tab or route;
- a full-screen/modal arrival browser;
- swipe gestures, drag-and-drop, or card-fan physics;
- per-mission arrival choreography;
- backend or new Chrome permissions.

## Self-review

- No placeholders or unresolved decisions remain.
- The design and state model agree on dwell threshold, stable membership,
  explicit refresh, preview cap, error preservation, cancellation, and focus.
- Scope is limited to one implementation plan.
- Every state transition is deterministic and testable; no transition is driven
  by free text or an LLM.
