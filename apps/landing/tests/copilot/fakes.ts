import {
  canonicalizeCopilotConsentSelection,
  isValidCopilotConsentSelection,
  unionCopilotConsentSelections,
  type CopilotConsentSelection,
  type CopilotValidatedResult,
  type RemoteCopilotJobStateValue,
} from '@pulse/domain';

import { CopilotApiError } from '../../src/lib/server/copilot/errors';
import type {
  CopilotProvider,
  CopilotProviderCancelRequest,
  CopilotProviderCancelResult,
  CopilotProviderDeleteSessionRequest,
  CopilotProviderDeleteSessionResult,
  CopilotProviderStartRequest,
  CopilotProviderStartResult,
} from '../../src/lib/server/copilot/provider-port';
import type {
  CopilotCreditMutation,
  CopilotJobPatch,
  CopilotProviderSessionRecord,
  CopilotRepository,
  CreateStoredJobResult,
  NewCopilotJobRecord,
} from '../../src/lib/server/copilot/repository-port';
import type {
  CreateCopilotDossierInput,
  StoredCopilotDossier,
  StoredCopilotJob,
} from '../../src/lib/server/copilot/types';

type ProviderStep = (
  request: CopilotProviderStartRequest
) => Promise<CopilotProviderStartResult> | CopilotProviderStartResult;
type ProviderDeletionStep = (
  request: CopilotProviderDeleteSessionRequest
) => Promise<CopilotProviderDeleteSessionResult> | CopilotProviderDeleteSessionResult;

const ACTIVE_JOB_STATES = new Set<RemoteCopilotJobStateValue>([
  'idle',
  'authorizing',
  'reserving',
  'queued',
  'running',
  'validating',
  'review',
  'cancelling',
  'refunding',
  'uncertain',
]);

function scopedKey(userId: string, value: string): string {
  return `${userId}:${value}`;
}

function cloneConsent(selection: CopilotConsentSelection): CopilotConsentSelection {
  return {
    missionFields: [...selection.missionFields],
    profileFields: [...selection.profileFields],
    evidenceIds: [...selection.evidenceIds],
  };
}

export class InMemoryCopilotRepository implements CopilotRepository {
  readonly dossiers = new Map<string, StoredCopilotDossier>();
  readonly jobs = new Map<string, StoredCopilotJob>();
  readonly sessions = new Map<string, CopilotProviderSessionRecord>();
  readonly balances = new Map<string, number>();
  readonly activeEntitlements = new Map<string, boolean>();
  readonly reservationLedger = new Map<string, { id: string; userId: string; jobId: string }>();
  readonly refundLedger = new Map<string, { id: string; userId: string; jobId: string }>();
  readonly dailyAdmissions = new Map<string, { total: number; analyses: number }>();
  readonly deletedReceipts = new Map<string, { inputHash: string }>();

  reserveMutations = 0;
  refundMutations = 0;
  loseNextProviderSessionResponse = false;
  loseNextNoCreditSettlementResponse = false;
  failNextDeleteWithoutMutation = false;
  loseNextDeleteResponse = false;

  #dossierSequence = 0;
  #ledgerSequence = 0;
  #timeSequence = 0;

  constructor(users: Record<string, { balance: number; active?: boolean }>) {
    for (const [userId, user] of Object.entries(users)) {
      this.balances.set(userId, user.balance);
      this.activeEntitlements.set(userId, user.active ?? true);
    }
  }

  async getCreditBalance(userId: string): Promise<number> {
    return this.balances.get(userId) ?? 0;
  }

  async createDossier(
    userId: string,
    input: CreateCopilotDossierInput,
    confirmedAtMs: number
  ): Promise<StoredCopilotDossier> {
    const existing = [...this.dossiers.values()].find(
      (dossier) => dossier.userId === userId && dossier.missionId === input.missionId
    );
    if (existing) {
      if (existing.state !== 'ready') {
        throw new CopilotApiError(409, 'DOSSIER_BUSY', 'Dossier is not ready');
      }
      const cumulative = canonicalizeCopilotConsentSelection(
        unionCopilotConsentSelections(existing.consent, input.consent)
      );
      if (!isValidCopilotConsentSelection(cumulative)) {
        throw new CopilotApiError(409, 'DOSSIER_BUSY', 'Cumulative consent exceeds its limits');
      }
      existing.consent = {
        ...cloneConsent(cumulative),
        confirmedAtMs: Math.max(existing.consent.confirmedAtMs, confirmedAtMs),
      };
      return existing;
    }

    const canonical = canonicalizeCopilotConsentSelection(input.consent);
    const dossier: StoredCopilotDossier = {
      id: `dossier-${++this.#dossierSequence}`,
      userId,
      missionId: input.missionId,
      state: 'ready',
      activeJobId: null,
      consent: { ...cloneConsent(canonical), confirmedAtMs },
      analysis: null,
      approvedArtifacts: [],
      deletionRequestedAt: null,
    };
    this.dossiers.set(dossier.id, dossier);
    return dossier;
  }

  async getDossier(userId: string, dossierId: string): Promise<StoredCopilotDossier | null> {
    const dossier = this.dossiers.get(dossierId);
    return dossier?.userId === userId ? dossier : null;
  }

  async getDossierByMission(
    userId: string,
    missionId: string
  ): Promise<StoredCopilotDossier | null> {
    return (
      [...this.dossiers.values()].find(
        (dossier) => dossier.userId === userId && dossier.missionId === missionId
      ) ?? null
    );
  }

  async findJobByIdempotency(
    userId: string,
    idempotencyKey: string
  ): Promise<StoredCopilotJob | null> {
    return (
      [...this.jobs.values()].find(
        (job) => job.userId === userId && job.idempotencyKey === idempotencyKey
      ) ?? null
    );
  }

  async assertJobReplayAllowed(
    userId: string,
    idempotencyKey: string,
    inputHash: string
  ): Promise<void> {
    const receipt = this.deletedReceipts.get(scopedKey(userId, idempotencyKey));
    if (!receipt) return;
    if (receipt.inputHash !== inputHash) {
      throw new CopilotApiError(409, 'INVALID_REQUEST', 'Idempotency key conflicts');
    }
    throw new CopilotApiError(410, 'JOB_GONE', 'Copilot job was deleted');
  }

  async createJob(record: NewCopilotJobRecord): Promise<CreateStoredJobResult> {
    const receipt = this.deletedReceipts.get(scopedKey(record.userId, record.idempotencyKey));
    if (receipt) {
      if (receipt.inputHash !== record.inputHash) {
        throw new CopilotApiError(409, 'INVALID_REQUEST', 'Idempotency key conflicts');
      }
      throw new CopilotApiError(410, 'JOB_GONE', 'Copilot job was deleted');
    }
    const duplicate = await this.findJobByIdempotency(record.userId, record.idempotencyKey);
    if (duplicate) {
      if (
        duplicate.inputHash !== record.inputHash ||
        duplicate.dossierId !== record.dossierId ||
        duplicate.operationKind !== record.operationKind
      ) {
        throw new CopilotApiError(409, 'INVALID_REQUEST', 'Idempotency key conflicts');
      }
      return { disposition: 'duplicate', job: duplicate };
    }
    const dossier = await this.getDossier(record.userId, record.dossierId);
    if (!dossier) throw new CopilotApiError(404, 'DOSSIER_NOT_FOUND', 'Dossier not found');
    if (dossier.state !== 'ready' || dossier.activeJobId !== null) {
      throw new CopilotApiError(409, 'DOSSIER_BUSY', 'Dossier is not ready');
    }
    const admission = this.dailyAdmissions.get(record.userId) ?? { total: 0, analyses: 0 };
    if (
      admission.total >= 20 ||
      (record.operationKind === 'analysis' && admission.analyses >= 10)
    ) {
      throw new CopilotApiError(429, 'RATE_LIMITED', 'Daily Copilot pilot quota reached');
    }
    this.dailyAdmissions.set(record.userId, {
      total: admission.total + 1,
      analyses: admission.analyses + (record.operationKind === 'analysis' ? 1 : 0),
    });
    const stamp = this.#stamp();
    const job: StoredCopilotJob = {
      id: record.id,
      userId: record.userId,
      dossierId: record.dossierId,
      missionId: record.missionId,
      attemptId: record.attemptId,
      idempotencyKey: record.idempotencyKey,
      billingKey: record.billingKey,
      inputHash: record.inputHash,
      operationKind: record.operationKind,
      state: record.state,
      creditCost: record.creditCost,
      suppliedEvidenceIds: [...record.suppliedEvidenceIds],
      consent: cloneConsent(record.consent),
      payload: record.payload,
      tjmFacts: record.tjmFacts,
      result: null,
      failure: null,
      reservationStatus: record.creditCost === 0 ? 'not-required' : 'required',
      reservationTransactionId: null,
      refundStatus: 'not-required',
      refundTransactionId: null,
      settlement: null,
      uncertainPhase: null,
      providerDispatchedAt: null,
      providerDispositionKnown: false,
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.jobs.set(job.id, job);
    dossier.state = 'processing';
    dossier.activeJobId = job.id;
    return { disposition: 'created', job };
  }

  async getJob(userId: string, jobId: string): Promise<StoredCopilotJob | null> {
    const job = this.jobs.get(jobId);
    return job?.userId === userId ? job : null;
  }

  async updateJob(
    userId: string,
    jobId: string,
    patch: CopilotJobPatch,
    expectedStates?: readonly RemoteCopilotJobStateValue[]
  ): Promise<StoredCopilotJob> {
    const job = await this.#requireJob(userId, jobId);
    if (expectedStates && !expectedStates.includes(job.state)) {
      throw new CopilotApiError(409, 'PERSISTENCE_FAILED', 'Unexpected persisted job state');
    }
    if (patch.state !== undefined) job.state = patch.state;
    if ('result' in patch) job.result = patch.result ?? null;
    if ('failure' in patch) job.failure = patch.failure ?? null;
    if (patch.reservationStatus !== undefined) job.reservationStatus = patch.reservationStatus;
    if ('reservationTransactionId' in patch) {
      job.reservationTransactionId = patch.reservationTransactionId ?? null;
    }
    if (patch.refundStatus !== undefined) job.refundStatus = patch.refundStatus;
    if ('refundTransactionId' in patch) {
      job.refundTransactionId = patch.refundTransactionId ?? null;
    }
    if ('settlement' in patch) job.settlement = patch.settlement ?? null;
    if ('uncertainPhase' in patch) job.uncertainPhase = patch.uncertainPhase ?? null;
    if ('providerDispatchedAt' in patch) {
      job.providerDispatchedAt = patch.providerDispatchedAt ?? null;
    }
    job.updatedAt = this.#stamp();
    return job;
  }

  async stageReview(
    userId: string,
    dossierId: string,
    jobId: string,
    result: CopilotValidatedResult,
    session: CopilotProviderSessionRecord
  ): Promise<StoredCopilotJob> {
    const dossier = await this.#requireDossier(userId, dossierId);
    const job = await this.#requireJob(userId, jobId);
    if (
      job.dossierId !== dossierId ||
      job.state !== 'running' ||
      dossier.state !== 'processing' ||
      dossier.activeJobId !== jobId ||
      session.activeJobId !== jobId
    ) {
      throw new CopilotApiError(409, 'PERSISTENCE_FAILED', 'Review cannot be staged');
    }
    await this.upsertProviderSession(session);
    job.state = 'review';
    job.result = result;
    job.failure = null;
    job.uncertainPhase = null;
    job.updatedAt = this.#stamp();
    dossier.state = 'reviewing';
    return job;
  }

  async reserveCredit(
    userId: string,
    jobId: string,
    billingKey: string
  ): Promise<CopilotCreditMutation> {
    const job = await this.#requireJob(userId, jobId);
    const ledgerKey = scopedKey(userId, billingKey);
    const existing = this.reservationLedger.get(ledgerKey);
    if (existing) {
      return {
        status: 'reserved',
        transactionId: existing.id,
        balance: await this.getCreditBalance(userId),
      };
    }
    if (!this.activeEntitlements.get(userId)) throw new Error('COPILOT_ENTITLEMENT_DENIED');
    if (job.creditCost === 0) {
      job.state = 'queued';
      job.reservationStatus = 'not-required';
      job.refundStatus = 'not-required';
      return {
        status: 'not-required',
        transactionId: null,
        balance: await this.getCreditBalance(userId),
      };
    }
    const balance = await this.getCreditBalance(userId);
    if (balance < job.creditCost) throw new Error('COPILOT_INSUFFICIENT_CREDITS');
    const transactionId = `reservation-${++this.#ledgerSequence}`;
    this.balances.set(userId, balance - job.creditCost);
    this.reservationLedger.set(ledgerKey, { id: transactionId, userId, jobId });
    this.reserveMutations += 1;
    job.state = 'queued';
    job.reservationStatus = 'reserved';
    job.reservationTransactionId = transactionId;
    job.refundStatus = 'pending';
    return {
      status: 'reserved',
      transactionId,
      balance: await this.getCreditBalance(userId),
    };
  }

  async refundCredit(
    userId: string,
    jobId: string,
    billingKey: string,
    terminalState: 'failed' | 'cancelled'
  ): Promise<CopilotCreditMutation> {
    const job = await this.#requireJob(userId, jobId);
    const dossier = await this.#requireDossier(userId, job.dossierId);
    const ledgerKey = scopedKey(userId, billingKey);
    const existing = this.refundLedger.get(ledgerKey);
    if (existing) {
      return {
        status: 'refunded',
        transactionId: existing.id,
        balance: await this.getCreditBalance(userId),
      };
    }
    if (!this.reservationLedger.has(ledgerKey) || job.reservationStatus !== 'reserved') {
      throw new Error('COPILOT_REFUND_NOT_ALLOWED');
    }
    if (
      job.state !== 'refunding' ||
      dossier.state !== 'processing' ||
      dossier.activeJobId !== job.id
    ) {
      throw new Error('COPILOT_REFUND_NOT_ALLOWED');
    }
    const transactionId = `refund-${++this.#ledgerSequence}`;
    this.balances.set(userId, (await this.getCreditBalance(userId)) + job.creditCost);
    this.refundLedger.set(ledgerKey, { id: transactionId, userId, jobId });
    this.refundMutations += 1;
    job.state = terminalState;
    job.refundStatus = 'refunded';
    job.refundTransactionId = transactionId;
    job.updatedAt = this.#stamp();
    dossier.state = 'ready';
    dossier.activeJobId = null;
    return {
      status: 'refunded',
      transactionId,
      balance: await this.getCreditBalance(userId),
    };
  }

  async getProviderSession(
    userId: string,
    dossierId: string,
    activeJobId?: string
  ): Promise<CopilotProviderSessionRecord | null> {
    return (
      [...this.sessions.values()]
        .reverse()
        .find(
          (session) =>
            session.userId === userId &&
            session.dossierId === dossierId &&
            (activeJobId === undefined || session.activeJobId === activeJobId)
        ) ?? null
    );
  }

  async claimReusableProviderSession(
    userId: string,
    dossierId: string,
    activeJobId: string
  ): Promise<CopilotProviderSessionRecord | null> {
    const dossier = await this.#requireDossier(userId, dossierId);
    const job = await this.#requireJob(userId, activeJobId);
    if (
      job.dossierId !== dossierId ||
      job.state !== 'queued' ||
      dossier.state !== 'processing' ||
      dossier.activeJobId !== activeJobId
    ) {
      throw new CopilotApiError(409, 'PERSISTENCE_FAILED', 'Continuation claim is not allowed');
    }
    const session = [...this.sessions.values()].find(
      (candidate) =>
        candidate.userId === userId &&
        candidate.dossierId === dossierId &&
        candidate.continuationEligible
    );
    if (!session) return null;
    session.continuationEligible = false;
    session.activeJobId = activeJobId;
    session.activeProviderRunId = null;
    return session;
  }

  async listProviderSessions(
    userId: string,
    dossierId: string
  ): Promise<CopilotProviderSessionRecord[]> {
    return [...this.sessions.values()].filter(
      (session) => session.userId === userId && session.dossierId === dossierId
    );
  }

  async beginProviderSessionDeletion(
    userId: string,
    dossierId: string,
    sessionId: string
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (
      !session ||
      session.userId !== userId ||
      session.dossierId !== dossierId ||
      session.deletionDisposition !== 'pending'
    ) {
      return false;
    }
    session.deletionDisposition = 'uncertain';
    return true;
  }

  async confirmProviderSessionDeletion(
    userId: string,
    dossierId: string,
    sessionId: string,
    disposition: 'deleted' | 'retention-confirmed'
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (
      !session ||
      session.userId !== userId ||
      session.dossierId !== dossierId ||
      session.deletionDisposition !== 'uncertain'
    ) {
      throw new CopilotApiError(409, 'DELETE_FAILED', 'Deletion disposition conflict');
    }
    session.deletionDisposition = disposition;
  }

  async upsertProviderSession(session: CopilotProviderSessionRecord): Promise<void> {
    if (!session.activeJobId || !session.activeProviderRunId || session.continuationEligible) {
      throw new CopilotApiError(409, 'PERSISTENCE_FAILED', 'Provider session is not recordable');
    }
    const dossier = await this.#requireDossier(session.userId, session.dossierId);
    const job = await this.#requireJob(session.userId, session.activeJobId);
    if (
      job.dossierId !== session.dossierId ||
      job.state !== 'running' ||
      dossier.state !== 'processing' ||
      dossier.activeJobId !== session.activeJobId
    ) {
      throw new CopilotApiError(409, 'PERSISTENCE_FAILED', 'Provider session correlation conflict');
    }
    const existing = this.sessions.get(session.sessionId);
    if (
      existing &&
      (existing.userId !== session.userId ||
        existing.dossierId !== session.dossierId ||
        existing.activeJobId !== session.activeJobId)
    ) {
      throw new CopilotApiError(409, 'PERSISTENCE_FAILED', 'Provider session ownership conflict');
    }
    this.sessions.set(session.sessionId, {
      ...session,
      deletionDisposition: existing?.deletionDisposition ?? 'pending',
    });
    job.providerDispositionKnown = true;
    if (this.loseNextProviderSessionResponse) {
      this.loseNextProviderSessionResponse = false;
      throw new Error('PROVIDER_SESSION_RESPONSE_LOST');
    }
  }

  async settleJobWithoutCredit(input: {
    userId: string;
    dossierId: string;
    jobId: string;
    terminalState: 'failed' | 'cancelled';
    failure: StoredCopilotJob['failure'];
  }): Promise<StoredCopilotJob> {
    const job = await this.#requireJob(input.userId, input.jobId);
    const dossier = await this.#requireDossier(input.userId, input.dossierId);
    if (
      job.dossierId !== input.dossierId ||
      job.reservationStatus === 'reserved' ||
      job.reservationTransactionId !== null
    ) {
      throw new CopilotApiError(409, 'PERSISTENCE_FAILED', 'No-credit settlement is not allowed');
    }
    if (job.state === input.terminalState) {
      if (dossier.state === 'ready' && dossier.activeJobId === null) return job;
      if (dossier.state !== 'processing' || dossier.activeJobId !== job.id) {
        throw new CopilotApiError(409, 'PERSISTENCE_FAILED', 'Stale terminal settlement');
      }
    } else if (
      (input.terminalState === 'failed' &&
        !['reserving', 'queued', 'running'].includes(job.state)) ||
      (input.terminalState === 'cancelled' && job.state !== 'cancelling') ||
      dossier.state !== 'processing' ||
      dossier.activeJobId !== job.id
    ) {
      throw new CopilotApiError(409, 'PERSISTENCE_FAILED', 'No-credit settlement is not allowed');
    }
    job.state = input.terminalState;
    job.failure = input.terminalState === 'failed' ? input.failure : null;
    job.refundStatus = 'not-required';
    job.settlement = null;
    job.uncertainPhase = null;
    job.updatedAt = this.#stamp();
    dossier.state = 'ready';
    dossier.activeJobId = null;
    if (this.loseNextNoCreditSettlementResponse) {
      this.loseNextNoCreditSettlementResponse = false;
      throw new Error('NO_CREDIT_SETTLEMENT_RESPONSE_LOST');
    }
    return job;
  }

  async completeReview(input: {
    userId: string;
    dossierId: string;
    jobId: string;
    decision: 'accept' | 'reject';
    artifactId: string | null;
    renderedDraft: string | null;
    reviewedAt: string;
  }): Promise<StoredCopilotJob> {
    const job = await this.#requireJob(input.userId, input.jobId);
    const dossier = await this.#requireDossier(input.userId, input.dossierId);
    const terminalState = input.decision === 'accept' ? 'accepted' : 'rejected';
    if (job.state === terminalState) return job;
    if (
      job.state !== 'review' ||
      job.result === null ||
      dossier.state !== 'reviewing' ||
      dossier.activeJobId !== job.id
    ) {
      throw new CopilotApiError(409, 'REVIEW_NOT_ALLOWED', 'Job is not reviewable');
    }
    job.state = terminalState;
    job.updatedAt = this.#stamp();
    dossier.state = 'ready';
    dossier.activeJobId = null;
    if (input.decision === 'accept' && job.operationKind === 'analysis') {
      dossier.analysis = {
        jobId: job.id,
        result: job.result as CopilotValidatedResult & { kind: 'analysis' },
        approvedAtMs: Date.parse(input.reviewedAt),
      };
    }
    if (
      input.decision === 'accept' &&
      job.operationKind !== 'analysis' &&
      input.artifactId &&
      input.renderedDraft
    ) {
      dossier.approvedArtifacts = [
        ...dossier.approvedArtifacts,
        {
          artifactId: input.artifactId,
          jobId: job.id,
          kind: job.operationKind,
          draft: input.renderedDraft,
          approvedAtMs: Date.parse(input.reviewedAt),
        },
      ];
    }
    for (const session of this.sessions.values()) {
      if (session.userId === input.userId && session.dossierId === input.dossierId) {
        session.continuationEligible =
          input.decision === 'accept' && session.activeJobId === input.jobId;
      }
    }
    return job;
  }

  async markDossierDeleting(
    userId: string,
    dossierId: string,
    _requestedAt: string
  ): Promise<void> {
    const dossier = await this.#requireDossier(userId, dossierId);
    if (
      (dossier.state !== 'ready' && dossier.state !== 'deletionFailed') ||
      dossier.activeJobId !== null
    ) {
      throw new CopilotApiError(409, 'DELETE_FAILED', 'Dossier is not deletable');
    }
    const blocksDeletion = [...this.jobs.values()].some(
      (job) =>
        job.userId === userId &&
        job.dossierId === dossierId &&
        (ACTIVE_JOB_STATES.has(job.state) ||
          ((job.state === 'failed' || job.state === 'cancelled') &&
            job.creditCost === 1 &&
            job.reservationStatus === 'reserved' &&
            job.refundStatus !== 'refunded'))
    );
    if (blocksDeletion) {
      throw new CopilotApiError(409, 'DELETE_FAILED', 'A job still blocks deletion');
    }
    this.dossiers.set(dossierId, {
      ...dossier,
      state: 'deleting',
      deletionRequestedAt: _requestedAt,
    });
  }

  async markDossierDeletionFailed(userId: string, dossierId: string): Promise<void> {
    const dossier = await this.#requireDossier(userId, dossierId);
    if (dossier.state === 'deleting') {
      this.dossiers.set(dossierId, { ...dossier, state: 'deletionFailed' });
    }
  }

  async deleteDossier(userId: string, dossierId: string): Promise<boolean> {
    if (this.failNextDeleteWithoutMutation) {
      this.failNextDeleteWithoutMutation = false;
      return false;
    }
    const dossier = await this.#requireDossier(userId, dossierId);
    if (dossier.state !== 'deleting' || dossier.activeJobId !== null) {
      return false;
    }
    const sessions = await this.listProviderSessions(userId, dossierId);
    if (
      sessions.some(
        (session) =>
          session.deletionDisposition !== 'deleted' &&
          session.deletionDisposition !== 'retention-confirmed'
      ) ||
      (await this.hasUnresolvedProviderDisposition(userId, dossierId))
    ) {
      return false;
    }
    for (const [sessionId, session] of this.sessions) {
      if (session.userId === userId && session.dossierId === dossierId) {
        this.sessions.delete(sessionId);
      }
    }
    for (const [jobId, job] of this.jobs) {
      if (job.userId === userId && job.dossierId === dossierId) {
        this.deletedReceipts.set(scopedKey(userId, job.idempotencyKey), {
          inputHash: job.inputHash,
        });
        this.jobs.delete(jobId);
      }
    }
    this.dossiers.delete(dossierId);
    if (this.loseNextDeleteResponse) {
      this.loseNextDeleteResponse = false;
      throw new Error('DELETE_RESPONSE_LOST');
    }
    return true;
  }

  async hasUnresolvedProviderDisposition(userId: string, dossierId: string): Promise<boolean> {
    return [...this.jobs.values()].some(
      (job) =>
        job.userId === userId &&
        job.dossierId === dossierId &&
        job.providerDispatchedAt !== null &&
        !job.providerDispositionKnown
    );
  }

  async hasActiveOrReservedJob(userId: string, dossierId: string): Promise<boolean> {
    return [...this.jobs.values()].some(
      (job) =>
        job.userId === userId &&
        job.dossierId === dossierId &&
        (ACTIVE_JOB_STATES.has(job.state) ||
          ((job.state === 'failed' || job.state === 'cancelled') &&
            job.reservationStatus === 'reserved' &&
            job.refundStatus !== 'refunded'))
    );
  }

  async #requireDossier(userId: string, dossierId: string): Promise<StoredCopilotDossier> {
    const dossier = await this.getDossier(userId, dossierId);
    if (!dossier) throw new CopilotApiError(404, 'DOSSIER_NOT_FOUND', 'Dossier not found');
    return dossier;
  }

  async #requireJob(userId: string, jobId: string): Promise<StoredCopilotJob> {
    const job = await this.getJob(userId, jobId);
    if (!job) throw new CopilotApiError(404, 'JOB_NOT_FOUND', 'Job not found');
    return job;
  }

  #stamp(): string {
    return new Date(Date.UTC(2026, 6, 21, 12, 0, this.#timeSequence++)).toISOString();
  }
}

export class ScriptedCopilotProvider implements CopilotProvider {
  readonly starts: CopilotProviderStartRequest[] = [];
  readonly cancellations: CopilotProviderCancelRequest[] = [];
  readonly deletions: CopilotProviderDeleteSessionRequest[] = [];
  readonly #steps: ProviderStep[] = [];
  readonly #deletionSteps: ProviderDeletionStep[] = [];

  enqueue(step: ProviderStep): void {
    this.#steps.push(step);
  }

  enqueueResult(result: CopilotProviderStartResult): void {
    this.enqueue(() => result);
  }

  enqueueError(error: unknown): void {
    this.enqueue(() => Promise.reject(error));
  }

  enqueueDeletionResult(result: CopilotProviderDeleteSessionResult): void {
    this.#deletionSteps.push(() => result);
  }

  enqueueDeletionError(error: unknown): void {
    this.#deletionSteps.push(() => Promise.reject(error));
  }

  async start(request: CopilotProviderStartRequest): Promise<CopilotProviderStartResult> {
    this.starts.push(request);
    const step = this.#steps.shift();
    if (!step) throw new Error('No scripted provider result');
    return step(request);
  }

  async cancel(request: CopilotProviderCancelRequest): Promise<CopilotProviderCancelResult> {
    this.cancellations.push(request);
    return { status: 'cancelled', continuationToken: null };
  }

  async deleteSession(
    request: CopilotProviderDeleteSessionRequest
  ): Promise<CopilotProviderDeleteSessionResult> {
    this.deletions.push(request);
    const step = this.#deletionSteps.shift();
    return step ? step(request) : { disposition: 'deleted' };
  }
}

export function withoutProviderDeletion(provider: ScriptedCopilotProvider): CopilotProvider {
  return {
    start: (request) => provider.start(request),
    cancel: (request) => provider.cancel(request),
  };
}
