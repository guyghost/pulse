import {
  createMissionArrivalQueueState,
  mergeAppliedIntoBase,
  transitionMissionArrivalQueue,
  type FeedPresentationFacts,
  type MissionArrivalQueueEffect,
  type MissionArrivalQueueEvent,
  type MissionArrivalQueueState,
  type ProjectionCandidate,
} from '$lib/core/feed/mission-arrival-queue';
import type { Mission, MissionSource } from '$lib/core/types/mission';

type PrivateArrivalEvent =
  | Extract<MissionArrivalQueueEvent, { type: 'PROJECTION_PREPARED' }>
  | Extract<MissionArrivalQueueEvent, { type: 'PROJECTION_LOAD_FAILED' }>
  | Extract<MissionArrivalQueueEvent, { type: 'PROJECTION_WRITE_SUCCEEDED' }>
  | Extract<MissionArrivalQueueEvent, { type: 'PROJECTION_WRITE_FAILED' }>
  | Extract<MissionArrivalQueueEvent, { type: 'SEEN_PERSISTED' }>
  | Extract<MissionArrivalQueueEvent, { type: 'SEEN_PERSIST_FAILED' }>;

export type MissionArrivalActorEvent = Exclude<MissionArrivalQueueEvent, PrivateArrivalEvent>;

export interface FeedProjectionResult {
  missions: readonly Mission[];
  orderedUnseenIds: readonly string[];
}

export interface MissionArrivalActorDependencies {
  readFeed(): readonly Mission[];
  /** Must replace the complete Feed atomically or throw before mutating it. */
  replaceFeedSync(missions: readonly Mission[]): void;
  loadProjection(orderedIds: readonly string[]): Promise<FeedProjectionResult>;
  persistSeen(missionId: string): Promise<void>;
  onStateChanged?(state: MissionArrivalQueueState): void;
  onEffect?(effect: MissionArrivalQueueEffect): void;
}

export interface MissionArrivalActor {
  readonly state: MissionArrivalQueueState;
  dispatch(event: MissionArrivalActorEvent): void;
  synchronizePresentation(facts: FeedPresentationFacts): void;
  synchronizeScope(enabledSources: ReadonlySet<MissionSource>): void;
  publishAlarm(missions: readonly Mission[]): void;
  whenIdle(): Promise<void>;
  dispose(): void;
}

type ActorCommand =
  | { type: 'event'; event: MissionArrivalQueueEvent; private: boolean }
  | { type: 'alarm'; scopeRevision: number; missions: readonly Mission[] }
  | { type: 'prepared'; candidate: ProjectionCandidate; missions: readonly Mission[] };

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))];
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function sameSources(left: ReadonlySet<MissionSource>, right: ReadonlySet<MissionSource>): boolean {
  return left.size === right.size && [...left].every((source) => right.has(source));
}

function correlation(candidate: ProjectionCandidate) {
  return {
    applyId: candidate.applyId,
    appliedRevision: candidate.appliedRevision,
    scopeRevision: candidate.scopeRevision,
    baseFeedRevision: candidate.baseFeedRevision,
  };
}

export function createMissionArrivalActor(
  dependencies: MissionArrivalActorDependencies
): MissionArrivalActor {
  let state = createMissionArrivalQueueState();
  let lastPresentationFacts: FeedPresentationFacts | null = null;
  let draining = false;
  let pendingAsync = 0;
  let seenPersistenceActive = false;
  const seenPersistenceQueue: Array<Extract<MissionArrivalQueueEffect, { type: 'persist-seen' }>> =
    [];
  const commands: ActorCommand[] = [];
  const idleWaiters = new Set<() => void>();

  function isIdle(): boolean {
    return !draining && commands.length === 0 && pendingAsync === 0;
  }

  function settleIdleWaiters(): void {
    if (!isIdle()) {
      return;
    }
    for (const resolve of idleWaiters) {
      resolve();
    }
    idleWaiters.clear();
  }

  function enqueue(command: ActorCommand): void {
    commands.push(command);
    drain();
  }

  function enqueuePrivate(event: PrivateArrivalEvent): void {
    enqueue({ type: 'event', event, private: true });
  }

  function startAsync(operation: () => Promise<void>): void {
    pendingAsync += 1;
    void operation().finally(() => {
      pendingAsync -= 1;
      settleIdleWaiters();
    });
  }

  function report(effect: MissionArrivalQueueEffect): void {
    dependencies.onEffect?.(effect);
  }

  function reduce(event: MissionArrivalQueueEvent): readonly MissionArrivalQueueEffect[] {
    const transition = transitionMissionArrivalQueue(state, event);
    state = transition.state;
    return transition.effects;
  }

  function stageColdCommit(
    effect: Extract<MissionArrivalQueueEffect, { type: 'hydrate-cold-feed-sync' }>
  ) {
    if (
      state.lifecycle !== 'active' ||
      state.presentation.value !== 'empty' ||
      state.scopeRevision !== effect.scopeRevision ||
      state.feedRevision !== effect.baseFeedRevision ||
      state.orderedVisibleFeedIds.length !== 0 ||
      dependencies.readFeed().length !== 0
    ) {
      return null;
    }
    const nextScopeRevision = state.scopeRevision + 1;
    const nextFeedRevision = state.feedRevision + 1;
    const nextPresentationRevision = state.presentationRevision + 1;
    if (
      !Number.isSafeInteger(nextScopeRevision) ||
      !Number.isSafeInteger(nextFeedRevision) ||
      !Number.isSafeInteger(nextPresentationRevision)
    ) {
      return null;
    }
    const scopeTransition = transitionMissionArrivalQueue(state, {
      type: 'PENDING_SCOPE_CHANGED',
      scopeRevision: nextScopeRevision,
      feedRevision: nextFeedRevision,
      enabledSources: state.enabledSources,
      orderedVisibleFeedIds: effect.orderedIds,
      visibleFeedIds: new Set(effect.orderedIds),
    });
    const facts: FeedPresentationFacts = {
      feedState: 'loaded',
      ownedScan: null,
      networkOnline: lastPresentationFacts?.networkOnline ?? true,
    };
    const presentationTransition = transitionMissionArrivalQueue(scopeTransition.state, {
      type: 'FEED_FACTS_CHANGED',
      revision: nextPresentationRevision,
      facts,
    });
    return { state: presentationTransition.state, facts };
  }

  function commitCold(
    effect: Extract<MissionArrivalQueueEffect, { type: 'hydrate-cold-feed-sync' }>,
    publication: ReadonlyMap<string, Mission>
  ): void {
    const orderedIds = uniqueIds(effect.orderedIds);
    const missions = orderedIds.map((id) => publication.get(id));
    if (
      !sameIds(orderedIds, effect.orderedIds) ||
      missions.some((mission) => mission === undefined)
    ) {
      report({ type: 'report-arrival-error', reason: 'CATALOGUE_INCOMPLETE' });
      return;
    }
    const staged = stageColdCommit(effect);
    if (!staged) {
      return;
    }
    try {
      dependencies.replaceFeedSync(missions as Mission[]);
      state = staged.state;
      lastPresentationFacts = staged.facts;
    } catch {
      report({ type: 'report-arrival-error', reason: 'FEED_WRITE_FAILED' });
    }
  }

  function prepareProjection(
    effect: Extract<MissionArrivalQueueEffect, { type: 'load-feed-projection' }>
  ): void {
    const orderedIds = mergeAppliedIntoBase(effect.orderedBaseFeedIds, effect.snapshot.orderedIds);
    if (orderedIds.length === 0) {
      enqueuePrivate({
        type: 'PROJECTION_LOAD_FAILED',
        applyId: effect.applyId,
        appliedRevision: effect.snapshot.revision,
        scopeRevision: effect.scopeRevision,
        baseFeedRevision: effect.baseFeedRevision,
        reason: 'CATALOGUE_INCOMPLETE',
      });
      return;
    }
    startAsync(async () => {
      let result: FeedProjectionResult;
      try {
        result = await dependencies.loadProjection(orderedIds);
      } catch {
        enqueuePrivate({
          type: 'PROJECTION_LOAD_FAILED',
          applyId: effect.applyId,
          appliedRevision: effect.snapshot.revision,
          scopeRevision: effect.scopeRevision,
          baseFeedRevision: effect.baseFeedRevision,
          reason: 'CATALOGUE_READ_FAILED',
        });
        return;
      }
      const byId = new Map<string, Mission>();
      for (const mission of result.missions) {
        if (byId.has(mission.id)) {
          enqueuePrivate({
            type: 'PROJECTION_LOAD_FAILED',
            applyId: effect.applyId,
            appliedRevision: effect.snapshot.revision,
            scopeRevision: effect.scopeRevision,
            baseFeedRevision: effect.baseFeedRevision,
            reason: 'CATALOGUE_INCOMPLETE',
          });
          return;
        }
        byId.set(mission.id, mission);
      }
      if (
        byId.size !== orderedIds.length ||
        [...byId.keys()].some((id) => !orderedIds.includes(id)) ||
        orderedIds.some((id) => !byId.has(id))
      ) {
        enqueuePrivate({
          type: 'PROJECTION_LOAD_FAILED',
          applyId: effect.applyId,
          appliedRevision: effect.snapshot.revision,
          scopeRevision: effect.scopeRevision,
          baseFeedRevision: effect.baseFeedRevision,
          reason: 'CATALOGUE_INCOMPLETE',
        });
        return;
      }
      const missions = orderedIds.map((id) => byId.get(id) as Mission);
      enqueue({
        type: 'prepared',
        missions,
        candidate: {
          applyId: effect.applyId,
          appliedRevision: effect.snapshot.revision,
          scopeRevision: effect.scopeRevision,
          baseFeedRevision: effect.baseFeedRevision,
          orderedAllFeedIds: orderedIds,
          orderedUnseenIds: [...result.orderedUnseenIds],
        },
      });
    });
  }

  function commitProjection(
    effect: Extract<MissionArrivalQueueEffect, { type: 'write-feed-projection-sync' }>,
    preparedMissions: readonly Mission[] | null
  ): void {
    if (
      state.lifecycle !== 'active' ||
      state.stack.value !== 'applying' ||
      state.stack.prepared !== effect.candidate ||
      state.presentation.value !== 'loaded' ||
      state.scopeRevision !== effect.candidate.scopeRevision ||
      state.feedRevision !== effect.candidate.baseFeedRevision ||
      !sameIds(state.orderedVisibleFeedIds, state.stack.orderedBaseFeedIds) ||
      !sameIds(
        dependencies.readFeed().map((mission) => mission.id),
        state.stack.orderedBaseFeedIds
      ) ||
      preparedMissions === null ||
      !sameIds(
        preparedMissions.map((mission) => mission.id),
        effect.candidate.orderedAllFeedIds
      )
    ) {
      return;
    }
    const success = transitionMissionArrivalQueue(state, {
      type: 'PROJECTION_WRITE_SUCCEEDED',
      ...correlation(effect.candidate),
    });
    if (success.state === state) {
      return;
    }
    try {
      dependencies.replaceFeedSync(preparedMissions);
      state = success.state;
      for (const nextEffect of success.effects) {
        report(nextEffect);
      }
    } catch {
      const failure = transitionMissionArrivalQueue(state, {
        type: 'PROJECTION_WRITE_FAILED',
        ...correlation(effect.candidate),
      });
      state = failure.state;
      for (const nextEffect of failure.effects) {
        report(nextEffect);
      }
    }
  }

  function drainSeenPersistenceQueue(): void {
    if (seenPersistenceActive) {
      return;
    }
    const effect = seenPersistenceQueue.shift();
    if (!effect) {
      settleIdleWaiters();
      return;
    }
    seenPersistenceActive = true;
    void (async () => {
      try {
        await dependencies.persistSeen(effect.missionId);
        enqueuePrivate({
          type: 'SEEN_PERSISTED',
          missionId: effect.missionId,
          seenOpId: effect.seenOpId,
        });
      } catch {
        enqueuePrivate({
          type: 'SEEN_PERSIST_FAILED',
          missionId: effect.missionId,
          seenOpId: effect.seenOpId,
        });
      } finally {
        seenPersistenceActive = false;
        pendingAsync -= 1;
        drainSeenPersistenceQueue();
      }
    })();
  }

  function persistSeen(effect: Extract<MissionArrivalQueueEffect, { type: 'persist-seen' }>): void {
    pendingAsync += 1;
    seenPersistenceQueue.push(effect);
    drainSeenPersistenceQueue();
  }

  function runEffects(
    effects: readonly MissionArrivalQueueEffect[],
    publication: ReadonlyMap<string, Mission>,
    preparedMissions: readonly Mission[] | null
  ): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'hydrate-cold-feed-sync':
          commitCold(effect, publication);
          break;
        case 'load-feed-projection':
          prepareProjection(effect);
          break;
        case 'write-feed-projection-sync':
          commitProjection(effect, preparedMissions);
          break;
        case 'persist-seen':
          persistSeen(effect);
          break;
        default:
          report(effect);
      }
    }
  }

  function process(command: ActorCommand): void {
    let effects: readonly MissionArrivalQueueEffect[] = [];
    let publication = new Map<string, Mission>();
    let preparedMissions: readonly Mission[] | null = null;
    if (command.type === 'alarm') {
      publication = new Map(command.missions.map((mission) => [mission.id, mission]));
      effects = reduce({
        type: 'ALARM_MISSIONS_RECEIVED',
        scopeRevision: command.scopeRevision,
        candidates: command.missions.map(({ id, source }) => ({ id, source })),
      });
    } else if (command.type === 'prepared') {
      preparedMissions = command.missions;
      effects = reduce({ type: 'PROJECTION_PREPARED', candidate: command.candidate });
    } else {
      if (
        !command.private &&
        (command.event.type === 'PROJECTION_PREPARED' ||
          command.event.type === 'PROJECTION_LOAD_FAILED' ||
          command.event.type === 'PROJECTION_WRITE_SUCCEEDED' ||
          command.event.type === 'PROJECTION_WRITE_FAILED' ||
          command.event.type === 'SEEN_PERSISTED' ||
          command.event.type === 'SEEN_PERSIST_FAILED')
      ) {
        return;
      }
      effects = reduce(command.event);
    }
    runEffects(effects, publication, preparedMissions);
    dependencies.onStateChanged?.(state);
  }

  function drain(): void {
    if (draining) {
      return;
    }
    draining = true;
    try {
      while (commands.length > 0) {
        const command = commands.shift();
        if (command) {
          process(command);
        }
      }
    } finally {
      draining = false;
      settleIdleWaiters();
    }
  }

  function synchronizePresentation(facts: FeedPresentationFacts): void {
    if (state.lifecycle === 'disposed') {
      return;
    }
    lastPresentationFacts = {
      ...facts,
      ownedScan: facts.ownedScan ? { ...facts.ownedScan } : null,
    };
    const revision = state.presentationRevision + 1;
    if (!Number.isSafeInteger(revision)) {
      return;
    }
    enqueue({
      type: 'event',
      private: false,
      event: { type: 'FEED_FACTS_CHANGED', revision, facts: lastPresentationFacts },
    });
  }

  function synchronizeScope(enabledSources: ReadonlySet<MissionSource>): void {
    if (state.lifecycle === 'disposed') {
      return;
    }
    const orderedVisibleFeedIds = uniqueIds(dependencies.readFeed().map((mission) => mission.id));
    const feedChanged = !sameIds(orderedVisibleFeedIds, state.orderedVisibleFeedIds);
    const sourcesChanged = !sameSources(enabledSources, state.enabledSources);
    if (state.scopeRevision >= 0 && !feedChanged && !sourcesChanged) {
      return;
    }
    const scopeRevision = state.scopeRevision + 1;
    const feedRevision =
      feedChanged || state.feedRevision < 0 ? state.feedRevision + 1 : state.feedRevision;
    if (!Number.isSafeInteger(scopeRevision) || !Number.isSafeInteger(feedRevision)) {
      return;
    }
    enqueue({
      type: 'event',
      private: false,
      event: {
        type: 'PENDING_SCOPE_CHANGED',
        scopeRevision,
        feedRevision,
        enabledSources: new Set(enabledSources),
        orderedVisibleFeedIds,
        visibleFeedIds: new Set(orderedVisibleFeedIds),
      },
    });
  }

  return {
    get state() {
      return state;
    },
    dispatch(event) {
      enqueue({ type: 'event', event, private: false });
    },
    synchronizePresentation,
    synchronizeScope,
    publishAlarm(missions) {
      enqueue({ type: 'alarm', scopeRevision: state.scopeRevision, missions: [...missions] });
    },
    whenIdle() {
      if (isIdle()) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => idleWaiters.add(resolve));
    },
    dispose() {
      if (state.lifecycle === 'disposed') {
        return;
      }
      enqueue({ type: 'event', event: { type: 'PANEL_CLOSED' }, private: false });
    },
  };
}
