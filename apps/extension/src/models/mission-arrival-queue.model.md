# Mission Arrival Queue and Feed Presentation Model

Status: **MODEL REVISION 3 — APPROVED FOR IMPLEMENTATION**.

Independent cold review: **APPROVED** on 2026-07-16 for behaviour hash
`01d08395fd5cf7446b36032493d414deb0f543415b4537007e811ce3a0fe8e4d`.

This model owns three Feed behaviours:

1. the single primary action for loading, empty, error and loaded Feed states;
2. stable membership of the **Nouvelles** queue while missions become seen; and
3. explicit application of missions received by a mounted warm panel.

The actor is local and ephemeral. IndexedDB, written and read only by the
service worker, is the durable mission catalogue. The actor owns presentation
state, correlations and synchronous authorization; it owns no durable data.
No component, free text or LLM decides a transition.

## Scope and ownership

| Concern                                                  | Owner                                        |
| -------------------------------------------------------- | -------------------------------------------- |
| Accepted scan, cancellation and durable catalogue commit | `scan-lifecycle.model.md` and service worker |
| Canonical mission objects                                | Service worker over IndexedDB                |
| Current visible Feed catalogue                           | Feed store in the mounted panel              |
| Feed action, queue and apply transitions                 | Pure Core reducer defined here               |
| Bridge calls, Feed writes, preview cache and DOM effects | Panel Shell                                  |

Only background-alarm publications enter the arrival path. Manual Start or
Retry is explicit consent to replace the Feed: its owned scan projects its
terminal result directly through the facade/bridge. It never dispatches
`ALARM_MISSIONS_RECEIVED` and never creates a tray.

Closing the panel or leaving Feed disposes the actor and abandons its optional
`+N` presentation. On remount, `smartLoad()` requests the current catalogue
through the facade/bridge. The panel never imports the IndexedDB adapter.

The following are outside this model: durable arrival buffers, apply journals,
restart reconciliation, connector execution, scoring, search, facets,
favourites and tracking.

## Serialized actor and indivisible Feed commit

The arrival actor and its Feed adapter share one synchronous, non-reentrant
FIFO. External events, bridge results, subscriber work and reentrant dispatches
are appended; one command is reduced to completion before the next begins.

Cold hydration and prepared Apply use one special Shell critical section. It
performs, without yielding: final pure guard; staged synchronous Feed write;
inline actor success transition (the internal ACK); then publication to Svelte
subscribers. No callback, subscriber, bridge handler or nested dispatch runs
between guard, write and ACK. A nested dispatch is only queued for the next FIFO
command. If guard, staging or actor commit fails, the adapter discards the
stage, preserves the previous Feed and reduces the matching failure inline.
Only after the critical section closes may subscriber callbacks observe the
new Feed and enqueue work. Required next feed/scope revisions are precomputed;
unsafe-integer exhaustion fails before staging any write.

## Total Feed presentation

```ts
type FeedState = 'empty' | 'loading' | 'loaded' | 'error';
type OwnedActiveScanState = 'starting' | 'scanning' | 'retrying' | 'persisting' | 'cancelling';

interface FeedPresentationFacts {
  feedState: FeedState;
  ownedScan: { operationId: string; state: OwnedActiveScanState } | null;
  networkOnline: boolean;
}

type FeedPresentation =
  | { value: 'loading'; primaryAction: 'cancel'; actionEnabled: boolean; arrivalCompatible: false }
  | { value: 'empty'; primaryAction: 'start'; actionEnabled: boolean; arrivalCompatible: false }
  | { value: 'error'; primaryAction: 'retry'; actionEnabled: boolean; arrivalCompatible: false }
  | { value: 'loaded'; primaryAction: 'start'; actionEnabled: boolean; arrivalCompatible: true }
  | { value: 'inconsistent'; primaryAction: null; actionEnabled: false; arrivalCompatible: false };

declare function deriveFeedPresentation(facts: Readonly<FeedPresentationFacts>): FeedPresentation;
```

| Facts                         | Projection     | Sole primary action                      |
| ----------------------------- | -------------- | ---------------------------------------- |
| `loading` plus one owned scan | `loading`      | Cancel; disabled only while `cancelling` |
| `empty` plus no owned scan    | `empty`        | Start; disabled offline                  |
| `error` plus no owned scan    | `error`        | Retry; disabled offline                  |
| `loaded` plus no owned scan   | `loaded`       | Start; disabled offline                  |
| Every other tuple             | `inconsistent` | None; fail closed                        |

`ownedScan` never represents an unobserved alarm scan. Components consume this
projection and must not reproduce its conditions.

`presentationRevision` also starts at `-1`. Feed-fact events are accepted only
for a safe non-negative revision strictly greater than the stored value; every
older, equal or unsafe revision is an exact no-op.

## Scope revision protocol

The Page publishes the complete pending scope whenever enabled sources or
visible Feed IDs change:

```ts
interface PendingScopeFacts {
  enabledSources: ReadonlySet<MissionSource>;
  feedRevision: number;
  orderedVisibleFeedIds: readonly string[];
  visibleFeedIds: ReadonlySet<string>;
}
```

`scopeRevision` starts at `-1`. The first valid
`PENDING_SCOPE_CHANGED` has revision `0`; each later accepted scope event has a
safe non-negative integer strictly greater than the stored revision. Equal,
older, unsafe or incomplete revisions are exact no-ops. The serialized adapter
is the sole revision allocator: it stamps a new scope revision for every
factual scope change and cannot mutate a published set. `feedRevision` is also
a safe monotone integer; it increases exactly when ordered Feed membership is
committed. A source-only scope change preserves it. `visibleFeedIds` must equal
the set of unique `orderedVisibleFeedIds`.

An accepted scope event cannot lower `feedRevision`. Equal Feed revision
requires element-for-element identical ordered IDs; changed ordered IDs require
a greater Feed revision. Any mismatch is an exact no-op.

Every `ALARM_MISSIONS_RECEIVED` carries the revision it observed. It is
accepted only when that revision is exactly the actor's current revision. Core
always filters with its stored immutable scope facts, never with alarm-supplied
sets. This makes an alarm based on an older connector/Feed view stale rather
than implicitly redefining scope.

## Alarm publication routing

After an alarm scan commits IndexedDB, the service worker publishes a
`projection: 'cold-only'` message with mission objects. The panel's synchronous
ingress maps those objects to pure candidates. The actor/Feed-commit adapter
retains canonical commit inputs only for the duration of that ingress turn. In
the same turn, the Shell may separately project those typed objects into the
non-authoritative preview cache defined below. A cached preview object can
render an actor-authorized ID, but can never authorize or supply a Feed write;
Apply still resolves its complete canonical candidate through the service
worker.

```ts
interface ArrivalCandidate {
  id: string;
  source: MissionSource;
}

interface AlarmMissionsReceived {
  type: 'ALARM_MISSIONS_RECEIVED';
  scopeRevision: number;
  candidates: readonly ArrivalCandidate[];
}
```

Core removes candidates from disabled sources, IDs already visible and IDs
frozen by an active apply, then deduplicates in publication order.

```ts
declare function selectPendingArrivalIds(input: {
  candidates: readonly ArrivalCandidate[];
  enabledSources: ReadonlySet<MissionSource>;
  visibleFeedIds: ReadonlySet<string>;
  excludedApplyIds: ReadonlySet<string>;
}): readonly string[];
```

| Exact presentation at receipt              | Required route                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `empty` and actual Feed store is empty     | Pure-filter the publication, then emit `hydrate-cold-feed-sync`; never create pending |
| `loaded`                                   | Capture/merge pending; never replace visible missions                                 |
| `loading`, `error` or `inconsistent`       | Ignore for presentation; durable data remains recoverable by `smartLoad()`            |
| Any presentation with stale scope revision | Exact no-op                                                                           |

Cold hydration is deliberately synchronous and has no externally dispatchable
ACK state:

1. Core first authorizes the exact empty presentation, empty Feed IDs, current
   scope revision and filtered IDs.
2. In the same non-awaiting bridge-listener turn, the Shell resolves every
   selected object from that same publication. Missing objects fail closed.
3. Immediately before writing, a pure guard rechecks active lifecycle, exact
   empty presentation, exact scope/feed revisions and exact empty ordered Feed.
4. The indivisible commit writes once, advances authoritative feed/scope
   revisions and visible IDs inline, then publishes the resulting facts.
5. A write exception leaves the Feed unchanged and reports an error.

No event can interleave between the final guard and the write. Consequently,
two sequential cold publications cannot both take the empty route: the first
listener finishes with a loaded Feed before the second is reduced, so the
second takes the warm route.

## State and context

```ts
interface PendingSnapshot {
  revision: number;
  orderedIds: readonly string[];
  sourceById: Readonly<Record<string, MissionSource>>;
}

type QueueRegion =
  | { value: 'all-feed' }
  | {
      value: 'stable-queue';
      queueIds: readonly string[];
      dwells: Readonly<Record<string, number>>;
      seenInFlight: Readonly<Record<string, number>>;
      confirmedSeenIds: readonly string[];
    };

type StackRegion =
  | { value: 'empty' }
  | { value: 'collapsed'; pending: PendingSnapshot }
  | { value: 'open'; pending: PendingSnapshot; previewIds: readonly string[] }
  | {
      value: 'applying';
      applyId: number;
      applied: PendingSnapshot;
      appliedScopeRevision: number;
      baseFeedRevision: number;
      orderedBaseFeedIds: readonly string[];
      latest: PendingSnapshot | null;
      prepared: ProjectionCandidate | null;
      returnView: 'collapsed' | 'open';
      previewIds: readonly string[];
    }
  | {
      value: 'projection-error';
      pending: PendingSnapshot;
      failedApplyId: number;
      reason: ProjectionFailureReason;
      drawerOpen: boolean;
      previewIds: readonly string[];
    };

interface MissionArrivalQueueState {
  lifecycle: 'active' | 'disposed';
  presentationRevision: number;
  presentation: FeedPresentation;
  pendingRevision: number;
  applyOrdinal: number;
  seenOperationOrdinal: number;
  scopeRevision: number;
  feedRevision: number;
  enabledSources: ReadonlySet<MissionSource>;
  orderedVisibleFeedIds: readonly string[];
  visibleFeedIds: ReadonlySet<string>;
  queue: QueueRegion;
  stack: StackRegion;
}
```

Initial state is active with presentation revision `-1`, the inconsistent
presentation, pending revision `0`, apply and seen-operation ordinals `0`,
scope/feed revisions `-1`, empty ordered/set scope facts, `queue='all-feed'`
and `stack='empty'`.

Every non-empty snapshot has unique non-empty IDs. A snapshot revision changes
only when membership or order changes. Merge preserves earlier order and
appends genuinely new IDs in publication order. Count and previews are derived
only from currently eligible snapshot membership.

## Events and effects

```ts
type ProjectionFailureReason =
  'CATALOGUE_READ_FAILED' | 'CATALOGUE_INCOMPLETE' | 'FEED_WRITE_FAILED' | 'INVALID_CANDIDATE';

interface ProjectionCandidate {
  applyId: number;
  appliedRevision: number;
  scopeRevision: number;
  baseFeedRevision: number;
  orderedAllFeedIds: readonly string[];
  orderedUnseenIds: readonly string[];
}

type MissionArrivalQueueEvent =
  | { type: 'FEED_FACTS_CHANGED'; revision: number; facts: FeedPresentationFacts }
  | AlarmMissionsReceived
  | {
      type: 'PENDING_SCOPE_CHANGED';
      scopeRevision: number;
      feedRevision: number;
      enabledSources: ReadonlySet<MissionSource>;
      orderedVisibleFeedIds: readonly string[];
      visibleFeedIds: ReadonlySet<string>;
    }
  | { type: 'OPEN_STACK' }
  | { type: 'CLOSE_STACK' }
  | { type: 'APPLY_REQUESTED' }
  | { type: 'PROJECTION_PREPARED'; candidate: ProjectionCandidate }
  | {
      type: 'PROJECTION_LOAD_FAILED';
      applyId: number;
      appliedRevision: number;
      scopeRevision: number;
      baseFeedRevision: number;
      reason: 'CATALOGUE_READ_FAILED' | 'CATALOGUE_INCOMPLETE';
    }
  | {
      type: 'PROJECTION_WRITE_SUCCEEDED';
      applyId: number;
      appliedRevision: number;
      scopeRevision: number;
      baseFeedRevision: number;
    }
  | {
      type: 'PROJECTION_WRITE_FAILED';
      applyId: number;
      appliedRevision: number;
      scopeRevision: number;
      baseFeedRevision: number;
    }
  | { type: 'RETRY_REQUESTED' }
  | { type: 'ENTER_NEW_QUEUE'; orderedUnseenIds: readonly string[] }
  | { type: 'EXIT_NEW_QUEUE' }
  | { type: 'SORT_QUEUE'; orderedQueueIds: readonly string[] }
  | { type: 'DWELL_STARTED'; missionId: string; now: number }
  | { type: 'DWELL_CANCELLED'; missionId: string }
  | { type: 'DWELL_ELAPSED'; missionId: string; now: number }
  | { type: 'SEEN_PERSISTED'; missionId: string; seenOpId: number }
  | { type: 'SEEN_PERSIST_FAILED'; missionId: string; seenOpId: number }
  | { type: 'FEED_UNMOUNTED' }
  | { type: 'PANEL_CLOSED' };

type MissionArrivalQueueEffect =
  | {
      type: 'hydrate-cold-feed-sync';
      scopeRevision: number;
      baseFeedRevision: number;
      orderedIds: readonly string[];
    }
  | {
      type: 'load-feed-projection';
      applyId: number;
      snapshot: PendingSnapshot;
      scopeRevision: number;
      baseFeedRevision: number;
      orderedBaseFeedIds: readonly string[];
      queueMode: 'all-feed' | 'stable-queue';
    }
  | { type: 'write-feed-projection-sync'; candidate: ProjectionCandidate }
  | { type: 'persist-seen'; missionId: string; seenOpId: number }
  | { type: 'focus-drawer-heading' }
  | { type: 'focus-stack-trigger' }
  | { type: 'scroll-feed-start' }
  | { type: 'report-arrival-error'; reason: ProjectionFailureReason }
  | { type: 'report-seen-error'; missionId: string; seenOpId: number };
```

`PROJECTION_WRITE_SUCCEEDED` and `PROJECTION_WRITE_FAILED` are private inline
commit commands, not public dispatch inputs. A bridge/component attempt to
dispatch either is ignored; only the serialized adapter may reduce them between
its staged write and subscriber publication.

## Apply protocol and linearization

Apply has an asynchronous preparation phase and a synchronous authorized write
phase. They are deliberately distinct.

```ts
declare function mergeAppliedIntoBase(
  orderedBaseFeedIds: readonly string[],
  orderedAppliedIds: readonly string[]
): readonly string[];
```

Both inputs must be unique and disjoint. The only valid result is every base ID
in unchanged order followed by every applied ID in unchanged order. There is no
sort, replacement or catalogue-wide append.

1. `APPLY_REQUESTED` freezes `applied`, a new local `applyId`, exact current
   scope/feed revisions and exact `orderedBaseFeedIds`, then emits
   `load-feed-projection` without clearing pending.
2. The Shell asks the service worker for the canonical objects needed to build
   the target visible Feed. The service worker alone reads IndexedDB. The
   target resolves objects for exactly
   `mergeAppliedIntoBase(orderedBaseFeedIds, applied.orderedIds)`; later
   arrivals remain `latest`.
3. The Shell normalizes the complete result in memory and dispatches either
   `PROJECTION_PREPARED` or the correlated `PROJECTION_LOAD_FAILED`.
4. Core accepts a prepared candidate only while lifecycle is active, stack is
   `applying`, presentation is loaded-compatible, and `applyId`, applied
   revision, scope revision and base Feed revision exactly equal frozen/current
   values. Current ordered Feed IDs must still exactly equal the frozen base.
   `orderedAllFeedIds` must equal the deterministic merge element-for-element:
   no foreign, omitted, duplicated or reordered ID is accepted.
   `orderedUnseenIds` must be a unique ordered subset of that exact list.
   Invalid structure enters retryable `INVALID_CANDIDATE` without writing.
5. Only an accepted candidate is stored as `prepared` and emits
   `write-feed-projection-sync`.
6. In the same FIFO command, the indivisible commit reruns the pure guard for
   active lifecycle, loaded presentation, exact `applyId`, applied revision,
   scope revision, base Feed revision, ordered base IDs and stored prepared
   candidate. It stages one Feed replacement and reduces success/failure inline
   before any callback or dispatch can execute.

No event can interleave between step 6's final guard and write. If authorization
is no longer exact, the effect performs no write; a stale candidate/result is
an exact no-op. Inline `PROJECTION_WRITE_SUCCEEDED` is the linearization point:
in the same indivisible commit it clears applied pending, updates exactly one
Queue branch, advances feed and scope revisions by one, and replaces ordered/set
visible IDs with the exact committed candidate. A queued alarm stamped with the
pre-commit scope revision is therefore stale and cannot re-pend an applied ID.
A load or write failure preserves eligible applied plus later arrivals and
exposes user Retry.
The Feed replacement primitive is atomic: it commits the complete normalized
list in one assignment or leaves the previous list unchanged before reporting
`PROJECTION_WRITE_FAILED`; partial replacement is forbidden.

### Apply transitions

| From                  | Event / exact guard                                               | Result and effects                                                                                                              |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `collapsed` or `open` | Apply, non-empty pending, exact loaded presentation               | Allocate apply ID; freeze pending/scope/previews; `latest=null`; emit one async load                                            |
| `applying`            | Apply or Retry                                                    | Exact no-op; single-flight                                                                                                      |
| `applying`            | Current-scope filtered alarm                                      | Merge only IDs outside visible/applied into `latest`; do not alter frozen applied                                               |
| `applying`            | Valid matching prepared candidate                                 | Store candidate; emit exactly one synchronous write                                                                             |
| `applying`            | Matching malformed prepared candidate                             | Merge/filter applied plus latest; enter `projection-error(INVALID_CANDIDATE)`                                                   |
| `applying`            | Matching load/write failure                                       | Merge/filter applied plus latest; enter retryable `projection-error`; report                                                    |
| `applying`            | Matching write success                                            | Indivisibly advance Feed/scope facts and one Queue branch; filter `latest` against new visible IDs; collapse/empty; scroll once |
| `projection-error`    | Alarm                                                             | Merge eligible IDs; preserve error                                                                                              |
| `projection-error`    | Retry with exact loaded presentation                              | Allocate new apply ID; freeze current pending/scope; emit exactly one async load                                                |
| Any                   | Stale, duplicate, crossed or post-disposal preparation/result/ACK | Exact no-op                                                                                                                     |

There is no automatic retry loop.

## Scope changes while applying

An accepted `PENDING_SCOPE_CHANGED` always stores its newer complete facts and
re-filters existing pending state. In `applying` it **logically cancels the
apply before any future write**:

1. union frozen `applied` and `latest` in stable order;
2. filter the union with the new enabled/visible facts;
3. leave `applying` immediately for `collapsed(eligible)` or `empty`; and
4. emit no projection write or success effect.

Frozen causal details may be retained only in diagnostics; count and previews
come exclusively from the new eligible snapshot. Any later prepared/load/write
result is stale because no matching applying state exists. If a synchronous
write effect was already emitted, its guard and write complete in the earlier
non-awaiting actor turn before a scope event can interleave; otherwise the
scope change wins before any Feed write. There is no ambiguous middle order.

A fresh `FEED_FACTS_CHANGED` that makes presentation non-loaded similarly
abandons an unwritten apply back to its eligible pending snapshot. An already
synchronous authorized write completes first by the same serialization rule.

## Ordinary stack transitions

| From / condition                      | Event                         | Result                                                                                                      |
| ------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Active                                | Fresh Feed facts revision     | Derive/store total Feed presentation                                                                        |
| Loaded `empty`                        | Non-empty current-scope alarm | `collapsed(snapshot)`                                                                                       |
| Loaded `collapsed`                    | Alarm                         | Merge pending; remain collapsed                                                                             |
| Loaded `open`                         | Alarm                         | Merge pending; keep frozen preview IDs                                                                      |
| `collapsed`                           | `OPEN_STACK`                  | `open`; preview first three eligible IDs; focus heading                                                     |
| `open`                                | `CLOSE_STACK`                 | `collapsed`; restore trigger focus                                                                          |
| `projection-error`                    | Open/close                    | Toggle drawer only                                                                                          |
| Any non-applying stack                | Empty filtered alarm          | Exact no-op                                                                                                 |
| `collapsed`/`open`/`projection-error` | Fresh scope facts             | Store facts; prune disabled/visible IDs; allocate snapshot revision only when membership/order changes      |
| Non-loaded-compatible presentation    | Any stack                     | Tray is not rendered; ordinary pending/error may remain, but an unwritten apply is invalidated as specified |

Re-enabling a source does not resurrect filtered publications. Those missions
appear only in a later publication or `smartLoad()`.

## Reactive preview-cache convergence

The Panel Shell may retain a local `id -> Mission` preview catalogue so an
opened arrival stack can keep rendering the exact mission objects received
before a later facade snapshot changes. This catalogue is a presentation cache,
not actor state and not durable authority.

```ts
type PreviewCacheState =
  | { lifecycle: 'active'; byId: Readonly<Record<string, Mission>> }
  | { lifecycle: 'disposed'; byId: Readonly<Record<string, never>> };

type PreviewCacheEvent =
  | {
      type: 'PREVIEW_OBJECTS_OBSERVED';
      source: 'facade-pending-snapshot' | 'alarm-ingress';
      missions: readonly Mission[];
    }
  | { type: 'APPLY_CYCLE_SETTLED'; hasRemainingPreviewMembership: boolean }
  | { type: 'PREVIEW_CACHE_DISPOSED'; reason: 'feed-unmounted' | 'panel-closed' };
```

The initial state is active with an empty map. A complete `pendingMissions`
snapshot from the Feed facade emits `PREVIEW_OBJECTS_OBSERVED` with
`source='facade-pending-snapshot'`. The synchronous `cold-only` listener emits
the same event with `source='alarm-ingress'` before discarding its commit input.
Both sources have identical cache semantics; the source exists for audit and
tests only.

```ts
declare function transitionPreviewCache(
  state: PreviewCacheState,
  event: PreviewCacheEvent
): PreviewCacheState;
```

| Current state / event                                                        | Exact result                                                                                               |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Active / observed empty list                                                 | Exact no-op; an empty observation does not erase frozen open-stack previews                               |
| Active / observed missing ID or changed canonical mission object             | Merge only those incoming entries, preserving every unrelated cached entry                                |
| Active / every observed ID already maps to its identical object              | Exact no-op; preserve the existing cache identity                                                          |
| Active / Apply settled with remaining preview membership                     | Exact no-op; actor membership alone controls which cached entries can render                              |
| Active / Apply settled without remaining preview membership                  | Clear once                                                                                                 |
| Active / Feed unmount or panel close                                          | Clear and enter terminal `disposed`                                                                        |
| Disposed / every event, including late alarm, facade observation or Apply ACK | Exact no-op; remain disposed with an empty map                                                              |

The Svelte synchronization effect tracks only the facade snapshot. Cache
comparison and mutation execute outside dependency collection (or through an
equivalent pure compare-and-merge boundary), so the effect never subscribes to
the cache it may write. Creating a fresh array wrapper around the same facade
snapshot is not a factual preview change. Re-observing identical mission
objects cannot allocate a fresh cache object or schedule another effect turn.

`APPLY_CYCLE_SETTLED` is projected only after `whenIdle()` settles the exact
current actor's Apply/Retry command. Its boolean is derived from that actor's
post-settlement stack membership, never from the cache. Feed unmount or panel
close disposes the cache in the same Page cleanup that disposes the actor; the
terminal cache guard makes every async late settlement harmless.

Malformed missions cannot enter this path because the typed facade owns the
snapshot. A future untrusted ingress must validate before dispatching this
projection event. Preview-cache failure never authorizes an actor transition,
a Feed write or durable persistence; missing preview objects remain omitted
from the view as already specified by the stack projection.

`isArrivalStackRenderable(state)` is true only for active, exact loaded
presentation with non-empty currently eligible membership. Applying renders
its frozen eligible count/previews, may announce a separate `latest` count and
disables Apply/Retry.

## Stable queue and correlated seen persistence

Entering Nouvelles captures unique ordered unseen IDs and initializes empty
dwell, in-flight and confirmed ledgers. Search/facets/sort project that stable
membership. Becoming seen changes only its badge, never membership or order.

| State          | Event                          | Exact result                                                                                                                                                     |
| -------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `all-feed`     | `ENTER_NEW_QUEUE(ids)`         | Capture unique ordered membership with empty dwell/in-flight/confirmed; preserve the actor ordinal                                                               |
| `stable-queue` | `SORT_QUEUE(ids)`              | Accept only an exact permutation                                                                                                                                 |
| `stable-queue` | `DWELL_STARTED(id, now)`       | Require member, finite time, not confirmed and no dwell/in-flight                                                                                                |
| `stable-queue` | `DWELL_CANCELLED(id)`          | Remove only its active dwell                                                                                                                                     |
| `stable-queue` | `DWELL_ELAPSED(id, now)`       | Require exact active dwell and at least 1,500 ms; atomically allocate the next actor-wide `seenOpId`, move ID to in-flight, clear dwell, emit one `persist-seen` |
| `stable-queue` | Matching `SEEN_PERSISTED`      | Remove exact in-flight pair; if ID remains in queue append it once to confirmed and project `Vu`, otherwise settle without presentation                          |
| `stable-queue` | Matching `SEEN_PERSIST_FAILED` | Remove exact in-flight pair, do not confirm, report; only a still-present ID may start a fresh dwell/retry                                                       |
| `stable-queue` | Crossed/stale/duplicate result | Exact no-op                                                                                                                                                      |
| `stable-queue` | Valid apply write success      | Replace IDs; intersect dwells/confirmed with new IDs; preserve every correlated in-flight operation until its durable result                                     |
| `stable-queue` | `EXIT_NEW_QUEUE`               | Return to all Feed and abandon presentation correlations without resetting the actor-wide ordinal                                                                |

While persistence is in flight the badge remains **Nouveau**. Only confirmed
success changes it to **Vu**. Failure enables a new 1,500 ms dwell; it never
creates a false seen badge. Durable persistence may finish after leaving the
queue, but its late UI result is intentionally ignored; the next capture uses
canonical seen facts. Apply success is not queue exit: it preserves
`seenInFlight`, so a later matching durable ACK still settles the operation and
projects `Vu` when that mission remains in the replacement queue.

`seenOperationOrdinal` belongs to the actor, starts at `0`, is a safe monotone
integer and is never reset by `ENTER_NEW_QUEUE`, `EXIT_NEW_QUEUE`, Apply or an
abandoned persistence result. Allocation fails closed without emitting
`persist-seen` when the next value would be unsafe. A result closure always
dispatches back to the actor that allocated it; disposal makes that old actor
terminal. Therefore leaving and re-entering Nouvelles can abandon an operation
but can never reuse its `seenOpId` in the same actor or deliver it to a new one.

## Cancellation, errors and terminal behaviour

- Scan cancellation belongs to the scan model. A cancelled alarm scan
  publishes no result and cannot clear older pending state.
- Closing the tray is presentation only; Apply has no user cancellation.
- Load, validation and write failures are retryable and never produce visual
  success.
- `PANEL_CLOSED` and `FEED_UNMOUNTED` transition every active state to terminal
  `disposed`, clear presentation state and ignore all late events/effects.
- Reset orchestration must dispose this actor before replacing IndexedDB. A
  new actor bootstraps via the bridge.

## UX and accessibility projection

- The stack is anchored to the lower Feed edge with a target of at least 44 px.
- Count and previews come only from eligible Core snapshots; previews cap at
  three and remain frozen while open.
- The arrival drawer is non-modal: no backdrop, focus trap or
  `aria-modal=true`; it never registers in `modal-focus.model.md`.
- Open focuses its heading; close restores its trigger; apply success scrolls
  once to the Feed start.
- Accepted count changes announce one throttled polite summary.
- Count motion is at most 160 ms; drawer motion at most 180 ms and 6 px;
  reduced motion is immediate.

## Invariants

1. Core derives the sole Feed action; arrivals render only for exact loaded
   presentation.
2. IndexedDB behind the service worker is the only durable catalogue; the
   panel reaches it only through the facade/bridge.
3. Alarm publications are cold-only. Cold/Apply Feed commits are serialized
   guard-write-inline-ACK critical sections; no callback or dispatch can
   interleave. Warm publication never replaces Feed without Apply.
4. Scope revisions are monotone, alarms require exact current revision, and
   enabled/visible facts filter count, preview and apply membership.
5. Two sequential cold publications cannot both hydrate an empty Feed.
6. Pending IDs/previews are unique and have one Core authority.
7. Apply is single-flight. Its async load cannot write; only an exact
   deterministic base-plus-applied candidate can enter the indivisible commit.
8. A scope change while loading logically cancels apply before write and makes
   all late results no-ops.
9. Only matching inline write success clears applied pending, atomically
   advances authoritative Feed/scope facts and updates exactly one Queue branch;
   every failure preserves eligible applied plus later arrivals.
10. Arrivals during apply live in `latest`; success cannot consume them as
    applied membership and failure cannot lose them.
11. Stable queue membership/order never changes merely because a mission
    becomes seen. Each mission has at most one seen operation in flight; only
    matching persistence success confirms it; failure permits a correlated
    retry. Apply success never drops an in-flight correlation, and the
    actor-wide ordinal is never reset or reused across queue captures.
12. Dispose abandons UI pending but never modifies the durable catalogue.
13. No session storage, journal, reconciliation, epoch, free text or LLM output
    participates.
14. Preview-cache synchronization converges: facade snapshots and alarm ingress
    are explicit non-authoritative inputs, identical entries preserve cache
    identity, and no reactive effect subscribes to state that it rewrites.
15. Preview-cache Apply settlement is projected from the current actor's
    post-settlement membership; Feed/panel disposal clears it terminally and
    every late cache event is an exact no-op.

## Mandatory review matrix

- every FeedState/owned-scan tuple and inconsistent combination;
- first scope revision `0`, monotone changes, equal/older alarm revisions and
  immutable complete facts;
- exact synchronous cold hydration, missing publication object/write throw,
  callback/reentrant dispatch during commit, and two sequential publications;
- warm pending capture, loading/error ignore, disabled-source and visible-ID
  filtering before count/preview/apply;
- collapsed/open frozen previews, duplicate/empty publications and ordered
  merge;
- Apply from collapsed/open, double Apply, async load success/failure and
  synchronous write success/failure;
- frozen Feed revision/order and exact deterministic base-plus-applied result,
  rejecting foreign, omitted, duplicate or reordered IDs;
- malformed prepared candidates, incomplete catalogue and stale/crossed/
  duplicate preparation or ACK;
- scope/source/visible change before preparation, after preparation but before
  the serialized write turn (must be impossible), and after success;
- later alarm before load completion and before load/write failure;
- one explicit Retry producing one new load and no automatic loop;
- stable queue permutation, interrupted dwell, 1,499/1,500 ms boundary,
  persistence success/failure, apply success while persistence is in flight,
  retry with a new op ID, exit/re-entry before a late result, safe ordinal
  exhaustion, crossed and late result;
- all-Feed versus stable-queue apply success;
- panel close/Feed unmount in every stack state and remount `smartLoad()`;
- manual Start/Retry direct replacement and zero tray event;
- architecture proof of no panel IndexedDB import, session buffer or reset
  event;
- non-empty preview snapshot followed by the same array wrapper and by a fresh
  wrapper over identical mission objects; each must settle without a second
  cache allocation or reactive update-depth failure;
- facade and alarm preview addition/update, empty snapshot, Apply settlement
  with/without remaining membership, terminal disposal and every crossed/late
  event after disposal;
- non-modal focus, reduced motion and missing preview object behaviour.

## Task 9 mapping

| Task 9 interface                            | Authoritative clause                      | Required RED proof before implementation                                        |
| ------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| Tray only for Feed-compatible pending items | Total presentation, scope and stack rules | No `+N` outside exact loaded; exact eligible count                              |
| Loading Cancel; Empty Start; Error Retry    | Total Feed presentation                   | Exhaustive Feed facts test                                                      |
| Warm scan does not reorder Feed             | Alarm routing and apply linearization     | Loaded alarm leaves visible IDs unchanged until exact write success             |
| Cold empty is atomic                        | Serialized actor and cold route           | No callback between guard/write/ACK; first hydrates, second becomes pending     |
| Scope changes cannot race Apply             | Apply protocol and scope invalidation     | New scope before async preparation prevents every Feed write                    |
| Seen badge follows persistence              | Correlated seen protocol                  | Failure stays Nouveau and retries with new op; only matching success becomes Vu |
| Apply failure remains actionable            | Apply transitions                         | Read/validation/write failure retains membership; one Retry emits one load      |
| Arrival drawer accessibility                | UX projection and modal boundary          | Non-modal semantics, heading/trigger focus and reduced motion                   |

Expected implementation surfaces remain `FeedPage.svelte`,
`MissionArrivalStack.svelte`, the pure reducer and their tests. Any
implementation requiring session persistence or a durable arrival protocol
contradicts this model and must return to Model review.

## Self-review gate

- States, events, transitions, effects, guards, errors, retries and terminal
  paths are explicit.
- Both cold and warm Feed writes have a synchronous last-moment authorization
  with no interleaving window.
- Scope invalidation, stale async results and correlated seen failures are
  fail-closed.
- No transition depends on text or an LLM.

**SELF-REVIEW VERDICT: READY FOR INDEPENDENT COLD REVIEW; NOT APPROVED FOR
IMPLEMENTATION.**
