# Mission Arrival Queue — State Model (source of truth)

This document is the authoritative behavioral model for two coupled feed
concerns:

1. reading missions in the **Nouvelles** view without cards disappearing; and
2. receiving scan results in an anchored **arrival stack** without mutating the
   list currently being read.

Rule: _the scanner produces mission batches; this model decides when those
batches may change the visible feed._ No LLM participates in a transition.

## Problem

Before this model, a card was marked seen as soon as 50% of it intersected the
viewport. Seen writes were flushed after 120ms. In the Nouvelles filter, that
write immediately removed the card from `displayMissions`, exposed the next
card, and triggered the same observer again. A viewport could therefore consume
an entire unseen queue without user intent.

Scan results were buffered behind an explicit **Afficher** action, but the
buffer had no stable, inspectable representation. Applying it could replace or
reorder the current reading context in one operation.

## Scope

- the Nouvelles queue opened by either the new-only filter or the `new`
  decision preset;
- dwell-based seen marking;
- scan results already buffered by the feed controller;
- the collapsed anchored stack and its non-modal drawer;
- explicit queue refresh.

Search, source/stack/remote/seniority filters, favorites, comparison, tracking,
notification focus, connector execution, parsing, scoring, and deduplication
remain governed by their existing models.

## State

Queue reading and scan arrivals are parallel regions. A stack may accumulate
while the user reads either the normal feed or a stable Nouvelles snapshot.

```ts
interface ArrivalQueueState {
  queue:
    | { value: 'all-feed'; queueIds: []; dwells: Record<string, number> }
    | {
        value: 'stable-queue';
        queueIds: string[];
        dwells: Record<string, number>;
      };
  stack:
    | { value: 'empty'; pendingIds: []; previewIds: []; message: null }
    | {
        value: 'collapsed' | 'open' | 'refreshing';
        pendingIds: string[];
        previewIds: string[];
        message: null;
      }
    | {
        value: 'refresh-error';
        pendingIds: string[];
        previewIds: string[];
        message: string;
      };
}
```

All ids are deduplicated. `queueIds` is an ordered membership snapshot;
`previewIds` contains at most three ids, ordered exactly as those missions would
appear after refresh. Each `dwells[missionId]` timestamp is injected by the
shell; several cards may be measured independently.

## Events

| Event               | Payload             | Meaning                                                          |
| ------------------- | ------------------- | ---------------------------------------------------------------- |
| `ENTER_NEW_QUEUE`   | `orderedUnseenIds`  | Enter Nouvelles and capture stable membership.                   |
| `EXIT_NEW_QUEUE`    | none                | Leave Nouvelles and discard the in-memory snapshot.              |
| `DWELL_STARTED`     | `missionId`, `now`  | A queue card is at least 60% visible.                            |
| `DWELL_CANCELLED`   | `missionId`         | The card dropped below 60% before the threshold.                 |
| `DWELL_ELAPSED`     | `missionId`, `now`  | The same card stayed visible for at least 1500ms.                |
| `ARRIVALS_BUFFERED` | `orderedPendingIds` | The controller has a new deterministic pending snapshot.         |
| `OPEN_STACK`        | `orderedPreviewIds` | Open the drawer and freeze at most three ordered previews.       |
| `CLOSE_STACK`       | none                | Collapse an open or failed drawer without changing either queue. |
| `REFRESH_QUEUE`     | none                | Explicitly apply all pending arrivals.                           |
| `REFRESH_SUCCEEDED` | `orderedUnseenIds`  | Replace the stable snapshot and clear the stack.                 |
| `REFRESH_FAILED`    | `message`           | Keep current and pending queues intact; expose retry.            |
| `RETRY_REFRESH`     | none                | Retry the same explicit application.                             |
| `SCAN_CANCELLED`    | none                | Discard the uncommitted scan buffer; keep current queue intact.  |
| `PANEL_CLOSED`      | none                | End dwell timers and discard in-memory snapshots.                |

Search and facet events project the captured membership through the current
filters. An explicit sort event may reorder `queueIds`; it may not add or remove
membership.

## Transition table

| Region / from                                   | Event                              | To              | Effects                                                                        |
| ----------------------------------------------- | ---------------------------------- | --------------- | ------------------------------------------------------------------------------ |
| queue / `all-feed`                              | `ENTER_NEW_QUEUE(ids)`             | `stable-queue`  | capture ids; preserve scroll                                                   |
| queue / any                                     | `DWELL_STARTED(id, now)`           | same mode       | record or replace the dwell for id                                             |
| queue / any                                     | `DWELL_CANCELLED(id)`              | same mode       | clear the matching dwell only                                                  |
| queue / any                                     | `DWELL_ELAPSED(id, now)`           | same mode       | emit `mark-seen(id)`; clear dwell; do **not** remove id                        |
| queue / any                                     | `EXIT_NEW_QUEUE`                   | `all-feed`      | clear dwell and snapshot; keep persisted seen ids                              |
| stack / `empty`                                 | `ARRIVALS_BUFFERED(ids)`           | `collapsed`     | show the anchored stack                                                        |
| stack / `collapsed`                             | `ARRIVALS_BUFFERED(ids)`           | `collapsed`     | replace the pending snapshot                                                   |
| stack / `collapsed`                             | `OPEN_STACK`                       | `open`          | freeze top-three previews; focus drawer heading                                |
| stack / `open`                                  | `ARRIVALS_BUFFERED(ids)`           | `open`          | update count/pending ids; keep previews frozen                                 |
| stack / `open` or `refresh-error`               | `CLOSE_STACK`                      | `collapsed`     | clear any error message; restore focus to stack trigger                        |
| stack / `collapsed`, `open`, or `refresh-error` | `REFRESH_QUEUE` or `RETRY_REFRESH` | `refreshing`    | apply controller buffer exactly once                                           |
| stack / `refreshing`                            | `REFRESH_SUCCEEDED(ids)`           | `empty`         | clear stack; rebuild queue only when queue region is stable; scroll feed start |
| stack / `refreshing`                            | `REFRESH_FAILED(message)`          | `refresh-error` | retain current queue and pending ids; announce error politely                  |
| stack / any                                     | `SCAN_CANCELLED`                   | `empty`         | clear pending ids only; queue region is unchanged                              |
| both / any                                      | `PANEL_CLOSED`                     | initial state   | cancel timers; drop in-memory state                                            |

Events that do not appear above are rejected as no-ops. In particular,
`DWELL_ELAPSED` is rejected unless it matches the active dwell id and satisfies
`now - startedAt >= 1500`.

## Rendering contract

### Stable queue

- `displayMissions` in Nouvelles uses `queueIds` as its membership allow-list.
- A seen write changes the card badge from **Nouveau** to **Vu** but never removes
  or repositions the card in the active snapshot.
- Re-entering Nouvelles creates a fresh snapshot from persisted unseen ids, so
  previously read cards are absent on the next visit.
- New feed data not present in `queueIds` is represented by the stack, not injected
  into the list.

### Collapsed anchored stack

- Render only when `stack.pendingIds.length > 0`.
- Anchor to the lower edge of the feed viewport. MissionPulse navigation remains
  at the top of the side panel; the stack does not imply or introduce bottom
  navigation. Reserve enough feed bottom padding that the collapsed control does
  not cover the final mission actions.
- Visual depth is capped at three solid layers regardless of count. The numeric
  count is authoritative.
- The whole trigger is keyboard reachable and at least 44px high.
- Copy: **Nouvelles arrivées** and `+N`; supporting text explains that opening the
  stack does not replace the current queue.

### Drawer A1

- Non-modal: no backdrop, no focus trap, and no route change.
- Opens upward from the anchored stack and preserves the feed scroll position.
- Shows the frozen top three previews, current total count, collapse control, and
  one primary action: **Actualiser la file avec les N missions**.
- New batches received while open update the count and an optional
  `+N supplémentaires` summary, but never replace a preview being read.
- `Escape` closes the open or failed drawer. An in-progress refresh is not
  interruptible. Closing restores focus to the stack trigger.
- An application failure keeps the drawer open, keeps both queues intact, and
  displays **Impossible d’actualiser la file. Réessayer.**

## Motion contract

- No feed-card entrance animation is tied to scan arrival or seen marking.
- Stack count/layer changes may crossfade for 160ms, once per connector batch,
  never once per mission.
- Drawer open/close uses opacity plus at most 6px of vertical translation over
  180ms with an ease-out-quart/quint/expo curve. It does not animate layout
  properties.
- Under `prefers-reduced-motion: reduce`, all state changes are instant.

## Accessibility contract

- The collapsed stack exposes its count in its accessible name.
- Count updates use one throttled `aria-live="polite"` summary per connector
  result, not per mission.
- **Nouveau** and **Vu** remain textual; color is not the sole distinction.
- Drawer heading receives focus on open; stack trigger receives focus on close.
- The feed remains keyboard navigable while the non-modal drawer is open.

## Invariants

- **I1 — Stable membership.** Visibility, seen writes, scan batches, drawer open,
  and drawer close never add, remove, or reorder an active `queueIds` snapshot.
- **I2 — Intentional refresh only.** Pending arrivals may enter the active queue
  only through `REFRESH_QUEUE` followed by `REFRESH_SUCCEEDED`.
- **I3 — Continuous dwell.** A mission is marked seen only after 1500ms of
  uninterrupted visibility at or above 60%. Leaving the threshold cancels the
  timer.
- **I4 — Seen is not removal.** `mark-seen` persists status and updates the badge;
  it never changes active stable membership.
- **I5 — Frozen inspection.** Once opened, drawer previews do not churn under new
  scan batches.
- **I6 — Atomic refresh.** Failed or duplicate refresh attempts cannot partially
  replace the feed or clear the pending stack.
- **I7 — Bounded rendering.** The stack renders at most three depth layers and the
  drawer at most three preview cards, independent of mission count.
- **I8 — No hidden layout obstruction.** The collapsed stack cannot cover the last
  card’s actions; the drawer may overlay content only while explicitly open.
- **I9 — Deterministic authority.** IDs, ordering, dwell time, and every transition
  are determined by code and injected timestamps. No free text or LLM output
  drives state.
- **I10 — Focus lens precedence.** Notification focus remains an explicit
  allow-list and bypasses this queue until dismissed; arrival state is preserved
  underneath.
- **I11 — Independent regions.** Entering or exiting Nouvelles never clears the
  arrival stack; buffering, opening, or closing the stack never changes queue
  mode or queue membership.

## Review of non-happy paths

- **Rapid scrolling:** dwell starts and cancels repeatedly; no seen write occurs
  until one uninterrupted threshold succeeds.
- **Many visible cards:** each observer may measure visibility, but the queue model
  accepts only one active dwell timer per mission id and seen writes are batched.
- **Duplicate connector results:** pending ids are deduplicated before the event.
- **New arrivals while drawer is open:** count changes; previews remain frozen.
- **Refresh during an active scan:** applies the controller’s latest complete
  pending snapshot exactly once; later connector results form a new stack.
- **Refresh error/retry:** previous feed and pending buffer remain recoverable.
- **Scan cancellation:** current reading context remains untouched; uncommitted
  pending results follow the controller’s existing discard behavior.
- **Panel close/reopen:** in-memory snapshots disappear; persisted seen ids produce
  a fresh deterministic queue on mount.
- **Permissions:** no new Chrome permission is required.
- **Reduced motion:** state and accessibility semantics are identical; only visual
  interpolation is removed.

## Intended implementation boundaries

- **Pure Core:** arrival queue reducer, dwell guards, id deduplication, preview
  selection, transition tests.
- **State/UI shell:** timers, IntersectionObserver, focus restoration, scroll
  preservation, controller application, persistence, and aria-live updates.
- **UI:** a reusable anchored stack organism consuming model state; MissionCard
  receives explicit `isSeen` status and emits visibility signals only.

Core never imports Shell. UI and Shell consume reducer outputs; they do not
recreate queue transition rules.
