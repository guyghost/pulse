import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { apiRateLimitMachine, retentionPurgeMachine } from '../src/preproduction-machines';

describe('apiRateLimitMachine', () => {
  it.each([
    ['BUCKET_ALLOWED', 'allowed_terminal'],
    ['BUCKET_DENIED', 'denied_terminal'],
    ['STORE_FAILED', 'failed_closed_terminal'],
  ] as const)('terminates deterministically on %s', (event, expected) => {
    const actor = createActor(apiRateLimitMachine).start();
    actor.send({ type: 'SUBJECT_DERIVED' });
    actor.send({ type: event });
    expect(actor.getSnapshot().value).toBe(expected);
    expect(actor.getSnapshot().status).toBe('done');
  });

  it('fails closed before storage when the subject is invalid', () => {
    const actor = createActor(apiRateLimitMachine).start();
    actor.send({ type: 'SUBJECT_INVALID' });
    expect(actor.getSnapshot().value).toBe('failed_closed_terminal');
  });

  it('rejects implicit transitions from the received state', () => {
    const actor = createActor(apiRateLimitMachine).start();
    actor.send({ type: 'BUCKET_ALLOWED' });
    expect(actor.getSnapshot().value).toBe('received');
  });
});

describe('retentionPurgeMachine', () => {
  it('requires an explicit retry after a retryable failure', () => {
    const actor = createActor(retentionPurgeMachine).start();
    actor.send({ type: 'PURGE_REQUESTED' });
    actor.send({ type: 'PURGE_FAILED_RETRYABLE' });
    expect(actor.getSnapshot().value).toBe('failed_retryable');
    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('purging');
    actor.send({ type: 'PURGE_COMMITTED' });
    expect(actor.getSnapshot().value).toBe('completed_terminal');
  });

  it('supports explicit cancellation only from a retryable failure', () => {
    const actor = createActor(retentionPurgeMachine).start();
    actor.send({ type: 'PURGE_REQUESTED' });
    actor.send({ type: 'CANCEL_REQUESTED' });
    expect(actor.getSnapshot().value).toBe('purging');
    actor.send({ type: 'PURGE_FAILED_RETRYABLE' });
    actor.send({ type: 'CANCEL_REQUESTED' });
    expect(actor.getSnapshot().value).toBe('cancelled_terminal');
  });
});
