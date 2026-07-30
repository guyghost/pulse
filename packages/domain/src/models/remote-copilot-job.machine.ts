import { assign, setup, type SnapshotFrom } from 'xstate';

import {
  copilotCreditCost,
  isReviewableCopilotResult,
  type CopilotCreditCost,
  type CopilotGroundingContext,
  type CopilotOperationKind,
  type CopilotTjmFactId,
  type CopilotValidatedResult,
} from './copilot-contracts';

export const REMOTE_COPILOT_JOB_STATES = [
  'idle',
  'authorizing',
  'reserving',
  'queued',
  'running',
  'validating',
  'review',
  'accepted',
  'rejected',
  'cancelling',
  'refunding',
  'uncertain',
  'failed',
  'cancelled',
] as const;

export type RemoteCopilotJobStateValue = (typeof REMOTE_COPILOT_JOB_STATES)[number];

export const REMOTE_COPILOT_FAILURE_CODES = [
  'AUTHENTICATION_REQUIRED',
  'ENTITLEMENT_DENIED',
  'OWNERSHIP_DENIED',
  'INSUFFICIENT_CREDITS',
  'RATE_LIMITED',
  'RESERVATION_FAILED',
  'PROVIDER_FAILED',
  'RESULT_INVALID',
  'CANCELLATION_FAILED',
  'REFUND_FAILED',
  'RECONCILIATION_FAILED',
] as const;

export type RemoteCopilotFailureCode = (typeof REMOTE_COPILOT_FAILURE_CODES)[number];

const REMOTE_COPILOT_FAILURE_CODE_SET = new Set<string>(REMOTE_COPILOT_FAILURE_CODES);

export interface RemoteCopilotFailure {
  code: RemoteCopilotFailureCode;
  message: string;
  retryable: boolean;
}

export interface CopilotAuthorizationEvidence {
  authenticatedUserId: string;
  entitlement: 'active';
  dossierOwnerUserId: string;
}

export interface RemoteCopilotAttemptCorrelation {
  jobId: string;
  userId: string;
  attemptId: string;
}

export interface RemoteCopilotPaymentCorrelation extends RemoteCopilotAttemptCorrelation {
  idempotencyKey: string;
}

export type RemoteCopilotReservationStatus = 'not-required' | 'required' | 'reserved';
export type RemoteCopilotRefundStatus = 'not-required' | 'pending' | 'refunded';
export type RemoteCopilotSettlement = 'failure' | 'cancellation' | null;
export type RemoteCopilotUncertainPhase =
  'reservation' | 'provider' | 'cancellation' | 'refund' | null;

export interface RemoteCopilotJobContext {
  jobId: string | null;
  userId: string | null;
  dossierId: string | null;
  attemptId: string | null;
  idempotencyKey: string | null;
  operationKind: CopilotOperationKind | null;
  creditCost: CopilotCreditCost;
  suppliedEvidenceIds: readonly string[];
  suppliedTjmFactIds: readonly CopilotTjmFactId[];
  grounding: CopilotGroundingContext | null;
  authorizationEvidence: CopilotAuthorizationEvidence | null;
  reservationStatus: RemoteCopilotReservationStatus;
  reservationId: string | null;
  refundStatus: RemoteCopilotRefundStatus;
  refundId: string | null;
  providerRunId: string | null;
  result: CopilotValidatedResult | null;
  settlement: RemoteCopilotSettlement;
  uncertainPhase: RemoteCopilotUncertainPhase;
  failure: RemoteCopilotFailure | null;
}

export type RemoteCopilotJobEvent =
  | {
      type: 'CREATE_JOB';
      jobId: string;
      userId: string;
      dossierId: string;
      attemptId: string;
      idempotencyKey: string;
      operationKind: CopilotOperationKind;
      suppliedEvidenceIds: readonly string[];
      suppliedTjmFactIds?: readonly CopilotTjmFactId[];
      grounding?: CopilotGroundingContext;
    }
  | (RemoteCopilotAttemptCorrelation & {
      type: 'AUTHORIZATION_GRANTED';
      evidence: CopilotAuthorizationEvidence;
    })
  | (RemoteCopilotAttemptCorrelation & {
      type: 'AUTHORIZATION_DENIED';
      failure: RemoteCopilotFailure;
    })
  | (RemoteCopilotPaymentCorrelation & {
      type: 'CREDIT_RESERVED';
      reservationId: string;
    })
  | (RemoteCopilotPaymentCorrelation & {
      type: 'CREDIT_RESERVATION_FAILED';
      failure: RemoteCopilotFailure;
    })
  | (RemoteCopilotPaymentCorrelation & { type: 'CREDIT_RESERVATION_UNCERTAIN' })
  | (RemoteCopilotAttemptCorrelation & { type: 'PROVIDER_STARTED'; providerRunId: string })
  | (RemoteCopilotAttemptCorrelation & { type: 'PROVIDER_COMPLETED'; providerRunId: string })
  | (RemoteCopilotAttemptCorrelation & {
      type: 'PROVIDER_FAILED';
      providerRunId: string | null;
      failure: RemoteCopilotFailure;
    })
  | (RemoteCopilotAttemptCorrelation & {
      type: 'PROVIDER_STATUS_UNCERTAIN';
      providerRunId: string | null;
    })
  | (RemoteCopilotAttemptCorrelation & {
      type: 'RESULT_VALIDATED';
      result: CopilotValidatedResult;
    })
  | (RemoteCopilotAttemptCorrelation & {
      type: 'RESULT_INVALID';
      failure: RemoteCopilotFailure;
    })
  | (RemoteCopilotAttemptCorrelation & { type: 'USER_ACCEPTED'; reviewedAtMs: number })
  | (RemoteCopilotAttemptCorrelation & { type: 'USER_REJECTED'; reviewedAtMs: number })
  | (RemoteCopilotAttemptCorrelation & { type: 'CANCEL_REQUESTED' })
  | (RemoteCopilotAttemptCorrelation & { type: 'CANCELLATION_CONFIRMED' })
  | (RemoteCopilotAttemptCorrelation & {
      type: 'CANCELLATION_UNCERTAIN';
      failure: RemoteCopilotFailure;
    })
  | (RemoteCopilotPaymentCorrelation & { type: 'CREDIT_REFUNDED'; refundId: string })
  | (RemoteCopilotPaymentCorrelation & {
      type: 'CREDIT_REFUND_FAILED';
      failure: RemoteCopilotFailure;
    })
  | (RemoteCopilotPaymentCorrelation & { type: 'CREDIT_REFUND_UNCERTAIN' })
  | (RemoteCopilotPaymentCorrelation & {
      type: 'RESERVATION_RECONCILED';
      outcome: 'reserved' | 'not-reserved';
      reservationId: string | null;
      failure: RemoteCopilotFailure | null;
    })
  | (RemoteCopilotAttemptCorrelation & {
      type: 'PROVIDER_RECONCILED_RUNNING';
      providerRunId: string;
    })
  | (RemoteCopilotAttemptCorrelation & {
      type: 'PROVIDER_RECONCILED_COMPLETED';
      providerRunId: string;
    })
  | (RemoteCopilotAttemptCorrelation & {
      type: 'PROVIDER_RECONCILED_FAILED';
      providerRunId: string | null;
      failure: RemoteCopilotFailure;
    })
  | (RemoteCopilotAttemptCorrelation & {
      type: 'CANCELLATION_RECONCILED';
      outcome: 'running' | 'cancelled';
      providerRunId: string | null;
    })
  | (RemoteCopilotPaymentCorrelation & {
      type: 'REFUND_RECONCILED';
      outcome: 'refunded' | 'pending';
      refundId: string | null;
    });

const EMPTY_REMOTE_JOB_CONTEXT: RemoteCopilotJobContext = {
  jobId: null,
  userId: null,
  dossierId: null,
  attemptId: null,
  idempotencyKey: null,
  operationKind: null,
  creditCost: 0,
  suppliedEvidenceIds: [],
  suppliedTjmFactIds: [],
  grounding: null,
  authorizationEvidence: null,
  reservationStatus: 'not-required',
  reservationId: null,
  refundStatus: 'not-required',
  refundId: null,
  providerRunId: null,
  result: null,
  settlement: null,
  uncertainPhase: null,
  failure: null,
};

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function uniqueNonEmpty(values: readonly string[]): boolean {
  return values.every(nonEmpty) && new Set(values).size === values.length;
}

function validCreateEvent(event: Extract<RemoteCopilotJobEvent, { type: 'CREATE_JOB' }>): boolean {
  return (
    nonEmpty(event.jobId) &&
    nonEmpty(event.userId) &&
    nonEmpty(event.dossierId) &&
    nonEmpty(event.attemptId) &&
    nonEmpty(event.idempotencyKey) &&
    uniqueNonEmpty(event.suppliedEvidenceIds)
  );
}

function matchesAttempt(
  context: RemoteCopilotJobContext,
  event: RemoteCopilotAttemptCorrelation
): boolean {
  return (
    event.jobId === context.jobId &&
    event.userId === context.userId &&
    event.attemptId === context.attemptId
  );
}

function matchesPayment(
  context: RemoteCopilotJobContext,
  event: RemoteCopilotPaymentCorrelation
): boolean {
  return matchesAttempt(context, event) && event.idempotencyKey === context.idempotencyKey;
}

function providerRunMatches(
  context: RemoteCopilotJobContext,
  providerRunId: string | null
): boolean {
  return (
    providerRunId === null ||
    context.providerRunId === null ||
    providerRunId === context.providerRunId
  );
}

function isPaidReserved(context: RemoteCopilotJobContext): boolean {
  return context.creditCost === 1 && context.reservationStatus === 'reserved';
}

function matchesPendingRefund(
  context: RemoteCopilotJobContext,
  event: RemoteCopilotPaymentCorrelation
): boolean {
  return (
    matchesPayment(context, event) && context.refundStatus === 'pending' && isPaidReserved(context)
  );
}

function failureFromEvent(event: RemoteCopilotJobEvent): RemoteCopilotFailure | null {
  return 'failure' in event ? event.failure : null;
}

const remoteCopilotJobSetup = setup({
  types: {
    context: {} as RemoteCopilotJobContext,
    events: {} as RemoteCopilotJobEvent,
  },
  guards: {
    validCreate: ({ event }) => event.type === 'CREATE_JOB' && validCreateEvent(event),
    matchingAttempt: ({ context, event }) =>
      event.type !== 'CREATE_JOB' && matchesAttempt(context, event),
    matchingPaidReservation: ({ context, event }) =>
      event.type === 'CREDIT_RESERVED' &&
      matchesPayment(context, event) &&
      context.creditCost === 1 &&
      context.reservationStatus === 'required' &&
      nonEmpty(event.reservationId),
    matchingReservationFailure: ({ context, event }) =>
      event.type === 'CREDIT_RESERVATION_FAILED' &&
      matchesPayment(context, event) &&
      context.creditCost === 1 &&
      context.reservationStatus === 'required',
    matchingReservationUncertain: ({ context, event }) =>
      event.type === 'CREDIT_RESERVATION_UNCERTAIN' &&
      matchesPayment(context, event) &&
      context.creditCost === 1 &&
      context.reservationStatus === 'required',
    authorizedFree: ({ context, event }) =>
      event.type === 'AUTHORIZATION_GRANTED' &&
      matchesAttempt(context, event) &&
      context.creditCost === 0 &&
      event.evidence.authenticatedUserId === context.userId &&
      event.evidence.dossierOwnerUserId === context.userId &&
      event.evidence.entitlement === 'active',
    authorizedPaid: ({ context, event }) =>
      event.type === 'AUTHORIZATION_GRANTED' &&
      matchesAttempt(context, event) &&
      context.creditCost === 1 &&
      event.evidence.authenticatedUserId === context.userId &&
      event.evidence.dossierOwnerUserId === context.userId &&
      event.evidence.entitlement === 'active',
    matchingAuthorizationDenial: ({ context, event }) =>
      event.type === 'AUTHORIZATION_DENIED' && matchesAttempt(context, event),
    matchingProviderStart: ({ context, event }) =>
      event.type === 'PROVIDER_STARTED' &&
      matchesAttempt(context, event) &&
      nonEmpty(event.providerRunId) &&
      providerRunMatches(context, event.providerRunId),
    matchingProviderCompletion: ({ context, event }) =>
      event.type === 'PROVIDER_COMPLETED' &&
      matchesAttempt(context, event) &&
      nonEmpty(event.providerRunId) &&
      providerRunMatches(context, event.providerRunId),
    matchingPaidProviderFailure: ({ context, event }) =>
      event.type === 'PROVIDER_FAILED' &&
      matchesAttempt(context, event) &&
      providerRunMatches(context, event.providerRunId) &&
      isPaidReserved(context),
    matchingFreeProviderFailure: ({ context, event }) =>
      event.type === 'PROVIDER_FAILED' &&
      matchesAttempt(context, event) &&
      providerRunMatches(context, event.providerRunId) &&
      !isPaidReserved(context),
    matchingProviderUncertain: ({ context, event }) =>
      event.type === 'PROVIDER_STATUS_UNCERTAIN' &&
      matchesAttempt(context, event) &&
      providerRunMatches(context, event.providerRunId),
    matchingValidResult: ({ context, event }) =>
      event.type === 'RESULT_VALIDATED' &&
      matchesAttempt(context, event) &&
      context.operationKind !== null &&
      isReviewableCopilotResult(
        event.result,
        context.operationKind,
        context.suppliedEvidenceIds,
        context.suppliedTjmFactIds,
        context.grounding
      ),
    matchingPaidInvalidResult: ({ context, event }) =>
      event.type === 'RESULT_INVALID' && matchesAttempt(context, event) && isPaidReserved(context),
    matchingFreeInvalidResult: ({ context, event }) =>
      event.type === 'RESULT_INVALID' && matchesAttempt(context, event) && !isPaidReserved(context),
    matchingReview: ({ context, event }) =>
      (event.type === 'USER_ACCEPTED' || event.type === 'USER_REJECTED') &&
      matchesAttempt(context, event) &&
      Number.isFinite(event.reviewedAtMs),
    matchingCancellation: ({ context, event }) =>
      (event.type === 'CANCEL_REQUESTED' || event.type === 'CANCELLATION_CONFIRMED') &&
      matchesAttempt(context, event),
    matchingCancellationUncertain: ({ context, event }) =>
      event.type === 'CANCELLATION_UNCERTAIN' && matchesAttempt(context, event),
    matchingPaidRefund: ({ context, event }) =>
      event.type === 'CREDIT_REFUNDED' &&
      matchesPendingRefund(context, event) &&
      nonEmpty(event.refundId),
    matchingRefundFailure: ({ context, event }) =>
      event.type === 'CREDIT_REFUND_FAILED' &&
      matchesPayment(context, event) &&
      context.refundStatus === 'pending',
    matchingRefundUncertain: ({ context, event }) =>
      event.type === 'CREDIT_REFUND_UNCERTAIN' &&
      matchesPayment(context, event) &&
      context.refundStatus === 'pending',
    settlesFailure: ({ context }) => context.settlement === 'failure',
    settlesCancellation: ({ context }) => context.settlement === 'cancellation',
    reservationReconciledReserved: ({ context, event }) =>
      event.type === 'RESERVATION_RECONCILED' &&
      context.uncertainPhase === 'reservation' &&
      matchesPayment(context, event) &&
      event.outcome === 'reserved' &&
      event.failure === null &&
      event.reservationId !== null &&
      nonEmpty(event.reservationId),
    reservationReconciledNotReserved: ({ context, event }) =>
      event.type === 'RESERVATION_RECONCILED' &&
      context.uncertainPhase === 'reservation' &&
      matchesPayment(context, event) &&
      event.outcome === 'not-reserved' &&
      event.failure !== null,
    providerReconciledRunning: ({ context, event }) =>
      event.type === 'PROVIDER_RECONCILED_RUNNING' &&
      context.uncertainPhase === 'provider' &&
      matchesAttempt(context, event) &&
      providerRunMatches(context, event.providerRunId) &&
      nonEmpty(event.providerRunId),
    providerReconciledCompleted: ({ context, event }) =>
      event.type === 'PROVIDER_RECONCILED_COMPLETED' &&
      context.uncertainPhase === 'provider' &&
      matchesAttempt(context, event) &&
      providerRunMatches(context, event.providerRunId) &&
      nonEmpty(event.providerRunId),
    paidProviderReconciledFailed: ({ context, event }) =>
      event.type === 'PROVIDER_RECONCILED_FAILED' &&
      context.uncertainPhase === 'provider' &&
      matchesAttempt(context, event) &&
      providerRunMatches(context, event.providerRunId) &&
      isPaidReserved(context),
    freeProviderReconciledFailed: ({ context, event }) =>
      event.type === 'PROVIDER_RECONCILED_FAILED' &&
      context.uncertainPhase === 'provider' &&
      matchesAttempt(context, event) &&
      providerRunMatches(context, event.providerRunId) &&
      !isPaidReserved(context),
    cancellationReconciledRunning: ({ context, event }) =>
      event.type === 'CANCELLATION_RECONCILED' &&
      context.uncertainPhase === 'cancellation' &&
      matchesAttempt(context, event) &&
      event.outcome === 'running' &&
      event.providerRunId !== null &&
      nonEmpty(event.providerRunId) &&
      providerRunMatches(context, event.providerRunId),
    cancellationReconciledPaid: ({ context, event }) =>
      event.type === 'CANCELLATION_RECONCILED' &&
      context.uncertainPhase === 'cancellation' &&
      matchesAttempt(context, event) &&
      event.outcome === 'cancelled' &&
      providerRunMatches(context, event.providerRunId) &&
      isPaidReserved(context),
    cancellationReconciledFree: ({ context, event }) =>
      event.type === 'CANCELLATION_RECONCILED' &&
      context.uncertainPhase === 'cancellation' &&
      matchesAttempt(context, event) &&
      event.outcome === 'cancelled' &&
      providerRunMatches(context, event.providerRunId) &&
      !isPaidReserved(context),
    refundReconciledSettlesFailure: ({ context, event }) =>
      event.type === 'REFUND_RECONCILED' &&
      context.uncertainPhase === 'refund' &&
      matchesPayment(context, event) &&
      event.outcome === 'refunded' &&
      event.refundId !== null &&
      nonEmpty(event.refundId) &&
      context.settlement === 'failure',
    refundReconciledSettlesCancellation: ({ context, event }) =>
      event.type === 'REFUND_RECONCILED' &&
      context.uncertainPhase === 'refund' &&
      matchesPayment(context, event) &&
      event.outcome === 'refunded' &&
      event.refundId !== null &&
      nonEmpty(event.refundId) &&
      context.settlement === 'cancellation',
    refundReconciledPending: ({ context, event }) =>
      event.type === 'REFUND_RECONCILED' &&
      context.uncertainPhase === 'refund' &&
      matchesPayment(context, event) &&
      event.outcome === 'pending',
  },
  actions: {
    initializeJob: assign(({ event }) => {
      if (event.type !== 'CREATE_JOB') return {};
      const creditCost = copilotCreditCost(event.operationKind);
      return {
        ...EMPTY_REMOTE_JOB_CONTEXT,
        jobId: event.jobId,
        userId: event.userId,
        dossierId: event.dossierId,
        attemptId: event.attemptId,
        idempotencyKey: event.idempotencyKey,
        operationKind: event.operationKind,
        creditCost,
        suppliedEvidenceIds: [...event.suppliedEvidenceIds],
        suppliedTjmFactIds: [...(event.suppliedTjmFactIds ?? [])],
        grounding: event.grounding ?? null,
        reservationStatus: creditCost === 0 ? 'not-required' : 'required',
      };
    }),
    recordAuthorization: assign(({ event }) => ({
      authorizationEvidence: event.type === 'AUTHORIZATION_GRANTED' ? event.evidence : null,
      failure: null,
    })),
    reserveCredit: assign(({ event }) => ({
      reservationStatus: 'reserved' as const,
      reservationId: event.type === 'CREDIT_RESERVED' ? event.reservationId : null,
      refundStatus: 'pending' as const,
      failure: null,
      uncertainPhase: null,
    })),
    recordFailure: assign(({ event }) => ({
      failure: failureFromEvent(event),
      uncertainPhase: null,
    })),
    recordProviderRun: assign(({ event }) => ({
      providerRunId:
        'providerRunId' in event && event.providerRunId !== null ? event.providerRunId : null,
      uncertainPhase: null,
    })),
    recordResult: assign(({ event }) => ({
      result: event.type === 'RESULT_VALIDATED' ? event.result : null,
      failure: null,
      uncertainPhase: null,
    })),
    prepareFailureRefund: assign(({ event }) => ({
      settlement: 'failure' as const,
      refundStatus: 'pending' as const,
      failure: failureFromEvent(event),
      uncertainPhase: null,
    })),
    prepareCancellation: assign(() => ({
      settlement: 'cancellation' as const,
      failure: null,
      uncertainPhase: null,
    })),
    prepareCancellationRefund: assign(() => ({
      settlement: 'cancellation' as const,
      refundStatus: 'pending' as const,
      uncertainPhase: null,
    })),
    enterReservationUncertain: assign(() => ({ uncertainPhase: 'reservation' as const })),
    enterProviderUncertain: assign(({ context, event }) => ({
      uncertainPhase: 'provider' as const,
      providerRunId:
        'providerRunId' in event && event.providerRunId !== null
          ? event.providerRunId
          : context.providerRunId,
    })),
    enterCancellationUncertain: assign(({ event }) => ({
      uncertainPhase: 'cancellation' as const,
      failure: failureFromEvent(event),
    })),
    enterRefundUncertain: assign(({ context, event }) => ({
      uncertainPhase: 'refund' as const,
      failure: failureFromEvent(event) ?? context.failure,
    })),
    settleRefund: assign(({ event }) => ({
      refundStatus: 'refunded' as const,
      refundId:
        event.type === 'CREDIT_REFUNDED'
          ? event.refundId
          : event.type === 'REFUND_RECONCILED'
            ? event.refundId
            : null,
      uncertainPhase: null,
    })),
    settleFreeCancellation: assign(() => ({
      settlement: 'cancellation' as const,
      uncertainPhase: null,
    })),
    resumeRunning: assign(({ event }) => ({
      providerRunId:
        'providerRunId' in event && event.providerRunId !== null ? event.providerRunId : null,
      settlement: null,
      uncertainPhase: null,
      failure: null,
    })),
    recordReconciledReservation: assign(({ event }) => ({
      reservationStatus: 'reserved' as const,
      reservationId: event.type === 'RESERVATION_RECONCILED' ? event.reservationId : null,
      refundStatus: 'pending' as const,
      uncertainPhase: null,
      failure: null,
    })),
    recordReconciledFailure: assign(({ event }) => ({
      failure: failureFromEvent(event),
      uncertainPhase: null,
    })),
    resumePendingRefund: assign(() => ({ uncertainPhase: null })),
  },
});

const PROVIDER_FAILURE_TRANSITIONS = [
  {
    target: 'refunding',
    guard: 'matchingPaidProviderFailure',
    actions: 'prepareFailureRefund',
  },
  {
    target: 'failed',
    guard: 'matchingFreeProviderFailure',
    actions: 'recordFailure',
  },
] as const;

const PROVIDER_ACTIVE_ON = {
  PROVIDER_STARTED: {
    target: 'running',
    guard: 'matchingProviderStart',
    actions: 'recordProviderRun',
  },
  PROVIDER_COMPLETED: {
    target: 'validating',
    guard: 'matchingProviderCompletion',
    actions: 'recordProviderRun',
  },
  PROVIDER_FAILED: PROVIDER_FAILURE_TRANSITIONS,
  PROVIDER_STATUS_UNCERTAIN: {
    target: 'uncertain',
    guard: 'matchingProviderUncertain',
    actions: 'enterProviderUncertain',
  },
  CANCEL_REQUESTED: {
    target: 'cancelling',
    guard: 'matchingCancellation',
    actions: 'prepareCancellation',
  },
} as const;

export const remoteCopilotJobMachine = remoteCopilotJobSetup.createMachine({
  id: 'remote-copilot-job',
  initial: 'idle',
  context: { ...EMPTY_REMOTE_JOB_CONTEXT },
  states: {
    idle: {
      on: {
        CREATE_JOB: {
          target: 'authorizing',
          guard: 'validCreate',
          actions: 'initializeJob',
        },
      },
    },
    authorizing: {
      on: {
        AUTHORIZATION_GRANTED: [
          {
            target: 'queued',
            guard: 'authorizedFree',
            actions: 'recordAuthorization',
          },
          {
            target: 'reserving',
            guard: 'authorizedPaid',
            actions: 'recordAuthorization',
          },
        ],
        AUTHORIZATION_DENIED: {
          target: 'failed',
          guard: 'matchingAuthorizationDenial',
          actions: 'recordFailure',
        },
      },
    },
    reserving: {
      on: {
        CREDIT_RESERVED: {
          target: 'queued',
          guard: 'matchingPaidReservation',
          actions: 'reserveCredit',
        },
        CREDIT_RESERVATION_FAILED: {
          target: 'failed',
          guard: 'matchingReservationFailure',
          actions: 'recordFailure',
        },
        CREDIT_RESERVATION_UNCERTAIN: {
          target: 'uncertain',
          guard: 'matchingReservationUncertain',
          actions: 'enterReservationUncertain',
        },
      },
    },
    queued: { on: PROVIDER_ACTIVE_ON },
    running: { on: PROVIDER_ACTIVE_ON },
    validating: {
      on: {
        RESULT_VALIDATED: {
          target: 'review',
          guard: 'matchingValidResult',
          actions: 'recordResult',
        },
        RESULT_INVALID: [
          {
            target: 'refunding',
            guard: 'matchingPaidInvalidResult',
            actions: 'prepareFailureRefund',
          },
          {
            target: 'failed',
            guard: 'matchingFreeInvalidResult',
            actions: 'recordFailure',
          },
        ],
      },
    },
    review: {
      on: {
        USER_ACCEPTED: {
          target: 'accepted',
          guard: 'matchingReview',
        },
        USER_REJECTED: {
          target: 'rejected',
          guard: 'matchingReview',
        },
      },
    },
    accepted: { type: 'final' },
    rejected: { type: 'final' },
    cancelling: {
      on: {
        CANCELLATION_CONFIRMED: [
          {
            target: 'refunding',
            guard: ({ context, event }) =>
              event.type === 'CANCELLATION_CONFIRMED' &&
              matchesAttempt(context, event) &&
              isPaidReserved(context),
            actions: 'prepareCancellationRefund',
          },
          {
            target: 'cancelled',
            guard: ({ context, event }) =>
              event.type === 'CANCELLATION_CONFIRMED' &&
              matchesAttempt(context, event) &&
              !isPaidReserved(context),
            actions: 'settleFreeCancellation',
          },
        ],
        CANCELLATION_UNCERTAIN: {
          target: 'uncertain',
          guard: 'matchingCancellationUncertain',
          actions: 'enterCancellationUncertain',
        },
      },
    },
    refunding: {
      on: {
        CREDIT_REFUNDED: [
          {
            target: 'failed',
            guard: ({ context, event }) =>
              event.type === 'CREDIT_REFUNDED' &&
              matchesPendingRefund(context, event) &&
              nonEmpty(event.refundId) &&
              context.settlement === 'failure',
            actions: 'settleRefund',
          },
          {
            target: 'cancelled',
            guard: ({ context, event }) =>
              event.type === 'CREDIT_REFUNDED' &&
              matchesPendingRefund(context, event) &&
              nonEmpty(event.refundId) &&
              context.settlement === 'cancellation',
            actions: 'settleRefund',
          },
        ],
        CREDIT_REFUND_FAILED: {
          target: 'uncertain',
          guard: 'matchingRefundFailure',
          actions: 'enterRefundUncertain',
        },
        CREDIT_REFUND_UNCERTAIN: {
          target: 'uncertain',
          guard: 'matchingRefundUncertain',
          actions: 'enterRefundUncertain',
        },
      },
    },
    uncertain: {
      on: {
        RESERVATION_RECONCILED: [
          {
            target: 'queued',
            guard: 'reservationReconciledReserved',
            actions: 'recordReconciledReservation',
          },
          {
            target: 'failed',
            guard: 'reservationReconciledNotReserved',
            actions: 'recordReconciledFailure',
          },
        ],
        PROVIDER_RECONCILED_RUNNING: {
          target: 'running',
          guard: 'providerReconciledRunning',
          actions: 'resumeRunning',
        },
        PROVIDER_RECONCILED_COMPLETED: {
          target: 'validating',
          guard: 'providerReconciledCompleted',
          actions: 'recordProviderRun',
        },
        PROVIDER_RECONCILED_FAILED: [
          {
            target: 'refunding',
            guard: 'paidProviderReconciledFailed',
            actions: 'prepareFailureRefund',
          },
          {
            target: 'failed',
            guard: 'freeProviderReconciledFailed',
            actions: 'recordFailure',
          },
        ],
        CANCELLATION_RECONCILED: [
          {
            target: 'running',
            guard: 'cancellationReconciledRunning',
            actions: 'resumeRunning',
          },
          {
            target: 'refunding',
            guard: 'cancellationReconciledPaid',
            actions: 'prepareCancellationRefund',
          },
          {
            target: 'cancelled',
            guard: 'cancellationReconciledFree',
            actions: 'settleFreeCancellation',
          },
        ],
        REFUND_RECONCILED: [
          {
            target: 'failed',
            guard: 'refundReconciledSettlesFailure',
            actions: 'settleRefund',
          },
          {
            target: 'cancelled',
            guard: 'refundReconciledSettlesCancellation',
            actions: 'settleRefund',
          },
          {
            target: 'refunding',
            guard: 'refundReconciledPending',
            actions: 'resumePendingRefund',
          },
        ],
      },
    },
    failed: { type: 'final' },
    cancelled: { type: 'final' },
  },
});

export type RemoteCopilotJobSnapshot = SnapshotFrom<typeof remoteCopilotJobMachine>;

export interface PersistedRemoteCopilotJobProjection {
  state: RemoteCopilotJobStateValue;
  context: RemoteCopilotJobContext;
}

function validPersistedAuthorization(context: RemoteCopilotJobContext): boolean {
  return (
    context.authorizationEvidence !== null &&
    context.authorizationEvidence.authenticatedUserId === context.userId &&
    context.authorizationEvidence.dossierOwnerUserId === context.userId &&
    context.authorizationEvidence.entitlement === 'active'
  );
}

function validPersistedReservation(context: RemoteCopilotJobContext): boolean {
  if (context.creditCost === 0) {
    return (
      context.reservationStatus === 'not-required' &&
      context.reservationId === null &&
      context.refundStatus === 'not-required' &&
      context.refundId === null
    );
  }
  if (context.reservationStatus === 'required') {
    return (
      context.reservationId === null &&
      context.refundStatus === 'not-required' &&
      context.refundId === null
    );
  }
  return (
    context.reservationStatus === 'reserved' &&
    context.reservationId !== null &&
    nonEmpty(context.reservationId) &&
    ((context.refundStatus === 'pending' && context.refundId === null) ||
      (context.refundStatus === 'refunded' &&
        context.refundId !== null &&
        nonEmpty(context.refundId)))
  );
}

function validPersistedFailure(failure: RemoteCopilotFailure | null): boolean {
  return (
    failure === null ||
    (REMOTE_COPILOT_FAILURE_CODE_SET.has(failure.code) &&
      nonEmpty(failure.message) &&
      typeof failure.retryable === 'boolean')
  );
}

function validPersistedJobBase(context: RemoteCopilotJobContext): boolean {
  return (
    context.jobId !== null &&
    nonEmpty(context.jobId) &&
    context.userId !== null &&
    nonEmpty(context.userId) &&
    context.dossierId !== null &&
    nonEmpty(context.dossierId) &&
    context.attemptId !== null &&
    nonEmpty(context.attemptId) &&
    context.idempotencyKey !== null &&
    nonEmpty(context.idempotencyKey) &&
    context.operationKind !== null &&
    context.creditCost === copilotCreditCost(context.operationKind) &&
    uniqueNonEmpty(context.suppliedEvidenceIds) &&
    uniqueNonEmpty(context.suppliedTjmFactIds) &&
    context.grounding !== null &&
    validPersistedReservation(context) &&
    validPersistedFailure(context.failure) &&
    (context.providerRunId === null || nonEmpty(context.providerRunId))
  );
}

function hasPersistedReviewResult(context: RemoteCopilotJobContext): boolean {
  return (
    context.operationKind !== null &&
    context.result !== null &&
    isReviewableCopilotResult(
      context.result,
      context.operationKind,
      context.suppliedEvidenceIds,
      context.suppliedTjmFactIds,
      context.grounding
    )
  );
}

/**
 * Resolve a durable job projection without replaying invented provider or
 * ledger history. Recovery shells must hydrate this snapshot before issuing
 * an idempotent command or applying a correlated reconciliation event.
 */
export function resolveRemoteCopilotJobSnapshot(
  projection: PersistedRemoteCopilotJobProjection
): RemoteCopilotJobSnapshot | null {
  const { state, context } = projection;
  if (state === 'idle') {
    const isEmpty =
      context.jobId === null &&
      context.userId === null &&
      context.dossierId === null &&
      context.attemptId === null &&
      context.idempotencyKey === null &&
      context.operationKind === null &&
      context.creditCost === 0 &&
      context.suppliedEvidenceIds.length === 0 &&
      context.suppliedTjmFactIds.length === 0 &&
      context.grounding === null &&
      context.authorizationEvidence === null &&
      context.reservationStatus === 'not-required' &&
      context.reservationId === null &&
      context.refundStatus === 'not-required' &&
      context.refundId === null &&
      context.providerRunId === null &&
      context.result === null &&
      context.settlement === null &&
      context.uncertainPhase === null &&
      context.failure === null;
    if (!isEmpty) return null;
    try {
      return remoteCopilotJobMachine.resolveState({ value: state, context });
    } catch {
      return null;
    }
  }
  if (!validPersistedJobBase(context)) return null;

  const authorized = validPersistedAuthorization(context);
  const providerKnown = context.providerRunId !== null;
  const paidReserved = context.creditCost === 1 && context.reservationStatus === 'reserved';
  const paidReservationActive =
    paidReserved && context.refundStatus === 'pending' && context.refundId === null;
  const paidRefunded =
    paidReserved &&
    context.refundStatus === 'refunded' &&
    context.refundId !== null &&
    nonEmpty(context.refundId);
  const readyForProvider = context.creditCost === 0 || paidReservationActive;
  const noProviderResult = context.result === null;
  const noSettlement = context.settlement === null;
  const noUncertainty = context.uncertainPhase === null;

  const valid = (() => {
    switch (state) {
      case 'authorizing':
        return (
          context.authorizationEvidence === null &&
          !providerKnown &&
          noProviderResult &&
          context.failure === null &&
          noSettlement &&
          noUncertainty
        );
      case 'reserving':
        return (
          authorized &&
          context.creditCost === 1 &&
          context.reservationStatus === 'required' &&
          !providerKnown &&
          noProviderResult &&
          context.failure === null &&
          noSettlement &&
          noUncertainty
        );
      case 'queued':
        return (
          authorized &&
          readyForProvider &&
          !providerKnown &&
          noProviderResult &&
          context.failure === null &&
          noSettlement &&
          noUncertainty
        );
      case 'running':
      case 'validating':
        return (
          authorized &&
          readyForProvider &&
          providerKnown &&
          noProviderResult &&
          context.failure === null &&
          noSettlement &&
          noUncertainty
        );
      case 'review':
      case 'accepted':
      case 'rejected':
        return (
          authorized &&
          readyForProvider &&
          providerKnown &&
          hasPersistedReviewResult(context) &&
          context.failure === null &&
          noSettlement &&
          noUncertainty
        );
      case 'cancelling':
        return (
          authorized &&
          readyForProvider &&
          noProviderResult &&
          context.settlement === 'cancellation' &&
          noUncertainty
        );
      case 'refunding':
        return (
          authorized &&
          paidReservationActive &&
          context.settlement !== null &&
          noProviderResult &&
          noUncertainty
        );
      case 'uncertain':
        if (context.uncertainPhase === 'reservation') {
          return (
            authorized &&
            context.creditCost === 1 &&
            context.reservationStatus === 'required' &&
            !providerKnown &&
            noProviderResult &&
            noSettlement
          );
        }
        if (context.uncertainPhase === 'provider') {
          return authorized && readyForProvider && noProviderResult && noSettlement;
        }
        if (context.uncertainPhase === 'cancellation') {
          return (
            authorized &&
            readyForProvider &&
            noProviderResult &&
            context.settlement === 'cancellation'
          );
        }
        return (
          context.uncertainPhase === 'refund' &&
          authorized &&
          paidReservationActive &&
          noProviderResult &&
          context.settlement !== null
        );
      case 'failed':
        return (
          context.failure !== null &&
          noProviderResult &&
          noUncertainty &&
          (context.creditCost === 0
            ? noSettlement
            : context.reservationStatus === 'required'
              ? noSettlement
              : paidRefunded && context.settlement === 'failure')
        );
      case 'cancelled':
        return (
          authorized &&
          noProviderResult &&
          context.settlement === 'cancellation' &&
          noUncertainty &&
          (context.creditCost === 0 || paidRefunded)
        );
    }
  })();
  if (!valid) return null;

  try {
    return remoteCopilotJobMachine.resolveState({ value: state, context });
  } catch {
    return null;
  }
}
