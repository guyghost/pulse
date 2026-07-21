import type {
  ConfirmedCopilotConsent,
  ApprovedCopilotAnalysis,
  ApprovedCopilotArtifact,
  CopilotConsentSelection,
  CopilotDossierStateValue,
  CopilotOperationKind,
  CopilotTransmittedPayload,
  CopilotValidatedResult,
  RemoteCopilotJobStateValue,
  RemoteCopilotFailure,
  RemoteCopilotRefundStatus,
  RemoteCopilotReservationStatus,
} from '@pulse/domain';
import type { CopilotTjmCoachFacts } from './tjm-facts';

export interface CopilotPrincipal {
  userId: string;
  creditsRemaining: number;
}

export interface StoredCopilotDossier {
  id: string;
  userId: string;
  missionId: string;
  state: CopilotDossierStateValue;
  activeJobId: string | null;
  consent: ConfirmedCopilotConsent;
  analysis: ApprovedCopilotAnalysis | null;
  approvedArtifacts: readonly ApprovedCopilotArtifact[];
  deletionRequestedAt: string | null;
}

export interface StoredCopilotJob {
  id: string;
  userId: string;
  dossierId: string;
  missionId: string;
  attemptId: string;
  idempotencyKey: string;
  billingKey: string;
  inputHash: string;
  operationKind: CopilotOperationKind;
  state: RemoteCopilotJobStateValue;
  creditCost: 0 | 1;
  suppliedEvidenceIds: readonly string[];
  consent: CopilotConsentSelection;
  payload: CopilotTransmittedPayload;
  tjmFacts: CopilotTjmCoachFacts | null;
  result: CopilotValidatedResult | null;
  failure: RemoteCopilotFailure | null;
  reservationStatus: RemoteCopilotReservationStatus;
  reservationTransactionId: string | null;
  refundStatus: RemoteCopilotRefundStatus;
  refundTransactionId: string | null;
  settlement: 'failure' | 'cancellation' | null;
  uncertainPhase: 'reservation' | 'provider' | 'cancellation' | 'refund' | null;
  providerDispatchedAt: string | null;
  providerDispositionKnown: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCopilotJob {
  id: string;
  requestId: string;
  dossierId: string;
  missionId: string;
  operationKind: CopilotOperationKind;
  state: RemoteCopilotJobStateValue;
  creditCost: 0 | 1;
  inputHash: string;
  tjmFacts: CopilotTjmCoachFacts | null;
  result: CopilotValidatedResult | null;
  failure: StoredCopilotJob['failure'];
  createdAt: string;
  updatedAt: string;
}

export interface PublicCopilotDossierActiveJob {
  jobId: string;
  kind: CopilotOperationKind;
  state: RemoteCopilotJobStateValue;
}

/**
 * Owner-only, observational dossier projection. Deliberately excludes job
 * payloads, unapproved results and every provider/session handle.
 */
export interface PublicCopilotDossierProjection {
  missionId: string;
  state: CopilotDossierStateValue;
  consent: CopilotConsentSelection;
  analysis: ApprovedCopilotAnalysis | null;
  approvedArtifacts: readonly ApprovedCopilotArtifact[];
  activeJob: PublicCopilotDossierActiveJob | null;
}

export interface CreateCopilotDossierInput {
  missionId: string;
  consent: CopilotConsentSelection;
}

export interface CreateCopilotJobInput {
  dossierId: string;
  idempotencyKey: string;
  operationKind: CopilotOperationKind;
  inputHash: string;
  consent: CopilotConsentSelection;
  payload: unknown;
  tjmFacts: unknown;
}

export function toPublicCopilotJob(job: StoredCopilotJob): PublicCopilotJob {
  return {
    id: job.id,
    requestId: job.idempotencyKey,
    dossierId: job.dossierId,
    missionId: job.missionId,
    operationKind: job.operationKind,
    state: job.state,
    creditCost: job.creditCost,
    inputHash: job.inputHash,
    tjmFacts: job.tjmFacts,
    result: job.result,
    failure: job.failure,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
