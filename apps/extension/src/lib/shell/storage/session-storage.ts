import type { DeepLinkIntent } from '../../core/deep-link/deep-link-intent';
import type {
  ScanCheckpoint,
  ScanLifecycleState,
  ScanTerminalDecision,
  ScanTrigger,
} from '../../../models/scan-lifecycle.machine';

export type ScanState = 'idle' | 'scanning' | 'error';

export async function getScanState(): Promise<ScanState> {
  const result = await chrome.storage.session.get(['scanState']);
  return (result.scanState as ScanState) ?? 'idle';
}

export async function setScanState(state: ScanState): Promise<void> {
  await chrome.storage.session.set({ scanState: state });
}

export async function getNewMissionCount(): Promise<number> {
  const result = await chrome.storage.session.get(['newMissionCount']);
  return (result.newMissionCount as number) ?? 0;
}

export async function setNewMissionCount(count: number): Promise<void> {
  await chrome.storage.session.set({ newMissionCount: count });
}

export async function resetNewMissionCount(): Promise<void> {
  await chrome.storage.session.set({ newMissionCount: 0 });
}

// ---------------------------------------------------------------------------
// Deep-link focus intent (notification → panel)
// Stored in session storage: single-consume, cleared on browser session end.
// See src/models/notification-deep-link.model.md.
// ---------------------------------------------------------------------------

const DEEP_LINK_INTENT_KEY = 'deepLinkIntent';

/** Write a focus intent (overwrites any pending one — invariant I4). */
export async function setDeepLinkIntent(intent: DeepLinkIntent): Promise<void> {
  await chrome.storage.session.set({ [DEEP_LINK_INTENT_KEY]: intent });
}

/** Read the current intent without removing it. */
export async function getDeepLinkIntent(): Promise<DeepLinkIntent | null> {
  const result = await chrome.storage.session.get(DEEP_LINK_INTENT_KEY);
  return (result[DEEP_LINK_INTENT_KEY] as DeepLinkIntent | undefined) ?? null;
}

// In-process serialization of the read-then-clear consume (invariant I1).
// `chrome.storage.session` has no atomic read-and-remove, so two concurrent
// CONSUME messages (e.g. panel opened in two windows) could both observe the
// same pending intent before either remove runs. This promise chain forces
// consumes to execute strictly one after another within this service worker.
let consumeChain: Promise<void> = Promise.resolve();

/**
 * Atomically read and clear the intent (invariant I1: single consume).
 * Returns the consumed intent, or null if none was pending. Serialized within
 * the service worker so only the first concurrent caller wins.
 */
export function consumeDeepLinkIntent(): Promise<DeepLinkIntent | null> {
  const run = consumeChain.then(async () => {
    const intent = await getDeepLinkIntent();
    if (intent) {
      await chrome.storage.session.remove(DEEP_LINK_INTENT_KEY);
    }
    return intent;
  });
  // Keep the chain alive even if this run rejects, so one failure can't stall
  // subsequent consumes forever.
  consumeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function clearDeepLinkIntent(): Promise<void> {
  await chrome.storage.session.remove(DEEP_LINK_INTENT_KEY);
}

// ---------------------------------------------------------------------------
// Scan lifecycle checkpoint (MV3 worker restart recovery)
// ---------------------------------------------------------------------------

const SCAN_CHECKPOINT_KEY = 'scanLifecycleCheckpoint';
const CHECKPOINT_STATES = new Set<ScanCheckpoint['state']>([
  'starting',
  'scanning',
  'retrying',
  'cancelling',
  'cancelled',
  'persisting',
  'completed',
  'partial',
  'failed',
]);
const ACTIVE_CHECKPOINT_STATES = new Set<ScanCheckpoint['state']>([
  'starting',
  'scanning',
  'retrying',
  'cancelling',
  'persisting',
]);
const CHECKPOINT_TRIGGERS = new Set<ScanTrigger>(['manual', 'alarm', 'first_scan']);
const CONNECTOR_CHECKPOINT_STATES = new Set(['pending', 'running', 'succeeded', 'failed']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTerminalDecision(value: unknown): ScanTerminalDecision | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== 'string') {
    return undefined;
  }
  if (value.type === 'SCAN_CANCELLED') {
    return { type: 'SCAN_CANCELLED' };
  }
  if (
    value.type === 'SCAN_ERROR' &&
    typeof value.code === 'string' &&
    typeof value.message === 'string'
  ) {
    return { type: 'SCAN_ERROR', code: value.code, message: value.message };
  }
  if (
    value.type === 'SCAN_COMPLETE' &&
    Array.isArray(value.missionIds) &&
    value.missionIds.every((missionId) => typeof missionId === 'string')
  ) {
    return { type: 'SCAN_COMPLETE', missionIds: [...value.missionIds] };
  }
  return undefined;
}

function terminalMatchesState(
  state: ScanCheckpoint['state'],
  terminal: ScanTerminalDecision | null
): boolean {
  if (ACTIVE_CHECKPOINT_STATES.has(state)) {
    return terminal === null;
  }
  if (state === 'completed' || state === 'partial') {
    return terminal?.type === 'SCAN_COMPLETE';
  }
  if (state === 'failed') {
    return terminal?.type === 'SCAN_ERROR';
  }
  return state === 'cancelled' && terminal?.type === 'SCAN_CANCELLED';
}

function connectorResultsMatchState(
  state: ScanCheckpoint['state'],
  connectorResults: ScanCheckpoint['connectorResults']
): boolean {
  const results = Object.values(connectorResults);
  const hasResults = results.length > 0;
  const allSettled = results.every((result) => result === 'succeeded' || result === 'failed');
  const hasSucceeded = results.includes('succeeded');
  const hasFailed = results.includes('failed');

  if (state === 'completed') {
    return hasResults && results.every((result) => result === 'succeeded');
  }
  if (state === 'partial') {
    return hasResults && allSettled && hasSucceeded && hasFailed;
  }
  if (state === 'persisting') {
    return hasResults && allSettled && hasSucceeded;
  }
  return true;
}

function cancellationMatchesState(
  state: ScanCheckpoint['state'],
  cancellationRequested: boolean
): boolean {
  return cancellationRequested === (state === 'cancelling' || state === 'cancelled');
}

function parseScanCheckpoint(value: unknown): ScanCheckpoint | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.operationId !== 'string' ||
    value.operationId.length === 0 ||
    typeof value.state !== 'string' ||
    !CHECKPOINT_STATES.has(value.state as ScanCheckpoint['state']) ||
    typeof value.trigger !== 'string' ||
    !CHECKPOINT_TRIGGERS.has(value.trigger as ScanTrigger) ||
    typeof value.cancellationRequested !== 'boolean' ||
    !isRecord(value.connectorResults)
  ) {
    return null;
  }

  const connectorResults: Record<string, 'pending' | 'running' | 'succeeded' | 'failed'> = {};
  for (const [connectorId, connectorState] of Object.entries(value.connectorResults)) {
    if (
      connectorId.length === 0 ||
      typeof connectorState !== 'string' ||
      !CONNECTOR_CHECKPOINT_STATES.has(connectorState)
    ) {
      return null;
    }
    connectorResults[connectorId] = connectorState as
      'pending' | 'running' | 'succeeded' | 'failed';
  }

  const terminal = parseTerminalDecision(value.terminal);
  const state = value.state as Exclude<ScanLifecycleState, 'idle' | 'busy'>;
  if (
    terminal === undefined ||
    !terminalMatchesState(state, terminal) ||
    !connectorResultsMatchState(state, connectorResults) ||
    !cancellationMatchesState(state, value.cancellationRequested)
  ) {
    return null;
  }

  return {
    version: 1,
    operationId: value.operationId,
    state,
    trigger: value.trigger as ScanTrigger,
    connectorResults,
    cancellationRequested: value.cancellationRequested,
    terminal,
  };
}

let checkpointChain: Promise<void> = Promise.resolve();

function enqueueCheckpointOperation<T>(operation: () => Promise<T>): Promise<T> {
  const run = checkpointChain.then(operation);
  checkpointChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function saveScanCheckpoint(checkpoint: ScanCheckpoint): Promise<void> {
  return enqueueCheckpointOperation(async () => {
    if (!parseScanCheckpoint(checkpoint)) {
      throw new Error('Invalid scan lifecycle checkpoint.');
    }
    await chrome.storage.session.set({ [SCAN_CHECKPOINT_KEY]: checkpoint });
  });
}

export function loadScanCheckpoint(): Promise<ScanCheckpoint | null> {
  return enqueueCheckpointOperation(async () => {
    const result = await chrome.storage.session.get(SCAN_CHECKPOINT_KEY);
    const rawCheckpoint = result[SCAN_CHECKPOINT_KEY];
    if (rawCheckpoint === undefined) {
      return null;
    }
    const checkpoint = parseScanCheckpoint(rawCheckpoint);
    if (!checkpoint) {
      await chrome.storage.session.remove(SCAN_CHECKPOINT_KEY);
    }
    return checkpoint;
  });
}

export function clearScanCheckpoint(expectedOperationId: string): Promise<boolean> {
  return enqueueCheckpointOperation(async () => {
    const result = await chrome.storage.session.get(SCAN_CHECKPOINT_KEY);
    const rawCheckpoint = result[SCAN_CHECKPOINT_KEY];
    if (rawCheckpoint === undefined) {
      return false;
    }
    const checkpoint = parseScanCheckpoint(rawCheckpoint);
    if (!checkpoint) {
      await chrome.storage.session.remove(SCAN_CHECKPOINT_KEY);
      return false;
    }
    if (checkpoint.operationId !== expectedOperationId) {
      return false;
    }
    await chrome.storage.session.remove(SCAN_CHECKPOINT_KEY);
    return true;
  });
}
