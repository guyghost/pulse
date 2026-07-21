import type {
  ApprovedCopilotAnalysis,
  ApprovedCopilotArtifact,
  CopilotConsentSelection,
  CopilotDossierStateValue,
  CopilotOperationKind,
  CopilotTjmCoachFacts,
  CopilotTransmittedPayload,
  CopilotValidatedResult,
  PremiumEntitlementStateValue,
  RemoteCopilotJobStateValue,
} from '@pulse/domain';

export const COPILOT_JOB_STATUSES = [
  'checkpointed',
  'queued',
  'running',
  'uncertain',
  'review',
  'accepted',
  'rejected',
  'cancelling',
  'cancelled',
  'failed',
] as const;

export type CopilotJobStatus = (typeof COPILOT_JOB_STATUSES)[number];

export const COPILOT_ERROR_CODES = [
  'ROLLOUT_DISABLED',
  'AUTH_REQUIRED',
  'AUTH_CANCELLED',
  'AUTH_FAILED',
  'ENTITLEMENT_DENIED',
  'INSUFFICIENT_CREDITS',
  'RATE_LIMITED',
  'INVALID_REQUEST',
  'MISSION_NOT_FOUND',
  'PROFILE_NOT_FOUND',
  'PAYLOAD_REJECTED',
  'JOB_CONFLICT',
  'JOB_NOT_FOUND',
  'JOB_GONE',
  'JOB_NOT_REVIEWABLE',
  'NETWORK_ERROR',
  'REMOTE_FAILED',
  'PROTOCOL_ERROR',
  'DELETE_FAILED',
] as const;

export type CopilotErrorCode = (typeof COPILOT_ERROR_CODES)[number];

export interface CopilotError {
  code: CopilotErrorCode;
  message: string;
  retryable: boolean;
}

export interface CopilotEntitlement {
  status: 'free' | 'active' | 'expired' | 'revoked';
  subject: string;
  issuedAtMs: number | null;
  expiresAtMs: number | null;
  creditsRemaining: number;
}

export interface CopilotJobSnapshot {
  jobId: string | null;
  missionId: string;
  requestId: string;
  kind: CopilotOperationKind;
  creditCost: 0 | 1;
  /** Cumulative, locally checkpointed consent projection for reopen/edit. */
  selection: CopilotConsentSelection;
  /** Immutable, consented sources used by this exact job, never current profile data. */
  sourceSnapshot: CopilotJobSourceSnapshot;
  status: CopilotJobStatus;
  tjmFacts: CopilotTjmCoachFacts | null;
  result: CopilotValidatedResult | null;
  error: CopilotError | null;
  creditsRemaining: number | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CopilotJobCheckpoint extends Omit<CopilotJobSnapshot, 'sourceSnapshot'> {
  version: 1;
  /** Exact request committed before POST and replayed byte-semantically after MV3 restart. */
  createInput: CopilotCreateApiInput;
}

export interface CopilotCreateCommand {
  requestId: string;
  missionId: string;
  kind: CopilotOperationKind;
  missionFields: CopilotConsentSelection['missionFields'];
  profileFields: CopilotConsentSelection['profileFields'];
  evidenceIds: CopilotConsentSelection['evidenceIds'];
}

export interface CopilotLinkResultPayload {
  requestId: string;
  outcome: 'linked' | 'error';
  subject: string | null;
  error: CopilotError | null;
}

export interface CopilotEntitlementResultPayload {
  requestId: string;
  outcome: 'synced' | 'error';
  state: PremiumEntitlementStateValue;
  entitlement: CopilotEntitlement | null;
  error: CopilotError | null;
}

export interface CopilotJobResultPayload {
  requestId: string;
  missionId: string;
  outcome: 'ok' | 'local' | 'not_found' | 'error';
  job: CopilotJobSnapshot | null;
  deletionReceipt: CopilotDeletionReceipt | null;
  error: CopilotError | null;
}

export interface CopilotDossierProjection {
  missionId: string;
  state: CopilotDossierStateValue;
  consent: CopilotConsentSelection;
  analysis: ApprovedCopilotAnalysis | null;
  approvedArtifacts: readonly ApprovedCopilotArtifact[];
  activeJob: {
    jobId: string;
    kind: CopilotOperationKind;
    state: RemoteCopilotJobStateValue;
  } | null;
}

export type CopilotDossierResultPayload =
  | {
      requestId: string;
      missionId: string;
      outcome: 'ok';
      dossier: CopilotDossierProjection;
      error: null;
    }
  | {
      requestId: string;
      missionId: string;
      outcome: 'not_found';
      dossier: null;
      error: null;
    }
  | {
      requestId: string;
      missionId: string;
      outcome: 'error';
      dossier: null;
      error: CopilotError;
    };

export type CopilotDeletionDisposition = 'deleted' | 'retention-confirmed' | 'not-created';

export interface CopilotDeletionReceipt {
  version: 1;
  missionId: string;
  disposition: CopilotDeletionDisposition;
  confirmedAtMs: number;
}

export interface CopilotDeleteResultPayload {
  requestId: string;
  missionId: string;
  outcome: 'deleted' | 'error';
  disposition: CopilotDeletionDisposition | null;
  receipt: CopilotDeletionReceipt | null;
  error: CopilotError | null;
}

export interface CopilotCreateApiInputHashMaterial {
  schemaVersion: 1;
  missionId: string;
  kind: CopilotOperationKind;
  consent: CopilotConsentSelection;
  input: CopilotTransmittedPayload;
  /** Local deterministic facts, never an Eve recommendation. */
  tjmFacts: CopilotTjmCoachFacts | null;
}

export interface CopilotCreateApiInput extends CopilotCreateApiInputHashMaterial {
  /** SHA-256 hex of the recursively key-sorted hash material, excluding this field. */
  inputHash: string;
}

export interface CopilotJobSourceSnapshot {
  inputHash: string;
  /** Exact consented payload used by this job. */
  payload: CopilotTransmittedPayload;
}

export interface CopilotSessionCredential {
  version: 1;
  subject: string;
  bearer: string;
}

export interface CopilotRemoteJob {
  jobId: string;
  missionId: string;
  requestId: string;
  kind: CopilotOperationKind;
  inputHash: string;
  status: Exclude<CopilotJobStatus, 'checkpointed'>;
  /** Echo of the checkpointed local facts; null for non-TJM jobs. */
  tjmFacts: CopilotTjmCoachFacts | null;
  result: CopilotValidatedResult | null;
  error: CopilotError | null;
  creditsRemaining: number | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CopilotRemoteDeleteResult {
  missionId: string;
  disposition: CopilotDeletionDisposition;
}
