import type {
  CopilotConsentSelection,
  CopilotOperationKind,
  CopilotTransmittedPayload,
  CopilotValidatedResult,
  RemoteCopilotJobStateValue,
} from '@pulse/domain';

import type { CreateCopilotDossierInput, StoredCopilotDossier, StoredCopilotJob } from './types';
import type { CopilotTjmCoachFacts } from './tjm-facts';

export interface NewCopilotJobRecord {
  id: string;
  userId: string;
  dossierId: string;
  missionId: string;
  attemptId: string;
  idempotencyKey: string;
  billingKey: string;
  inputHash: string;
  operationKind: CopilotOperationKind;
  state: 'queued' | 'reserving';
  creditCost: 0 | 1;
  suppliedEvidenceIds: readonly string[];
  consent: CopilotConsentSelection;
  tjmFacts: CopilotTjmCoachFacts | null;
  payload: CopilotTransmittedPayload;
}

export type CreateStoredJobResult =
  | { disposition: 'created'; job: StoredCopilotJob }
  | { disposition: 'duplicate'; job: StoredCopilotJob };

export interface CopilotJobPatch {
  state?: RemoteCopilotJobStateValue;
  result?: CopilotValidatedResult | null;
  failure?: StoredCopilotJob['failure'];
  reservationStatus?: StoredCopilotJob['reservationStatus'];
  reservationTransactionId?: string | null;
  refundStatus?: StoredCopilotJob['refundStatus'];
  refundTransactionId?: string | null;
  settlement?: 'failure' | 'cancellation' | null;
  uncertainPhase?: 'reservation' | 'provider' | 'cancellation' | 'refund' | null;
  providerDispatchedAt?: string | null;
  reviewedAt?: string | null;
}

export interface CopilotProviderSessionRecord {
  userId: string;
  dossierId: string;
  sessionId: string;
  continuationToken: string | null;
  activeJobId: string | null;
  activeProviderRunId: string | null;
  /** Only a session whose latest result was explicitly accepted may continue. */
  continuationEligible: boolean;
  deletionDisposition: 'pending' | 'uncertain' | 'deleted' | 'retention-confirmed';
}

export interface CopilotCreditMutation {
  status: 'not-required' | 'reserved' | 'refunded';
  transactionId: string | null;
  balance: number;
}

export interface CopilotRepository {
  getCreditBalance(userId: string): Promise<number>;
  createDossier(
    userId: string,
    input: CreateCopilotDossierInput,
    confirmedAtMs: number
  ): Promise<StoredCopilotDossier>;
  getDossier(userId: string, dossierId: string): Promise<StoredCopilotDossier | null>;
  getDossierByMission(userId: string, missionId: string): Promise<StoredCopilotDossier | null>;
  findJobByIdempotency(userId: string, idempotencyKey: string): Promise<StoredCopilotJob | null>;
  assertJobReplayAllowed(userId: string, idempotencyKey: string, inputHash: string): Promise<void>;
  createJob(record: NewCopilotJobRecord): Promise<CreateStoredJobResult>;
  getJob(userId: string, jobId: string): Promise<StoredCopilotJob | null>;
  updateJob(
    userId: string,
    jobId: string,
    patch: CopilotJobPatch,
    expectedStates?: readonly RemoteCopilotJobStateValue[]
  ): Promise<StoredCopilotJob>;
  stageReview(
    userId: string,
    dossierId: string,
    jobId: string,
    result: CopilotValidatedResult,
    session: CopilotProviderSessionRecord
  ): Promise<StoredCopilotJob>;
  reserveCredit(userId: string, jobId: string, billingKey: string): Promise<CopilotCreditMutation>;
  refundCredit(
    userId: string,
    jobId: string,
    billingKey: string,
    terminalState: 'failed' | 'cancelled'
  ): Promise<CopilotCreditMutation>;
  getProviderSession(
    userId: string,
    dossierId: string,
    activeJobId?: string
  ): Promise<CopilotProviderSessionRecord | null>;
  claimReusableProviderSession(
    userId: string,
    dossierId: string,
    activeJobId: string
  ): Promise<CopilotProviderSessionRecord | null>;
  listProviderSessions(userId: string, dossierId: string): Promise<CopilotProviderSessionRecord[]>;
  beginProviderSessionDeletion(
    userId: string,
    dossierId: string,
    sessionId: string
  ): Promise<boolean>;
  confirmProviderSessionDeletion(
    userId: string,
    dossierId: string,
    sessionId: string,
    disposition: 'deleted' | 'retention-confirmed'
  ): Promise<void>;
  upsertProviderSession(session: CopilotProviderSessionRecord): Promise<void>;
  settleJobWithoutCredit(input: {
    userId: string;
    dossierId: string;
    jobId: string;
    terminalState: 'failed' | 'cancelled';
    failure: StoredCopilotJob['failure'];
  }): Promise<StoredCopilotJob>;
  completeReview(input: {
    userId: string;
    dossierId: string;
    jobId: string;
    decision: 'accept' | 'reject';
    artifactId: string | null;
    renderedDraft: string | null;
    reviewedAt: string;
  }): Promise<StoredCopilotJob>;
  markDossierDeleting(userId: string, dossierId: string, requestedAt: string): Promise<void>;
  markDossierDeletionFailed(userId: string, dossierId: string): Promise<void>;
  deleteDossier(userId: string, dossierId: string): Promise<boolean>;
  hasUnresolvedProviderDisposition(userId: string, dossierId: string): Promise<boolean>;
  hasActiveOrReservedJob(userId: string, dossierId: string): Promise<boolean>;
}
