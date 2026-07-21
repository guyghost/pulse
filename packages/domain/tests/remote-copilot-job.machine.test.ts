import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import {
  remoteCopilotJobMachine,
  resolveRemoteCopilotJobSnapshot,
  type CopilotOperationKind,
  type CopilotValidatedResult,
  type RemoteCopilotFailure,
} from '../src';

const JOB_ID = 'job-1';
const USER_ID = 'user-1';
const DOSSIER_ID = 'dossier-1';
const ATTEMPT_ID = 'attempt-1';
const IDEMPOTENCY_KEY = 'idempotency-1';
const PROVIDER_RUN_ID = 'eve-run-1';
const TJM_FACTS = {
  schemaVersion: 1 as const,
  confidence: 'low' as const,
  missionDisplayedTjm: 650,
  profileBounds: { min: 550, target: 650, max: 750, currency: 'EUR' as const },
  market: {
    matchedStacks: ['TypeScript'],
    recordCount: 1,
    sampleCount: 1,
    min: 600,
    weightedAverage: 650,
    max: 700,
    trend: 'stable' as const,
    lastObservedAt: '2026-07-20',
  },
};

const providerFailure: RemoteCopilotFailure = {
  code: 'PROVIDER_FAILED',
  message: 'provider unavailable',
  retryable: true,
};

const resultInvalid: RemoteCopilotFailure = {
  code: 'RESULT_INVALID',
  message: 'schema rejected',
  retryable: true,
};

function result(kind: CopilotOperationKind): CopilotValidatedResult {
  return {
    schemaVersion: 1,
    kind,
    evidenceClaims: [{ text: 'Expérience vérifiée dans le profil.', evidenceIds: ['evidence-1'] }],
    gaps: [],
    risks: [],
    questions: [],
    ...(kind === 'analysis'
      ? {}
      : {
          draftSegments: [
            {
              text: `Brouillon ${kind}`,
              sourceRefs:
                kind === 'tjm-coach'
                  ? [
                      {
                        kind: 'tjm-fact' as const,
                        id: 'profile-tjm-bounds' as const,
                        quote: '550 / 650 / 750 EUR',
                      },
                    ]
                  : [
                      {
                        kind: 'experience' as const,
                        id: 'evidence-1',
                        quote: 'Expérience vérifiée',
                      },
                    ],
            },
          ],
        }),
  };
}

function actor(kind: CopilotOperationKind = 'analysis') {
  const instance = createActor(remoteCopilotJobMachine);
  instance.start();
  instance.send({
    type: 'CREATE_JOB',
    jobId: JOB_ID,
    userId: USER_ID,
    dossierId: DOSSIER_ID,
    attemptId: ATTEMPT_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    operationKind: kind,
    suppliedEvidenceIds: ['evidence-1'],
    suppliedTjmFactIds: kind === 'tjm-coach' ? ['profile-tjm-bounds'] : [],
    grounding: {
      payload: {
        mission: { title: 'Mission' },
        profile: { jobTitle: 'Engineer' },
        experienceEvidence: [
          {
            evidenceId: 'evidence-1',
            role: 'Engineer',
            company: null,
            summary: 'Expérience vérifiée dans le profil.',
            skills: ['TypeScript'],
          },
        ],
      },
      tjmFacts: kind === 'tjm-coach' ? TJM_FACTS : null,
    },
  });
  return instance;
}

type JobActor = ReturnType<typeof actor>;

function correlation(attemptId = ATTEMPT_ID) {
  return { jobId: JOB_ID, userId: USER_ID, attemptId };
}

function paymentCorrelation(attemptId = ATTEMPT_ID) {
  return { ...correlation(attemptId), idempotencyKey: IDEMPOTENCY_KEY };
}

function authorize(instance: JobActor, attemptId = ATTEMPT_ID): void {
  instance.send({
    type: 'AUTHORIZATION_GRANTED',
    ...correlation(attemptId),
    evidence: {
      authenticatedUserId: USER_ID,
      entitlement: 'active',
      dossierOwnerUserId: USER_ID,
    },
  });
}

function reserve(instance: JobActor, attemptId = ATTEMPT_ID): void {
  instance.send({
    type: 'CREDIT_RESERVED',
    ...paymentCorrelation(attemptId),
    reservationId: `reservation-${attemptId}`,
  });
}

function completeProvider(instance: JobActor, attemptId = ATTEMPT_ID): void {
  instance.send({
    type: 'PROVIDER_STARTED',
    ...correlation(attemptId),
    providerRunId: PROVIDER_RUN_ID,
  });
  instance.send({
    type: 'PROVIDER_COMPLETED',
    ...correlation(attemptId),
    providerRunId: PROVIDER_RUN_ID,
  });
}

describe('remote copilot job machine', () => {
  it('hydrates only coherent reserving, refunding and uncertain projections', () => {
    const instance = actor('pitch');
    authorize(instance);
    const reserving = instance.getSnapshot();
    expect(
      resolveRemoteCopilotJobSnapshot({
        state: 'reserving',
        context: reserving.context,
      })?.value
    ).toBe('reserving');
    expect(
      resolveRemoteCopilotJobSnapshot({
        state: 'reserving',
        context: { ...reserving.context, authorizationEvidence: null },
      })
    ).toBeNull();

    reserve(instance);
    completeProvider(instance);
    instance.send({ type: 'RESULT_INVALID', ...correlation(), failure: resultInvalid });
    const refunding = instance.getSnapshot();
    expect(
      resolveRemoteCopilotJobSnapshot({
        state: 'refunding',
        context: refunding.context,
      })?.value
    ).toBe('refunding');

    instance.send({ type: 'CREDIT_REFUND_UNCERTAIN', ...paymentCorrelation() });
    const uncertain = instance.getSnapshot();
    expect(
      resolveRemoteCopilotJobSnapshot({
        state: 'uncertain',
        context: uncertain.context,
      })?.value
    ).toBe('uncertain');
    expect(
      resolveRemoteCopilotJobSnapshot({
        state: 'uncertain',
        context: { ...uncertain.context, uncertainPhase: null },
      })
    ).toBeNull();

    instance.send({
      type: 'REFUND_RECONCILED',
      ...paymentCorrelation(),
      outcome: 'pending',
      refundId: null,
    });
    const pendingRefund = instance.getSnapshot();
    expect(pendingRefund.value).toBe('refunding');
    expect(pendingRefund.context.failure).toEqual(resultInvalid);
    expect(pendingRefund.context.uncertainPhase).toBeNull();
    expect(
      resolveRemoteCopilotJobSnapshot({
        state: 'refunding',
        context: pendingRefund.context,
      })?.value
    ).toBe('refunding');
  });

  it('rejects a refunded projection for reviewable or accepted paid content', () => {
    const instance = actor('pitch');
    authorize(instance);
    reserve(instance);
    completeProvider(instance);
    instance.send({ type: 'RESULT_VALIDATED', ...correlation(), result: result('pitch') });
    const review = instance.getSnapshot();
    expect(
      resolveRemoteCopilotJobSnapshot({
        state: 'review',
        context: {
          ...review.context,
          refundStatus: 'refunded',
          refundId: 'refund-that-must-not-exist',
        },
      })
    ).toBeNull();
  });

  it('runs included analysis through authorization, validation and explicit acceptance', () => {
    const instance = actor('analysis');
    expect(instance.getSnapshot().value).toBe('authorizing');
    expect(instance.getSnapshot().context.creditCost).toBe(0);

    authorize(instance);
    expect(instance.getSnapshot().value).toBe('queued');
    completeProvider(instance);
    expect(instance.getSnapshot().value).toBe('validating');
    instance.send({ type: 'RESULT_VALIDATED', ...correlation(), result: result('analysis') });
    expect(instance.getSnapshot().value).toBe('review');
    instance.send({ type: 'USER_ACCEPTED', ...correlation(), reviewedAtMs: 10 });
    expect(instance.getSnapshot().value).toBe('accepted');
    expect(instance.getSnapshot().context.refundStatus).toBe('not-required');
  });

  it.each(['pitch', 'cover-message', 'cv-summary', 'tjm-coach'] as const)(
    'reserves exactly one credit before running %s',
    (kind) => {
      const instance = actor(kind);
      expect(instance.getSnapshot().context.creditCost).toBe(1);
      authorize(instance);
      expect(instance.getSnapshot().value).toBe('reserving');

      reserve(instance);
      expect(instance.getSnapshot().value).toBe('queued');
      expect(instance.getSnapshot().context.reservationStatus).toBe('reserved');
      expect(instance.getSnapshot().context.reservationId).toBe('reservation-attempt-1');

      completeProvider(instance);
      instance.send({ type: 'RESULT_VALIDATED', ...correlation(), result: result(kind) });
      instance.send({ type: 'USER_REJECTED', ...correlation(), reviewedAtMs: 11 });
      expect(instance.getSnapshot().value).toBe('rejected');
      expect(instance.getSnapshot().context.refundStatus).toBe('pending');
    }
  );

  it('requires authenticated active entitlement and matching dossier ownership', () => {
    const instance = actor('analysis');
    instance.send({
      type: 'AUTHORIZATION_GRANTED',
      ...correlation(),
      evidence: {
        authenticatedUserId: USER_ID,
        entitlement: 'active',
        dossierOwnerUserId: 'other-user',
      },
    });
    expect(instance.getSnapshot().value).toBe('authorizing');

    instance.send({
      type: 'AUTHORIZATION_DENIED',
      ...correlation(),
      failure: {
        code: 'OWNERSHIP_DENIED',
        message: 'wrong owner',
        retryable: false,
      },
    });
    expect(instance.getSnapshot().value).toBe('failed');
    expect(instance.getSnapshot().context.reservationId).toBeNull();
    expect(instance.getSnapshot().context.providerRunId).toBeNull();
  });

  it('fails on insufficient credit without reserving, refunding or calling the provider', () => {
    const instance = actor('pitch');
    authorize(instance);
    instance.send({
      type: 'CREDIT_RESERVATION_FAILED',
      ...paymentCorrelation(),
      failure: {
        code: 'INSUFFICIENT_CREDITS',
        message: 'balance is zero',
        retryable: false,
      },
    });

    expect(instance.getSnapshot().value).toBe('failed');
    expect(instance.getSnapshot().context.reservationStatus).toBe('required');
    expect(instance.getSnapshot().context.refundStatus).toBe('not-required');
  });

  it('ignores duplicate CREATE_JOB and all stale attempt/provider events', () => {
    const instance = actor('analysis');
    instance.send({
      type: 'CREATE_JOB',
      jobId: 'duplicate-job',
      userId: USER_ID,
      dossierId: DOSSIER_ID,
      attemptId: ATTEMPT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      operationKind: 'tjm-coach',
      suppliedEvidenceIds: [],
    });
    instance.send({
      type: 'AUTHORIZATION_GRANTED',
      ...correlation('stale-attempt'),
      evidence: {
        authenticatedUserId: USER_ID,
        entitlement: 'active',
        dossierOwnerUserId: USER_ID,
      },
    });

    expect(instance.getSnapshot().value).toBe('authorizing');
    expect(instance.getSnapshot().context.jobId).toBe(JOB_ID);
    expect(instance.getSnapshot().context.operationKind).toBe('analysis');
  });

  it('rejects fabricated evidence before review and refunds a paid invalid result exactly once', () => {
    const instance = actor('pitch');
    authorize(instance);
    reserve(instance);
    completeProvider(instance);
    instance.send({
      type: 'RESULT_VALIDATED',
      ...correlation(),
      result: {
        ...result('pitch'),
        evidenceClaims: [{ text: 'Expérience inventée.', evidenceIds: ['not-supplied'] }],
      },
    });
    expect(instance.getSnapshot().value).toBe('validating');

    instance.send({ type: 'RESULT_INVALID', ...correlation(), failure: resultInvalid });
    expect(instance.getSnapshot().value).toBe('refunding');
    instance.send({
      type: 'CREDIT_REFUNDED',
      ...paymentCorrelation(),
      refundId: 'refund-1',
    });
    expect(instance.getSnapshot().value).toBe('failed');
    expect(instance.getSnapshot().context.refundStatus).toBe('refunded');

    instance.send({
      type: 'CREDIT_REFUNDED',
      ...paymentCorrelation(),
      refundId: 'refund-duplicate',
    });
    expect(instance.getSnapshot().context.refundId).toBe('refund-1');
  });

  it('fails a free provider run without entering credit settlement', () => {
    const instance = actor('analysis');
    authorize(instance);
    instance.send({
      type: 'PROVIDER_FAILED',
      ...correlation(),
      providerRunId: null,
      failure: providerFailure,
    });

    expect(instance.getSnapshot().value).toBe('failed');
    expect(instance.getSnapshot().context.refundStatus).toBe('not-required');
  });

  it('refunds a paid provider failure before making the job terminal', () => {
    const instance = actor('pitch');
    authorize(instance);
    reserve(instance);
    instance.send({
      type: 'PROVIDER_FAILED',
      ...correlation(),
      providerRunId: null,
      failure: providerFailure,
    });
    expect(instance.getSnapshot().value).toBe('refunding');

    instance.send({
      type: 'CREDIT_REFUNDED',
      ...paymentCorrelation(),
      refundId: 'refund-1',
    });
    expect(instance.getSnapshot().value).toBe('failed');
    expect(instance.getSnapshot().context.failure).toEqual(providerFailure);
    expect(instance.getSnapshot().status).toBe('done');
  });

  it('cancels free and paid jobs only after explicit confirmation', () => {
    const free = actor('analysis');
    authorize(free);
    free.send({ type: 'CANCEL_REQUESTED', ...correlation() });
    expect(free.getSnapshot().value).toBe('cancelling');
    free.send({ type: 'CANCELLATION_CONFIRMED', ...correlation() });
    expect(free.getSnapshot().value).toBe('cancelled');

    const paid = actor('pitch');
    authorize(paid);
    reserve(paid);
    paid.send({ type: 'CANCEL_REQUESTED', ...correlation() });
    paid.send({ type: 'CANCELLATION_CONFIRMED', ...correlation() });
    expect(paid.getSnapshot().value).toBe('refunding');
    paid.send({ type: 'CREDIT_REFUNDED', ...paymentCorrelation(), refundId: 'refund-cancel' });
    expect(paid.getSnapshot().value).toBe('cancelled');
  });

  it('reconciles an uncertain reservation instead of blindly retrying', () => {
    const instance = actor('pitch');
    authorize(instance);
    instance.send({ type: 'CREDIT_RESERVATION_UNCERTAIN', ...paymentCorrelation() });
    expect(instance.getSnapshot().value).toBe('uncertain');

    instance.send({
      type: 'RESERVATION_RECONCILED',
      ...paymentCorrelation(),
      outcome: 'reserved',
      reservationId: 'reservation-reconciled',
      failure: null,
    });
    expect(instance.getSnapshot().value).toBe('queued');
    expect(instance.getSnapshot().context.reservationId).toBe('reservation-reconciled');
  });

  it('reconciles provider timeout to running, completion or failure', () => {
    const running = actor('analysis');
    authorize(running);
    running.send({
      type: 'PROVIDER_STATUS_UNCERTAIN',
      ...correlation(),
      providerRunId: PROVIDER_RUN_ID,
    });
    expect(running.getSnapshot().value).toBe('uncertain');
    running.send({
      type: 'PROVIDER_RECONCILED_RUNNING',
      ...correlation(),
      providerRunId: PROVIDER_RUN_ID,
    });
    expect(running.getSnapshot().value).toBe('running');

    running.send({
      type: 'PROVIDER_STATUS_UNCERTAIN',
      ...correlation(),
      providerRunId: PROVIDER_RUN_ID,
    });
    running.send({
      type: 'PROVIDER_RECONCILED_COMPLETED',
      ...correlation(),
      providerRunId: PROVIDER_RUN_ID,
    });
    expect(running.getSnapshot().value).toBe('validating');
  });

  it('preserves and enforces a known provider run during reconciliation', () => {
    const instance = actor('analysis');
    authorize(instance);
    instance.send({
      type: 'PROVIDER_STARTED',
      ...correlation(),
      providerRunId: 'run-known',
    });
    instance.send({
      type: 'PROVIDER_STATUS_UNCERTAIN',
      ...correlation(),
      providerRunId: null,
    });
    expect(instance.getSnapshot().context.providerRunId).toBe('run-known');

    instance.send({
      type: 'PROVIDER_RECONCILED_RUNNING',
      ...correlation(),
      providerRunId: 'run-replacement',
    });
    expect(instance.getSnapshot().value).toBe('uncertain');
    instance.send({
      type: 'PROVIDER_RECONCILED_RUNNING',
      ...correlation(),
      providerRunId: 'run-known',
    });
    expect(instance.getSnapshot().value).toBe('running');
  });

  it('reconciles uncertain cancellation and refund to exactly one terminal outcome', () => {
    const instance = actor('pitch');
    authorize(instance);
    reserve(instance);
    instance.send({ type: 'CANCEL_REQUESTED', ...correlation() });
    instance.send({
      type: 'CANCELLATION_UNCERTAIN',
      ...correlation(),
      failure: {
        code: 'CANCELLATION_FAILED',
        message: 'timeout',
        retryable: true,
      },
    });
    instance.send({
      type: 'CANCELLATION_RECONCILED',
      ...correlation(),
      outcome: 'cancelled',
      providerRunId: PROVIDER_RUN_ID,
    });
    expect(instance.getSnapshot().value).toBe('refunding');

    instance.send({ type: 'CREDIT_REFUND_UNCERTAIN', ...paymentCorrelation() });
    expect(instance.getSnapshot().value).toBe('uncertain');
    instance.send({
      type: 'REFUND_RECONCILED',
      ...paymentCorrelation(),
      outcome: 'refunded',
      refundId: 'refund-reconciled',
    });
    expect(instance.getSnapshot().value).toBe('cancelled');
    expect(instance.getSnapshot().context.refundStatus).toBe('refunded');
  });

  it('does not allow provider or refund events after successful review', () => {
    const instance = actor('pitch');
    authorize(instance);
    reserve(instance);
    completeProvider(instance);
    instance.send({ type: 'RESULT_VALIDATED', ...correlation(), result: result('pitch') });
    instance.send({ type: 'USER_ACCEPTED', ...correlation(), reviewedAtMs: 10 });

    instance.send({
      type: 'CREDIT_REFUNDED',
      ...paymentCorrelation(),
      refundId: 'illegal-refund',
    });
    expect(instance.getSnapshot().value).toBe('accepted');
    expect(instance.getSnapshot().context.refundStatus).toBe('pending');
  });
});
