import { createActor } from 'xstate';
import type { Mission } from '../lib/core/types/mission';
import type { BridgeMessage } from '../lib/shell/messaging/bridge';
import { getMissions } from '../lib/shell/storage/db';
import {
  clearScanCheckpoint,
  loadScanCheckpoint,
  saveScanCheckpoint,
} from '../lib/shell/storage/session-storage';
import {
  scanLifecycleMachine,
  type ScanCheckpoint,
  type ScanTerminalDecision,
} from '../models/scan-lifecycle.machine';

type ScanTerminalMessage = Extract<
  BridgeMessage,
  { type: 'SCAN_COMPLETE' | 'SCAN_ERROR' | 'SCAN_CANCELLED' }
>;

function selectCommittedMissions(
  missions: readonly Mission[],
  missionIds: readonly string[]
): Mission[] {
  const missionsById = new Map(missions.map((mission) => [mission.id, mission]));
  return missionIds.flatMap((missionId) => {
    const mission = missionsById.get(missionId);
    return mission ? [mission] : [];
  });
}

function recoveredTerminalDecision(
  checkpoint: ScanCheckpoint,
  recoveredState: ScanCheckpoint['state'],
  error: { code: string; message: string } | null
): ScanTerminalDecision {
  if (recoveredState === 'cancelled') {
    return { type: 'SCAN_CANCELLED' };
  }
  if (recoveredState === 'failed') {
    if (checkpoint.terminal?.type === 'SCAN_ERROR') {
      return checkpoint.terminal;
    }
    const recoveredError = error ?? {
      code: 'WORKER_RESTARTED',
      message: 'Le service worker a redémarré pendant le scan.',
    };
    return { type: 'SCAN_ERROR', ...recoveredError };
  }
  if (
    (recoveredState === 'completed' || recoveredState === 'partial') &&
    checkpoint.terminal?.type === 'SCAN_COMPLETE'
  ) {
    return checkpoint.terminal;
  }
  throw new Error(`Unsupported recovered scan terminal state: ${recoveredState}`);
}

async function terminalMessageFromDecision(
  operationId: string,
  terminal: ScanTerminalDecision
): Promise<ScanTerminalMessage> {
  if (terminal.type === 'SCAN_CANCELLED') {
    return { type: 'SCAN_CANCELLED', payload: { operationId } };
  }
  if (terminal.type === 'SCAN_ERROR') {
    return {
      type: 'SCAN_ERROR',
      payload: { operationId, code: terminal.code, message: terminal.message },
    };
  }
  const durableMissions = await getMissions();
  return {
    type: 'SCAN_COMPLETE',
    payload: {
      operationId,
      missions: selectCommittedMissions(durableMissions, terminal.missionIds),
    },
  };
}

export async function recoverInterruptedScan(): Promise<string | null> {
  const checkpoint = await loadScanCheckpoint();
  if (!checkpoint) {
    return null;
  }

  const actor = createActor(scanLifecycleMachine, {
    input: { now: Date.now(), maxRetries: 2, activeLeaseOperationId: null },
  });
  actor.start();
  actor.send({ type: 'SERVICE_WORKER_RESTARTED', checkpoint });

  let terminalAttempted = false;
  try {
    const snapshot = actor.getSnapshot();
    const recoveredState = snapshot.value as ScanCheckpoint['state'];
    const terminal = recoveredTerminalDecision(checkpoint, recoveredState, snapshot.context.error);
    const terminalCheckpoint: ScanCheckpoint = {
      ...checkpoint,
      state: recoveredState,
      cancellationRequested: checkpoint.cancellationRequested || recoveredState === 'cancelled',
      terminal,
    };

    await saveScanCheckpoint(terminalCheckpoint);
    const message = await terminalMessageFromDecision(checkpoint.operationId, terminal);
    terminalAttempted = true;
    await chrome.runtime.sendMessage(message).catch(() => {
      // No side panel is expected during many worker wake-ups. The persisted
      // terminal has still been attempted and Feed consumption is idempotent
      // by operationId when a listener is present.
    });
  } finally {
    actor.stop();
  }
  if (terminalAttempted) {
    const cleared = await clearScanCheckpoint(checkpoint.operationId);
    if (!cleared) {
      throw new Error(
        `Recovered terminal checkpoint ${checkpoint.operationId} was not cleared conditionally.`
      );
    }
  }
  return checkpoint.operationId;
}

type ScanRecoveryAttempt = { ok: true; operationId: string | null } | { ok: false; error: unknown };

function startScanRecoveryAttempt(): Promise<ScanRecoveryAttempt> {
  return recoverInterruptedScan().then(
    (operationId) => ({ ok: true, operationId }),
    (error: unknown) => ({ ok: false, error })
  );
}

let scanRecoveryAttempt: Promise<ScanRecoveryAttempt> | null = startScanRecoveryAttempt();

export async function waitForScanRecovery(): Promise<string | null> {
  const observedAttempt = scanRecoveryAttempt ?? startScanRecoveryAttempt();
  scanRecoveryAttempt = observedAttempt;
  const result = await observedAttempt;
  if (!result.ok) {
    if (scanRecoveryAttempt === observedAttempt) {
      scanRecoveryAttempt = null;
    }
    throw result.error;
  }
  return result.operationId;
}
