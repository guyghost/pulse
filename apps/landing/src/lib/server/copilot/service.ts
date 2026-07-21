import {
  copilotCreditCost,
  MAX_COPILOT_APPROVED_ARTIFACTS,
  copilotDossierMachine,
  copilotTjmFactIds,
  isCopilotTransmissionAllowed,
  isCopilotConsentSubset,
  isReviewableCopilotResult,
  isValidCopilotConsentSelection,
  renderCopilotDraft,
  resolveCopilotDossierSnapshot,
  resolveRemoteCopilotJobSnapshot,
  remoteCopilotJobMachine,
  type CopilotDossierContext,
  type CopilotDossierStateValue,
  unionCopilotConsentSelections,
  type CopilotOperationKind,
  type RemoteCopilotFailure,
  type RemoteCopilotJobStateValue,
} from '@pulse/domain';
import { createActor, type ActorRefFrom } from 'xstate';

import { CopilotApiError } from './errors';
import type { CopilotProvider, CopilotProviderStartResult } from './provider-port';
import type {
  CopilotCreditMutation,
  CopilotProviderSessionRecord,
  CopilotRepository,
  CreateStoredJobResult,
} from './repository-port';
import type {
  CopilotPrincipal,
  CreateCopilotDossierInput,
  CreateCopilotJobInput,
  PublicCopilotDossierProjection,
  PublicCopilotJob,
  StoredCopilotDossier,
  StoredCopilotJob,
} from './types';
import { toPublicCopilotJob } from './types';
import { parseTjmFactsForOperation } from './tjm-facts';

export interface CopilotServiceDependencies {
  repository: CopilotRepository;
  provider: CopilotProvider;
  createId: () => string;
  now: () => Date;
}

export interface CreateCopilotJobOutcome {
  duplicate: boolean;
  job: PublicCopilotJob;
  creditsRemaining: number;
}

export interface CopilotJobMutationOutcome {
  job: PublicCopilotJob;
  creditsRemaining: number;
}

const PROVIDER_FAILURE: RemoteCopilotFailure = {
  code: 'PROVIDER_FAILED',
  message: 'Provider execution failed',
  retryable: true,
};

const INVALID_RESULT_FAILURE: RemoteCopilotFailure = {
  code: 'RESULT_INVALID',
  message: 'Provider result did not satisfy the Copilot evidence contract',
  retryable: true,
};

function isProviderOutcomeUncertain(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'EVE_OUTCOME_UNCERTAIN' || error.code === 'EVE_TRANSPORT_FAILED')
  );
}

function providerFailureMetadata(error: unknown): {
  remoteEffectPossible: boolean;
  session: { sessionId: string; continuationToken: string | null } | null;
} {
  if (typeof error !== 'object' || error === null) {
    return { remoteEffectPossible: true, session: null };
  }
  const candidate = error as {
    remoteEffectPossible?: unknown;
    session?: { sessionId?: unknown; continuationToken?: unknown } | null;
  };
  const session =
    candidate.session &&
    typeof candidate.session.sessionId === 'string' &&
    (candidate.session.continuationToken === null ||
      typeof candidate.session.continuationToken === 'string')
      ? {
          sessionId: candidate.session.sessionId,
          continuationToken: candidate.session.continuationToken,
        }
      : null;
  return { remoteEffectPossible: candidate.remoteEffectPossible !== false, session };
}

function stateValue(actor: { getSnapshot(): { value: unknown } }): RemoteCopilotJobStateValue {
  const value = actor.getSnapshot().value;
  if (typeof value !== 'string') {
    throw new CopilotApiError(500, 'PERSISTENCE_FAILED', 'Invalid job machine state');
  }
  return value as RemoteCopilotJobStateValue;
}

function expectState(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new CopilotApiError(
      409,
      'PERSISTENCE_FAILED',
      `Copilot transition rejected (${actual}, expected ${expected})`
    );
  }
}

function publicFailure(failure: RemoteCopilotFailure): StoredCopilotJob['failure'] {
  return {
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
  };
}

export class CopilotService {
  constructor(private readonly dependencies: CopilotServiceDependencies) {}

  async createDossier(
    principal: CopilotPrincipal,
    input: CreateCopilotDossierInput
  ): Promise<StoredCopilotDossier> {
    if (!isValidCopilotConsentSelection(input.consent)) {
      throw new CopilotApiError(400, 'INVALID_REQUEST', 'Invalid Copilot consent');
    }

    const confirmedAtMs = this.dependencies.now().getTime();
    const existing = await this.dependencies.repository.getDossierByMission(
      principal.userId,
      input.missionId
    );
    const actor = createActor(copilotDossierMachine, {
      input: { userId: principal.userId, missionId: input.missionId },
    });
    actor.start();
    actor.send({ type: 'CONSENT_STARTED', userId: principal.userId, missionId: input.missionId });
    actor.send({
      type: 'CONSENT_CONFIRMED',
      userId: principal.userId,
      missionId: input.missionId,
      selection: existing?.consent ?? input.consent,
      confirmedAtMs: existing?.consent.confirmedAtMs ?? confirmedAtMs,
    });
    if (existing && !isCopilotConsentSubset(input.consent, existing.consent)) {
      const cumulativeConsent = unionCopilotConsentSelections(existing.consent, input.consent);
      if (!isValidCopilotConsentSelection(cumulativeConsent)) {
        actor.stop();
        throw new CopilotApiError(400, 'INVALID_REQUEST', 'Cumulative Copilot consent is invalid');
      }
      actor.send({
        type: 'CONSENT_UPDATED',
        userId: principal.userId,
        missionId: input.missionId,
        selection: cumulativeConsent,
        confirmedAtMs,
      });
      const projected = actor.getSnapshot().context.consent;
      if (
        projected === null ||
        projected.confirmedAtMs !== confirmedAtMs ||
        !isCopilotConsentSubset(cumulativeConsent, projected) ||
        !isCopilotConsentSubset(projected, cumulativeConsent)
      ) {
        actor.stop();
        throw new CopilotApiError(409, 'PERSISTENCE_FAILED', 'Consent transition was rejected');
      }
    }
    const state = actor.getSnapshot().value;
    actor.stop();
    expectState(String(state), 'ready');

    return this.dependencies.repository.createDossier(principal.userId, input, confirmedAtMs);
  }

  /**
   * Observational owner read. This method deliberately performs no entitlement
   * sync, job recovery, credit mutation or provider call.
   */
  async getDossierProjection(
    principal: CopilotPrincipal,
    missionId: string
  ): Promise<PublicCopilotDossierProjection | null> {
    const dossier = await this.dependencies.repository.getDossierByMission(
      principal.userId,
      missionId
    );
    if (!dossier) return null;

    let activeJob: PublicCopilotDossierProjection['activeJob'] = null;
    if (dossier.activeJobId !== null) {
      const job = await this.dependencies.repository.getJob(principal.userId, dossier.activeJobId);
      if (
        !job ||
        job.userId !== principal.userId ||
        job.dossierId !== dossier.id ||
        job.missionId !== dossier.missionId
      ) {
        throw new CopilotApiError(
          500,
          'PERSISTENCE_FAILED',
          'Invalid active Copilot dossier correlation'
        );
      }
      activeJob = { jobId: job.id, kind: job.operationKind, state: job.state };
    }

    return {
      missionId: dossier.missionId,
      state: dossier.state,
      consent: {
        missionFields: [...dossier.consent.missionFields],
        profileFields: [...dossier.consent.profileFields],
        evidenceIds: [...dossier.consent.evidenceIds],
      },
      analysis: dossier.analysis,
      approvedArtifacts: [...dossier.approvedArtifacts],
      activeJob,
    };
  }

  async createJob(
    principal: CopilotPrincipal,
    input: CreateCopilotJobInput
  ): Promise<CreateCopilotJobOutcome> {
    const duplicate = await this.dependencies.repository.findJobByIdempotency(
      principal.userId,
      input.idempotencyKey
    );
    if (duplicate) {
      if (
        duplicate.inputHash !== input.inputHash ||
        duplicate.dossierId !== input.dossierId ||
        duplicate.operationKind !== input.operationKind
      ) {
        throw new CopilotApiError(
          409,
          'INVALID_REQUEST',
          'Idempotency key conflicts with another input'
        );
      }
      return this.resumeExistingJob(principal, duplicate);
    }

    const dossier = await this.dependencies.repository.getDossier(
      principal.userId,
      input.dossierId
    );
    if (!dossier) {
      throw new CopilotApiError(404, 'DOSSIER_NOT_FOUND', 'Copilot dossier not found');
    }
    if (dossier.state !== 'ready') {
      throw new CopilotApiError(409, 'DOSSIER_BUSY', 'Copilot dossier is not ready');
    }
    if (
      input.operationKind !== 'analysis' &&
      dossier.approvedArtifacts.length >= MAX_COPILOT_APPROVED_ARTIFACTS
    ) {
      throw new CopilotApiError(
        409,
        'INVALID_REQUEST',
        'Copilot dossier approved artifact limit reached'
      );
    }
    if (
      !isValidCopilotConsentSelection(input.consent) ||
      !isCopilotConsentSubset(input.consent, dossier.consent)
    ) {
      throw new CopilotApiError(409, 'DOSSIER_BUSY', 'Job consent exceeds the dossier consent');
    }
    if (!isCopilotTransmissionAllowed(input.payload, input.consent)) {
      throw new CopilotApiError(400, 'INVALID_REQUEST', 'Payload exceeds job consent');
    }
    const tjmFacts = parseTjmFactsForOperation(input.operationKind, input.tjmFacts, input.consent);

    const jobId = this.dependencies.createId();
    const attemptId = this.dependencies.createId();
    const billingKey = `${jobId}:${attemptId}`;
    const suppliedEvidenceIds = input.payload.experienceEvidence.map((item) => item.evidenceId);
    const creditCost = copilotCreditCost(input.operationKind);
    if (
      input.operationKind !== 'analysis' &&
      input.operationKind !== 'tjm-coach' &&
      suppliedEvidenceIds.length === 0
    ) {
      throw new CopilotApiError(
        422,
        'INVALID_REQUEST',
        'This artifact requires at least one supplied experience'
      );
    }
    if (input.operationKind === 'tjm-coach' && copilotTjmFactIds(tjmFacts).length === 0) {
      throw new CopilotApiError(422, 'INVALID_REQUEST', 'TJM coaching facts are required');
    }

    this.assertDossierRequestTransition(dossier, jobId, input.operationKind);

    const actor = createActor(remoteCopilotJobMachine);
    actor.start();
    actor.send({
      type: 'CREATE_JOB',
      jobId,
      userId: principal.userId,
      dossierId: dossier.id,
      attemptId,
      idempotencyKey: input.idempotencyKey,
      operationKind: input.operationKind,
      suppliedEvidenceIds,
      suppliedTjmFactIds: copilotTjmFactIds(tjmFacts),
      grounding: { payload: input.payload, tjmFacts },
    });
    expectState(String(actor.getSnapshot().value), 'authorizing');
    const admittedState = creditCost === 0 ? 'queued' : 'reserving';
    let created: CreateStoredJobResult;
    try {
      created = await this.dependencies.repository.createJob({
        id: jobId,
        userId: principal.userId,
        dossierId: dossier.id,
        missionId: dossier.missionId,
        attemptId,
        idempotencyKey: input.idempotencyKey,
        billingKey,
        inputHash: input.inputHash,
        operationKind: input.operationKind,
        state: admittedState,
        creditCost,
        suppliedEvidenceIds,
        consent: input.consent,
        tjmFacts,
        payload: input.payload,
      });
    } catch (error) {
      if (error instanceof CopilotApiError && error.code === 'RATE_LIMITED') {
        actor.send({
          type: 'AUTHORIZATION_DENIED',
          jobId,
          userId: principal.userId,
          attemptId,
          failure: {
            code: 'RATE_LIMITED',
            message: 'Daily Copilot pilot quota reached',
            retryable: false,
          },
        });
        expectState(stateValue(actor), 'failed');
      }
      actor.stop();
      throw error;
    }
    if (created.disposition === 'duplicate') {
      actor.stop();
      return this.resumeExistingJob(principal, created.job);
    }
    actor.send({
      type: 'AUTHORIZATION_GRANTED',
      jobId,
      userId: principal.userId,
      attemptId,
      evidence: {
        authenticatedUserId: principal.userId,
        entitlement: 'active',
        dossierOwnerUserId: dossier.userId,
      },
    });
    expectState(stateValue(actor), admittedState);

    let job = created.job;
    let creditsRemaining = principal.creditsRemaining;
    let reservation: CopilotCreditMutation | null = null;
    let reservationError: unknown = null;
    try {
      reservation = await this.dependencies.repository.reserveCredit(
        principal.userId,
        jobId,
        billingKey
      );
    } catch (firstError) {
      const firstMessage = firstError instanceof Error ? firstError.message : '';
      const confirmedDenial =
        firstMessage.includes('COPILOT_INSUFFICIENT_CREDITS') ||
        firstMessage.includes('COPILOT_ENTITLEMENT_DENIED');
      if (confirmedDenial) {
        reservationError = firstError;
      } else {
        // The first RPC may have committed and only lost its response. Re-read
        // the durable job, then retry the idempotent RPC once before declaring
        // the reservation phase uncertain.
        try {
          const durable = await this.dependencies.repository.getJob(principal.userId, jobId);
          if (durable?.reservationStatus === 'reserved' && durable.reservationTransactionId) {
            reservation = {
              status: 'reserved',
              transactionId: durable.reservationTransactionId,
              balance: await this.dependencies.repository.getCreditBalance(principal.userId),
            };
          } else {
            reservation = await this.dependencies.repository.reserveCredit(
              principal.userId,
              jobId,
              billingKey
            );
          }
        } catch (reconciliationError) {
          const durable = await this.dependencies.repository
            .getJob(principal.userId, jobId)
            .catch(() => null);
          if (durable?.reservationStatus === 'reserved' && durable.reservationTransactionId) {
            reservation = {
              status: 'reserved',
              transactionId: durable.reservationTransactionId,
              balance: await this.dependencies.repository.getCreditBalance(principal.userId),
            };
          } else {
            reservationError = reconciliationError;
          }
        }
      }
    }

    if (reservation === null) {
      const message = reservationError instanceof Error ? reservationError.message : '';
      const isInsufficient = message.includes('COPILOT_INSUFFICIENT_CREDITS');
      const isEntitlement = message.includes('COPILOT_ENTITLEMENT_DENIED');
      if (isInsufficient || isEntitlement) {
        const failure: RemoteCopilotFailure = {
          code: isInsufficient ? 'INSUFFICIENT_CREDITS' : 'ENTITLEMENT_DENIED',
          message: isInsufficient
            ? 'Insufficient Copilot credits'
            : 'Premium entitlement is no longer active',
          retryable: false,
        };
        if (creditCost === 1) {
          actor.send({
            type: 'CREDIT_RESERVATION_FAILED',
            jobId,
            userId: principal.userId,
            attemptId,
            idempotencyKey: input.idempotencyKey,
            failure,
          });
        } else {
          actor.send({
            type: 'PROVIDER_FAILED',
            jobId,
            userId: principal.userId,
            attemptId,
            providerRunId: null,
            failure,
          });
        }
        expectState(stateValue(actor), 'failed');
        this.assertDossierJobFailureTransition(dossier, job, failure.message);
        job = await this.settleJobWithoutCreditWithRecovery({
          userId: principal.userId,
          dossierId: dossier.id,
          jobId,
          terminalState: 'failed',
          failure: publicFailure(failure),
        });
        actor.stop();
        throw new CopilotApiError(
          isInsufficient ? 402 : 403,
          isInsufficient ? 'INSUFFICIENT_CREDITS' : 'ENTITLEMENT_DENIED',
          isInsufficient ? 'Insufficient Copilot credits' : 'Premium entitlement is not active'
        );
      }
      job = await this.dependencies.repository.updateJob(
        principal.userId,
        jobId,
        {
          state: 'uncertain',
          uncertainPhase: 'reservation',
          failure: {
            code: 'RESERVATION_FAILED',
            message: 'Credit reservation requires reconciliation',
            retryable: true,
          },
        },
        ['reserving', 'queued']
      );
      actor.stop();
      return { duplicate: false, job: toPublicCopilotJob(job), creditsRemaining };
    }

    creditsRemaining = reservation.balance;
    if (creditCost === 1) {
      if (reservation.status !== 'reserved' || reservation.transactionId === null) {
        throw new CopilotApiError(500, 'PERSISTENCE_FAILED', 'Credit reservation was not durable');
      }
      actor.send({
        type: 'CREDIT_RESERVED',
        jobId,
        userId: principal.userId,
        attemptId,
        idempotencyKey: input.idempotencyKey,
        reservationId: reservation.transactionId,
      });
      expectState(stateValue(actor), 'queued');
      job = await this.dependencies.repository.updateJob(
        principal.userId,
        jobId,
        {
          state: 'queued',
          reservationStatus: 'reserved',
          reservationTransactionId: reservation.transactionId,
          refundStatus: 'pending',
        },
        ['queued']
      );
    }

    // Consume only a continuation whose previous result was explicitly
    // accepted. The claim retires it before dispatch, so failure/rejection can
    // never leak generated context into a later job.
    const reusableSession = await this.dependencies.repository.claimReusableProviderSession(
      principal.userId,
      dossier.id,
      job.id
    );

    // Claim provider execution before the potentially long Eve call. Cancel
    // races this CAS; only one side may leave queued.
    const machineProviderRunId = `provider:${job.id}:${job.attemptId}`;
    actor.send({
      type: 'PROVIDER_STARTED',
      jobId: job.id,
      userId: principal.userId,
      attemptId: job.attemptId,
      providerRunId: machineProviderRunId,
    });
    expectState(stateValue(actor), 'running');
    job = await this.dependencies.repository.updateJob(
      principal.userId,
      job.id,
      {
        state: 'running',
        failure: null,
        uncertainPhase: null,
        providerDispatchedAt: this.dependencies.now().toISOString(),
      },
      ['queued']
    );
    let providerResult: CopilotProviderStartResult;
    try {
      providerResult = await this.dependencies.provider.start({
        jobId,
        attemptId,
        operationKind: input.operationKind,
        payload: input.payload,
        tjmFacts,
        session: reusableSession
          ? {
              sessionId: reusableSession.sessionId,
              continuationToken: reusableSession.continuationToken,
            }
          : null,
      });
    } catch (error) {
      const providerFailure = providerFailureMetadata(error);
      if (providerFailure.session) {
        await this.recordProviderSessionWithRecovery({
          userId: principal.userId,
          dossierId: dossier.id,
          sessionId: providerFailure.session.sessionId,
          continuationToken: providerFailure.session.continuationToken,
          activeJobId: job.id,
          activeProviderRunId: `failed:${job.id}:${job.attemptId}`,
          continuationEligible: false,
          deletionDisposition: 'pending',
        });
      } else if (!providerFailure.remoteEffectPossible) {
        job = await this.dependencies.repository.updateJob(
          principal.userId,
          job.id,
          { providerDispatchedAt: null },
          ['running']
        );
      }
      if (isProviderOutcomeUncertain(error)) {
        actor.send({
          type: 'PROVIDER_STATUS_UNCERTAIN',
          jobId: job.id,
          userId: principal.userId,
          attemptId: job.attemptId,
          providerRunId: null,
        });
        expectState(stateValue(actor), 'uncertain');
        job = await this.dependencies.repository.updateJob(
          principal.userId,
          job.id,
          {
            state: 'uncertain',
            uncertainPhase: 'provider',
            failure: {
              code: 'RECONCILIATION_FAILED',
              message: 'Provider outcome requires reconciliation',
              retryable: true,
            },
          },
          ['running']
        );
        actor.stop();
        return { duplicate: false, job: toPublicCopilotJob(job), creditsRemaining };
      }
      try {
        const settlement = await this.settleExecutionFailure(
          principal,
          dossier,
          job,
          actor,
          PROVIDER_FAILURE
        );
        job = settlement.job;
        if (settlement.creditsRemaining !== null) {
          creditsRemaining = settlement.creditsRemaining;
        }
      } finally {
        actor.stop();
      }
      return { duplicate: false, job: toPublicCopilotJob(job), creditsRemaining };
    }

    try {
      const recorded = await this.recordProviderResult(
        principal,
        dossier,
        job,
        actor,
        providerResult,
        machineProviderRunId,
        reusableSession?.sessionId ?? null
      );
      job = recorded.job;
      if (recorded.creditsRemaining !== null) creditsRemaining = recorded.creditsRemaining;
    } finally {
      actor.stop();
    }

    return { duplicate: false, job: toPublicCopilotJob(job), creditsRemaining };
  }

  async getJob(principal: CopilotPrincipal, jobId: string): Promise<PublicCopilotJob> {
    const job = await this.dependencies.repository.getJob(principal.userId, jobId);
    if (!job) throw new CopilotApiError(404, 'JOB_NOT_FOUND', 'Copilot job not found');
    return (await this.resumeExistingJob(principal, job)).job;
  }

  async getJobByIdempotency(
    principal: CopilotPrincipal,
    idempotencyKey: string,
    expected?: {
      inputHash: string;
      missionId: string;
      operationKind: CopilotOperationKind;
    }
  ): Promise<PublicCopilotJob | null> {
    const job = await this.dependencies.repository.findJobByIdempotency(
      principal.userId,
      idempotencyKey
    );
    if (!job) return null;
    if (
      expected &&
      (job.inputHash !== expected.inputHash ||
        job.missionId !== expected.missionId ||
        job.operationKind !== expected.operationKind)
    ) {
      throw new CopilotApiError(
        409,
        'INVALID_REQUEST',
        'Idempotency key conflicts with another input'
      );
    }
    return (await this.resumeExistingJob(principal, job)).job;
  }

  async assertJobReplayAllowed(
    principal: CopilotPrincipal,
    idempotencyKey: string,
    inputHash: string
  ): Promise<void> {
    await this.dependencies.repository.assertJobReplayAllowed(
      principal.userId,
      idempotencyKey,
      inputHash
    );
  }

  async cancelJob(principal: CopilotPrincipal, jobId: string): Promise<CopilotJobMutationOutcome> {
    let job = await this.requireJob(principal, jobId);
    if (job.state === 'cancelled') {
      return { job: toPublicCopilotJob(job), creditsRemaining: principal.creditsRemaining };
    }
    const resumesCancelling = job.state === 'cancelling';
    if (job.state !== 'queued' && job.state !== 'running' && !resumesCancelling) {
      throw new CopilotApiError(409, 'CANCELLATION_NOT_ALLOWED', 'Job cannot be cancelled');
    }
    const dossier = await this.dependencies.repository.getDossier(principal.userId, job.dossierId);
    if (!dossier) {
      throw new CopilotApiError(404, 'DOSSIER_NOT_FOUND', 'Copilot dossier not found');
    }

    const session = await this.dependencies.repository.getProviderSession(
      principal.userId,
      job.dossierId,
      job.id
    );
    const providerMayHaveStarted =
      job.providerDispatchedAt !== null || typeof session?.activeProviderRunId === 'string';
    const actor = this.replayJobActor(job, session?.activeProviderRunId ?? null);
    if (resumesCancelling) {
      expectState(stateValue(actor), 'cancelling');
    } else {
      actor.send({
        type: 'CANCEL_REQUESTED',
        jobId: job.id,
        userId: principal.userId,
        attemptId: job.attemptId,
      });
      expectState(stateValue(actor), 'cancelling');
      job = await this.dependencies.repository.updateJob(
        principal.userId,
        job.id,
        { state: 'cancelling', settlement: 'cancellation' },
        [job.state]
      );
    }

    if (
      providerMayHaveStarted &&
      (session?.activeJobId !== job.id || session.activeProviderRunId === null)
    ) {
      actor.send({
        type: 'CANCELLATION_UNCERTAIN',
        jobId: job.id,
        userId: principal.userId,
        attemptId: job.attemptId,
        failure: {
          code: 'CANCELLATION_FAILED',
          message: 'Cancellation outcome requires reconciliation',
          retryable: true,
        },
      });
      const uncertain = await this.dependencies.repository.updateJob(
        principal.userId,
        job.id,
        {
          state: 'uncertain',
          uncertainPhase: 'cancellation',
          failure: {
            code: 'CANCELLATION_FAILED',
            message: 'Cancellation outcome requires reconciliation',
            retryable: true,
          },
        },
        ['cancelling']
      );
      actor.stop();
      return { job: toPublicCopilotJob(uncertain), creditsRemaining: principal.creditsRemaining };
    }

    if (session?.activeJobId === job.id && session.activeProviderRunId !== null) {
      try {
        const result = await this.dependencies.provider.cancel({
          providerRunId: session.activeProviderRunId,
          sessionId: session.sessionId,
        });
        if (result.status !== 'cancelled') {
          actor.send({
            type: 'CANCELLATION_UNCERTAIN',
            jobId: job.id,
            userId: principal.userId,
            attemptId: job.attemptId,
            failure: {
              code: 'CANCELLATION_FAILED',
              message: 'Cancellation outcome requires reconciliation',
              retryable: true,
            },
          });
          const uncertain = await this.dependencies.repository.updateJob(
            principal.userId,
            job.id,
            {
              state: 'uncertain',
              uncertainPhase: 'cancellation',
              failure: {
                code: 'CANCELLATION_FAILED',
                message: 'Cancellation outcome requires reconciliation',
                retryable: true,
              },
            },
            ['cancelling']
          );
          actor.stop();
          return {
            job: toPublicCopilotJob(uncertain),
            creditsRemaining: principal.creditsRemaining,
          };
        }
      } catch {
        actor.send({
          type: 'CANCELLATION_UNCERTAIN',
          jobId: job.id,
          userId: principal.userId,
          attemptId: job.attemptId,
          failure: {
            code: 'CANCELLATION_FAILED',
            message: 'Cancellation outcome requires reconciliation',
            retryable: true,
          },
        });
        const uncertain = await this.dependencies.repository.updateJob(
          principal.userId,
          job.id,
          {
            state: 'uncertain',
            uncertainPhase: 'cancellation',
            failure: {
              code: 'CANCELLATION_FAILED',
              message: 'Cancellation outcome requires reconciliation',
              retryable: true,
            },
          },
          ['cancelling']
        );
        actor.stop();
        return { job: toPublicCopilotJob(uncertain), creditsRemaining: principal.creditsRemaining };
      }
    }

    actor.send({
      type: 'CANCELLATION_CONFIRMED',
      jobId: job.id,
      userId: principal.userId,
      attemptId: job.attemptId,
    });
    this.assertDossierJobFailureTransition(dossier, job, 'Copilot job cancelled');
    let creditsRemaining = principal.creditsRemaining;
    if (job.creditCost === 1 && job.reservationStatus === 'reserved') {
      expectState(stateValue(actor), 'refunding');
      await this.dependencies.repository.updateJob(
        principal.userId,
        job.id,
        { state: 'refunding', settlement: 'cancellation', failure: null },
        ['cancelling']
      );
      try {
        const refund = await this.dependencies.repository.refundCredit(
          principal.userId,
          job.id,
          job.billingKey,
          'cancelled'
        );
        creditsRemaining = refund.balance;
        const durable = await this.dependencies.repository.getJob(principal.userId, job.id);
        if (
          !durable ||
          durable.state !== 'cancelled' ||
          durable.refundStatus !== 'refunded' ||
          durable.refundTransactionId !== refund.transactionId
        ) {
          throw new CopilotApiError(500, 'PERSISTENCE_FAILED', 'Refund did not settle the job');
        }
        job = durable;
      } catch {
        const reconciled = await this.reconcileCommittedRefund(principal.userId, job, 'cancelled');
        if (reconciled) {
          actor.stop();
          return { job: toPublicCopilotJob(reconciled.job), creditsRemaining: reconciled.balance };
        }
        job = await this.dependencies.repository.updateJob(
          principal.userId,
          job.id,
          {
            state: 'uncertain',
            uncertainPhase: 'refund',
            refundStatus: 'pending',
            failure: {
              code: 'REFUND_FAILED',
              message: 'Credit refund requires reconciliation',
              retryable: true,
            },
          },
          ['refunding']
        );
        actor.stop();
        return { job: toPublicCopilotJob(job), creditsRemaining };
      }
    } else {
      expectState(stateValue(actor), 'cancelled');
      job = await this.settleJobWithoutCreditWithRecovery({
        userId: principal.userId,
        dossierId: dossier.id,
        jobId: job.id,
        terminalState: 'cancelled',
        failure: null,
      });
    }
    actor.stop();
    return { job: toPublicCopilotJob(job), creditsRemaining };
  }

  async reviewJob(
    principal: CopilotPrincipal,
    jobId: string,
    decision: 'accept' | 'reject'
  ): Promise<CopilotJobMutationOutcome> {
    const job = await this.requireJob(principal, jobId);
    if (job.state === 'accepted' || job.state === 'rejected') {
      const canonicalDecision = job.state === 'accepted' ? 'accept' : 'reject';
      if (decision !== canonicalDecision) {
        throw new CopilotApiError(409, 'REVIEW_NOT_ALLOWED', 'Job was reviewed differently');
      }
      const reviewed = await this.dependencies.repository.completeReview({
        userId: principal.userId,
        dossierId: job.dossierId,
        jobId: job.id,
        decision,
        artifactId: null,
        renderedDraft: null,
        reviewedAt: this.dependencies.now().toISOString(),
      });
      return { job: toPublicCopilotJob(reviewed), creditsRemaining: principal.creditsRemaining };
    }
    if (job.state !== 'review' || job.result === null) {
      throw new CopilotApiError(409, 'REVIEW_NOT_ALLOWED', 'Job is not reviewable');
    }
    const session = await this.dependencies.repository.getProviderSession(
      principal.userId,
      job.dossierId,
      job.id
    );
    const dossier = await this.dependencies.repository.getDossier(principal.userId, job.dossierId);
    if (!dossier) {
      throw new CopilotApiError(404, 'DOSSIER_NOT_FOUND', 'Copilot dossier not found');
    }
    const actor = this.replayJobActor(job, session?.activeProviderRunId ?? null);
    const reviewedAtDate = this.dependencies.now();
    actor.send({
      type: decision === 'accept' ? 'USER_ACCEPTED' : 'USER_REJECTED',
      jobId: job.id,
      userId: principal.userId,
      attemptId: job.attemptId,
      reviewedAtMs: reviewedAtDate.getTime(),
    });
    expectState(stateValue(actor), decision === 'accept' ? 'accepted' : 'rejected');
    actor.stop();

    const artifactId =
      decision === 'accept' && job.operationKind !== 'analysis'
        ? this.dependencies.createId()
        : null;
    const dossierActor = this.hydrateDossierActor(dossier, {
      state: 'reviewing',
      job,
      session,
      providerMayExist: session !== null,
    });
    if (job.operationKind === 'analysis') {
      if (decision === 'accept') {
        dossierActor.send({
          type: 'ANALYSIS_APPROVED',
          userId: dossier.userId,
          missionId: dossier.missionId,
          jobId: job.id,
          approvedAtMs: reviewedAtDate.getTime(),
        });
      } else {
        dossierActor.send({
          type: 'ANALYSIS_REJECTED',
          userId: dossier.userId,
          missionId: dossier.missionId,
          jobId: job.id,
        });
      }
    } else {
      dossierActor.send(
        decision === 'accept'
          ? {
              type: 'ARTIFACT_APPROVED',
              userId: dossier.userId,
              missionId: dossier.missionId,
              jobId: job.id,
              artifactId: artifactId!,
              approvedAtMs: reviewedAtDate.getTime(),
            }
          : {
              type: 'ARTIFACT_REJECTED',
              userId: dossier.userId,
              missionId: dossier.missionId,
              jobId: job.id,
            }
      );
    }
    expectState(String(dossierActor.getSnapshot().value), 'ready');
    dossierActor.stop();

    const reviewedAt = reviewedAtDate.toISOString();
    const reviewed = await this.dependencies.repository.completeReview({
      userId: principal.userId,
      dossierId: job.dossierId,
      jobId: job.id,
      decision,
      artifactId,
      renderedDraft:
        decision === 'accept' && job.operationKind !== 'analysis'
          ? renderCopilotDraft(job.result)
          : null,
      reviewedAt,
    });
    return { job: toPublicCopilotJob(reviewed), creditsRemaining: principal.creditsRemaining };
  }

  async deleteDossier(
    principal: CopilotPrincipal,
    missionId: string
  ): Promise<'deleted' | 'retention-confirmed' | 'not-created'> {
    const dossier = await this.dependencies.repository.getDossierByMission(
      principal.userId,
      missionId
    );
    if (!dossier) return 'not-created';
    if (
      dossier.state !== 'ready' &&
      dossier.state !== 'deletionFailed' &&
      dossier.state !== 'deleting'
    ) {
      throw new CopilotApiError(
        409,
        'DELETE_FAILED',
        'Dossier deletion requires every job to settle first',
        true
      );
    }
    const requestedAt =
      dossier.state === 'deleting' && dossier.deletionRequestedAt
        ? new Date(dossier.deletionRequestedAt)
        : this.dependencies.now();
    if (!Number.isFinite(requestedAt.getTime())) {
      throw new CopilotApiError(500, 'PERSISTENCE_FAILED', 'Invalid deletion checkpoint');
    }
    if (dossier.state !== 'deleting') {
      const requestActor = this.hydrateDossierActor(dossier, { state: dossier.state });
      if (dossier.state === 'deletionFailed') {
        requestActor.send({
          type: 'DELETE_RETRIED',
          userId: dossier.userId,
          missionId: dossier.missionId,
        });
      } else {
        requestActor.send({
          type: 'DELETE_REQUESTED',
          userId: dossier.userId,
          missionId: dossier.missionId,
          requestedAtMs: requestedAt.getTime(),
        });
      }
      expectState(String(requestActor.getSnapshot().value), 'deleting');
      requestActor.stop();
    }

    // Freeze the dossier under the same row lock used by job creation before
    // enumerating provider obligations. No new job/session can appear after
    // this point and escape deletion.
    if (dossier.state !== 'deleting') {
      await this.dependencies.repository.markDossierDeleting(
        principal.userId,
        dossier.id,
        requestedAt.toISOString()
      );
    }
    let sessions: CopilotProviderSessionRecord[] = [];
    try {
      const unresolvedProvider =
        await this.dependencies.repository.hasUnresolvedProviderDisposition(
          principal.userId,
          dossier.id
        );
      if (unresolvedProvider) {
        throw new CopilotApiError(
          503,
          'DELETE_FAILED',
          'Provider disposition is unknown and requires reconciliation',
          true
        );
      }
      sessions = await this.dependencies.repository.listProviderSessions(
        principal.userId,
        dossier.id
      );
    } catch {
      const failureActor = this.hydrateDossierActor(dossier, {
        state: 'deleting',
        providerMayExist: true,
        deletionRequestedAtMs: requestedAt.getTime(),
      });
      failureActor.send({
        type: 'DELETE_FAILED',
        userId: dossier.userId,
        missionId: dossier.missionId,
        error: { code: 'DELETE_FAILED', message: 'Obligation inventory failed', retryable: true },
      });
      expectState(String(failureActor.getSnapshot().value), 'deletionFailed');
      failureActor.stop();
      await this.dependencies.repository.markDossierDeletionFailed(principal.userId, dossier.id);
      throw new CopilotApiError(
        503,
        'DELETE_FAILED',
        'Provider deletion obligations could not be enumerated',
        true
      );
    }
    const actor = this.hydrateDossierActor(dossier, {
      state: 'deleting',
      providerMayExist: sessions.length > 0,
      deletionRequestedAtMs: requestedAt.getTime(),
    });
    let disposition: 'deleted' | 'retention-confirmed' | 'not-created' = 'not-created';
    if (sessions.some((session) => session.deletionDisposition === 'uncertain')) {
      actor.send({
        type: 'DELETE_FAILED',
        userId: dossier.userId,
        missionId: dossier.missionId,
        error: {
          code: 'DELETE_FAILED',
          message: 'Provider deletion is uncertain',
          retryable: true,
        },
      });
      actor.stop();
      await this.dependencies.repository.markDossierDeletionFailed(principal.userId, dossier.id);
      throw new CopilotApiError(
        503,
        'DELETE_FAILED',
        'Provider deletion requires lookup or operator reconciliation',
        true
      );
    }

    try {
      const pendingSessions = sessions.filter(
        (session) => session.deletionDisposition === 'pending'
      );
      if (pendingSessions.length > 0 && !this.dependencies.provider.deleteSession) {
        throw new Error('Provider session deletion is unsupported');
      }
      for (const session of pendingSessions) {
        const claimed = await this.dependencies.repository.beginProviderSessionDeletion(
          principal.userId,
          dossier.id,
          session.sessionId
        );
        if (!claimed) throw new Error('Provider deletion obligation changed concurrently');
        const deleted = await this.dependencies.provider.deleteSession!({
          sessionId: session.sessionId,
        });
        await this.dependencies.repository.confirmProviderSessionDeletion(
          principal.userId,
          dossier.id,
          session.sessionId,
          deleted.disposition
        );
      }
      sessions = await this.dependencies.repository.listProviderSessions(
        principal.userId,
        dossier.id
      );
      if (
        sessions.some(
          (session) =>
            session.deletionDisposition !== 'deleted' &&
            session.deletionDisposition !== 'retention-confirmed'
        )
      ) {
        throw new Error('Provider deletion journal is incomplete');
      }
      if (sessions.length > 0) {
        disposition = sessions.some(
          (session) => session.deletionDisposition === 'retention-confirmed'
        )
          ? 'retention-confirmed'
          : 'deleted';
      }
    } catch {
      actor.send({
        type: 'DELETE_FAILED',
        userId: dossier.userId,
        missionId: dossier.missionId,
        error: { code: 'DELETE_FAILED', message: 'Provider deletion failed', retryable: true },
      });
      actor.stop();
      await this.dependencies.repository
        .markDossierDeletionFailed(principal.userId, dossier.id)
        .catch(() => undefined);
      throw new CopilotApiError(503, 'DELETE_FAILED', 'Provider deletion is not confirmed', true);
    }

    let localDeleted = false;
    try {
      localDeleted = await this.dependencies.repository.deleteDossier(principal.userId, dossier.id);
    } catch {
      localDeleted = false;
    }
    if (!localDeleted) {
      actor.send({
        type: 'DELETE_FAILED',
        userId: dossier.userId,
        missionId: dossier.missionId,
        error: { code: 'DELETE_FAILED', message: 'Local deletion failed', retryable: true },
      });
      actor.stop();
      await this.dependencies.repository
        .markDossierDeletionFailed(principal.userId, dossier.id)
        .catch(() => undefined);
      throw new CopilotApiError(503, 'DELETE_FAILED', 'Local deletion was not committed', true);
    }
    actor.send({
      type: 'DELETE_CONFIRMED',
      userId: dossier.userId,
      missionId: dossier.missionId,
      missionPulseRecordsDeleted: true,
      eveDisposition: disposition,
    });
    expectState(String(actor.getSnapshot().value), 'deleted');
    actor.stop();
    return disposition;
  }

  /** Resume only effects whose durable cut-point proves they did not run. */
  private async resumeExistingJob(
    principal: CopilotPrincipal,
    initialJob: StoredCopilotJob
  ): Promise<CreateCopilotJobOutcome> {
    let job = initialJob;
    let creditsRemaining = await this.dependencies.repository
      .getCreditBalance(principal.userId)
      .catch(() => principal.creditsRemaining);
    const dossier = await this.dependencies.repository.getDossier(principal.userId, job.dossierId);
    if (!dossier) {
      throw new CopilotApiError(404, 'DOSSIER_NOT_FOUND', 'Copilot dossier not found');
    }

    if (job.state === 'cancelling') {
      const resumed = await this.cancelJob(principal, job.id);
      return { duplicate: true, job: resumed.job, creditsRemaining: resumed.creditsRemaining };
    }

    const projectionSession = ['running', 'validating', 'review', 'accepted', 'rejected'].includes(
      job.state
    )
      ? await this.dependencies.repository.getProviderSession(
          principal.userId,
          job.dossierId,
          job.id
        )
      : null;
    const persistedActor = this.replayJobActor(job, projectionSession?.activeProviderRunId ?? null);
    persistedActor.stop();

    if (job.state === 'reserving') {
      try {
        const reservation = await this.dependencies.repository.reserveCredit(
          principal.userId,
          job.id,
          job.billingKey
        );
        creditsRemaining = reservation.balance;
        const durable = await this.dependencies.repository.getJob(principal.userId, job.id);
        if (!durable) throw new CopilotApiError(404, 'JOB_NOT_FOUND', 'Copilot job not found');
        job = durable;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (
          message.includes('COPILOT_INSUFFICIENT_CREDITS') ||
          message.includes('COPILOT_ENTITLEMENT_DENIED')
        ) {
          const failure = {
            code: message.includes('COPILOT_INSUFFICIENT_CREDITS')
              ? 'INSUFFICIENT_CREDITS'
              : 'ENTITLEMENT_DENIED',
            message: 'Copilot reservation denied',
            retryable: false,
          } as const;
          this.assertDossierJobFailureTransition(dossier, job, 'Copilot reservation denied');
          job = await this.settleJobWithoutCreditWithRecovery({
            userId: principal.userId,
            dossierId: job.dossierId,
            jobId: job.id,
            terminalState: 'failed',
            failure,
          });
          return { duplicate: true, job: toPublicCopilotJob(job), creditsRemaining };
        }
        const durable = await this.dependencies.repository
          .getJob(principal.userId, job.id)
          .catch(() => null);
        if (durable?.state === 'queued') {
          job = durable;
        } else {
          job = await this.dependencies.repository.updateJob(
            principal.userId,
            job.id,
            {
              state: 'uncertain',
              uncertainPhase: 'reservation',
              failure: {
                code: 'RESERVATION_FAILED',
                message: 'Credit reservation requires reconciliation',
                retryable: true,
              },
            },
            ['reserving']
          );
          return { duplicate: true, job: toPublicCopilotJob(job), creditsRemaining };
        }
      }
    }

    if (job.state === 'refunding') {
      if (job.settlement !== 'failure' && job.settlement !== 'cancellation') {
        job = await this.dependencies.repository.updateJob(
          principal.userId,
          job.id,
          {
            state: 'uncertain',
            uncertainPhase: 'refund',
            failure: {
              code: 'REFUND_FAILED',
              message: 'Credit refund requires reconciliation',
              retryable: true,
            },
          },
          ['refunding']
        );
      } else {
        try {
          const refund = await this.dependencies.repository.refundCredit(
            principal.userId,
            job.id,
            job.billingKey,
            job.settlement === 'failure' ? 'failed' : 'cancelled'
          );
          creditsRemaining = refund.balance;
          const durable = await this.dependencies.repository.getJob(principal.userId, job.id);
          if (!durable) throw new CopilotApiError(404, 'JOB_NOT_FOUND', 'Copilot job not found');
          job = durable;
        } catch {
          const reconciled = await this.reconcileCommittedRefund(
            principal.userId,
            job,
            job.settlement === 'failure' ? 'failed' : 'cancelled'
          );
          if (reconciled) {
            job = reconciled.job;
            creditsRemaining = reconciled.balance;
          } else {
            job = await this.dependencies.repository.updateJob(
              principal.userId,
              job.id,
              {
                state: 'uncertain',
                uncertainPhase: 'refund',
                failure: {
                  code: 'REFUND_FAILED',
                  message: 'Credit refund requires reconciliation',
                  retryable: true,
                },
              },
              ['refunding']
            );
          }
        }
      }
    }

    if (job.state === 'running' && job.result === null) {
      // Eve currently has no durable turn lookup. Re-dispatching would risk a
      // double effect, so every ambiguous running cut-point is fail-closed.
      job = await this.dependencies.repository.updateJob(
        principal.userId,
        job.id,
        {
          state: 'uncertain',
          uncertainPhase: 'provider',
          failure: {
            code: 'RECONCILIATION_FAILED',
            message: 'Provider outcome requires reconciliation',
            retryable: true,
          },
        },
        ['running']
      );
    }

    if (job.state === 'queued') {
      if (job.providerDispatchedAt !== null) {
        job = await this.dependencies.repository.updateJob(
          principal.userId,
          job.id,
          {
            state: 'uncertain',
            uncertainPhase: 'provider',
            failure: {
              code: 'RECONCILIATION_FAILED',
              message: 'Provider outcome requires reconciliation',
              retryable: true,
            },
          },
          ['queued']
        );
      } else {
        const boundSession = await this.dependencies.repository.getProviderSession(
          principal.userId,
          job.dossierId,
          job.id
        );
        const reusableSession =
          boundSession ??
          (await this.dependencies.repository.claimReusableProviderSession(
            principal.userId,
            job.dossierId,
            job.id
          ));
        const actor = this.replayJobActor(job, null);
        const machineProviderRunId = `provider:${job.id}:${job.attemptId}`;
        actor.send({
          type: 'PROVIDER_STARTED',
          jobId: job.id,
          userId: job.userId,
          attemptId: job.attemptId,
          providerRunId: machineProviderRunId,
        });
        expectState(stateValue(actor), 'running');
        job = await this.dependencies.repository.updateJob(
          principal.userId,
          job.id,
          {
            state: 'running',
            failure: null,
            uncertainPhase: null,
            providerDispatchedAt: this.dependencies.now().toISOString(),
          },
          ['queued']
        );
        try {
          const providerResult = await this.dependencies.provider.start({
            jobId: job.id,
            attemptId: job.attemptId,
            operationKind: job.operationKind,
            payload: job.payload,
            tjmFacts: job.tjmFacts,
            session: reusableSession
              ? {
                  sessionId: reusableSession.sessionId,
                  continuationToken: reusableSession.continuationToken,
                }
              : null,
          });
          const recorded = await this.recordProviderResult(
            principal,
            dossier,
            job,
            actor,
            providerResult,
            machineProviderRunId,
            reusableSession?.sessionId ?? null
          );
          job = recorded.job;
          if (recorded.creditsRemaining !== null) creditsRemaining = recorded.creditsRemaining;
        } catch (error) {
          const metadata = providerFailureMetadata(error);
          if (metadata.session) {
            await this.recordProviderSessionWithRecovery({
              userId: principal.userId,
              dossierId: dossier.id,
              sessionId: metadata.session.sessionId,
              continuationToken: metadata.session.continuationToken,
              activeJobId: job.id,
              activeProviderRunId: `failed:${job.id}:${job.attemptId}`,
              continuationEligible: false,
              deletionDisposition: 'pending',
            });
          } else if (!metadata.remoteEffectPossible) {
            job = await this.dependencies.repository.updateJob(
              principal.userId,
              job.id,
              { providerDispatchedAt: null },
              ['running']
            );
          }
          if (isProviderOutcomeUncertain(error)) {
            actor.send({
              type: 'PROVIDER_STATUS_UNCERTAIN',
              jobId: job.id,
              userId: job.userId,
              attemptId: job.attemptId,
              providerRunId: null,
            });
            job = await this.dependencies.repository.updateJob(
              principal.userId,
              job.id,
              {
                state: 'uncertain',
                uncertainPhase: 'provider',
                failure: {
                  code: 'RECONCILIATION_FAILED',
                  message: 'Provider outcome requires reconciliation',
                  retryable: true,
                },
              },
              ['running']
            );
          } else {
            const settled = await this.settleExecutionFailure(
              principal,
              dossier,
              job,
              actor,
              PROVIDER_FAILURE
            );
            job = settled.job;
            if (settled.creditsRemaining !== null) creditsRemaining = settled.creditsRemaining;
          }
        } finally {
          actor.stop();
        }
      }
    }

    return { duplicate: true, job: toPublicCopilotJob(job), creditsRemaining };
  }

  private async requireJob(principal: CopilotPrincipal, jobId: string): Promise<StoredCopilotJob> {
    const job = await this.dependencies.repository.getJob(principal.userId, jobId);
    if (!job) throw new CopilotApiError(404, 'JOB_NOT_FOUND', 'Copilot job not found');
    return job;
  }

  private replayJobActor(job: StoredCopilotJob, providerRunId: string | null) {
    const durableProviderRunId =
      providerRunId ??
      ((job.state === 'running' || job.state === 'cancelling') && job.providerDispatchedAt !== null
        ? `provider:${job.id}:${job.attemptId}`
        : null);
    const snapshot = resolveRemoteCopilotJobSnapshot({
      state: job.state,
      context: {
        jobId: job.id,
        userId: job.userId,
        dossierId: job.dossierId,
        attemptId: job.attemptId,
        idempotencyKey: job.idempotencyKey,
        operationKind: job.operationKind,
        creditCost: job.creditCost,
        suppliedEvidenceIds: job.suppliedEvidenceIds,
        suppliedTjmFactIds: copilotTjmFactIds(job.tjmFacts),
        grounding: { payload: job.payload, tjmFacts: job.tjmFacts },
        authorizationEvidence: {
          authenticatedUserId: job.userId,
          entitlement: 'active',
          dossierOwnerUserId: job.userId,
        },
        reservationStatus: job.reservationStatus,
        reservationId: job.reservationTransactionId,
        refundStatus: job.refundStatus,
        refundId: job.refundTransactionId,
        providerRunId: durableProviderRunId,
        result: job.result,
        settlement: job.settlement,
        uncertainPhase: job.uncertainPhase,
        failure: job.failure,
      },
    });
    if (!snapshot) {
      throw new CopilotApiError(
        500,
        'PERSISTENCE_FAILED',
        `Invalid persisted Copilot job projection (${job.state})`
      );
    }
    const actor = createActor(remoteCopilotJobMachine, { snapshot });
    actor.start();
    return actor;
  }

  private assertDossierRequestTransition(
    dossier: StoredCopilotDossier,
    jobId: string,
    operationKind: CopilotOperationKind
  ): void {
    const actor = this.hydrateDossierActor(dossier, { state: 'ready' });
    if (operationKind === 'analysis') {
      actor.send({
        type: 'ANALYSIS_REQUESTED',
        userId: dossier.userId,
        missionId: dossier.missionId,
        jobId,
      });
    } else {
      actor.send({
        type: 'ARTIFACT_REQUESTED',
        userId: dossier.userId,
        missionId: dossier.missionId,
        jobId,
        kind: operationKind,
      });
    }
    const state = actor.getSnapshot().value;
    actor.stop();
    expectState(String(state), 'processing');
  }

  private assertDossierJobFailureTransition(
    dossier: StoredCopilotDossier,
    job: StoredCopilotJob,
    message: string
  ): void {
    const actor = this.hydrateDossierActor(dossier, { state: 'processing', job });
    actor.send({
      type: 'JOB_FAILED',
      userId: dossier.userId,
      missionId: dossier.missionId,
      jobId: job.id,
      error: { code: 'JOB_FAILED', message, retryable: true },
    });
    expectState(String(actor.getSnapshot().value), 'ready');
    actor.stop();
  }

  private hydrateDossierActor(
    dossier: StoredCopilotDossier,
    options: {
      state?: CopilotDossierStateValue;
      job?: StoredCopilotJob | null;
      session?: CopilotProviderSessionRecord | null;
      providerMayExist?: boolean;
      deletionRequestedAtMs?: number;
    } = {}
  ): ActorRefFrom<typeof copilotDossierMachine> {
    const state = options.state ?? dossier.state;
    const job = options.job ?? null;
    const session = options.session ?? null;
    const deletionRequestedAtMs =
      options.deletionRequestedAtMs ??
      (dossier.deletionRequestedAt
        ? Date.parse(dossier.deletionRequestedAt)
        : state === 'deletionFailed'
          ? 0
          : null);
    const context: CopilotDossierContext = {
      userId: dossier.userId,
      missionId: dossier.missionId,
      consent: dossier.consent,
      session: session
        ? { sessionId: session.sessionId, continuationToken: session.continuationToken }
        : null,
      activeJob:
        (state === 'processing' || state === 'reviewing') && job
          ? { jobId: job.id, kind: job.operationKind }
          : null,
      reviewCandidate:
        state === 'reviewing' && job?.result ? { jobId: job.id, result: job.result } : null,
      analysis: dossier.analysis,
      artifacts: dossier.approvedArtifacts,
      deletionRequestedAtMs,
      error:
        state === 'deletionFailed'
          ? { code: 'DELETE_FAILED', message: 'Persisted deletion failed', retryable: true }
          : null,
      providerMayExist: options.providerMayExist ?? session !== null,
    };
    const snapshot = resolveCopilotDossierSnapshot({ state, context });
    if (!snapshot) {
      throw new CopilotApiError(
        409,
        'PERSISTENCE_FAILED',
        `Invalid persisted Copilot dossier projection (${state})`
      );
    }
    const actor = createActor(copilotDossierMachine, {
      input: { userId: dossier.userId, missionId: dossier.missionId },
      snapshot,
    });
    actor.start();
    return actor;
  }

  private async recordProviderResult(
    principal: CopilotPrincipal,
    dossier: StoredCopilotDossier,
    job: StoredCopilotJob,
    actor: ActorRefFrom<typeof remoteCopilotJobMachine>,
    providerResult: CopilotProviderStartResult,
    machineProviderRunId: string,
    expectedSessionId: string | null
  ): Promise<{ job: StoredCopilotJob; creditsRemaining: number | null }> {
    const providerSession = {
      userId: principal.userId,
      dossierId: dossier.id,
      sessionId: providerResult.sessionId,
      continuationToken: providerResult.continuationToken,
      activeJobId: job.id,
      activeProviderRunId: providerResult.providerRunId,
      continuationEligible: false,
      deletionDisposition: 'pending' as const,
    };

    if (expectedSessionId !== null && providerResult.sessionId !== expectedSessionId) {
      // Keep every returned handle as a deletion obligation, but fail closed:
      // provider-side session rotation would break accepted-only continuation.
      await this.recordProviderSessionWithRecovery(providerSession);
      return this.settleExecutionFailure(principal, dossier, job, actor, INVALID_RESULT_FAILURE);
    }

    actor.send({
      type: providerResult.status === 'running' ? 'PROVIDER_STARTED' : 'PROVIDER_COMPLETED',
      jobId: job.id,
      userId: principal.userId,
      attemptId: job.attemptId,
      providerRunId: machineProviderRunId,
    });
    if (providerResult.status === 'running') {
      expectState(stateValue(actor), 'running');
      await this.recordProviderSessionWithRecovery(providerSession);
      const running = await this.dependencies.repository.updateJob(
        principal.userId,
        job.id,
        { state: 'running' },
        ['running']
      );
      return { job: running, creditsRemaining: null };
    }
    expectState(stateValue(actor), 'validating');

    if (
      !isReviewableCopilotResult(
        providerResult.result,
        job.operationKind,
        job.suppliedEvidenceIds,
        copilotTjmFactIds(job.tjmFacts),
        { payload: job.payload, tjmFacts: job.tjmFacts }
      )
    ) {
      await this.recordProviderSessionWithRecovery(providerSession);
      actor.send({
        type: 'RESULT_INVALID',
        jobId: job.id,
        userId: principal.userId,
        attemptId: job.attemptId,
        failure: INVALID_RESULT_FAILURE,
      });
      return this.settleExecutionFailure(
        principal,
        dossier,
        job,
        actor,
        INVALID_RESULT_FAILURE,
        true
      );
    }

    actor.send({
      type: 'RESULT_VALIDATED',
      jobId: job.id,
      userId: principal.userId,
      attemptId: job.attemptId,
      result: providerResult.result,
    });
    expectState(stateValue(actor), 'review');
    const dossierActor = this.hydrateDossierActor(dossier, {
      state: 'processing',
      job,
      session: providerSession,
      providerMayExist: true,
    });
    dossierActor.send({
      type: 'JOB_REVIEW_READY',
      userId: dossier.userId,
      missionId: dossier.missionId,
      jobId: job.id,
      sessionId: providerSession.sessionId,
      continuationToken: providerSession.continuationToken,
      result: providerResult.result,
      suppliedEvidenceIds: job.suppliedEvidenceIds,
      suppliedTjmFactIds: copilotTjmFactIds(job.tjmFacts),
      grounding: { payload: job.payload, tjmFacts: job.tjmFacts },
    });
    expectState(String(dossierActor.getSnapshot().value), 'reviewing');
    dossierActor.stop();
    const reviewed = await this.dependencies.repository.stageReview(
      principal.userId,
      dossier.id,
      job.id,
      providerResult.result,
      providerSession
    );
    return { job: reviewed, creditsRemaining: null };
  }

  private async recordProviderSessionWithRecovery(
    session: CopilotProviderSessionRecord
  ): Promise<void> {
    try {
      await this.dependencies.repository.upsertProviderSession(session);
    } catch (error) {
      const durable = session.activeJobId
        ? await this.dependencies.repository
            .getProviderSession(session.userId, session.dossierId, session.activeJobId)
            .catch(() => null)
        : null;
      if (
        durable?.sessionId === session.sessionId &&
        durable.activeJobId === session.activeJobId &&
        durable.activeProviderRunId === session.activeProviderRunId &&
        durable.continuationToken === session.continuationToken &&
        durable.continuationEligible === false &&
        durable.deletionDisposition === 'pending'
      ) {
        return;
      }
      throw error;
    }
  }

  private async settleJobWithoutCreditWithRecovery(input: {
    userId: string;
    dossierId: string;
    jobId: string;
    terminalState: 'failed' | 'cancelled';
    failure: StoredCopilotJob['failure'];
  }): Promise<StoredCopilotJob> {
    try {
      return await this.dependencies.repository.settleJobWithoutCredit(input);
    } catch (error) {
      const [job, dossier] = await Promise.all([
        this.dependencies.repository.getJob(input.userId, input.jobId).catch(() => null),
        this.dependencies.repository.getDossier(input.userId, input.dossierId).catch(() => null),
      ]);
      if (
        job?.state === input.terminalState &&
        dossier?.state === 'ready' &&
        dossier.activeJobId === null
      ) {
        return job;
      }
      throw error;
    }
  }

  private async settleExecutionFailure(
    principal: CopilotPrincipal,
    dossier: StoredCopilotDossier,
    job: StoredCopilotJob,
    actor: ActorRefFrom<typeof remoteCopilotJobMachine>,
    failure: RemoteCopilotFailure,
    machineAlreadyTransitioned = false
  ): Promise<{ job: StoredCopilotJob; creditsRemaining: number | null }> {
    if (!machineAlreadyTransitioned) {
      actor.send({
        type: 'PROVIDER_FAILED',
        jobId: job.id,
        userId: principal.userId,
        attemptId: job.attemptId,
        providerRunId: null,
        failure,
      });
    }

    if (job.creditCost === 1 && job.reservationStatus === 'reserved') {
      expectState(stateValue(actor), 'refunding');
      this.assertDossierJobFailureTransition(dossier, job, failure.message);
      await this.dependencies.repository.updateJob(
        principal.userId,
        job.id,
        {
          state: 'refunding',
          failure: publicFailure(failure),
          settlement: 'failure',
        },
        ['running']
      );
      let refund;
      try {
        refund = await this.dependencies.repository.refundCredit(
          principal.userId,
          job.id,
          job.billingKey,
          'failed'
        );
      } catch {
        const reconciled = await this.reconcileCommittedRefund(principal.userId, job, 'failed');
        if (reconciled) {
          return { job: reconciled.job, creditsRemaining: reconciled.balance };
        }
        actor.send({
          type: 'CREDIT_REFUND_UNCERTAIN',
          jobId: job.id,
          userId: principal.userId,
          attemptId: job.attemptId,
          idempotencyKey: job.idempotencyKey,
        });
        await this.dependencies.repository.updateJob(
          principal.userId,
          job.id,
          {
            state: 'uncertain',
            failure: {
              code: 'REFUND_FAILED',
              message: 'Credit refund requires reconciliation',
              retryable: true,
            },
            refundStatus: 'pending',
            uncertainPhase: 'refund',
          },
          ['refunding']
        );
        throw new CopilotApiError(503, 'PERSISTENCE_FAILED', 'Credit refund is uncertain', true);
      }
      const failed = await this.dependencies.repository.getJob(principal.userId, job.id);
      if (
        !failed ||
        failed.state !== 'failed' ||
        failed.refundStatus !== 'refunded' ||
        failed.refundTransactionId !== refund.transactionId
      ) {
        throw new CopilotApiError(500, 'PERSISTENCE_FAILED', 'Refund did not settle the job');
      }
      return { job: failed, creditsRemaining: refund.balance };
    } else {
      expectState(stateValue(actor), 'failed');
      this.assertDossierJobFailureTransition(dossier, job, failure.message);
      const failed = await this.settleJobWithoutCreditWithRecovery({
        userId: principal.userId,
        dossierId: dossier.id,
        jobId: job.id,
        terminalState: 'failed',
        failure: publicFailure(failure),
      });
      return { job: failed, creditsRemaining: null };
    }
  }

  private async reconcileCommittedRefund(
    userId: string,
    original: StoredCopilotJob,
    terminalState: 'failed' | 'cancelled'
  ): Promise<{ job: StoredCopilotJob; balance: number } | null> {
    const durable = await this.dependencies.repository
      .getJob(userId, original.id)
      .catch(() => null);
    if (
      !durable ||
      durable.state !== terminalState ||
      durable.refundStatus !== 'refunded' ||
      durable.refundTransactionId === null
    ) {
      return null;
    }
    return {
      job: durable,
      balance: await this.dependencies.repository.getCreditBalance(userId),
    };
  }
}
