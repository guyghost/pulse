import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';
import {
  scanLifecycleMachine,
  type ScanLifecycleInput,
} from '../../../src/models/scan-lifecycle.machine';

const OPERATION_ID = 'scan-operation-1';

function createLifecycleActor(input: Partial<ScanLifecycleInput> = {}) {
  const actor = createActor(scanLifecycleMachine, {
    input: {
      now: 1_773_820_800_000,
      maxRetries: 2,
      activeLeaseOperationId: null,
      ...input,
    },
  });
  actor.start();
  return actor;
}

function startScanning() {
  const actor = createLifecycleActor();
  actor.send({ type: 'START', operationId: OPERATION_ID, trigger: 'manual' });
  actor.send({
    type: 'START_READY',
    operationId: OPERATION_ID,
    connectorIds: ['free-work'],
  });
  expect(actor.getSnapshot().value).toBe('scanning');
  return actor;
}

describe('scanLifecycleMachine', () => {
  it('declares exactly the eleven approved lifecycle states', () => {
    expect(Object.keys(scanLifecycleMachine.config.states ?? {}).sort()).toEqual(
      [
        'idle',
        'starting',
        'scanning',
        'retrying',
        'cancelling',
        'cancelled',
        'persisting',
        'completed',
        'partial',
        'failed',
        'busy',
      ].sort()
    );
  });

  it.each([
    ['starting', (actor: ReturnType<typeof createLifecycleActor>) => actor],
    ['scanning', startScanning],
    [
      'retrying',
      () => {
        const actor = startScanning();
        actor.send({
          type: 'CONNECTOR_FAILED',
          operationId: OPERATION_ID,
          connectorId: 'free-work',
          error: { connectorId: 'free-work', code: 'NETWORK_ERROR', message: 'temporary' },
          retryable: true,
        });
        actor.send({
          type: 'RETRY_SCHEDULED',
          operationId: OPERATION_ID,
          connectorId: 'free-work',
        });
        return actor;
      },
    ],
    [
      'persisting',
      () => {
        const actor = startScanning();
        actor.send({
          type: 'CONNECTOR_SUCCEEDED',
          operationId: OPERATION_ID,
          connectorId: 'free-work',
          missions: [],
        });
        actor.send({ type: 'CONNECTORS_SETTLED', operationId: OPERATION_ID });
        return actor;
      },
    ],
  ])('cancels deterministically from %s', (_state, arrange) => {
    const actor = arrange(createLifecycleActor());
    if (actor.getSnapshot().value === 'idle') {
      actor.send({ type: 'START', operationId: OPERATION_ID, trigger: 'manual' });
    }

    actor.send({ type: 'CANCEL', operationId: OPERATION_ID });
    expect(actor.getSnapshot().value).toBe('cancelling');
    expect(actor.getSnapshot().context.cancellationRequested).toBe(true);

    actor.send({ type: 'ABORT_CONFIRMED', operationId: OPERATION_ID });
    expect(actor.getSnapshot().value).toBe('cancelled');
    expect(actor.getSnapshot().status).toBe('done');
  });

  it('rejects stale operation events and every transition out of cancelled', () => {
    const actor = startScanning();

    actor.send({ type: 'CANCEL', operationId: 'different-operation' });
    expect(actor.getSnapshot().value).toBe('scanning');

    actor.send({ type: 'CANCEL', operationId: OPERATION_ID });
    actor.send({ type: 'ABORT_CONFIRMED', operationId: OPERATION_ID });
    actor.send({ type: 'PERSIST_SUCCEEDED', operationId: OPERATION_ID });
    actor.send({ type: 'START', operationId: OPERATION_ID, trigger: 'manual' });

    expect(actor.getSnapshot().value).toBe('cancelled');
  });

  it('settles a rejected concurrent request as busy without disturbing the active actor', () => {
    const activeActor = startScanning();
    const rejectedActor = createLifecycleActor({ activeLeaseOperationId: OPERATION_ID });

    rejectedActor.send({ type: 'START', operationId: 'scan-operation-2', trigger: 'manual' });
    activeActor.send({ type: 'START', operationId: 'scan-operation-2', trigger: 'manual' });

    expect(rejectedActor.getSnapshot().value).toBe('busy');
    expect(rejectedActor.getSnapshot().context.activeLeaseOperationId).toBe(OPERATION_ID);
    expect(activeActor.getSnapshot().value).toBe('scanning');
    expect(activeActor.getSnapshot().context.operationId).toBe(OPERATION_ID);
  });

  it('enters retrying directly when the live connector attempt fails retryably', () => {
    const actor = startScanning();

    actor.send({
      type: 'CONNECTOR_FAILED',
      operationId: OPERATION_ID,
      connectorId: 'free-work',
      error: { connectorId: 'free-work', code: 'NETWORK_ERROR', message: 'temporary' },
      retryable: true,
    });

    expect(actor.getSnapshot().value).toBe('retrying');
    expect(actor.getSnapshot().context.retryPendingConnectorIds).toEqual(['free-work']);
    expect(actor.getSnapshot().context.retryCountByConnector['free-work']).toBe(1);
  });

  it('settles a live terminal connector failure and releases the modeled lease', () => {
    const actor = startScanning();

    actor.send({
      type: 'CONNECTOR_FAILED',
      operationId: OPERATION_ID,
      connectorId: 'free-work',
      error: { connectorId: 'free-work', code: 'SESSION', message: 'unauthorized' },
      retryable: false,
    });

    expect(actor.getSnapshot().value).toBe('failed');
    expect(actor.getSnapshot().status).toBe('done');
    expect(actor.getSnapshot().context.activeLeaseOperationId).toBeNull();
  });

  it('settles an unexpected live runtime error as failed and releases the lease', () => {
    const actor = startScanning();

    actor.send({
      type: 'RUNTIME_FAILED',
      operationId: OPERATION_ID,
      error: { code: 'OFFLINE', message: 'network disappeared' },
    });

    expect(actor.getSnapshot().value).toBe('failed');
    expect(actor.getSnapshot().status).toBe('done');
    expect(actor.getSnapshot().context.activeLeaseOperationId).toBeNull();
  });

  it('settles all unfinished connectors on a live offline event', () => {
    const actor = startScanning();

    actor.send({ type: 'NETWORK_OFFLINE', operationId: OPERATION_ID });

    expect(actor.getSnapshot().value).toBe('failed');
    expect(actor.getSnapshot().context.connectorResults['free-work']).toBe('failed');
    expect(actor.getSnapshot().context.activeLeaseOperationId).toBeNull();
  });
});
