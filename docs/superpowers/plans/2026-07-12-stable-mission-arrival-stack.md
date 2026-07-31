# Stable Mission Arrival Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Nouvelles queue readable while scan results accumulate in an anchored, inspectable A1 drawer that updates the feed only after explicit confirmation.

**Architecture:** A pure reducer in `lib/core/feed` owns two parallel regions: stable queue membership and arrival-stack inspection. Svelte state consumes reducer effects, the feed controller exposes pending mission data, and UI actions own IntersectionObserver/timers/focus/scroll without recreating business transitions.

**Tech Stack:** TypeScript strict, Svelte 5 runes, Vitest, Playwright, TailwindCSS 4 tokens, Chrome MV3 shell.

## Global Constraints

- Follow `Model → Review → Implement → Verify`; `src/models/mission-arrival-queue.model.md` is authoritative.
- Core contains no async, I/O, `Date.now()`, DOM, timers, Chrome APIs, or Shell imports.
- A mission is readable after 1500ms continuous visibility at an intersection ratio of at least 0.6.
- Seen marking never removes a card from the active stable queue snapshot.
- Pending missions never enter the visible feed without explicit refresh.
- Drawer previews are capped at three and frozen while the drawer is open.
- Navigation remains at the top; the stack anchors to the lower feed edge.
- Motion is opacity/transform only: 160ms count crossfade and 180ms drawer transition; reduced motion is instant.
- No LLM output drives any transition.

---

### Task 1: Pure arrival-queue reducer

**Files:**

- Create: `apps/extension/src/lib/core/feed/mission-arrival-queue.ts`
- Create: `apps/extension/tests/unit/feed/mission-arrival-queue.test.ts`

**Interfaces:**

- Produces: `createMissionArrivalQueueState()`, `transitionMissionArrivalQueue(state, event)`, `DWELL_THRESHOLD_MS`, `DWELL_INTERSECTION_RATIO`, `ARRIVAL_PREVIEW_LIMIT`, `MissionDwellSignal`, `MissionArrivalQueueState`, `MissionArrivalQueueEvent`, `MissionArrivalQueueEffect`.
- Consumed by: Tasks 2 and 4.

- [ ] **Step 1: Write reducer tests first**

Cover stable membership, parallel regions, dwell guards, deduplication, frozen previews, atomic refresh, retry, cancellation, and panel close:

```ts
const initial = createMissionArrivalQueueState();
const entered = transitionMissionArrivalQueue(initial, {
  type: 'ENTER_NEW_QUEUE',
  orderedUnseenIds: ['a', 'a', 'b'],
}).state;
expect(entered.queue).toMatchObject({ value: 'stable-queue', queueIds: ['a', 'b'] });

const started = transitionMissionArrivalQueue(entered, {
  type: 'DWELL_STARTED',
  missionId: 'a',
  now: 100,
}).state;
expect(
  transitionMissionArrivalQueue(started, {
    type: 'DWELL_ELAPSED',
    missionId: 'a',
    now: 1599,
  }).effects
).toEqual([]);
expect(
  transitionMissionArrivalQueue(started, {
    type: 'DWELL_ELAPSED',
    missionId: 'a',
    now: 1600,
  }).effects
).toEqual([{ type: 'mark-seen', missionId: 'a' }]);

const buffered = transitionMissionArrivalQueue(entered, {
  type: 'ARRIVALS_BUFFERED',
  orderedPendingIds: ['n1', 'n2', 'n3', 'n4'],
}).state;
const opened = transitionMissionArrivalQueue(buffered, {
  type: 'OPEN_STACK',
  orderedPreviewIds: ['n1', 'n2', 'n3', 'n4'],
}).state;
const updated = transitionMissionArrivalQueue(opened, {
  type: 'ARRIVALS_BUFFERED',
  orderedPendingIds: ['n1', 'n2', 'n3', 'n4', 'n5'],
}).state;
expect(updated.stack.previewIds).toEqual(['n1', 'n2', 'n3']);
expect(updated.queue).toEqual(opened.queue);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @pulse/extension exec vitest run tests/unit/feed/mission-arrival-queue.test.ts`

Expected: FAIL because `src/lib/core/feed/mission-arrival-queue.ts` does not exist.

- [ ] **Step 3: Implement the pure reducer**

Use discriminated unions with composed regions and emitted effects:

```ts
export const DWELL_THRESHOLD_MS = 1500;
export const DWELL_INTERSECTION_RATIO = 0.6;
export const ARRIVAL_PREVIEW_LIMIT = 3;

export type MissionDwellSignal =
  | { type: 'started'; at: number }
  | { type: 'cancelled'; at: number }
  | { type: 'elapsed'; at: number };

export type MissionArrivalQueueEffect =
  | { type: 'mark-seen'; missionId: string }
  | { type: 'apply-pending' }
  | { type: 'focus-drawer-heading' }
  | { type: 'focus-stack-trigger' }
  | { type: 'scroll-feed-start' };
```

`transitionMissionArrivalQueue` must return `{ state, effects }`, preserve the untouched parallel region on every transition, and reject invalid events as exact no-ops.

- [ ] **Step 4: Run reducer tests and verify GREEN**

Run: `pnpm --filter @pulse/extension exec vitest run tests/unit/feed/mission-arrival-queue.test.ts`

Expected: one test file passed, zero failures.

- [ ] **Step 5: Commit the reducer slice**

```bash
git add apps/extension/src/lib/core/feed/mission-arrival-queue.ts apps/extension/tests/unit/feed/mission-arrival-queue.test.ts
git commit -m "feat(feed): model stable mission arrivals"
```

---

### Task 2: Continuous dwell signals from mission cards

**Files:**

- Modify: `apps/extension/src/ui/actions/on-visible.ts`
- Modify: `apps/extension/src/ui/molecules/MissionCard.svelte`
- Modify: `apps/extension/src/ui/organisms/VirtualMissionFeed.svelte`
- Modify: `apps/extension/tests/unit/ui/on-visible.test.ts`
- Modify: `apps/extension/tests/unit/ui/MissionCard.test.ts`

**Interfaces:**

- Consumes: `MissionDwellSignal`, `DWELL_THRESHOLD_MS`, `DWELL_INTERSECTION_RATIO` from Task 1.
- Produces: `onReadSignal(signal: MissionDwellSignal)` callback from `MissionCard` through `VirtualMissionFeed`.

- [ ] **Step 1: Write failing dwell-action tests**

Replace immediate-intersection expectations with fake-timer assertions:

```ts
vi.useFakeTimers();
const onSignal = vi.fn();
onVisible(el, { onSignal });
observer.trigger({ isIntersecting: true, intersectionRatio: 0.6 });
expect(onSignal).toHaveBeenCalledWith({ type: 'started', at: expect.any(Number) });
vi.advanceTimersByTime(1499);
expect(onSignal).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'elapsed' }));
vi.advanceTimersByTime(1);
expect(onSignal).toHaveBeenCalledWith({ type: 'elapsed', at: expect.any(Number) });
```

Add cases for ratio `0.59`, cancellation on visibility loss, timer cleanup on destroy, and no signal when disabled.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter @pulse/extension exec vitest run tests/unit/ui/on-visible.test.ts tests/unit/ui/MissionCard.test.ts`

Expected: FAIL because the action still calls a callback immediately and MissionCard has no `onReadSignal` contract.

- [ ] **Step 3: Implement the action and callback plumbing**

Use an options object and emit deterministic UI-shell signals:

```ts
export interface OnVisibleOptions {
  disabled?: boolean;
  onSignal: (signal: MissionDwellSignal) => void;
}

export function onVisible(node: HTMLElement, options: OnVisibleOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  // IntersectionObserver threshold = DWELL_INTERSECTION_RATIO.
  // Start once, cancel below threshold, emit elapsed after DWELL_THRESHOLD_MS.
  // destroy() clears timer and disconnects observer.
}
```

`MissionCard` passes `disabled: isSeen`, displays **Vu** only when new prop `showSeenStatus` is true, and forwards signals without deciding seen state. `VirtualMissionFeed` adds `stableQueueActive` and forwards `(mission.id, signal)` to the page callback.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `pnpm --filter @pulse/extension exec vitest run tests/unit/ui/on-visible.test.ts tests/unit/ui/MissionCard.test.ts`

Expected: both files passed.

- [ ] **Step 5: Commit the dwell slice**

```bash
git add apps/extension/src/ui/actions/on-visible.ts apps/extension/src/ui/molecules/MissionCard.svelte apps/extension/src/ui/organisms/VirtualMissionFeed.svelte apps/extension/tests/unit/ui/on-visible.test.ts apps/extension/tests/unit/ui/MissionCard.test.ts
git commit -m "fix(feed): require continuous visibility before seen"
```

---

### Task 3: Expose pending mission previews from the controller

**Files:**

- Modify: `apps/extension/src/lib/shell/facades/feed-controller.svelte.ts`
- Modify: `apps/extension/tests/unit/facades/feed-controller.test.ts`
- Modify: `apps/extension/tests/unit/state/feed-page.test.ts` (controller stub)

**Interfaces:**

- Produces: `FeedController.pendingMissions: Mission[]`, a read-only snapshot used for preview selection.
- Consumed by: Tasks 4 and 5.

- [ ] **Step 1: Add failing controller assertions**

Extend the partial/final buffering tests:

```ts
expect(controller.pendingMissions.map((mission) => mission.id)).toEqual(['new-free-work']);
await controller.applyPendingMissions();
expect(controller.pendingMissions).toEqual([]);
```

For final results, assert the getter exposes the normalized buffered missions before apply.

- [ ] **Step 2: Run the controller test and verify RED**

Run: `pnpm --filter @pulse/extension exec vitest run tests/unit/facades/feed-controller.test.ts`

Expected: FAIL because `pendingMissions` is missing.

- [ ] **Step 3: Implement the reactive getter**

Add `let pendingMissions = $state<Mission[]>([])`. Partial results set it to the flattened connector missions; final results set it to the final normalized snapshot. `clearPendingScanUpdate()` resets it. Never expose the mutable internal array directly; getters return a copied array.

- [ ] **Step 4: Run controller tests and verify GREEN**

Run: `pnpm --filter @pulse/extension exec vitest run tests/unit/facades/feed-controller.test.ts`

Expected: test file passed.

- [ ] **Step 5: Commit the controller slice**

```bash
git add apps/extension/src/lib/shell/facades/feed-controller.svelte.ts apps/extension/tests/unit/facades/feed-controller.test.ts apps/extension/tests/unit/state/feed-page.test.ts
git commit -m "feat(feed): expose buffered mission previews"
```

---

### Task 4: Consume the model in feed state

**Files:**

- Modify: `apps/extension/src/lib/state/feed-page.svelte.ts`
- Modify: `apps/extension/tests/unit/state/feed-page.test.ts`

**Interfaces:**

- Consumes: reducer/events/effects from Task 1, dwell signals from Task 2, controller previews from Task 3.
- Produces: `stableQueueActive`, `arrivalStackState`, `arrivalPreviewMissions`, `handleMissionReadSignal`, `openArrivalStack`, `closeArrivalStack`, `startArrivalRefresh`, `completeArrivalRefresh`, `failArrivalRefresh`.

- [ ] **Step 1: Write failing stable-queue state tests**

Test the original cascade directly:

```ts
page.toggleNewOnly();
expect(page.displayMissions.map(({ id }) => id)).toEqual(['new-1', 'new-2']);
page.handleMissionReadSignal('new-1', { type: 'started', at: 0 });
page.handleMissionReadSignal('new-1', { type: 'elapsed', at: 1500 });
vi.advanceTimersByTime(120);
expect(page.seenIds).toContain('new-1');
expect(page.displayMissions.map(({ id }) => id)).toEqual(['new-1', 'new-2']);
expect(page.stableQueueActive).toBe(true);
```

Add tests that exiting/re-entering removes persisted seen missions, stack state remains independent of queue mode, and previews stay frozen when controller pending data changes.

- [ ] **Step 2: Run state tests and verify RED**

Run: `pnpm --filter @pulse/extension exec vitest run tests/unit/state/feed-page.test.ts`

Expected: FAIL because the new API and stable snapshot do not exist.

- [ ] **Step 3: Refactor filtering into a pre-new projection**

Create a derived `decisionFilteredMissions` that applies enabled-source, favorites, hidden, remote, stack, seniority, score, and non-new decision presets. Derive `newQueueCandidateMissions` from that projection plus selected source, current sort, and `!seenSet.has(id)`. Then apply either reducer `queueIds` or the unseen predicate when Nouvelles is active.

```ts
const newQueueRequested = $derived(showNewOnly || decisionPreset === 'new');
const stableQueueIds = $derived(
  arrivalQueueState.queue.value === 'stable-queue'
    ? new Set(arrivalQueueState.queue.queueIds)
    : null
);
```

An effect dispatches `ENTER_NEW_QUEUE` once when requested and `EXIT_NEW_QUEUE` once when deactivated. It must not depend on `displayMissions`, avoiding a derived cycle.

- [ ] **Step 4: Execute model effects in one function**

```ts
function dispatchArrival(event: MissionArrivalQueueEvent): MissionArrivalQueueEffect[] {
  const transition = transitionMissionArrivalQueue(arrivalQueueState, event);
  arrivalQueueState = transition.state;
  for (const effect of transition.effects) {
    if (effect.type === 'mark-seen') queueSeenMission(effect.missionId);
  }
  return transition.effects;
}
```

Controller pending ids feed `ARRIVALS_BUFFERED`; an empty controller buffer dispatches `SCAN_CANCELLED` only when the stack is not `refreshing`. Preview ordering follows the current feed sort before `OPEN_STACK` freezes the first three ids.

- [ ] **Step 5: Run state tests and verify GREEN**

Run: `pnpm --filter @pulse/extension exec vitest run tests/unit/state/feed-page.test.ts tests/unit/feed/mission-arrival-queue.test.ts`

Expected: both test files passed.

- [ ] **Step 6: Commit the state slice**

```bash
git add apps/extension/src/lib/state/feed-page.svelte.ts apps/extension/tests/unit/state/feed-page.test.ts
git commit -m "fix(feed): keep new mission queue stable"
```

---

### Task 5: Build and integrate the anchored A1 drawer

**Files:**

- Create: `apps/extension/src/ui/organisms/MissionArrivalStack.svelte`
- Create: `apps/extension/tests/unit/ui/MissionArrivalStack.test.ts`
- Modify: `apps/extension/src/ui/pages/FeedPage.svelte`
- Modify: `apps/extension/src/ui/organisms/VirtualMissionFeed.svelte`
- Modify: `apps/extension/src/ui/organisms/ToastContainer.svelte`
- Modify: `apps/extension/tests/unit/ui/operational-ui-constraints.test.ts`

**Interfaces:**

- Consumes: state API from Task 4 and pending missions from Task 3.
- Produces: accessible collapsed stack and non-modal drawer with callbacks `onOpen`, `onClose`, `onRefresh`.

- [ ] **Step 1: Write failing component/contract tests**

Mount the new organism and assert:

```ts
expect(target.querySelector('[data-testid="mission-arrival-stack"]')).not.toBeNull();
expect(target.textContent).toContain('Nouvelles arrivées');
expect(target.textContent).toContain('+8');
openButton.click();
await tick();
expect(target.textContent).toContain('Actualiser la file avec les 8 missions');
expect(target.querySelectorAll('[data-testid="arrival-preview"]')).toHaveLength(3);
```

Also assert accessible count, `Escape` close, focus restoration, error copy, disabled applying state, no backdrop, and design-token-only classes. Add a source contract proving the old inline pending banner is removed and reduced-motion styles exist.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `pnpm --filter @pulse/extension exec vitest run tests/unit/ui/MissionArrivalStack.test.ts tests/unit/ui/operational-ui-constraints.test.ts`

Expected: FAIL because the organism does not exist and FeedPage still has the inline banner.

- [ ] **Step 3: Implement `MissionArrivalStack.svelte`**

Use Svelte 5 `$props`, existing `Icon`, design tokens, at most three solid layer elements, a 44px minimum trigger, a non-modal drawer without backdrop/focus trap, and `@media (prefers-reduced-motion: reduce)`. The drawer heading is programmatically focusable; close restores focus to the trigger.

- [ ] **Step 4: Integrate into `FeedPage.svelte`**

Remove the old `pending-missions-banner`. Lazy-load the stack when pending data exists. The async refresh handler must dispatch `REFRESH_QUEUE`, await `controller.applyPendingMissions()`, call `completeArrivalRefresh()`, wait for `tick()`, and scroll the mission section to the start. Catching an error calls `failArrivalRefresh('Impossible d’actualiser la file. Réessayer.')`.

Pass `stableQueueActive` and `handleMissionReadSignal` to `VirtualMissionFeed`. Add feed bottom padding while the stack is present. Move the existing comparison dock above the collapsed stack and hide it while the drawer is open so the two fixed controls never overlap.

Set `--toast-bottom-offset` on `document.documentElement` while the stack exists and remove it on cleanup. `ToastContainer` consumes `bottom-[var(--toast-bottom-offset,4rem)]` so notifications do not cover the stack trigger.

- [ ] **Step 5: Run UI/state/controller tests and verify GREEN**

Run: `pnpm --filter @pulse/extension exec vitest run tests/unit/ui/MissionArrivalStack.test.ts tests/unit/ui/MissionCard.test.ts tests/unit/ui/on-visible.test.ts tests/unit/ui/operational-ui-constraints.test.ts tests/unit/state/feed-page.test.ts tests/unit/facades/feed-controller.test.ts tests/unit/feed/mission-arrival-queue.test.ts`

Expected: all targeted test files passed.

- [ ] **Step 6: Commit the UI slice**

```bash
git add apps/extension/src/ui/organisms/MissionArrivalStack.svelte apps/extension/src/ui/pages/FeedPage.svelte apps/extension/src/ui/organisms/VirtualMissionFeed.svelte apps/extension/src/ui/organisms/ToastContainer.svelte apps/extension/tests/unit/ui/MissionArrivalStack.test.ts apps/extension/tests/unit/ui/operational-ui-constraints.test.ts
git commit -m "feat(feed): add anchored mission arrival stack"
```

---

### Task 6: End-to-end regression and verification

**Files:**

- Modify: `apps/extension/tests/e2e/feed.test.ts`
- Modify: `apps/extension/tests/e2e/performance/virtual-list.test.ts`
- Modify: `apps/extension/src/models/mission-arrival-queue.model.md` only if runtime evidence reveals a reviewed model discrepancy.

**Interfaces:**

- Consumes: complete feature from Tasks 1–5.
- Produces: browser-visible proof of stable reading, stack inspection, explicit refresh, large-feed bounded rendering, and reduced motion.

- [ ] **Step 1: Replace the old partial-scan banner E2E expectation**

The slow partial-scan fixture must now assert the anchored trigger appears while the existing feed stays unchanged, opening shows a frozen preview, and explicit refresh reveals the mission.

- [ ] **Step 2: Add the original cascade regression**

Activate Nouvelles with several injected missions, wait longer than multiple `SEEN_FLUSH_MS` windows, and assert the first visible mission id and mission count remain unchanged while its badge becomes **Vu**.

- [ ] **Step 3: Add large-feed arrival-stack coverage**

With 200+ missions, buffer results and assert the stack has three visual layers and no more than three preview rows regardless of total count.

- [ ] **Step 4: Run targeted E2E**

Run: `pnpm --filter @pulse/ui build && pnpm --filter @pulse/extension exec playwright test tests/e2e/feed.test.ts tests/e2e/performance/virtual-list.test.ts --project=chromium`

Expected: targeted specs passed.

- [ ] **Step 5: Run repository verification gates**

```bash
pnpm --filter @pulse/extension exec vitest run --reporter=dot
pnpm --filter @pulse/extension lint
pnpm --filter @pulse/extension typecheck
pnpm --filter @pulse/extension build
git diff --check
```

Expected: every command exits 0. Existing test fixture warnings may print, but no failure is accepted.

- [ ] **Step 6: Verify in a real browser**

Run `pnpm --filter @pulse/extension dev`, open `/src/sidepanel/index.html` at side-panel width, trigger a slow partial scan, and record evidence for:

- current cards remain stationary;
- stack layers/count update without per-card choreography;
- drawer previews remain frozen under another batch;
- Escape/focus restoration work;
- explicit refresh is the only list replacement;
- comparison dock and toast do not overlap the stack;
- `prefers-reduced-motion: reduce` removes interpolation.

- [ ] **Step 7: Commit verification coverage**

```bash
git add apps/extension/tests/e2e/feed.test.ts apps/extension/tests/e2e/performance/virtual-list.test.ts apps/extension/src/models/mission-arrival-queue.model.md docs/superpowers/specs/2026-07-12-mission-arrival-stack-design.md docs/superpowers/plans/2026-07-12-stable-mission-arrival-stack.md
git commit -m "test(feed): verify stable mission arrivals"
```
