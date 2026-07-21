import {
  COPILOT_DOSSIER_STATES,
  MAX_COPILOT_APPROVED_ARTIFACTS,
  COPILOT_OPERATION_KINDS,
  REMOTE_COPILOT_FAILURE_CODES,
  REMOTE_COPILOT_JOB_STATES,
  canonicalizeCopilotConsentSelection,
  copilotTjmFactIds,
  isCopilotConsentSubset,
  isCopilotTransmissionAllowed,
  isReviewableCopilotResult,
  isCopilotTjmCoachFacts,
  isValidCopilotConsentSelection,
  unionCopilotConsentSelections,
  type ConfirmedCopilotConsent,
  type ApprovedCopilotArtifact,
  type CopilotConsentSelection,
  type CopilotDossierStateValue,
  type CopilotMissionField,
  type CopilotOperationKind,
  type CopilotProfileField,
  type RemoteCopilotFailureCode,
  type RemoteCopilotJobStateValue,
} from '@pulse/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

import { CopilotApiError } from './errors';
import type {
  CopilotCreditMutation,
  CopilotJobPatch,
  CopilotProviderSessionRecord,
  CopilotRepository,
  CreateStoredJobResult,
  NewCopilotJobRecord,
} from './repository-port';
import type { CreateCopilotDossierInput, StoredCopilotDossier, StoredCopilotJob } from './types';

type DbRecord = Record<string, unknown>;

function isRecord(value: unknown): value is DbRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(row: DbRecord, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') {
    throw new CopilotApiError(500, 'PERSISTENCE_FAILED', `Invalid persisted ${key}`);
  }
  return value;
}

function nullableStringField(row: DbRecord, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return stringField(row, key);
}

function booleanField(row: DbRecord, key: string): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') {
    throw new CopilotApiError(500, 'PERSISTENCE_FAILED', `Invalid persisted ${key}`);
  }
  return value;
}

function mapProviderSession(value: unknown): CopilotProviderSessionRecord {
  if (!isRecord(value)) databaseFailure(null);
  const deletionDisposition = stringField(value, 'deletion_disposition');
  if (!['pending', 'uncertain', 'deleted', 'retention-confirmed'].includes(deletionDisposition)) {
    databaseFailure(null);
  }
  return {
    userId: stringField(value, 'user_id'),
    dossierId: stringField(value, 'dossier_id'),
    sessionId: stringField(value, 'provider_session_id'),
    continuationToken: nullableStringField(value, 'continuation_token'),
    activeJobId: nullableStringField(value, 'active_job_id'),
    activeProviderRunId: nullableStringField(value, 'active_provider_run_id'),
    continuationEligible: booleanField(value, 'continuation_eligible'),
    deletionDisposition: deletionDisposition as CopilotProviderSessionRecord['deletionDisposition'],
  };
}

function databaseFailure(error: { message: string; code?: string } | null): never {
  const message = error?.message ?? 'Copilot persistence failed';
  if (message.includes('COPILOT_DOSSIER_NOT_FOUND')) {
    throw new CopilotApiError(404, 'DOSSIER_NOT_FOUND', 'Copilot dossier not found');
  }
  if (message.includes('COPILOT_DOSSIER_BUSY')) {
    throw new CopilotApiError(409, 'DOSSIER_BUSY', 'Copilot dossier is not ready');
  }
  if (message.includes('COPILOT_DOSSIER_ARTIFACT_LIMIT')) {
    throw new CopilotApiError(
      409,
      'INVALID_REQUEST',
      'Copilot dossier approved artifact limit reached'
    );
  }
  if (message.includes('COPILOT_RATE_LIMITED')) {
    throw new CopilotApiError(429, 'RATE_LIMITED', 'Daily Copilot pilot quota reached');
  }
  if (message.includes('COPILOT_JOB_GONE')) {
    throw new CopilotApiError(410, 'JOB_GONE', 'Copilot job was deleted');
  }
  if (message.includes('COPILOT_IDEMPOTENCY_CONFLICT')) {
    throw new CopilotApiError(
      409,
      'INVALID_REQUEST',
      'Idempotency key conflicts with another input'
    );
  }
  if (message.includes('COPILOT_CONSENT_LIMIT_EXCEEDED')) {
    throw new CopilotApiError(409, 'DOSSIER_BUSY', 'Cumulative Copilot consent exceeds its limits');
  }
  if (
    message.includes('COPILOT_TERMINAL_NOT_ALLOWED') ||
    message.includes('COPILOT_PROVIDER_SESSION_NOT_ALLOWED') ||
    message.includes('COPILOT_PROVIDER_SESSION_CONFLICT')
  ) {
    throw new CopilotApiError(409, 'PERSISTENCE_FAILED', 'Copilot transition conflict');
  }
  if (message.includes('COPILOT_DELETE_NOT_ALLOWED')) {
    throw new CopilotApiError(409, 'DELETE_FAILED', 'Copilot dossier has an unsettled job', true);
  }
  throw new Error(message);
}

function mapDossier(value: unknown): StoredCopilotDossier {
  if (!isRecord(value)) databaseFailure(null);
  const state = stringField(value, 'state');
  if (!(COPILOT_DOSSIER_STATES as readonly string[]).includes(state)) databaseFailure(null);
  const rawConsent = value.consent;
  if (!isRecord(rawConsent) || typeof rawConsent.confirmedAtMs !== 'number') databaseFailure(null);
  const consent: ConfirmedCopilotConsent = {
    missionFields: Array.isArray(rawConsent.missionFields)
      ? (rawConsent.missionFields.filter(
          (item): item is string => typeof item === 'string'
        ) as CopilotMissionField[])
      : [],
    profileFields: Array.isArray(rawConsent.profileFields)
      ? (rawConsent.profileFields.filter(
          (item): item is string => typeof item === 'string'
        ) as CopilotProfileField[])
      : [],
    evidenceIds: Array.isArray(rawConsent.evidenceIds)
      ? (rawConsent.evidenceIds as readonly string[])
      : [],
    confirmedAtMs: rawConsent.confirmedAtMs,
  };
  if (!isValidCopilotConsentSelection(consent)) databaseFailure(null);
  const rawAnalysis = value.analysis_result;
  let analysis: StoredCopilotDossier['analysis'] = null;
  if (rawAnalysis !== null && rawAnalysis !== undefined) {
    if (
      !isRecord(rawAnalysis) ||
      typeof rawAnalysis.jobId !== 'string' ||
      typeof rawAnalysis.approvedAtMs !== 'number' ||
      !isReviewableCopilotResult(rawAnalysis.result, 'analysis', consent.evidenceIds)
    ) {
      databaseFailure(null);
    }
    analysis = {
      jobId: rawAnalysis.jobId,
      result: rawAnalysis.result as import('@pulse/domain').CopilotValidatedResult & {
        kind: 'analysis';
      },
      approvedAtMs: rawAnalysis.approvedAtMs,
    };
  }
  if (
    !Array.isArray(value.approved_artifacts) ||
    value.approved_artifacts.length > MAX_COPILOT_APPROVED_ARTIFACTS
  ) {
    databaseFailure(null);
  }
  const approvedArtifacts = value.approved_artifacts.map((artifact): ApprovedCopilotArtifact => {
    if (
      !isRecord(artifact) ||
      typeof artifact.artifactId !== 'string' ||
      typeof artifact.jobId !== 'string' ||
      !['pitch', 'cover-message', 'cv-summary', 'tjm-coach'].includes(String(artifact.kind)) ||
      typeof artifact.draft !== 'string' ||
      artifact.draft.trim().length === 0 ||
      artifact.draft.length > 256_000 ||
      typeof artifact.approvedAtMs !== 'number'
    ) {
      databaseFailure(null);
    }
    return artifact as unknown as ApprovedCopilotArtifact;
  });

  return {
    id: stringField(value, 'id'),
    userId: stringField(value, 'user_id'),
    missionId: stringField(value, 'mission_id'),
    state: state as CopilotDossierStateValue,
    activeJobId: nullableStringField(value, 'active_job_id'),
    consent,
    analysis,
    approvedArtifacts,
    deletionRequestedAt: nullableStringField(value, 'deletion_requested_at'),
  };
}

function canonicalConsent(selection: CopilotConsentSelection): CopilotConsentSelection {
  return canonicalizeCopilotConsentSelection(selection);
}

function mapJob(value: unknown): StoredCopilotJob {
  if (!isRecord(value)) databaseFailure(null);
  const operationKind = stringField(value, 'operation_kind');
  const state = stringField(value, 'state');
  if (!(COPILOT_OPERATION_KINDS as readonly string[]).includes(operationKind))
    databaseFailure(null);
  if (!(REMOTE_COPILOT_JOB_STATES as readonly string[]).includes(state)) databaseFailure(null);
  const evidenceIds = Array.isArray(value.supplied_evidence_ids)
    ? value.supplied_evidence_ids.filter((item): item is string => typeof item === 'string')
    : [];
  const rawConsent = value.consent_selection;
  if (!isRecord(rawConsent) || !isValidCopilotConsentSelection(rawConsent as never)) {
    databaseFailure(null);
  }
  const consent = rawConsent as unknown as CopilotConsentSelection;
  const rawPayload = value.input_payload;
  if (!isCopilotTransmissionAllowed(rawPayload, consent)) databaseFailure(null);
  const payload = rawPayload;
  const rawTjmFacts = value.tjm_facts;
  const tjmFacts =
    rawTjmFacts === null || rawTjmFacts === undefined
      ? null
      : isCopilotTjmCoachFacts(rawTjmFacts)
        ? rawTjmFacts
        : databaseFailure(null);
  if ((operationKind === 'tjm-coach') !== (tjmFacts !== null)) databaseFailure(null);
  const rawResult = value.result;
  const result =
    rawResult === null || rawResult === undefined
      ? null
      : isReviewableCopilotResult(
            rawResult,
            operationKind as CopilotOperationKind,
            evidenceIds,
            copilotTjmFactIds(tjmFacts),
            { payload, tjmFacts }
          )
        ? rawResult
        : databaseFailure(null);
  const rawFailure = value.failure;
  const failure =
    rawFailure === null || rawFailure === undefined
      ? null
      : isRecord(rawFailure) &&
          typeof rawFailure.code === 'string' &&
          (REMOTE_COPILOT_FAILURE_CODES as readonly string[]).includes(rawFailure.code) &&
          typeof rawFailure.message === 'string' &&
          typeof rawFailure.retryable === 'boolean'
        ? {
            code: rawFailure.code as RemoteCopilotFailureCode,
            message: rawFailure.message,
            retryable: rawFailure.retryable,
          }
        : databaseFailure(null);
  const creditCost = value.credit_cost;
  if (creditCost !== 0 && creditCost !== 1) databaseFailure(null);
  const reservationStatus = stringField(value, 'reservation_status');
  const refundStatus = stringField(value, 'refund_status');
  if (!['not-required', 'required', 'reserved'].includes(reservationStatus)) databaseFailure(null);
  if (!['not-required', 'pending', 'refunded'].includes(refundStatus)) databaseFailure(null);
  return {
    id: stringField(value, 'id'),
    userId: stringField(value, 'user_id'),
    dossierId: stringField(value, 'dossier_id'),
    missionId: stringField(value, 'mission_id'),
    attemptId: stringField(value, 'attempt_id'),
    idempotencyKey: stringField(value, 'idempotency_key'),
    billingKey: stringField(value, 'billing_key'),
    inputHash: stringField(value, 'input_hash'),
    operationKind: operationKind as CopilotOperationKind,
    state: state as RemoteCopilotJobStateValue,
    creditCost,
    suppliedEvidenceIds: evidenceIds,
    consent,
    payload,
    tjmFacts,
    result,
    failure,
    reservationStatus: reservationStatus as StoredCopilotJob['reservationStatus'],
    reservationTransactionId: nullableStringField(value, 'reservation_transaction_id'),
    refundStatus: refundStatus as StoredCopilotJob['refundStatus'],
    refundTransactionId: nullableStringField(value, 'refund_transaction_id'),
    settlement: nullableStringField(value, 'settlement') as StoredCopilotJob['settlement'],
    uncertainPhase: nullableStringField(
      value,
      'uncertain_phase'
    ) as StoredCopilotJob['uncertainPhase'],
    providerDispatchedAt: nullableStringField(value, 'provider_dispatched_at'),
    providerDispositionKnown: booleanField(value, 'provider_disposition_known'),
    createdAt: stringField(value, 'created_at'),
    updatedAt: stringField(value, 'updated_at'),
  };
}

function mapCreditMutation(value: unknown): CopilotCreditMutation {
  if (!isRecord(value) || typeof value.status !== 'string' || typeof value.balance !== 'number') {
    databaseFailure(null);
  }
  if (!['not-required', 'reserved', 'refunded'].includes(value.status)) databaseFailure(null);
  const transaction = value.reservation_id ?? value.refund_id ?? null;
  if (transaction !== null && typeof transaction !== 'string') databaseFailure(null);
  return {
    status: value.status as CopilotCreditMutation['status'],
    transactionId: transaction,
    balance: value.balance,
  };
}

export class SupabaseCopilotRepository implements CopilotRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getCreditBalance(userId: string): Promise<number> {
    const { data, error } = await this.client
      .from('profiles')
      .select('credit_balance')
      .eq('id', userId)
      .single();
    if (error || !data || typeof data.credit_balance !== 'number') databaseFailure(error);
    return data.credit_balance;
  }

  async createDossier(
    userId: string,
    input: CreateCopilotDossierInput,
    confirmedAtMs: number
  ): Promise<StoredCopilotDossier> {
    const canonical = canonicalConsent(input.consent);
    const { data, error } = await this.client
      .from('copilot_dossiers')
      .insert({
        user_id: userId,
        mission_id: input.missionId,
        state: 'ready',
        consent: { ...canonical, confirmedAtMs },
      })
      .select('*')
      .single();
    if (!error && data) return mapDossier(data);
    if (error?.code === '23505') {
      const { data: existing, error: lookupError } = await this.client
        .from('copilot_dossiers')
        .select('*')
        .eq('user_id', userId)
        .eq('mission_id', input.missionId)
        .single();
      if (lookupError || !existing) databaseFailure(lookupError);
      const dossier = mapDossier(existing);
      if (isCopilotConsentSubset(input.consent, dossier.consent)) return dossier;
      if (dossier.state !== 'ready') {
        throw new CopilotApiError(409, 'DOSSIER_BUSY', 'Dossier consent cannot expand while busy');
      }
      const cumulativeConsent = canonicalConsent(
        unionCopilotConsentSelections(dossier.consent, input.consent)
      );
      if (!isValidCopilotConsentSelection(cumulativeConsent)) {
        throw new CopilotApiError(400, 'INVALID_REQUEST', 'Cumulative Copilot consent is invalid');
      }
      const { error: updateError } = await this.client.rpc('expand_copilot_consent', {
        p_user_id: userId,
        p_dossier_id: dossier.id,
        p_consent: { ...cumulativeConsent, confirmedAtMs },
      });
      if (updateError) databaseFailure(updateError);
      const updated = await this.getDossier(userId, dossier.id);
      if (!updated) databaseFailure(null);
      return updated;
    }
    databaseFailure(error);
  }

  async getDossier(userId: string, dossierId: string): Promise<StoredCopilotDossier | null> {
    const { data, error } = await this.client
      .from('copilot_dossiers')
      .select('*')
      .eq('id', dossierId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) databaseFailure(error);
    return data ? mapDossier(data) : null;
  }

  async getDossierByMission(
    userId: string,
    missionId: string
  ): Promise<StoredCopilotDossier | null> {
    const { data, error } = await this.client
      .from('copilot_dossiers')
      .select('*')
      .eq('mission_id', missionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) databaseFailure(error);
    return data ? mapDossier(data) : null;
  }

  async findJobByIdempotency(
    userId: string,
    idempotencyKey: string
  ): Promise<StoredCopilotJob | null> {
    const { data, error } = await this.client
      .from('copilot_jobs')
      .select('*')
      .eq('user_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (error) databaseFailure(error);
    return data ? mapJob(data) : null;
  }

  async assertJobReplayAllowed(
    userId: string,
    idempotencyKey: string,
    inputHash: string
  ): Promise<void> {
    const { data, error } = await this.client.rpc('assert_copilot_job_replay_allowed', {
      p_user_id: userId,
      p_idempotency_key: idempotencyKey,
      p_input_hash: inputHash,
    });
    if (error) databaseFailure(error);
    if (data !== true) databaseFailure(null);
  }

  async createJob(record: NewCopilotJobRecord): Promise<CreateStoredJobResult> {
    const { data, error } = await this.client.rpc('begin_copilot_job', {
      p_user_id: record.userId,
      p_dossier_id: record.dossierId,
      p_job_id: record.id,
      p_attempt_id: record.attemptId,
      p_idempotency_key: record.idempotencyKey,
      p_billing_key: record.billingKey,
      p_input_hash: record.inputHash,
      p_operation_kind: record.operationKind,
      p_supplied_evidence_ids: record.suppliedEvidenceIds,
      p_consent_selection: canonicalConsent(record.consent),
      p_tjm_facts: record.tjmFacts,
      p_input_payload: record.payload,
    });
    if (error || !isRecord(data)) databaseFailure(error);
    const jobId = stringField(data, 'job_id');
    const disposition = stringField(data, 'disposition');
    const job = await this.getJob(record.userId, jobId);
    if (!job || (disposition !== 'created' && disposition !== 'duplicate')) databaseFailure(null);
    return { disposition, job } as CreateStoredJobResult;
  }

  async getJob(userId: string, jobId: string): Promise<StoredCopilotJob | null> {
    const { data, error } = await this.client
      .from('copilot_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) databaseFailure(error);
    return data ? mapJob(data) : null;
  }

  async updateJob(
    userId: string,
    jobId: string,
    patch: CopilotJobPatch,
    expectedStates?: readonly RemoteCopilotJobStateValue[]
  ): Promise<StoredCopilotJob> {
    const update: DbRecord = {};
    if (patch.state !== undefined) update.state = patch.state;
    if ('result' in patch) update.result = patch.result;
    if ('failure' in patch) update.failure = patch.failure;
    if (patch.reservationStatus !== undefined) update.reservation_status = patch.reservationStatus;
    if ('reservationTransactionId' in patch) {
      update.reservation_transaction_id = patch.reservationTransactionId;
    }
    if (patch.refundStatus !== undefined) update.refund_status = patch.refundStatus;
    if ('refundTransactionId' in patch) update.refund_transaction_id = patch.refundTransactionId;
    if ('settlement' in patch) update.settlement = patch.settlement;
    if ('uncertainPhase' in patch) update.uncertain_phase = patch.uncertainPhase;
    if ('providerDispatchedAt' in patch) update.provider_dispatched_at = patch.providerDispatchedAt;
    if ('reviewedAt' in patch) update.reviewed_at = patch.reviewedAt;
    let query = this.client
      .from('copilot_jobs')
      .update(update)
      .eq('id', jobId)
      .eq('user_id', userId);
    if (expectedStates && expectedStates.length > 0) query = query.in('state', expectedStates);
    const { data, error } = await query.select('*').maybeSingle();
    if (error) databaseFailure(error);
    if (!data) {
      throw new CopilotApiError(409, 'DOSSIER_BUSY', 'Copilot job changed concurrently');
    }
    return mapJob(data);
  }

  async stageReview(
    userId: string,
    dossierId: string,
    jobId: string,
    result: import('@pulse/domain').CopilotValidatedResult,
    session: CopilotProviderSessionRecord
  ): Promise<StoredCopilotJob> {
    const { error } = await this.client.rpc('stage_copilot_review', {
      p_user_id: userId,
      p_dossier_id: dossierId,
      p_job_id: jobId,
      p_result: result,
      p_provider_session_id: session.sessionId,
      p_continuation_token: session.continuationToken,
      p_provider_run_id: session.activeProviderRunId,
    });
    if (error) databaseFailure(error);
    const job = await this.getJob(userId, jobId);
    if (!job) databaseFailure(null);
    return job;
  }

  async reserveCredit(
    userId: string,
    jobId: string,
    billingKey: string
  ): Promise<CopilotCreditMutation> {
    const { data, error } = await this.client.rpc('reserve_copilot_credit', {
      p_user_id: userId,
      p_job_id: jobId,
      p_billing_key: billingKey,
    });
    if (error) databaseFailure(error);
    return mapCreditMutation(data);
  }

  async refundCredit(
    userId: string,
    jobId: string,
    billingKey: string,
    terminalState: 'failed' | 'cancelled'
  ): Promise<CopilotCreditMutation> {
    const { data, error } = await this.client.rpc('refund_copilot_credit', {
      p_user_id: userId,
      p_job_id: jobId,
      p_billing_key: billingKey,
      p_terminal_state: terminalState,
    });
    if (error) databaseFailure(error);
    return mapCreditMutation(data);
  }

  async getProviderSession(
    userId: string,
    dossierId: string,
    activeJobId?: string
  ): Promise<CopilotProviderSessionRecord | null> {
    let query = this.client
      .from('copilot_provider_sessions')
      .select('*')
      .eq('dossier_id', dossierId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (activeJobId) query = query.eq('active_job_id', activeJobId);
    const { data, error } = await query.maybeSingle();
    if (error) databaseFailure(error);
    return data ? mapProviderSession(data) : null;
  }

  async claimReusableProviderSession(
    userId: string,
    dossierId: string,
    activeJobId: string
  ): Promise<CopilotProviderSessionRecord | null> {
    const { data, error } = await this.client.rpc('claim_copilot_provider_session', {
      p_user_id: userId,
      p_dossier_id: dossierId,
      p_job_id: activeJobId,
    });
    if (error) databaseFailure(error);
    return data === null ? null : mapProviderSession(data);
  }

  async listProviderSessions(
    userId: string,
    dossierId: string
  ): Promise<CopilotProviderSessionRecord[]> {
    const { data, error } = await this.client
      .from('copilot_provider_sessions')
      .select('*')
      .eq('dossier_id', dossierId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) databaseFailure(error);
    return (data ?? []).map(mapProviderSession);
  }

  async beginProviderSessionDeletion(
    userId: string,
    dossierId: string,
    sessionId: string
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc('begin_copilot_provider_session_deletion', {
      p_user_id: userId,
      p_dossier_id: dossierId,
      p_provider_session_id: sessionId,
    });
    if (error) databaseFailure(error);
    return data === true;
  }

  async confirmProviderSessionDeletion(
    userId: string,
    dossierId: string,
    sessionId: string,
    disposition: 'deleted' | 'retention-confirmed'
  ): Promise<void> {
    const { data, error } = await this.client.rpc('confirm_copilot_provider_session_deletion', {
      p_user_id: userId,
      p_dossier_id: dossierId,
      p_provider_session_id: sessionId,
      p_disposition: disposition,
    });
    if (error) databaseFailure(error);
    if (!data) {
      throw new CopilotApiError(
        409,
        'DELETE_FAILED',
        'Provider deletion disposition changed concurrently',
        true
      );
    }
  }

  async upsertProviderSession(session: CopilotProviderSessionRecord): Promise<void> {
    if (!session.activeJobId || !session.activeProviderRunId || session.continuationEligible) {
      throw new CopilotApiError(
        409,
        'PERSISTENCE_FAILED',
        'Provider session is not recordable at this boundary'
      );
    }
    const { error } = await this.client.rpc('record_copilot_provider_session', {
      p_user_id: session.userId,
      p_dossier_id: session.dossierId,
      p_job_id: session.activeJobId,
      p_provider_session_id: session.sessionId,
      p_continuation_token: session.continuationToken,
      p_provider_run_id: session.activeProviderRunId,
    });
    if (error) databaseFailure(error);
  }

  async settleJobWithoutCredit(input: {
    userId: string;
    dossierId: string;
    jobId: string;
    terminalState: 'failed' | 'cancelled';
    failure: StoredCopilotJob['failure'];
  }): Promise<StoredCopilotJob> {
    const { error } = await this.client.rpc('settle_copilot_job_without_credit', {
      p_user_id: input.userId,
      p_dossier_id: input.dossierId,
      p_job_id: input.jobId,
      p_terminal_state: input.terminalState,
      p_failure: input.failure,
    });
    if (error) databaseFailure(error);
    const job = await this.getJob(input.userId, input.jobId);
    if (!job) databaseFailure(null);
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
    const { error } = await this.client.rpc('complete_copilot_review', {
      p_user_id: input.userId,
      p_dossier_id: input.dossierId,
      p_job_id: input.jobId,
      p_decision: input.decision,
      p_artifact_id: input.artifactId,
      p_rendered_draft: input.renderedDraft,
      p_reviewed_at: input.reviewedAt,
    });
    if (error) {
      if (error.message.includes('COPILOT_REVIEW_NOT_ALLOWED')) {
        throw new CopilotApiError(409, 'REVIEW_NOT_ALLOWED', 'Job is not reviewable');
      }
      databaseFailure(error);
    }
    const reviewed = await this.getJob(input.userId, input.jobId);
    if (!reviewed) databaseFailure(null);
    return reviewed;
  }

  async markDossierDeleting(userId: string, dossierId: string, requestedAt: string): Promise<void> {
    const { error } = await this.client.rpc('begin_copilot_deletion', {
      p_user_id: userId,
      p_dossier_id: dossierId,
      p_requested_at: requestedAt,
    });
    if (error) databaseFailure(error);
  }

  async markDossierDeletionFailed(userId: string, dossierId: string): Promise<void> {
    const { error } = await this.client
      .from('copilot_dossiers')
      .update({ state: 'deletionFailed' })
      .eq('id', dossierId)
      .eq('user_id', userId)
      .eq('state', 'deleting');
    if (error) databaseFailure(error);
  }

  async deleteDossier(userId: string, dossierId: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('delete_copilot_dossier', {
      p_user_id: userId,
      p_dossier_id: dossierId,
    });
    if (error) databaseFailure(error);
    return data === true;
  }

  async hasUnresolvedProviderDisposition(userId: string, dossierId: string): Promise<boolean> {
    const { count, error } = await this.client
      .from('copilot_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('dossier_id', dossierId)
      .not('provider_dispatched_at', 'is', null)
      .eq('provider_disposition_known', false);
    if (error) databaseFailure(error);
    return (count ?? 0) > 0;
  }

  async hasActiveOrReservedJob(userId: string, dossierId: string): Promise<boolean> {
    const { count, error } = await this.client
      .from('copilot_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('dossier_id', dossierId)
      .or(
        'state.in.(idle,authorizing,reserving,queued,running,validating,cancelling,refunding,uncertain),reservation_status.eq.reserved,refund_status.eq.pending'
      );
    if (error) databaseFailure(error);
    return (count ?? 0) > 0;
  }
}
