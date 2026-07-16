import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  SETTINGS_PENDING_INTENT_STORAGE_KEY,
  commandId,
  contractFor,
  expectedAlarm,
  makeError,
  settingsDigest,
  type SettingsEnvelopeV2,
  type SettingsGlobalStorageReservationDenialV1,
  type SettingsGlobalStorageReservationProofV1,
  type SettingsMutationOutcomeV1,
  type SettingsPersistenceContext,
  type SettingsSnapshotV1,
} from '../../../src/models/settings-persistence.contract';
import * as settingsModule from '../../../src/models/settings-persistence.machine';
import {
  createSettingsPersistenceController,
  normalizeSettingsPersistenceEvent,
  type SettingsPersistenceController,
  type SettingsPersistencePublicView,
} from '../../../src/models/settings-persistence.machine';

const uuid = (suffix: number): string =>
  `10000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const DATA_EPOCH = uuid(1);
const WORKER_EPOCH = uuid(999);
const DEFAULT_SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};
const INCLUDED_CONNECTORS = ['free-work'];
const PERMISSION_ORIGINS = { 'free-work': ['https://www.free-work.com/*'] };

type PublicCommand = NonNullable<SettingsPersistencePublicView['command']>;

function createController(
  dataEpoch = DATA_EPOCH,
  initialLoadRequestId = uuid(2)
): SettingsPersistenceController {
  return createSettingsPersistenceController({
    dataEpoch,
    workerEpoch: WORKER_EPOCH,
    defaultSettings: DEFAULT_SETTINGS,
    includedConnectorIds: INCLUDED_CONNECTORS,
    permissionOriginsByConnectorId: PERMISSION_ORIGINS,
    initialLoadRequestId,
    coldStartSeed: null,
  });
}

function commandOfType<T extends PublicCommand['type']>(
  controller: SettingsPersistenceController,
  type: T
): Extract<PublicCommand, { type: T }> {
  const command = controller.getSnapshot().command;
  expect(command?.type).toBe(type);
  if (command?.type !== type) {
    throw new Error(`Expected ${type} command`);
  }
  return command as Extract<PublicCommand, { type: T }>;
}

function acknowledgePendingIntentPersist(
  controller: SettingsPersistenceController,
  proofId: string
): void {
  const command = commandOfType(controller, 'PERSIST_SETTINGS_PENDING_INTENT');
  expect(
    controller.dispatch({
      type: 'SETTINGS_PENDING_INTENT_PERSISTED',
      dataEpoch: command.dataEpoch,
      mutationId: command.pendingIntent.mutation.mutationId,
      commandId: command.commandId,
      proof: {
        version: 1,
        kind: 'SETTINGS_PENDING_INTENT_PERSISTED',
        storageArea: 'session',
        storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
        dataEpoch: command.dataEpoch,
        mutationId: command.pendingIntent.mutation.mutationId,
        originWorkerEpoch: command.pendingIntent.originWorkerEpoch,
        intentRevision: command.intentRevision,
        intentDigest: command.intentDigest,
        commandId: command.commandId,
        proofId,
        readBackVerified: true,
      },
    })
  ).toEqual({ status: 'dispatched' });
}

function acknowledgePendingIntentClear(
  controller: SettingsPersistenceController,
  proofId: string
): void {
  const command = commandOfType(controller, 'CLEAR_SETTINGS_PENDING_INTENT');
  expect(
    controller.dispatch({
      type: 'SETTINGS_PENDING_INTENT_CLEARED',
      dataEpoch: command.dataEpoch,
      mutationId: command.mutationId,
      commandId: command.commandId,
      proof: {
        version: 1,
        kind: 'SETTINGS_PENDING_INTENT_CLEARED',
        storageArea: 'session',
        storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        originWorkerEpoch: command.originWorkerEpoch,
        intentRevision: command.intentRevision,
        intentDigest: command.intentDigest,
        commandId: command.commandId,
        proofId,
        absenceReadBackVerified: true,
      },
    })
  ).toEqual({ status: 'dispatched' });
}

function envelope(
  dataEpoch: string,
  settings: AppSettings = DEFAULT_SETTINGS,
  revision = 0,
  generation = 0,
  outcomes: SettingsMutationOutcomeV1[] = []
): SettingsEnvelopeV2 {
  return {
    version: 2,
    dataEpoch,
    revision,
    generation,
    settings: { ...settings, enabledConnectors: [...settings.enabledConnectors] },
    journal: null,
    outcomes,
  };
}

function snapshot(
  currentEnvelope: SettingsEnvelopeV2,
  requestId: string,
  currentCommandId: string,
  proofId = uuid(900)
): SettingsSnapshotV1 {
  const alarm = expectedAlarm(currentEnvelope.settings);
  return {
    version: 1,
    dataEpoch: currentEnvelope.dataEpoch,
    requestId,
    commandId: currentCommandId,
    resetJournalAbsent: true,
    envelope: currentEnvelope,
    alarmProof: {
      ...alarm,
      dataEpoch: currentEnvelope.dataEpoch,
      envelopeRevision: currentEnvelope.revision,
      envelopeGeneration: currentEnvelope.generation,
      settingsDigest: settingsDigest(currentEnvelope.settings),
      proofId,
      requestId,
      commandId: currentCommandId,
    },
  };
}

function finishLoad(
  controller: SettingsPersistenceController,
  currentEnvelope = envelope(DATA_EPOCH),
  proofId = uuid(901)
): SettingsSnapshotV1 {
  const command = commandOfType(controller, 'RECOVER_AND_LOAD_SETTINGS');
  const loaded = snapshot(currentEnvelope, command.requestId, command.commandId, proofId);
  expect(
    controller.dispatch({
      type: 'LOAD_SUCCEEDED',
      dataEpoch: command.dataEpoch,
      requestId: command.requestId,
      commandId: command.commandId,
      snapshot: loaded,
    })
  ).toEqual({ status: 'dispatched' });
  expect(controller.getSnapshot().state).toBe('saved');
  return loaded;
}

interface MutationIds {
  mutationId: string;
  permissionCheckId: string;
  activationId: string;
  storageReservationId: string;
  activationResultId: string;
}

function mutationIds(base: number): MutationIds {
  return {
    mutationId: uuid(base),
    permissionCheckId: uuid(base + 1),
    activationId: uuid(base + 2),
    storageReservationId: uuid(base + 3),
    activationResultId: uuid(base + 100_000),
  };
}

function consumedActivationResult(ids: MutationIds) {
  return {
    version: 1 as const,
    kind: 'SETTINGS_ACTIVATION_CONSUMED' as const,
    dataEpoch: DATA_EPOCH,
    workerEpoch: WORKER_EPOCH,
    mutationId: ids.mutationId,
    permissionCheckId: ids.permissionCheckId,
    activationId: ids.activationId,
    storageReservationId: ids.storageReservationId,
    issuedAtMs: 1_000,
    expiresAtMs: 301_000,
    observedAtMs: 2_000,
    resultId: ids.activationResultId,
    oneShotConsumed: true as const,
  };
}

function beginThemeMutation(
  controller: SettingsPersistenceController,
  ids: MutationIds,
  candidate: AppSettings['theme'] = 'dark'
): Extract<PublicCommand, { type: 'RESERVE_SETTINGS_STORAGE' }> {
  expect(
    controller.dispatch({
      type: 'MUTATE',
      dataEpoch: DATA_EPOCH,
      mutationId: ids.mutationId,
      permissionCheckId: ids.permissionCheckId,
      activationId: ids.activationId,
      storageReservationId: ids.storageReservationId,
      activationResult: consumedActivationResult(ids),
      key: 'theme',
      candidate,
    })
  ).toEqual({ status: 'dispatched' });
  acknowledgePendingIntentPersist(controller, uuid(800));
  expect(controller.getSnapshot().state).toBe('reserving');
  return commandOfType(controller, 'RESERVE_SETTINGS_STORAGE');
}

function reservationProof(
  command: Extract<PublicCommand, { type: 'RESERVE_SETTINGS_STORAGE' }>,
  gateLeaseId: string,
  proofId: string
): SettingsGlobalStorageReservationProofV1 {
  const quotaBytes = 10_000_000;
  const bytesInUse = 0;
  return {
    version: 1,
    kind: 'CHROME_LOCAL_SETTINGS_RESERVATION',
    storageArea: 'local',
    settingsKey: 'settings',
    dataEpoch: command.dataEpoch,
    mutationId: command.mutationId,
    commandDigest: command.commandDigest,
    baseRevision: command.baseRevision,
    baseGeneration: command.baseGeneration,
    reservationId: command.reservationId,
    gateLeaseId,
    proofId,
    quotaBytes,
    bytesInUse,
    currentSettingsEntryBytes: command.byteProjection.currentSettingsEntryBytes,
    reservedSettingsEntryBytes: command.byteProjection.reservedSettingsEntryBytes,
    requiredAdditionalBytes: command.byteProjection.requiredAdditionalBytes,
    systemReserveBytes: command.byteProjection.systemReserveBytes,
    resetReceiptReserveBytes: command.byteProjection.resetReceiptReserveBytes,
    availableAfterReservationBytes:
      quotaBytes - bytesInUse - command.byteProjection.requiredAdditionalBytes,
    reservationActive: true,
    allLocalWritersFenced: true,
    resetJournalAbsent: true,
  };
}

function reservationDenial(
  command: Extract<PublicCommand, { type: 'RESERVE_SETTINGS_STORAGE' }>,
  gateLeaseId: string,
  proofId: string
): SettingsGlobalStorageReservationDenialV1 {
  return {
    version: 1,
    kind: 'CHROME_LOCAL_SETTINGS_RESERVATION_DENIED',
    storageArea: 'local',
    settingsKey: 'settings',
    dataEpoch: command.dataEpoch,
    mutationId: command.mutationId,
    commandDigest: command.commandDigest,
    baseRevision: command.baseRevision,
    baseGeneration: command.baseGeneration,
    reservationId: command.reservationId,
    gateLeaseId,
    proofId,
    quotaBytes: 0,
    bytesInUse: 0,
    currentSettingsEntryBytes: command.byteProjection.currentSettingsEntryBytes,
    reservedSettingsEntryBytes: command.byteProjection.reservedSettingsEntryBytes,
    requiredAdditionalBytes: command.byteProjection.requiredAdditionalBytes,
    systemReserveBytes: command.byteProjection.systemReserveBytes,
    resetReceiptReserveBytes: command.byteProjection.resetReceiptReserveBytes,
    availableBytes: 0,
    reason: 'INSUFFICIENT_GLOBAL_HEADROOM',
    allLocalWritersFenced: true,
    resetJournalAbsent: true,
  };
}

function grantReservation(
  controller: SettingsPersistenceController,
  command: Extract<PublicCommand, { type: 'RESERVE_SETTINGS_STORAGE' }>,
  idsBase: number
): Extract<PublicCommand, { type: 'COMPARE_AND_SETTLE_SETTINGS' }> {
  expect(
    controller.dispatch({
      type: 'STORAGE_RESERVATION_GRANTED',
      dataEpoch: command.dataEpoch,
      mutationId: command.mutationId,
      commandId: command.commandId,
      proof: reservationProof(command, uuid(idsBase), uuid(idsBase + 1)),
    })
  ).toEqual({ status: 'dispatched' });
  acknowledgePendingIntentPersist(controller, uuid(idsBase + 2));
  expect(controller.getSnapshot().state).toBe('writing');
  return commandOfType(controller, 'COMPARE_AND_SETTLE_SETTINGS');
}

function outcomeFor(
  command:
    | Extract<PublicCommand, { type: 'COMPARE_AND_SETTLE_SETTINGS' }>
    | Extract<PublicCommand, { type: 'ABORT_SETTINGS_MUTATION' }>,
  outcome: SettingsMutationOutcomeV1['outcome'],
  settledRevision: number,
  settledGeneration: number
): SettingsMutationOutcomeV1 {
  return {
    version: 1,
    dataEpoch: command.dataEpoch,
    mutationId: command.mutationId,
    commandDigest: command.commandDigest,
    previousDigest: command.previousDigest,
    candidateDigest: command.candidateDigest,
    baseRevision: command.baseRevision,
    baseGeneration: command.baseGeneration,
    settledRevision,
    settledGeneration,
    correlationIds: [...command.correlationIds],
    outcome,
  };
}

function normalizationContext(dataEpoch = DATA_EPOCH): SettingsPersistenceContext {
  const loadRequestId = uuid(700);
  return {
    dataEpoch,
    workerEpoch: WORKER_EPOCH,
    defaultSettings: { ...DEFAULT_SETTINGS, enabledConnectors: [...INCLUDED_CONNECTORS] },
    includedConnectorIds: [...INCLUDED_CONNECTORS],
    permissionOriginsByConnectorId: {
      'free-work': [...PERMISSION_ORIGINS['free-work']],
    },
    coldStartSeedProvided: false,
    coldStartSeed: null,
    loadStatus: 'loading',
    loadRequestId,
    phase: 'saved',
    canonical: null,
    projected: { ...DEFAULT_SETTINGS, enabledConnectors: [...INCLUDED_CONNECTORS] },
    mutation: null,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
    canonicalRelation: 'unknown',
    retryIntent: null,
    handledActivationIds: [],
    handledActivationResultIds: [],
    pendingIntent: null,
    deferredCommand: null,
    pendingTerminalSettlement: null,
    pendingTerminalTarget: null,
    terminalSettlement: null,
    pendingReset: null,
    reconcileRequestId: null,
    reconcileReason: null,
    runtimeEffectError: null,
    error: null,
    lastRejection: null,
    command: {
      type: 'RECOVER_AND_LOAD_SETTINGS',
      commandId: commandId('load', loadRequestId),
      dataEpoch,
      requestId: loadRequestId,
      resetCorrelation: null,
    },
  };
}

const PUBLIC_VIEW_KEYS = [
  'command',
  'confirmedSettings',
  'dataEpoch',
  'editingDisabled',
  'error',
  'lastRejection',
  'lifecycle',
  'loadStatus',
  'projectedSettings',
  'runtimeEffectError',
  'saveStatus',
  'state',
  'terminalSettlement',
];

const FORBIDDEN_PUBLIC_KEYS = new Set([
  '_nodes',
  'actor',
  'can',
  'children',
  'context',
  'getMeta',
  'historyValue',
  'implementations',
  'machine',
  'matches',
  'send',
  'tags',
  'toJSON',
]);

function expectSafeFrozenGraph(value: unknown, seen = new Set<object>()): void {
  expect(typeof value).not.toBe('function');
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return;
  }
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  const prototype = Object.getPrototypeOf(value);
  expect(
    prototype === Object.prototype || prototype === Array.prototype || prototype === null
  ).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    expect(typeof key).toBe('string');
    expect(FORBIDDEN_PUBLIC_KEYS.has(String(key))).toBe(false);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    expect(descriptor).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(descriptor, 'value')).toBe(true);
    expectSafeFrozenGraph(descriptor?.value, seen);
  }
}

function expectPublicView(view: SettingsPersistencePublicView): void {
  expect(Object.keys(view).sort()).toEqual(PUBLIC_VIEW_KEYS);
  expectSafeFrozenGraph(view);
}

function propertyName(name: ts.PropertyName, source: ts.SourceFile): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText(source);
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function settingsTransitionInventory(): {
  eventTypes: Set<string>;
  branches: number;
  provenanceFailures: string[];
} {
  const sourceText = readFileSync(
    resolve(process.cwd(), 'src/models/settings-persistence.machine.ts'),
    'utf8'
  );
  const source = ts.createSourceFile(
    'settings-persistence.machine.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const constants = new Map<string, ts.Expression>();
  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) {
      return;
    }
    for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        constants.set(declaration.name.text, declaration.initializer);
      }
    }
  });

  function expand(
    expression: ts.Expression,
    trail = new Set<string>()
  ): ts.ObjectLiteralExpression[] {
    const current = unwrapExpression(expression);
    if (ts.isObjectLiteralExpression(current)) {
      return [current];
    }
    if (ts.isArrayLiteralExpression(current)) {
      return current.elements.flatMap((element) =>
        ts.isSpreadElement(element) ? expand(element.expression, trail) : expand(element, trail)
      );
    }
    if (ts.isIdentifier(current)) {
      if (trail.has(current.text)) {
        throw new Error(`Cyclic transition constant: ${current.text}`);
      }
      const target = constants.get(current.text);
      if (!target) {
        throw new Error(`Unknown transition constant: ${current.text}`);
      }
      return expand(target, new Set([...trail, current.text]));
    }
    throw new Error(`Unsupported transition expression: ${current.getText(source)}`);
  }

  function guardStartsWithAdmission(transition: ts.ObjectLiteralExpression): boolean {
    const guardProperty = transition.properties.find(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) && propertyName(property.name, source) === 'guard'
    );
    if (!guardProperty) {
      return false;
    }
    const guard = unwrapExpression(guardProperty.initializer);
    if (ts.isStringLiteral(guard)) {
      return guard.text === 'admittedEvent';
    }
    if (!ts.isCallExpression(guard) || guard.arguments.length === 0) {
      return false;
    }
    const guards = unwrapExpression(guard.arguments[0]);
    if (!ts.isArrayLiteralExpression(guards) || guards.elements.length === 0) {
      return false;
    }
    const first = guards.elements[0];
    return ts.isStringLiteral(first) && first.text === 'admittedEvent';
  }

  let machineConfig: ts.ObjectLiteralExpression | null = null;
  const findMachine = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'createMachine' &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      machineConfig = node.arguments[0];
    }
    ts.forEachChild(node, findMachine);
  };
  findMachine(source);
  if (machineConfig === null) {
    throw new Error('Settings machine config not found');
  }

  const eventTypes = new Set<string>();
  let branches = 0;
  const provenanceFailures: string[] = [];

  function visitObject(object: ts.ObjectLiteralExpression): void {
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }
      const name = propertyName(property.name, source);
      const initializer = unwrapExpression(property.initializer);
      if (name === 'on' && ts.isObjectLiteralExpression(initializer)) {
        for (const transitionProperty of initializer.properties) {
          if (!ts.isPropertyAssignment(transitionProperty)) {
            continue;
          }
          const eventType = propertyName(transitionProperty.name, source);
          if (!eventType.startsWith('SETTINGS_CAPTURED/')) {
            continue;
          }
          eventTypes.add(eventType);
          const transitions = expand(transitionProperty.initializer);
          branches += transitions.length;
          transitions.forEach((transition, index) => {
            if (!guardStartsWithAdmission(transition)) {
              provenanceFailures.push(`${eventType}[${index}]`);
            }
          });
        }
        continue;
      }
      if (ts.isObjectLiteralExpression(initializer)) {
        visitObject(initializer);
      } else if (ts.isArrayLiteralExpression(initializer)) {
        initializer.elements.forEach((element) => {
          const nested = unwrapExpression(
            ts.isSpreadElement(element) ? element.expression : element
          );
          if (ts.isObjectLiteralExpression(nested)) {
            visitObject(nested);
          }
        });
      }
    }
  }

  visitObject(machineConfig);
  return { eventTypes, branches, provenanceFailures };
}

describe('settings persistence public controller contract', () => {
  it('exports no machine, actor, implementation, or send capability', () => {
    expect(
      Object.keys(settingsModule).filter((key) =>
        /(?:machine|actor|implementations|\bsend\b)/i.test(key)
      )
    ).toEqual([]);
  });

  it('returns allowlisted, detached, deeply frozen views from getSnapshot and JSON', () => {
    const controller = createController();
    expect(Object.isFrozen(controller)).toBe(true);
    expect(Object.keys(controller).sort()).toEqual([
      'dispatch',
      'getSnapshot',
      'stop',
      'subscribe',
    ]);

    const first = controller.getSnapshot();
    const second = controller.getSnapshot();
    expectPublicView(first);
    expectPublicView(second);
    expect(first).not.toBe(second);
    expect(first.projectedSettings).not.toBe(second.projectedSettings);
    expect(first.projectedSettings.enabledConnectors).not.toBe(
      second.projectedSettings.enabledConnectors
    );
    expect(first.command).not.toBe(second.command);

    expect(Reflect.set(first, 'dataEpoch', uuid(999))).toBe(false);
    expect(Reflect.set(first.projectedSettings, 'theme', 'dark')).toBe(false);
    expect(Reflect.set(first.projectedSettings.enabledConnectors, '0', 'foreign')).toBe(false);
    expect(() => Object.defineProperty(first, 'machine', { value: {} })).toThrow(TypeError);
    expect(() => Object.setPrototypeOf(first, null)).toThrow(TypeError);

    const parsed = JSON.parse(JSON.stringify(first)) as {
      projectedSettings: { theme: string; enabledConnectors: string[] };
    };
    parsed.projectedSettings.theme = 'dark';
    parsed.projectedSettings.enabledConnectors.push('foreign');
    const fresh = controller.getSnapshot();
    expect(fresh.dataEpoch).toBe(DATA_EPOCH);
    expect(fresh.projectedSettings.theme).toBe('system');
    expect(fresh.projectedSettings.enabledConnectors).toEqual(['free-work']);
  });

  it('detaches confirmed settings and every subscription notification', () => {
    const controller = createController();
    finishLoad(controller);
    const first = controller.getSnapshot();
    const second = controller.getSnapshot();
    expect(first.confirmedSettings).not.toBe(second.confirmedSettings);
    expect(first.confirmedSettings?.enabledConnectors).not.toBe(
      second.confirmedSettings?.enabledConnectors
    );

    const observed: SettingsPersistencePublicView[] = [];
    const subscription = controller.subscribe((view) => observed.push(view));
    expect(Object.isFrozen(subscription)).toBe(true);
    expect(observed).toHaveLength(1);
    expectPublicView(observed[0]);
    expect(observed[0]).not.toBe(first);
    expect(observed[0].confirmedSettings).not.toBe(first.confirmedSettings);
    subscription.unsubscribe();
    subscription.unsubscribe();
    controller.stop();
  });

  it('isolates throwing observers, rejects reentrance, and makes unsubscribe idempotent', () => {
    const controller = createController();
    const firstViews: SettingsPersistencePublicView[] = [];
    const secondViews: SettingsPersistencePublicView[] = [];
    let nestedResult: ReturnType<SettingsPersistenceController['dispatch']> | null = null;

    const firstSubscription = controller.subscribe((view) => {
      firstViews.push(view);
      if (firstViews.length === 2) {
        expect(Reflect.set(view.projectedSettings, 'theme', 'dark')).toBe(false);
        nestedResult = controller.dispatch({
          type: 'LOAD',
          dataEpoch: DATA_EPOCH,
          requestId: uuid(53),
        });
        throw new Error('observer failure must stay isolated');
      }
    });
    const secondSubscription = controller.subscribe((view) => secondViews.push(view));

    expect(
      controller.dispatch({ type: 'LOAD', dataEpoch: DATA_EPOCH, requestId: uuid(52) })
    ).toEqual({ status: 'dispatched' });
    expect(nestedResult).toEqual({ status: 'rejected', reason: 'reentrant' });
    expect(firstViews).toHaveLength(2);
    expect(secondViews).toHaveLength(2);
    expect(firstViews[1]).not.toBe(secondViews[1]);
    expect(firstViews[1].projectedSettings).not.toBe(secondViews[1].projectedSettings);

    firstSubscription.unsubscribe();
    firstSubscription.unsubscribe();
    expect(
      controller.dispatch({ type: 'LOAD', dataEpoch: DATA_EPOCH, requestId: uuid(54) })
    ).toEqual({ status: 'dispatched' });
    expect(firstViews).toHaveLength(2);
    expect(secondViews).toHaveLength(3);
    secondSubscription.unsubscribe();
    controller.stop();
  });

  it('allows stop during notification, then exposes one stopped view to late subscribers', () => {
    const controller = createController();
    let firstCount = 0;
    let secondCount = 0;
    const firstSubscription = controller.subscribe(() => {
      firstCount += 1;
      if (firstCount === 2) {
        controller.stop();
      }
    });
    const secondSubscription = controller.subscribe(() => {
      secondCount += 1;
    });

    expect(
      controller.dispatch({ type: 'LOAD', dataEpoch: DATA_EPOCH, requestId: uuid(61) })
    ).toEqual({ status: 'dispatched' });
    expect({ firstCount, secondCount }).toEqual({ firstCount: 2, secondCount: 2 });
    expect(
      controller.dispatch({ type: 'LOAD', dataEpoch: DATA_EPOCH, requestId: uuid(62) })
    ).toEqual({ status: 'rejected', reason: 'inactive' });
    controller.stop();

    const stoppedViews: SettingsPersistencePublicView[] = [];
    const lateSubscription = controller.subscribe((view) => stoppedViews.push(view));
    expect(Object.isFrozen(lateSubscription)).toBe(true);
    expect(stoppedViews).toHaveLength(1);
    expect(stoppedViews[0].lifecycle).toBe('stopped');
    expectPublicView(stoppedViews[0]);
    lateSubscription.unsubscribe();
    lateSubscription.unsubscribe();
    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();
  });
});

describe('settings persistence atomic admission', () => {
  it('accepts a raw event but rejects retained normalized, fabricated, and cross-controller events', () => {
    const first = createController(DATA_EPOCH, uuid(71));
    const second = createController(DATA_EPOCH, uuid(72));
    const raw = { type: 'LOAD', dataEpoch: DATA_EPOCH, requestId: uuid(73) };
    const normalized = normalizeSettingsPersistenceEvent(raw, normalizationContext());
    expect(normalized).not.toBeNull();
    expect(Object.isFrozen(normalized)).toBe(true);

    expect(first.dispatch(normalized)).toEqual({ status: 'rejected', reason: 'invalid_event' });
    expect(second.dispatch(normalized)).toEqual({ status: 'rejected', reason: 'invalid_event' });
    expect(
      first.dispatch({
        type: 'SETTINGS_CAPTURED/LOAD',
        dataEpoch: DATA_EPOCH,
        requestId: uuid(73),
      })
    ).toEqual({ status: 'rejected', reason: 'invalid_event' });

    expect(first.dispatch(raw)).toEqual({ status: 'dispatched' });
    const afterRaw = first.getSnapshot();
    expect(afterRaw.command?.type).toBe('RECOVER_AND_LOAD_SETTINGS');
    expect(afterRaw.command?.requestId).toBe(uuid(73));
    expect(first.dispatch(raw)).toEqual({ status: 'dispatched' });
    expect(first.getSnapshot()).toEqual(afterRaw);
  });

  it('rejects accessors and revoked proxies without poisoning the next dispatch', () => {
    const controller = createController(DATA_EPOCH, uuid(81));
    let getterCalls = 0;
    const accessorEvent: Record<string, unknown> = {
      dataEpoch: DATA_EPOCH,
      requestId: uuid(82),
    };
    Object.defineProperty(accessorEvent, 'type', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'LOAD';
      },
    });
    expect(controller.dispatch(accessorEvent)).toEqual({
      status: 'rejected',
      reason: 'invalid_event',
    });
    expect(getterCalls).toBe(0);

    const revocable = Proxy.revocable(
      { type: 'LOAD', dataEpoch: DATA_EPOCH, requestId: uuid(83) },
      {}
    );
    revocable.revoke();
    expect(() => controller.dispatch(revocable.proxy)).not.toThrow();
    expect(controller.dispatch(revocable.proxy)).toEqual({
      status: 'rejected',
      reason: 'invalid_event',
    });
    expect(
      controller.dispatch({ type: 'LOAD', dataEpoch: DATA_EPOCH, requestId: uuid(84) })
    ).toEqual({ status: 'dispatched' });
    expect(controller.getSnapshot().command?.requestId).toBe(uuid(84));
  });

  it('keeps all 34 captured event types and every branch provenance-first', () => {
    const inventory = settingsTransitionInventory();
    expect(inventory.eventTypes.size).toBe(34);
    expect(inventory.branches).toBe(126);
    expect(inventory.provenanceFailures).toEqual([]);
  });
});

describe('settings persistence model traces', () => {
  it('loads a settled snapshot and recovers from a failed load with a fresh request', () => {
    const controller = createController(DATA_EPOCH, uuid(101));
    const firstCommand = commandOfType(controller, 'RECOVER_AND_LOAD_SETTINGS');
    expect(
      controller.dispatch({
        type: 'LOAD_FAILED',
        dataEpoch: DATA_EPOCH,
        requestId: firstCommand.requestId,
        commandId: firstCommand.commandId,
        error: makeError(contractFor('SETTINGS_LOAD_FAILED'), 'load unavailable'),
      })
    ).toEqual({ status: 'dispatched' });
    expect(controller.getSnapshot()).toMatchObject({ state: 'loadError', loadStatus: 'error' });

    expect(
      controller.dispatch({ type: 'LOAD', dataEpoch: DATA_EPOCH, requestId: uuid(102) })
    ).toEqual({ status: 'dispatched' });
    expect(commandOfType(controller, 'RECOVER_AND_LOAD_SETTINGS').requestId).toBe(uuid(102));
    finishLoad(controller, envelope(DATA_EPOCH), uuid(103));
    expect(controller.getSnapshot()).toMatchObject({
      state: 'saved',
      loadStatus: 'ready',
      saveStatus: 'saved',
      confirmedSettings: DEFAULT_SETTINGS,
    });
  });

  it('commits a theme mutation only after reservation and a causal committed outcome', () => {
    const controller = createController(DATA_EPOCH, uuid(111));
    finishLoad(controller, envelope(DATA_EPOCH), uuid(112));
    const ids = mutationIds(113);
    const reservation = beginThemeMutation(controller, ids);
    const write = grantReservation(controller, reservation, 117);
    const committedOutcome = outcomeFor(
      write,
      'committed',
      write.baseRevision + 1,
      write.baseGeneration + 2
    );
    const committedEnvelope = envelope(
      DATA_EPOCH,
      write.candidateSettings as AppSettings,
      write.baseRevision + 1,
      write.baseGeneration + 2,
      [committedOutcome]
    );
    expect(
      controller.dispatch({
        type: 'SAVE_SUCCEEDED',
        dataEpoch: DATA_EPOCH,
        mutationId: ids.mutationId,
        commandId: write.commandId,
        snapshot: snapshot(committedEnvelope, ids.mutationId, write.commandId, uuid(119)),
      })
    ).toEqual({ status: 'dispatched' });
    acknowledgePendingIntentClear(controller, uuid(120));
    expect(controller.getSnapshot()).toMatchObject({
      state: 'saved',
      saveStatus: 'saved',
      projectedSettings: { theme: 'dark' },
      confirmedSettings: { theme: 'dark' },
    });
  });

  it('retains a quota failure, rebases on retry, and can cancel the retry intent', () => {
    const proceed = createController(DATA_EPOCH, uuid(121));
    finishLoad(proceed, envelope(DATA_EPOCH), uuid(122));
    const failedIds = mutationIds(123);
    const failedReservation = beginThemeMutation(proceed, failedIds);
    const quotaError = makeError(
      contractFor('SETTINGS_GLOBAL_STORAGE_QUOTA_EXHAUSTED'),
      'global quota exhausted'
    );
    expect(
      proceed.dispatch({
        type: 'STORAGE_RESERVATION_DENIED',
        dataEpoch: DATA_EPOCH,
        mutationId: failedIds.mutationId,
        commandId: failedReservation.commandId,
        denial: reservationDenial(failedReservation, uuid(127), uuid(128)),
        error: quotaError,
      })
    ).toEqual({ status: 'dispatched' });
    acknowledgePendingIntentClear(proceed, uuid(135));
    expect(proceed.getSnapshot()).toMatchObject({
      state: 'failed',
      error: { code: 'SETTINGS_GLOBAL_STORAGE_QUOTA_EXHAUSTED' },
    });

    const retryIds = mutationIds(129);
    const retryRequestId = uuid(133);
    expect(
      proceed.dispatch({
        type: 'RETRY',
        dataEpoch: DATA_EPOCH,
        failedMutationId: failedIds.mutationId,
        mutationId: retryIds.mutationId,
        permissionCheckId: retryIds.permissionCheckId,
        activationId: retryIds.activationId,
        storageReservationId: retryIds.storageReservationId,
        activationResult: consumedActivationResult(retryIds),
        requestId: retryRequestId,
      })
    ).toEqual({ status: 'dispatched' });
    acknowledgePendingIntentPersist(proceed, uuid(136));
    const rebase = commandOfType(proceed, 'REBASE_SETTINGS_MUTATION');
    expect(
      proceed.dispatch({
        type: 'RETRY_READY',
        dataEpoch: DATA_EPOCH,
        mutationId: retryIds.mutationId,
        requestId: retryRequestId,
        commandId: rebase.commandId,
        snapshot: snapshot(envelope(DATA_EPOCH), retryRequestId, rebase.commandId, uuid(134)),
      })
    ).toEqual({ status: 'dispatched' });
    acknowledgePendingIntentPersist(proceed, uuid(137));
    expect(proceed.getSnapshot().state).toBe('reserving');
    expect(commandOfType(proceed, 'RESERVE_SETTINGS_STORAGE').mutationId).toBe(retryIds.mutationId);

    const cancel = createController(DATA_EPOCH, uuid(141));
    finishLoad(cancel, envelope(DATA_EPOCH), uuid(142));
    const cancelFailedIds = mutationIds(143);
    const cancelReservation = beginThemeMutation(cancel, cancelFailedIds);
    expect(
      cancel.dispatch({
        type: 'STORAGE_RESERVATION_DENIED',
        dataEpoch: DATA_EPOCH,
        mutationId: cancelFailedIds.mutationId,
        commandId: cancelReservation.commandId,
        denial: reservationDenial(cancelReservation, uuid(147), uuid(148)),
        error: quotaError,
      })
    ).toEqual({ status: 'dispatched' });
    acknowledgePendingIntentClear(cancel, uuid(155));
    const cancelledRetryIds = mutationIds(149);
    expect(
      cancel.dispatch({
        type: 'RETRY',
        dataEpoch: DATA_EPOCH,
        failedMutationId: cancelFailedIds.mutationId,
        mutationId: cancelledRetryIds.mutationId,
        permissionCheckId: cancelledRetryIds.permissionCheckId,
        activationId: cancelledRetryIds.activationId,
        storageReservationId: cancelledRetryIds.storageReservationId,
        activationResult: consumedActivationResult(cancelledRetryIds),
        requestId: uuid(153),
      })
    ).toEqual({ status: 'dispatched' });
    acknowledgePendingIntentPersist(cancel, uuid(156));
    expect(
      cancel.dispatch({
        type: 'CANCEL',
        dataEpoch: DATA_EPOCH,
        mutationId: cancelledRetryIds.mutationId,
        requestId: uuid(154),
      })
    ).toEqual({ status: 'dispatched' });
    acknowledgePendingIntentClear(cancel, uuid(157));
    expect(cancel.getSnapshot()).toMatchObject({ state: 'saved', error: null });
  });

  it('requires a causal cancelled outcome before returning an active mutation to saved', () => {
    const controller = createController(DATA_EPOCH, uuid(161));
    finishLoad(controller, envelope(DATA_EPOCH), uuid(162));
    const ids = mutationIds(163);
    const reserve = beginThemeMutation(controller, ids);
    grantReservation(controller, reserve, 167);
    const cancelRequestId = uuid(169);
    expect(
      controller.dispatch({
        type: 'CANCEL',
        dataEpoch: DATA_EPOCH,
        mutationId: ids.mutationId,
        requestId: cancelRequestId,
      })
    ).toEqual({ status: 'dispatched' });
    acknowledgePendingIntentPersist(controller, uuid(171));
    const abort = commandOfType(controller, 'ABORT_SETTINGS_MUTATION');
    const cancelledOutcome = outcomeFor(
      abort,
      'cancelled',
      abort.baseRevision,
      abort.baseGeneration + 1
    );
    const cancelledEnvelope = envelope(
      DATA_EPOCH,
      DEFAULT_SETTINGS,
      abort.baseRevision,
      abort.baseGeneration + 1,
      [cancelledOutcome]
    );
    expect(
      controller.dispatch({
        type: 'CANCEL_CONFIRMED',
        dataEpoch: DATA_EPOCH,
        mutationId: ids.mutationId,
        requestId: cancelRequestId,
        commandId: abort.commandId,
        snapshot: snapshot(cancelledEnvelope, cancelRequestId, abort.commandId, uuid(170)),
      })
    ).toEqual({ status: 'dispatched' });
    acknowledgePendingIntentClear(controller, uuid(172));
    expect(controller.getSnapshot()).toMatchObject({
      state: 'saved',
      projectedSettings: { theme: 'system' },
      confirmedSettings: { theme: 'system' },
    });
  });

  it('routes saved and in-flight worker restarts through load and reconciliation', () => {
    const saved = createController(DATA_EPOCH, uuid(181));
    finishLoad(saved, envelope(DATA_EPOCH), uuid(182));
    expect(
      saved.dispatch({
        type: 'SERVICE_WORKER_RESTARTED',
        dataEpoch: DATA_EPOCH,
        requestId: uuid(183),
      })
    ).toEqual({ status: 'dispatched' });
    expect(saved.getSnapshot().state).toBe('loading');
    expect(commandOfType(saved, 'RECOVER_AND_LOAD_SETTINGS').requestId).toBe(uuid(183));

    const active = createController(DATA_EPOCH, uuid(184));
    finishLoad(active, envelope(DATA_EPOCH), uuid(185));
    const ids = mutationIds(186);
    const reserve = beginThemeMutation(active, ids);
    grantReservation(active, reserve, 190);
    expect(
      active.dispatch({
        type: 'SERVICE_WORKER_RESTARTED',
        dataEpoch: DATA_EPOCH,
        requestId: uuid(192),
      })
    ).toEqual({ status: 'dispatched' });
    acknowledgePendingIntentPersist(active, uuid(193));
    expect(active.getSnapshot().state).toBe('reconciling');
    expect(commandOfType(active, 'RECONCILE_SETTINGS')).toMatchObject({
      requestId: uuid(192),
      reason: 'worker_restart',
    });
  });

  it.each([0, 2])(
    'joins reset ready/committed and accepts a settled generation %i bootstrap',
    (generation) => {
      const oldEpoch = uuid(201 + generation);
      const nextEpoch = uuid(204 + generation);
      const controller = createController(oldEpoch, uuid(207 + generation));
      finishLoad(controller, envelope(oldEpoch), uuid(210 + generation));
      const resetId = uuid(213 + generation);
      const bootstrapRequestId = uuid(216 + generation);
      const ready = {
        version: 1,
        stage: 'ready_to_commit' as const,
        resetId,
        previousDataEpoch: oldEpoch,
        nextDataEpoch: nextEpoch,
        settingsBootstrapRequestId: bootstrapRequestId,
      };
      expect(controller.dispatch({ type: 'RESET_EPOCH_READY_TO_COMMIT', payload: ready })).toEqual({
        status: 'dispatched',
      });
      expect(controller.getSnapshot()).toMatchObject({
        state: 'resetPending',
        loadStatus: 'reset_pending',
      });

      expect(
        controller.dispatch({
          type: 'RESET_EPOCH_COMMITTED',
          payload: { ...ready, stage: 'committed' },
        })
      ).toEqual({ status: 'dispatched' });
      const resetLoad = commandOfType(controller, 'RECOVER_AND_LOAD_SETTINGS');
      expect(resetLoad).toMatchObject({
        dataEpoch: nextEpoch,
        requestId: bootstrapRequestId,
        resetCorrelation: { resetId, nextDataEpoch: nextEpoch },
      });
      finishLoad(
        controller,
        envelope(nextEpoch, DEFAULT_SETTINGS, 0, generation),
        uuid(219 + generation)
      );
      expect(controller.getSnapshot()).toMatchObject({
        state: 'saved',
        dataEpoch: nextEpoch,
        loadStatus: 'ready',
      });
    }
  );
});
