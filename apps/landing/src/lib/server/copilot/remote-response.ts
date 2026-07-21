import type { RemoteCopilotJobStateValue } from '@pulse/domain';

import { CopilotApiError, asCopilotApiError } from './errors';
import type { PublicCopilotJob } from './types';

export type PublicCopilotErrorCode =
  | 'ROLLOUT_DISABLED'
  | 'AUTH_REQUIRED'
  | 'ENTITLEMENT_DENIED'
  | 'INSUFFICIENT_CREDITS'
  | 'RATE_LIMITED'
  | 'INVALID_REQUEST'
  | 'MISSION_NOT_FOUND'
  | 'PAYLOAD_REJECTED'
  | 'JOB_CONFLICT'
  | 'JOB_NOT_FOUND'
  | 'JOB_GONE'
  | 'JOB_NOT_REVIEWABLE'
  | 'REMOTE_FAILED'
  | 'PROTOCOL_ERROR'
  | 'DELETE_FAILED';

export interface PublicCopilotError {
  code: PublicCopilotErrorCode;
  message: string;
  retryable: boolean;
}

function publicStatus(
  state: RemoteCopilotJobStateValue
):
  | 'queued'
  | 'running'
  | 'review'
  | 'accepted'
  | 'rejected'
  | 'cancelling'
  | 'cancelled'
  | 'failed'
  | 'uncertain' {
  switch (state) {
    case 'review':
    case 'accepted':
    case 'rejected':
    case 'cancelling':
    case 'cancelled':
    case 'failed':
    case 'uncertain':
      return state;
    case 'running':
    case 'validating':
    case 'refunding':
      return 'running';
    default:
      return 'queued';
  }
}

function failedJobError(job: PublicCopilotJob): PublicCopilotError | null {
  if (job.state !== 'failed') return null;
  switch (job.failure?.code) {
    case 'INSUFFICIENT_CREDITS':
      return {
        code: 'INSUFFICIENT_CREDITS',
        message: 'Crédits Copilot insuffisants.',
        retryable: false,
      };
    case 'ENTITLEMENT_DENIED':
      return {
        code: 'ENTITLEMENT_DENIED',
        message: 'L’abonnement Premium n’autorise plus cette action.',
        retryable: false,
      };
    case 'RESULT_INVALID':
      return {
        code: 'PROTOCOL_ERROR',
        message: 'Le résultat distant ne respecte pas le contrat Copilot.',
        retryable: true,
      };
    default:
      return {
        code: 'REMOTE_FAILED',
        message: 'Le traitement Copilot a échoué.',
        retryable: job.failure?.retryable ?? true,
      };
  }
}

export function toRemoteCopilotJob(job: PublicCopilotJob, creditsRemaining: number) {
  return {
    jobId: job.id,
    missionId: job.missionId,
    requestId: job.requestId,
    kind: job.operationKind,
    inputHash: job.inputHash,
    status: publicStatus(job.state),
    tjmFacts: job.tjmFacts,
    result: job.result,
    error: failedJobError(job),
    creditsRemaining,
    createdAtMs: Date.parse(job.createdAt),
    updatedAtMs: Date.parse(job.updatedAt),
  };
}

export function publicError(error: unknown): { status: number; error: PublicCopilotError } {
  const internal = asCopilotApiError(error);
  let code: PublicCopilotErrorCode;
  let message: string;
  switch (internal.code) {
    case 'ROLLOUT_DISABLED':
      code = 'ROLLOUT_DISABLED';
      message = 'Le Copilot Premium n’est pas encore activé.';
      break;
    case 'RATE_LIMITED':
      code = 'RATE_LIMITED';
      message = 'Limite quotidienne du pilote Copilot atteinte.';
      break;
    case 'AUTHENTICATION_REQUIRED':
      code = 'AUTH_REQUIRED';
      message = 'La session Copilot a expiré.';
      break;
    case 'ENTITLEMENT_DENIED':
      code = 'ENTITLEMENT_DENIED';
      message = 'L’abonnement Premium n’autorise pas cette action.';
      break;
    case 'INSUFFICIENT_CREDITS':
      code = 'INSUFFICIENT_CREDITS';
      message = 'Crédits Copilot insuffisants.';
      break;
    case 'DOSSIER_NOT_FOUND':
      code = 'MISSION_NOT_FOUND';
      message = 'Le dossier de mission est introuvable.';
      break;
    case 'DOSSIER_BUSY':
    case 'CANCELLATION_NOT_ALLOWED':
      code = 'JOB_CONFLICT';
      message = 'Un job Copilot est déjà actif pour cette mission.';
      break;
    case 'JOB_NOT_FOUND':
    case 'OWNERSHIP_DENIED':
      code = 'JOB_NOT_FOUND';
      message = 'Job Copilot introuvable.';
      break;
    case 'JOB_GONE':
      code = 'JOB_GONE';
      message = 'Ce job Copilot a été supprimé et ne peut pas être recréé.';
      break;
    case 'REVIEW_NOT_ALLOWED':
      code = 'JOB_NOT_REVIEWABLE';
      message = 'Ce job Copilot n’est pas prêt pour la revue.';
      break;
    case 'RESULT_INVALID':
      code = 'PROTOCOL_ERROR';
      message = 'Le résultat distant ne respecte pas le contrat Copilot.';
      break;
    case 'INVALID_REQUEST':
      code = 'INVALID_REQUEST';
      message = 'Requête Copilot invalide.';
      break;
    case 'DELETE_FAILED':
      code = 'DELETE_FAILED';
      message = 'La suppression du dossier Copilot a échoué.';
      break;
    default:
      code = 'REMOTE_FAILED';
      message = 'Le service Copilot est temporairement indisponible.';
  }
  return {
    status: internal.status,
    error: { code, message, retryable: internal.retryable },
  };
}

export function invalidRequestError(): CopilotApiError {
  return new CopilotApiError(422, 'INVALID_REQUEST', 'Invalid Copilot request');
}
