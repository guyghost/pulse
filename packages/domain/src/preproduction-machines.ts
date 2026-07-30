import { createActor, setup } from 'xstate';

export type ApiRateLimitEvent =
  | { type: 'SUBJECT_DERIVED' }
  | { type: 'SUBJECT_INVALID' }
  | { type: 'BUCKET_ALLOWED' }
  | { type: 'BUCKET_DENIED' }
  | { type: 'STORE_FAILED' };

export const apiRateLimitMachine = setup({
  types: { events: {} as ApiRateLimitEvent },
}).createMachine({
  id: 'apiRateLimit',
  initial: 'received',
  states: {
    received: {
      on: {
        SUBJECT_DERIVED: 'checking',
        SUBJECT_INVALID: 'failed_closed_terminal',
      },
    },
    checking: {
      on: {
        BUCKET_ALLOWED: 'allowed_terminal',
        BUCKET_DENIED: 'denied_terminal',
        STORE_FAILED: 'failed_closed_terminal',
      },
    },
    allowed_terminal: { type: 'final' },
    denied_terminal: { type: 'final' },
    failed_closed_terminal: { type: 'final' },
  },
});

export type ApiRateLimitDecisionSignal =
  'subject_invalid' | 'bucket_allowed' | 'bucket_denied' | 'store_failed';

export function resolveApiRateLimitState(signal: ApiRateLimitDecisionSignal): string {
  const actor = createActor(apiRateLimitMachine).start();
  if (signal === 'subject_invalid') {
    actor.send({ type: 'SUBJECT_INVALID' });
  } else {
    actor.send({ type: 'SUBJECT_DERIVED' });
    actor.send({
      type:
        signal === 'bucket_allowed'
          ? 'BUCKET_ALLOWED'
          : signal === 'bucket_denied'
            ? 'BUCKET_DENIED'
            : 'STORE_FAILED',
    });
  }
  return String(actor.getSnapshot().value);
}

export type RetentionPurgeEvent =
  | { type: 'PURGE_REQUESTED' }
  | { type: 'PURGE_COMMITTED' }
  | { type: 'PURGE_FAILED_RETRYABLE' }
  | { type: 'PURGE_FAILED_TERMINAL' }
  | { type: 'RETRY' }
  | { type: 'CANCEL_REQUESTED' };

export const retentionPurgeMachine = setup({
  types: { events: {} as RetentionPurgeEvent },
}).createMachine({
  id: 'retentionPurge',
  initial: 'idle',
  states: {
    idle: { on: { PURGE_REQUESTED: 'purging' } },
    purging: {
      on: {
        PURGE_COMMITTED: 'completed_terminal',
        PURGE_FAILED_RETRYABLE: 'failed_retryable',
        PURGE_FAILED_TERMINAL: 'failed_terminal',
      },
    },
    failed_retryable: {
      on: {
        RETRY: 'purging',
        CANCEL_REQUESTED: 'cancelled_terminal',
      },
    },
    completed_terminal: { type: 'final' },
    failed_terminal: { type: 'final' },
    cancelled_terminal: { type: 'final' },
  },
});
