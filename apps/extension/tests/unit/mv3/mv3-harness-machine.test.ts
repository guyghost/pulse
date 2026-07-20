import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import {
  PLAYWRIGHT_AUTHORITY_KEYS,
  projectPlaywrightAuthorityV1,
  sha256Jcs,
} from '../../mv3/harness/playwright-authority';
import {
  createRawOperationalLedgerAuthorityV1,
  mv3HarnessMachine,
} from '../../mv3/harness/mv3-harness.machine';
import { createCompleteRawReleaseReceipt } from './raw-release-receipt.fixture';

const PROCESS_GENERATION = 1;
const EXTENSION_ID = 'a'.repeat(32);
const RAW_AUTHORITY = Object.freeze({
  extensionId: EXTENSION_ID,
  registrationId: 'registration-1',
  versionId: 'version-1',
  scopeURL: `chrome-extension://${EXTENSION_ID}/`,
  scriptURL: `chrome-extension://${EXTENSION_ID}/background/service-worker.js`,
  targetId: 'worker-target-1',
  sessionId: 'raw-session-1',
  attachmentGeneration: 1,
  attachmentOrigin: 'manual' as const,
  uniqueContextId: 'raw-context-1',
});

function rawReleaseReceipt(leaseEpoch: number) {
  return createCompleteRawReleaseReceipt({
    processGeneration: PROCESS_GENERATION,
    leaseEpoch,
    transportId: `raw-transport-${leaseEpoch}`,
  });
}

function rawOperationalAuthority(leaseEpoch: number) {
  return createRawOperationalLedgerAuthorityV1(rawReleaseReceipt(leaseEpoch));
}

function legacyMinimalRawReleaseReceipt(leaseEpoch: number) {
  return {
    schemaVersion: 1 as const,
    processGeneration: PROCESS_GENERATION,
    leaseEpoch,
    transportId: `raw-transport-${leaseEpoch}`,
    released: true as const,
    close: {
      schemaVersion: 1 as const,
      processGeneration: PROCESS_GENERATION,
      leaseEpoch,
      transportId: `raw-transport-${leaseEpoch}`,
      code: 1000,
      reason: 'closed',
    },
  };
}

function startHarness() {
  return createActor(mv3HarnessMachine).start();
}

function reachEndpointOwnerNone() {
  const actor = startHarness();
  actor.send({ type: 'HARNESS_STARTED' });
  actor.send({ type: 'ARTIFACT_SEALED', artifactSha256: 'a'.repeat(64) });
  actor.send({ type: 'PROFILE_CREATED', profileId: 'profile-1' });
  actor.send({
    type: 'PROCESS_SPAWNED',
    processGeneration: PROCESS_GENERATION,
    pid: 12_345,
  });
  actor.send({
    type: 'ENDPOINT_PARSED',
    processGeneration: PROCESS_GENERATION,
    endpointReceiptSha256: 'b'.repeat(64),
  });
  expect(actor.getSnapshot().matches('owner_none')).toBe(true);
  return actor;
}

function reachRawReleasing(operationalAuthority = rawOperationalAuthority(1)) {
  const actor = reachEndpointOwnerNone();
  actor.send({
    type: 'RAW_ACQUIRE_REQUESTED',
    processGeneration: PROCESS_GENERATION,
    mode: 'initial_bootstrap',
    leaseEpoch: 1,
  });
  actor.send({
    type: 'RAW_TRANSPORT_OPENED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch: 1,
    transportId: 'raw-transport-1',
  });
  actor.send({
    type: 'ENDPOINT_VERIFIED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch: 1,
    endpointReceiptSha256: 'b'.repeat(64),
  });
  actor.send({
    type: 'RAW_BOOTSTRAP_PROVED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch: 1,
    receiptSha256: 'c'.repeat(64),
    operationalCommandCount: operationalAuthority.operationalCommandCount,
    operationalLedgerSha256: operationalAuthority.operationalLedgerSha256,
  });
  expect(actor.getSnapshot().matches('raw_releasing.initial_bootstrap')).toBe(true);
  return actor;
}

function submitRawRelease(
  rawReceipt: unknown,
  authority: unknown = RAW_AUTHORITY,
  operationalAuthority = rawOperationalAuthority(1)
) {
  const actor = reachRawReleasing(operationalAuthority);
  actor.send({
    type: 'RAW_RELEASE_PROVED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch: 1,
    playwrightEpoch: 1,
    rawReceipt,
    rawReceiptSha256: sha256Jcs(rawReceipt),
    authority,
  });
  return actor;
}

function mutableRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('expected mutable record fixture');
  }
  return value as Record<string, unknown>;
}

function mutableArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error('expected mutable array fixture');
  }
  return value;
}

function completeRawEpoch(
  actor: ReturnType<typeof reachEndpointOwnerNone>,
  mode: 'initial_bootstrap' | 'runtime_restart',
  leaseEpoch: number,
  authority: typeof RAW_AUTHORITY = RAW_AUTHORITY
) {
  const playwrightEpoch = mode === 'initial_bootstrap' ? 1 : 2;
  const receipt = rawReleaseReceipt(leaseEpoch);
  const operationalAuthority = rawOperationalAuthority(leaseEpoch);
  actor.send({
    type: 'RAW_ACQUIRE_REQUESTED',
    processGeneration: PROCESS_GENERATION,
    mode,
    leaseEpoch,
  });
  actor.send({
    type: 'RAW_TRANSPORT_OPENED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch,
    transportId: `raw-transport-${leaseEpoch}`,
  });
  actor.send({
    type: 'ENDPOINT_VERIFIED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch,
    endpointReceiptSha256: 'b'.repeat(64),
  });
  actor.send({
    type: 'RAW_BOOTSTRAP_PROVED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch,
    receiptSha256: 'c'.repeat(64),
    operationalCommandCount: operationalAuthority.operationalCommandCount,
    operationalLedgerSha256: operationalAuthority.operationalLedgerSha256,
  });
  actor.send({
    type: 'RAW_RELEASE_PROVED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch,
    playwrightEpoch,
    rawReceipt: receipt,
    rawReceiptSha256: sha256Jcs(receipt),
    authority,
  });
  expect(actor.getSnapshot().matches('owner_none')).toBe(true);
  expect(actor.getSnapshot().context.currentRawAuthority).toBe(authority);
  expect(actor.getSnapshot().context.currentRawReleaseReceipt).toEqual(receipt);
  return sha256Jcs(receipt);
}

function projectAuthority(
  actor: ReturnType<typeof reachEndpointOwnerNone>,
  playwrightEpoch: number
) {
  const rawReceiptSha256 = actor.getSnapshot().context.currentRawReleaseReceiptSha256;
  if (rawReceiptSha256 === null) {
    throw new Error('raw receipt was not retained');
  }
  actor.send({
    type: 'PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED',
    processGeneration: PROCESS_GENERATION,
    playwrightEpoch,
    rawReceiptSha256,
  });
  expect(actor.getSnapshot().matches('playwright_authority_projecting')).toBe(true);
  const projection = projectPlaywrightAuthorityV1(actor.getSnapshot().context.currentRawAuthority);
  if (!projection.ok) {
    throw new Error(`projection failed: ${projection.error.code}`);
  }
  actor.send({
    type: 'PLAYWRIGHT_AUTHORITY_PROJECTED',
    processGeneration: PROCESS_GENERATION,
    playwrightEpoch,
    rawReceiptSha256,
    authority: projection.authority,
    authorityProjectionSha256: projection.authorityProjectionSha256,
  });
  expect(actor.getSnapshot().matches('playwright_authority_ready')).toBe(true);
  return projection;
}

function connectPlaywright(
  actor: ReturnType<typeof reachEndpointOwnerNone>,
  leaseEpoch: number,
  playwrightEpoch: number
) {
  const projection = projectAuthority(actor, playwrightEpoch);
  actor.send({
    type: 'PLAYWRIGHT_RESERVE_REQUESTED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch,
    playwrightEpoch,
    authorityProjectionSha256: projection.authorityProjectionSha256,
  });
  actor.send({
    type: 'PLAYWRIGHT_TRANSPORT_OPENED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch,
    playwrightEpoch,
    transportId: `playwright-transport-${playwrightEpoch}`,
  });
  actor.send({
    type: 'PLAYWRIGHT_HANDOFF_PROVED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch,
    playwrightEpoch,
  });
  expect(actor.getSnapshot().matches('playwright_owned.exercising')).toBe(true);
}

function reachInitialPlaywrightOwner() {
  const actor = reachEndpointOwnerNone();
  completeRawEpoch(actor, 'initial_bootstrap', 1);
  connectPlaywright(actor, 2, 1);
  return actor;
}

function reachShutdownOwned() {
  const actor = reachInitialPlaywrightOwner();
  actor.send({
    type: 'USE_COMPLETED',
    processGeneration: PROCESS_GENERATION,
    playwrightEpoch: 1,
  });
  actor.send({ type: 'DIAGNOSTICS_ACCEPTED', processGeneration: PROCESS_GENERATION });
  actor.send({
    type: 'ARTIFACT_MATCHED',
    processGeneration: PROCESS_GENERATION,
    artifactSha256: 'a'.repeat(64),
  });
  actor.send({
    type: 'PLAYWRIGHT_RELEASE_PROVED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch: 2,
    playwrightEpoch: 1,
  });
  actor.send({
    type: 'SHUTDOWN_TRANSPORT_OPENED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch: 3,
    transportId: 'shutdown-transport-3',
  });
  actor.send({
    type: 'SHUTDOWN_ENDPOINT_VERIFIED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch: 3,
    transportId: 'shutdown-transport-3',
    commandId: 'browser-close-1',
  });
  expect(actor.getSnapshot().matches('shutdown_owned')).toBe(true);
  return actor;
}

describe('mv3HarnessMachine', () => {
  it('rejects the legacy minimal raw-release receipt before owner handoff', () => {
    const legacyMinimalReceipt = legacyMinimalRawReleaseReceipt(1);
    const actor = submitRawRelease(legacyMinimalReceipt);

    expect(actor.getSnapshot().matches('raw_releasing.initial_bootstrap')).toBe(true);
    expect(actor.getSnapshot().context.currentRawReleaseReceipt).toBeNull();
  });

  it('rejects a hostile final ledger even when a recomputed authority is presented afterward', () => {
    const trustedAuthority = rawOperationalAuthority(1);
    const actor = reachRawReleasing(trustedAuthority);
    const forgedReceipt = structuredClone(rawReleaseReceipt(1));
    mutableRecord(mutableArray(forgedReceipt.commandLedger)[0]).resultSha256 = 'f'.repeat(64);
    const forgedAuthority = createRawOperationalLedgerAuthorityV1(forgedReceipt);

    actor.send({
      type: 'RAW_BOOTSTRAP_PROVED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 1,
      receiptSha256: 'd'.repeat(64),
      operationalCommandCount: forgedAuthority.operationalCommandCount,
      operationalLedgerSha256: forgedAuthority.operationalLedgerSha256,
    });
    actor.send({
      type: 'RAW_RELEASE_PROVED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 1,
      playwrightEpoch: 1,
      rawReceipt: forgedReceipt,
      rawReceiptSha256: sha256Jcs(forgedReceipt),
      authority: RAW_AUTHORITY,
    });

    expect(actor.getSnapshot().matches('raw_releasing.initial_bootstrap')).toBe(true);
    expect(actor.getSnapshot().context.currentRawOperationalLedgerSha256).toBe(
      trustedAuthority.operationalLedgerSha256
    );
    expect(actor.getSnapshot().context.currentRawReleaseReceipt).toBeNull();
  });

  it.each([
    [
      'top-level unknown field',
      (receipt: Record<string, unknown>) => {
        receipt.unexpected = true;
      },
    ],
    [
      'deadline unknown field',
      (receipt: Record<string, unknown>) => {
        mutableRecord(receipt.deadline).unexpected = true;
      },
    ],
    [
      'non-consecutive ledger ordinal',
      (receipt: Record<string, unknown>) => {
        mutableRecord(mutableArray(receipt.commandLedger)[0]).ordinal = 2;
      },
    ],
    [
      'self-consistently reordered operational ledger',
      (receipt: Record<string, unknown>) => {
        const ledger = mutableArray(receipt.commandLedger);
        [ledger[0], ledger[1]] = [ledger[1], ledger[0]];
        mutableRecord(ledger[0]).ordinal = 0;
        mutableRecord(ledger[1]).ordinal = 1;
      },
    ],
    [
      'missing operational ledger',
      (receipt: Record<string, unknown>) => {
        const cleanup = mutableArray(receipt.commandLedger).filter(
          (entry) => mutableRecord(entry).kind === 'cleanup'
        );
        cleanup.forEach((entry, ordinal) => {
          mutableRecord(entry).ordinal = ordinal;
        });
        receipt.commandLedger = cleanup;
      },
    ],
    [
      'truncated operational ledger',
      (receipt: Record<string, unknown>) => {
        const ledger = mutableArray(receipt.commandLedger);
        ledger.splice(0, 1);
        ledger.forEach((entry, ordinal) => {
          mutableRecord(entry).ordinal = ordinal;
        });
      },
    ],
    [
      'extra self-consistent operational command',
      (receipt: Record<string, unknown>) => {
        const ledger = mutableArray(receipt.commandLedger);
        const firstCleanup = ledger.findIndex((entry) => mutableRecord(entry).kind === 'cleanup');
        ledger.splice(firstCleanup, 0, {
          ordinal: firstCleanup,
          kind: 'operational',
          commandId: 999,
          method: 'Runtime.enable',
          sessionId: 'raw-session-1',
          paramsSha256: sha256Jcs({}),
          status: 'fulfilled',
          resultSha256: sha256Jcs({}),
          rejectionSha256: null,
        });
        ledger.forEach((entry, ordinal) => {
          mutableRecord(entry).ordinal = ordinal;
        });
      },
    ],
    [
      'ledger result hash drift',
      (receipt: Record<string, unknown>) => {
        mutableRecord(mutableArray(receipt.commandLedger)[0]).resultSha256 = 'f'.repeat(64);
      },
    ],
    [
      'ledger params hash drift',
      (receipt: Record<string, unknown>) => {
        mutableRecord(mutableArray(receipt.commandLedger)[0]).paramsSha256 = 'e'.repeat(64);
      },
    ],
    [
      'non-terminal attachment inventory',
      (receipt: Record<string, unknown>) => {
        mutableRecord(mutableArray(receipt.attachmentInventory)[0]).detached = false;
      },
    ],
    [
      'proofs unknown field',
      (receipt: Record<string, unknown>) => {
        mutableRecord(receipt.proofs).unexpected = true;
      },
    ],
    [
      'nested command receipt unknown field',
      (receipt: Record<string, unknown>) => {
        mutableRecord(mutableRecord(receipt.proofs).autoAttachDisarm).unexpected = true;
      },
    ],
    [
      'nested command receipt generation crossing',
      (receipt: Record<string, unknown>) => {
        mutableRecord(mutableRecord(receipt.proofs).autoAttachDisarm).processGeneration = 2;
      },
    ],
    [
      'nested command receipt lease crossing',
      (receipt: Record<string, unknown>) => {
        mutableRecord(mutableRecord(receipt.proofs).autoAttachDisarm).leaseEpoch = 2;
      },
    ],
    [
      'nested target unknown field',
      (receipt: Record<string, unknown>) => {
        const fence = mutableRecord(mutableRecord(receipt.proofs).attachFence);
        mutableRecord(mutableArray(fence.targets)[0]).unexpected = true;
      },
    ],
    [
      'close transport crossing',
      (receipt: Record<string, unknown>) => {
        mutableRecord(receipt.close).transportId = 'raw-foreign';
      },
    ],
    [
      'proof close crossing',
      (receipt: Record<string, unknown>) => {
        const proofs = mutableRecord(receipt.proofs);
        proofs.close = { ...mutableRecord(proofs.close), reason: 'crossed-close' };
      },
    ],
    [
      'duplicate worker detach proof',
      (receipt: Record<string, unknown>) => {
        const events = mutableArray(mutableRecord(receipt.proofs).workerDetachEvents);
        events.push(structuredClone(events[0]));
      },
    ],
    [
      'worker detach preimage hash drift',
      (receipt: Record<string, unknown>) => {
        const proofs = mutableRecord(receipt.proofs);
        const event = mutableRecord(mutableArray(proofs.workerDetachEvents)[0]);
        mutableRecord(event.preimage).targetId = 'crossed-worker-target';
      },
    ],
    [
      'self-consistent crossed worker detach',
      (receipt: Record<string, unknown>) => {
        const proofs = mutableRecord(receipt.proofs);
        const event = mutableRecord(mutableArray(proofs.workerDetachEvents)[0]);
        event.targetId = 'crossed-worker-target';
        const preimage = mutableRecord(event.preimage);
        preimage.targetId = 'crossed-worker-target';
        event.eventSha256 = sha256Jcs(preimage);
      },
    ],
    [
      'self-consistent crossed control detach',
      (receipt: Record<string, unknown>) => {
        const proofs = mutableRecord(receipt.proofs);
        const event = mutableRecord(proofs.controlDetachEvent);
        event.targetId = 'crossed-control-target';
        const preimage = mutableRecord(event.preimage);
        preimage.targetId = 'crossed-control-target';
        event.eventSha256 = sha256Jcs(preimage);
      },
    ],
  ] as const)('rejects a recursively malformed raw-release receipt: %s', (_label, mutate) => {
    const receipt = structuredClone(rawReleaseReceipt(1));
    mutate(mutableRecord(receipt));

    const actor = submitRawRelease(receipt);

    expect(actor.getSnapshot().matches('raw_releasing.initial_bootstrap')).toBe(true);
    expect(actor.getSnapshot().context.currentRawReleaseReceipt).toBeNull();
  });

  it('enforces exclusive raw and Playwright leases in both directions', () => {
    const actor = reachEndpointOwnerNone();
    actor.send({
      type: 'RAW_ACQUIRE_REQUESTED',
      processGeneration: PROCESS_GENERATION,
      mode: 'initial_bootstrap',
      leaseEpoch: 1,
    });
    expect(actor.getSnapshot().matches('raw_connecting.initial_bootstrap')).toBe(true);

    actor.send({
      type: 'PLAYWRIGHT_RESERVE_REQUESTED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 2,
      playwrightEpoch: 1,
      authorityProjectionSha256: 'f'.repeat(64),
    });
    expect(actor.getSnapshot().matches('raw_connecting.initial_bootstrap')).toBe(true);

    actor.send({
      type: 'RAW_TRANSPORT_OPENED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 1,
      transportId: 'raw-transport-1',
    });
    actor.send({
      type: 'ENDPOINT_VERIFIED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 1,
      endpointReceiptSha256: 'b'.repeat(64),
    });
    actor.send({
      type: 'RAW_BOOTSTRAP_PROVED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 1,
      receiptSha256: 'c'.repeat(64),
      operationalCommandCount: rawOperationalAuthority(1).operationalCommandCount,
      operationalLedgerSha256: rawOperationalAuthority(1).operationalLedgerSha256,
    });
    actor.send({
      type: 'RAW_RELEASE_PROVED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 1,
      playwrightEpoch: 1,
      rawReceipt: rawReleaseReceipt(1),
      rawReceiptSha256: sha256Jcs(rawReleaseReceipt(1)),
      authority: RAW_AUTHORITY,
    });
    connectPlaywright(actor, 2, 1);

    actor.send({
      type: 'RAW_ACQUIRE_REQUESTED',
      processGeneration: PROCESS_GENERATION,
      mode: 'runtime_restart',
      leaseEpoch: 3,
    });
    expect(actor.getSnapshot().matches('playwright_owned.exercising')).toBe(true);
  });

  it('permits one runtime restart and fails the second request before another lease', () => {
    const actor = reachInitialPlaywrightOwner();

    actor.send({
      type: 'RESTART_REQUESTED',
      processGeneration: PROCESS_GENERATION,
      playwrightEpoch: 1,
    });
    expect(actor.getSnapshot().matches('playwright_releasing.restart')).toBe(true);
    expect(actor.getSnapshot().context.runtimeRestartCount).toBe(1);
    actor.send({
      type: 'PLAYWRIGHT_RELEASE_PROVED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 2,
      playwrightEpoch: 1,
    });
    completeRawEpoch(actor, 'runtime_restart', 3);
    connectPlaywright(actor, 4, 2);

    actor.send({
      type: 'RESTART_REQUESTED',
      processGeneration: PROCESS_GENERATION,
      playwrightEpoch: 2,
    });

    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
    expect(actor.getSnapshot().context.runtimeRestartCount).toBe(1);
  });

  it('revokes a provisional pass when a diagnostic arrives before archival', () => {
    const actor = reachShutdownOwned();
    actor.send({
      type: 'SHUTDOWN_BROWSER_CLOSE_RESOLVED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 3,
      transportId: 'shutdown-transport-3',
      commandId: 'browser-close-1',
      resolvedAt: 100,
    });
    actor.send({
      type: 'PROCESS_EXITED',
      processGeneration: PROCESS_GENERATION,
      pid: 12_345,
      observedAt: 101,
    });
    actor.send({ type: 'PROFILE_REMOVED', processGeneration: PROCESS_GENERATION });
    expect(actor.getSnapshot().matches('passed')).toBe(true);

    actor.send({
      type: 'APPLICATION_DIAGNOSTIC_RECORDED',
      processGeneration: PROCESS_GENERATION,
      diagnosticSha256: 'e'.repeat(64),
      kind: 'pageerror',
    });

    expect(actor.getSnapshot().matches('passed_blocked')).toBe(true);
    expect(actor.getSnapshot().context.verdict).toBe('blocked');
    actor.send({ type: 'VERDICT_ARCHIVED', processGeneration: PROCESS_GENERATION });
    expect(actor.getSnapshot().matches('archived')).toBe(true);
    expect(actor.getSnapshot().context.verdict).toBe('blocked');
  });

  it('accepts process exit only after an exact causal Browser.close proof', () => {
    const prematureExit = reachShutdownOwned();
    prematureExit.send({
      type: 'PROCESS_EXITED',
      processGeneration: PROCESS_GENERATION,
      pid: 12_345,
      observedAt: 100,
    });
    expect(prematureExit.getSnapshot().matches('failed_profile_removing')).toBe(true);
    prematureExit.send({
      type: 'SHUTDOWN_SOCKET_CLOSED_AFTER_COMMAND',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 3,
      transportId: 'shutdown-transport-3',
      commandId: 'browser-close-1',
      dispatchedAt: 99,
      socketClosedAt: 101,
    });
    expect(prematureExit.getSnapshot().matches('failed_profile_removing')).toBe(true);

    const causalExit = reachShutdownOwned();
    causalExit.send({
      type: 'SHUTDOWN_SOCKET_CLOSED_AFTER_COMMAND',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 3,
      transportId: 'shutdown-transport-3',
      commandId: 'browser-close-1',
      dispatchedAt: 200,
      socketClosedAt: 201,
    });
    causalExit.send({
      type: 'PROCESS_EXITED',
      processGeneration: PROCESS_GENERATION,
      pid: 12_345,
      observedAt: 202,
    });
    expect(causalExit.getSnapshot().matches('profile_removing')).toBe(true);
  });

  it('retains the exact raw release receipt and frozen raw authority atomically', () => {
    const actor = reachEndpointOwnerNone();
    completeRawEpoch(actor, 'initial_bootstrap', 1);

    expect(actor.getSnapshot().context.currentRawAuthority).toBe(RAW_AUTHORITY);
    expect(Object.isFrozen(actor.getSnapshot().context.currentRawAuthority)).toBe(true);
    expect(actor.getSnapshot().context.currentRawReleaseReceipt).toEqual(rawReleaseReceipt(1));
    expect(actor.getSnapshot().context.currentRawReleaseReceiptSha256).toBe(
      sha256Jcs(rawReleaseReceipt(1))
    );
  });

  it('does not retain an unbound raw release receipt or authority', () => {
    const actor = reachEndpointOwnerNone();
    actor.send({
      type: 'RAW_ACQUIRE_REQUESTED',
      processGeneration: PROCESS_GENERATION,
      mode: 'initial_bootstrap',
      leaseEpoch: 1,
    });
    actor.send({
      type: 'RAW_TRANSPORT_OPENED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 1,
      transportId: 'raw-transport-1',
    });
    actor.send({
      type: 'ENDPOINT_VERIFIED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 1,
      endpointReceiptSha256: 'b'.repeat(64),
    });
    actor.send({
      type: 'RAW_BOOTSTRAP_PROVED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 1,
      receiptSha256: 'c'.repeat(64),
      operationalCommandCount: rawOperationalAuthority(1).operationalCommandCount,
      operationalLedgerSha256: rawOperationalAuthority(1).operationalLedgerSha256,
    });
    actor.send({
      type: 'RAW_RELEASE_PROVED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 1,
      playwrightEpoch: 1,
      rawReceipt: rawReleaseReceipt(1),
      rawReceiptSha256: '0'.repeat(64),
      authority: RAW_AUTHORITY,
    });

    expect(actor.getSnapshot().matches('raw_releasing.initial_bootstrap')).toBe(true);
    expect(actor.getSnapshot().context.currentRawReleaseReceipt).toBeNull();
    expect(actor.getSnapshot().context.currentRawAuthority).toBeNull();
  });

  it('owns no Playwright lease or transport while projection is pending', () => {
    const actor = reachEndpointOwnerNone();
    completeRawEpoch(actor, 'initial_bootstrap', 1);
    const rawReceiptSha256 = sha256Jcs(rawReleaseReceipt(1));

    actor.send({
      type: 'PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED',
      processGeneration: PROCESS_GENERATION,
      playwrightEpoch: 1,
      rawReceiptSha256,
    });
    actor.send({
      type: 'PLAYWRIGHT_RESERVE_REQUESTED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 2,
      playwrightEpoch: 1,
      authorityProjectionSha256: 'f'.repeat(64),
    });

    expect(actor.getSnapshot().matches('playwright_authority_projecting')).toBe(true);
    expect(actor.getSnapshot().context.currentLeaseEpoch).toBe(1);
    expect(actor.getSnapshot().context.playwrightTransportId).toBeNull();
    expect(actor.getSnapshot().context.playwrightTransportOpened).toBe(false);
  });

  it('accepts only a source-bound projection and freezes the event DTO before reservation', () => {
    const actor = reachEndpointOwnerNone();
    completeRawEpoch(actor, 'initial_bootstrap', 1);
    const projection = projectAuthority(actor, 1);

    expect(actor.getSnapshot().context.currentPlaywrightAuthority).toEqual(projection.authority);
    expect(actor.getSnapshot().context.currentPlaywrightAuthority).not.toBe(
      actor.getSnapshot().context.currentRawAuthority
    );
    expect(Reflect.ownKeys(actor.getSnapshot().context.currentPlaywrightAuthority!)).toEqual(
      PLAYWRIGHT_AUTHORITY_KEYS
    );
    expect(Object.isFrozen(actor.getSnapshot().context.currentPlaywrightAuthority)).toBe(true);
    expect(actor.getSnapshot().context.currentLeaseEpoch).toBe(1);

    actor.send({
      type: 'PLAYWRIGHT_RESERVE_REQUESTED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 2,
      playwrightEpoch: 1,
      authorityProjectionSha256: projection.authorityProjectionSha256,
    });
    expect(actor.getSnapshot().matches('playwright_connecting')).toBe(true);
    expect(actor.getSnapshot().context.currentLeaseEpoch).toBe(2);
  });

  it.each(PLAYWRIGHT_AUTHORITY_KEYS)(
    'rejects a self-consistently hashed projection whose %s differs from raw authority',
    (field) => {
      const actor = reachEndpointOwnerNone();
      completeRawEpoch(actor, 'initial_bootstrap', 1);
      const rawReceiptSha256 = sha256Jcs(rawReleaseReceipt(1));
      actor.send({
        type: 'PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED',
        processGeneration: PROCESS_GENERATION,
        playwrightEpoch: 1,
        rawReceiptSha256,
      });
      const canonical = projectPlaywrightAuthorityV1(RAW_AUTHORITY);
      if (!canonical.ok) {
        throw new Error('canonical projection failed');
      }
      const foreignInput = { ...canonical.authority, [field]: `${canonical.authority[field]}-x` };
      if (field === 'extensionId') {
        foreignInput.extensionId = 'b'.repeat(32);
      }
      actor.send({
        type: 'PLAYWRIGHT_AUTHORITY_PROJECTED',
        processGeneration: PROCESS_GENERATION,
        playwrightEpoch: 1,
        rawReceiptSha256,
        authority: foreignInput,
        authorityProjectionSha256: sha256Jcs(foreignInput),
      });

      expect(actor.getSnapshot().matches('playwright_authority_projecting')).toBe(true);
      expect(actor.getSnapshot().context.currentLeaseEpoch).toBe(1);
      expect(actor.getSnapshot().context.playwrightTransportOpened).toBe(false);
    }
  );

  it.each([
    ['stale generation', { processGeneration: 2 }],
    ['stale epoch', { playwrightEpoch: 2 }],
    ['stale raw receipt', { rawReceiptSha256: '0'.repeat(64) }],
    ['hash drift', { authorityProjectionSha256: '0'.repeat(64) }],
  ])('ignores %s projected events without reserving a lease', (_label, override) => {
    const actor = reachEndpointOwnerNone();
    completeRawEpoch(actor, 'initial_bootstrap', 1);
    const rawReceiptSha256 = sha256Jcs(rawReleaseReceipt(1));
    actor.send({
      type: 'PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED',
      processGeneration: PROCESS_GENERATION,
      playwrightEpoch: 1,
      rawReceiptSha256,
    });
    const projection = projectPlaywrightAuthorityV1(RAW_AUTHORITY);
    if (!projection.ok) {
      throw new Error('canonical projection failed');
    }
    actor.send({
      type: 'PLAYWRIGHT_AUTHORITY_PROJECTED',
      processGeneration: PROCESS_GENERATION,
      playwrightEpoch: 1,
      rawReceiptSha256,
      authority: projection.authority,
      authorityProjectionSha256: projection.authorityProjectionSha256,
      ...override,
    });

    expect(actor.getSnapshot().matches('playwright_authority_projecting')).toBe(true);
    expect(actor.getSnapshot().context.currentLeaseEpoch).toBe(1);
    expect(actor.getSnapshot().context.playwrightTransportId).toBeNull();
  });

  it('ignores a duplicate projected event after ready without reserving a lease', () => {
    const actor = reachEndpointOwnerNone();
    completeRawEpoch(actor, 'initial_bootstrap', 1);
    const projection = projectAuthority(actor, 1);
    const retainedAuthority = actor.getSnapshot().context.currentPlaywrightAuthority;

    actor.send({
      type: 'PLAYWRIGHT_AUTHORITY_PROJECTED',
      processGeneration: PROCESS_GENERATION,
      playwrightEpoch: 1,
      rawReceiptSha256: sha256Jcs(rawReleaseReceipt(1)),
      authority: projection.authority,
      authorityProjectionSha256: projection.authorityProjectionSha256,
    });

    expect(actor.getSnapshot().matches('playwright_authority_ready')).toBe(true);
    expect(actor.getSnapshot().context.currentPlaywrightAuthority).toBe(retainedAuthority);
    expect(actor.getSnapshot().context.currentLeaseEpoch).toBe(1);
    expect(actor.getSnapshot().context.playwrightTransportId).toBeNull();
  });

  it('creates a causal no-owner release receipt and enters failed shutdown directly on rejection', () => {
    const actor = reachEndpointOwnerNone();
    completeRawEpoch(actor, 'initial_bootstrap', 1);
    const rawReceiptSha256 = sha256Jcs(rawReleaseReceipt(1));
    actor.send({
      type: 'PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED',
      processGeneration: PROCESS_GENERATION,
      playwrightEpoch: 1,
      rawReceiptSha256,
    });
    actor.send({
      type: 'PLAYWRIGHT_AUTHORITY_REJECTED',
      processGeneration: PROCESS_GENERATION,
      playwrightEpoch: 1,
      rawReceiptSha256,
      error: {
        schemaVersion: 1,
        code: 'FIELD_TYPE_INVALID',
        field: 'targetId',
      },
    });

    expect(actor.getSnapshot().matches('failed_shutdown_connecting')).toBe(true);
    expect(actor.getSnapshot().context.currentLeaseEpoch).toBe(1);
    expect(actor.getSnapshot().context.playwrightTransportId).toBeNull();
    expect(actor.getSnapshot().context.playwrightTransportOpened).toBe(false);
    const receipt = actor.getSnapshot().context.noOwnerReleaseReceipt;
    expect(receipt).toMatchObject({
      schemaVersion: 1,
      processGeneration: PROCESS_GENERATION,
      playwrightEpoch: 1,
      rawReceiptSha256,
      ownerKind: 'none',
      leaseReserved: false,
      transportOpened: false,
      authorityProjectionSha256: null,
    });
    if (receipt === null) {
      throw new Error('no-owner release receipt is missing');
    }
    const { receiptSha256, ...preimage } = receipt;
    expect(receiptSha256).toBe(sha256Jcs(preimage));
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it('ignores stale, duplicate and malformed projection rejections', () => {
    const actor = reachEndpointOwnerNone();
    completeRawEpoch(actor, 'initial_bootstrap', 1);
    const rawReceiptSha256 = sha256Jcs(rawReleaseReceipt(1));
    actor.send({
      type: 'PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED',
      processGeneration: PROCESS_GENERATION,
      playwrightEpoch: 1,
      rawReceiptSha256,
    });
    actor.send({
      type: 'PLAYWRIGHT_AUTHORITY_REJECTED',
      processGeneration: 2,
      playwrightEpoch: 1,
      rawReceiptSha256,
      error: { schemaVersion: 1, code: 'SOURCE_NOT_RECORD', field: null },
    });
    actor.send({
      type: 'PLAYWRIGHT_AUTHORITY_REJECTED',
      processGeneration: PROCESS_GENERATION,
      playwrightEpoch: 1,
      rawReceiptSha256,
      error: { schemaVersion: 1, code: 'FIELD_TYPE_INVALID', field: null },
    });
    expect(actor.getSnapshot().matches('playwright_authority_projecting')).toBe(true);
    expect(actor.getSnapshot().context.noOwnerReleaseReceipt).toBeNull();

    actor.send({
      type: 'PLAYWRIGHT_AUTHORITY_REJECTED',
      processGeneration: PROCESS_GENERATION,
      playwrightEpoch: 1,
      rawReceiptSha256,
      error: { schemaVersion: 1, code: 'SOURCE_NOT_RECORD', field: null },
    });
    const receipt = actor.getSnapshot().context.noOwnerReleaseReceipt;
    actor.send({
      type: 'PLAYWRIGHT_AUTHORITY_REJECTED',
      processGeneration: PROCESS_GENERATION,
      playwrightEpoch: 1,
      rawReceiptSha256,
      error: { schemaVersion: 1, code: 'SOURCE_NOT_RECORD', field: null },
    });
    expect(actor.getSnapshot().matches('failed_shutdown_connecting')).toBe(true);
    expect(actor.getSnapshot().context.noOwnerReleaseReceipt).toBe(receipt);
  });
});
