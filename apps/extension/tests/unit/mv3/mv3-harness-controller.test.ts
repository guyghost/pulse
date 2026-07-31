import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';

import {
  createRawBootstrapRetentionHandler,
  withProjectedPlaywrightReservation,
} from '../../mv3/harness/mv3-harness-controller';
import {
  createRawOperationalLedgerAuthorityV1,
  mv3HarnessMachine,
} from '../../mv3/harness/mv3-harness.machine';
import { PLAYWRIGHT_AUTHORITY_KEYS, sha256Jcs } from '../../mv3/harness/playwright-authority';
import {
  createRawBootstrapProvedV1,
  createRawOperationalLedgerAuthorityV1 as createSealedOperationalAuthority,
} from '../../mv3/harness/raw-operational-authority';
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
const RAW_RELEASE_RECEIPT = createCompleteRawReleaseReceipt({
  processGeneration: PROCESS_GENERATION,
  leaseEpoch: 1,
  transportId: 'raw-transport-1',
});
const RAW_OPERATIONAL_AUTHORITY = createRawOperationalLedgerAuthorityV1(RAW_RELEASE_RECEIPT);
const RAW_BOOTSTRAP_PROOF = createRawBootstrapProvedV1(
  createSealedOperationalAuthority(RAW_RELEASE_RECEIPT),
  'c'.repeat(64)
);

function actorReadyForBootstrap() {
  const actor = createActor(mv3HarnessMachine).start();
  actor.send({ type: 'HARNESS_STARTED' });
  actor.send({ type: 'ARTIFACT_SEALED', artifactSha256: 'a'.repeat(64) });
  actor.send({ type: 'PROFILE_CREATED', profileId: 'profile-1' });
  actor.send({ type: 'PROCESS_SPAWNED', processGeneration: PROCESS_GENERATION, pid: 12_345 });
  actor.send({
    type: 'ENDPOINT_PARSED',
    processGeneration: PROCESS_GENERATION,
    endpointReceiptSha256: 'b'.repeat(64),
  });
  actor.send({
    type: 'RAW_ACQUIRE_REQUESTED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch: 1,
    mode: 'initial_bootstrap',
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
  expect(actor.getSnapshot().matches('raw_owned.initial_bootstrap')).toBe(true);
  return actor;
}

function actorWithRawRelease(authority: unknown = RAW_AUTHORITY) {
  const actor = createActor(mv3HarnessMachine).start();
  actor.send({ type: 'HARNESS_STARTED' });
  actor.send({ type: 'ARTIFACT_SEALED', artifactSha256: 'a'.repeat(64) });
  actor.send({ type: 'PROFILE_CREATED', profileId: 'profile-1' });
  actor.send({ type: 'PROCESS_SPAWNED', processGeneration: PROCESS_GENERATION, pid: 12_345 });
  actor.send({
    type: 'ENDPOINT_PARSED',
    processGeneration: PROCESS_GENERATION,
    endpointReceiptSha256: 'b'.repeat(64),
  });
  actor.send({
    type: 'RAW_ACQUIRE_REQUESTED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch: 1,
    mode: 'initial_bootstrap',
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
    operationalCommandCount: RAW_OPERATIONAL_AUTHORITY.operationalCommandCount,
    operationalLedgerSha256: RAW_OPERATIONAL_AUTHORITY.operationalLedgerSha256,
  });
  actor.send({
    type: 'RAW_RELEASE_PROVED',
    processGeneration: PROCESS_GENERATION,
    leaseEpoch: 1,
    playwrightEpoch: 1,
    rawReceipt: RAW_RELEASE_RECEIPT,
    rawReceiptSha256: sha256Jcs(RAW_RELEASE_RECEIPT),
    authority,
  } as never);
  expect(actor.getSnapshot().matches('owner_none')).toBe(true);
  return actor;
}

describe('createRawBootstrapRetentionHandler', () => {
  function handlerFor(actor: ReturnType<typeof actorReadyForBootstrap>) {
    return createRawBootstrapRetentionHandler({
      actor,
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 1,
      mode: 'initial_bootstrap',
      transportId: 'raw-transport-1',
    });
  }

  it('ACKs only after the exact bootstrap proof is retained atomically', () => {
    const actor = actorReadyForBootstrap();
    const retain = handlerFor(actor);

    const ack = retain(RAW_BOOTSTRAP_PROOF);

    expect(ack).toEqual({ ...RAW_BOOTSTRAP_PROOF, retained: true });
    expect(actor.getSnapshot().matches('raw_releasing.initial_bootstrap')).toBe(true);
    expect(actor.getSnapshot().context).toMatchObject({
      currentRawBootstrapReceiptSha256: RAW_BOOTSTRAP_PROOF.receiptSha256,
      currentRawOperationalCommandCount: RAW_BOOTSTRAP_PROOF.operationalCommandCount,
      currentRawOperationalLedgerSha256: RAW_BOOTSTRAP_PROOF.operationalLedgerSha256,
    });
  });

  it('rejects duplicate, stale, and late callback invocations', () => {
    const duplicateActor = actorReadyForBootstrap();
    const duplicate = handlerFor(duplicateActor);
    duplicate(RAW_BOOTSTRAP_PROOF);
    expect(() => duplicate(RAW_BOOTSTRAP_PROOF)).toThrow(/more than once/u);

    const staleActor = actorReadyForBootstrap();
    const stale = handlerFor(staleActor);
    expect(() => stale({ ...RAW_BOOTSTRAP_PROOF, leaseEpoch: 2 })).toThrow(/stale/u);
    expect(staleActor.getSnapshot().matches('raw_owned.initial_bootstrap')).toBe(true);

    const lateActor = actorReadyForBootstrap();
    lateActor.send({
      type: 'RAW_BOOTSTRAP_PROVED',
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: 1,
      receiptSha256: RAW_BOOTSTRAP_PROOF.receiptSha256,
      operationalCommandCount: RAW_BOOTSTRAP_PROOF.operationalCommandCount,
      operationalLedgerSha256: RAW_BOOTSTRAP_PROOF.operationalLedgerSha256,
    });
    const late = handlerFor(lateActor);
    expect(() => late(RAW_BOOTSTRAP_PROOF)).toThrow(/expected raw_owned/u);
  });
});

describe('withProjectedPlaywrightReservation', () => {
  it('passes only the retained six-field DTO after ready accepted the source-bound hash', async () => {
    const actor = actorWithRawRelease();
    const acquire = vi.fn(async (prepared) => {
      expect(actor.getSnapshot().matches('playwright_connecting')).toBe(true);
      expect(Reflect.ownKeys(prepared.authority)).toEqual(PLAYWRIGHT_AUTHORITY_KEYS);
      expect(prepared.authority).not.toBe(RAW_AUTHORITY);
      expect(Object.isFrozen(prepared.authority)).toBe(true);
      expect(prepared.authorityProjectionSha256).toMatch(/^[a-f0-9]{64}$/u);
      return 'connected';
    });

    await expect(
      withProjectedPlaywrightReservation(
        {
          actor,
          processGeneration: PROCESS_GENERATION,
          leaseEpoch: 2,
          playwrightEpoch: 1,
          rawReceiptSha256: sha256Jcs(RAW_RELEASE_RECEIPT),
        },
        acquire
      )
    ).resolves.toBe('connected');

    expect(acquire).toHaveBeenCalledOnce();
    expect(actor.getSnapshot().context.currentLeaseEpoch).toBe(2);
  });

  it('opens no lease, transport or connection when projection is rejected', async () => {
    const actor = actorWithRawRelease({ ...RAW_AUTHORITY, targetId: 42 });
    const openTransport = vi.fn();
    const connectOverCDP = vi.fn();
    const exposeFixture = vi.fn();
    const acquire = vi.fn(async () => {
      openTransport();
      connectOverCDP();
      exposeFixture();
      return 'must-not-connect';
    });

    await expect(
      withProjectedPlaywrightReservation(
        {
          actor,
          processGeneration: PROCESS_GENERATION,
          leaseEpoch: 2,
          playwrightEpoch: 1,
          rawReceiptSha256: sha256Jcs(RAW_RELEASE_RECEIPT),
        },
        acquire
      )
    ).rejects.toMatchObject({
      name: 'PlaywrightAuthorityProjectionRejectedError',
      projectionError: {
        schemaVersion: 1,
        code: 'FIELD_TYPE_INVALID',
        field: 'targetId',
      },
    });

    expect(acquire).not.toHaveBeenCalled();
    expect(openTransport).not.toHaveBeenCalled();
    expect(connectOverCDP).not.toHaveBeenCalled();
    expect(exposeFixture).not.toHaveBeenCalled();
    expect(actor.getSnapshot().matches('failed_shutdown_connecting')).toBe(true);
    expect(actor.getSnapshot().context.currentLeaseEpoch).toBe(1);
    expect(actor.getSnapshot().context.playwrightTransportId).toBeNull();
    expect(actor.getSnapshot().context.playwrightTransportOpened).toBe(false);
    expect(actor.getSnapshot().context.noOwnerReleaseReceipt).not.toBeNull();
  });
});
