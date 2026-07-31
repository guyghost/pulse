import { assign, setup, type SnapshotFrom } from 'xstate';

import {
  MAX_COPILOT_APPROVED_ARTIFACTS,
  isReviewableCopilotResult,
  isValidCopilotConsentSelection,
  type CopilotArtifactKind,
  type CopilotConsentSelection,
  type CopilotGroundingContext,
  type CopilotOperationKind,
  type CopilotTjmFactId,
  type CopilotValidatedResult,
} from './copilot-contracts';

export const COPILOT_DOSSIER_STATES = [
  'empty',
  'consenting',
  'ready',
  'processing',
  'reviewing',
  'deleting',
  'deletionFailed',
  'deleted',
] as const;

export type CopilotDossierStateValue = (typeof COPILOT_DOSSIER_STATES)[number];

export interface CopilotDossierInput {
  userId: string;
  missionId: string;
  providerMayExist?: boolean;
}

export interface ConfirmedCopilotConsent extends CopilotConsentSelection {
  confirmedAtMs: number;
}

export interface CopilotDossierSession {
  sessionId: string;
  continuationToken: string | null;
}

export interface CopilotDossierActiveJob {
  jobId: string;
  kind: CopilotOperationKind;
}

export interface CopilotDossierReviewCandidate {
  jobId: string;
  result: CopilotValidatedResult;
}

export interface ApprovedCopilotAnalysis {
  jobId: string;
  result: CopilotValidatedResult & { kind: 'analysis' };
  approvedAtMs: number;
}

export interface ApprovedCopilotArtifact {
  artifactId: string;
  jobId: string;
  kind: CopilotArtifactKind;
  draft: string;
  approvedAtMs: number;
}

export interface CopilotDossierError {
  code: 'JOB_FAILED' | 'DELETE_FAILED';
  message: string;
  retryable: boolean;
}

export type EveDeletionDisposition = 'deleted' | 'retention-confirmed' | 'not-created';

export interface CopilotDossierContext {
  userId: string;
  missionId: string;
  consent: ConfirmedCopilotConsent | null;
  session: CopilotDossierSession | null;
  activeJob: CopilotDossierActiveJob | null;
  reviewCandidate: CopilotDossierReviewCandidate | null;
  analysis: ApprovedCopilotAnalysis | null;
  artifacts: readonly ApprovedCopilotArtifact[];
  deletionRequestedAtMs: number | null;
  error: CopilotDossierError | null;
  providerMayExist: boolean;
}

export interface CopilotDossierCorrelation {
  userId: string;
  missionId: string;
}

export type CopilotDossierEvent =
  | (CopilotDossierCorrelation & { type: 'CONSENT_STARTED' })
  | (CopilotDossierCorrelation & {
      type: 'CONSENT_CONFIRMED';
      selection: CopilotConsentSelection;
      confirmedAtMs: number;
    })
  | (CopilotDossierCorrelation & {
      type: 'CONSENT_UPDATED';
      selection: CopilotConsentSelection;
      confirmedAtMs: number;
    })
  | (CopilotDossierCorrelation & { type: 'CONSENT_CANCELLED' })
  | (CopilotDossierCorrelation & { type: 'ANALYSIS_REQUESTED'; jobId: string })
  | (CopilotDossierCorrelation & {
      type: 'ARTIFACT_REQUESTED';
      jobId: string;
      kind: CopilotArtifactKind;
    })
  | (CopilotDossierCorrelation & {
      type: 'JOB_REVIEW_READY';
      jobId: string;
      sessionId: string;
      continuationToken: string | null;
      result: CopilotValidatedResult;
      suppliedEvidenceIds: readonly string[];
      suppliedTjmFactIds?: readonly CopilotTjmFactId[];
      grounding?: CopilotGroundingContext;
    })
  | (CopilotDossierCorrelation & {
      type: 'JOB_FAILED';
      jobId: string;
      error: CopilotDossierError;
    })
  | (CopilotDossierCorrelation & {
      type: 'ANALYSIS_APPROVED';
      jobId: string;
      approvedAtMs: number;
    })
  | (CopilotDossierCorrelation & { type: 'ANALYSIS_REJECTED'; jobId: string })
  | (CopilotDossierCorrelation & {
      type: 'ARTIFACT_APPROVED';
      jobId: string;
      artifactId: string;
      approvedAtMs: number;
    })
  | (CopilotDossierCorrelation & { type: 'ARTIFACT_REJECTED'; jobId: string })
  | (CopilotDossierCorrelation & { type: 'DELETE_REQUESTED'; requestedAtMs: number })
  | (CopilotDossierCorrelation & {
      type: 'DELETE_CONFIRMED';
      missionPulseRecordsDeleted: boolean;
      eveDisposition: EveDeletionDisposition;
    })
  | (CopilotDossierCorrelation & {
      type: 'DELETE_FAILED';
      error: CopilotDossierError;
    })
  | (CopilotDossierCorrelation & { type: 'DELETE_RETRIED' });

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function matchesDossier(context: CopilotDossierContext, event: CopilotDossierCorrelation): boolean {
  return event.userId === context.userId && event.missionId === context.missionId;
}

function matchesActiveJob(
  context: CopilotDossierContext,
  event: CopilotDossierCorrelation & { jobId: string }
): boolean {
  return matchesDossier(context, event) && event.jobId === context.activeJob?.jobId;
}

function canAcceptSession(context: CopilotDossierContext, sessionId: string): boolean {
  return (
    nonEmpty(sessionId) && (context.session === null || context.session.sessionId === sessionId)
  );
}

function reviewMatches(
  context: CopilotDossierContext,
  event: CopilotDossierCorrelation & { jobId: string }
): boolean {
  return (
    matchesDossier(context, event) &&
    event.jobId === context.activeJob?.jobId &&
    event.jobId === context.reviewCandidate?.jobId &&
    context.activeJob !== null &&
    context.reviewCandidate !== null
  );
}

function deletedEveObligationsSatisfied(
  context: CopilotDossierContext,
  disposition: EveDeletionDisposition
): boolean {
  if (!context.providerMayExist) return disposition === 'not-created';
  return disposition === 'deleted' || disposition === 'retention-confirmed';
}

function isMonotonicConsentExpansion(
  current: ConfirmedCopilotConsent,
  next: CopilotConsentSelection
): boolean {
  const nextMission = new Set<string>(next.missionFields);
  const nextProfile = new Set<string>(next.profileFields);
  const nextEvidence = new Set(next.evidenceIds);
  return (
    current.missionFields.every((field) => nextMission.has(field)) &&
    current.profileFields.every((field) => nextProfile.has(field)) &&
    current.evidenceIds.every((id) => nextEvidence.has(id))
  );
}

const copilotDossierSetup = setup({
  types: {
    context: {} as CopilotDossierContext,
    events: {} as CopilotDossierEvent,
    input: {} as CopilotDossierInput,
  },
  guards: {
    matchingDossier: ({ context, event }) => matchesDossier(context, event),
    validConsent: ({ context, event }) =>
      event.type === 'CONSENT_CONFIRMED' &&
      matchesDossier(context, event) &&
      Number.isFinite(event.confirmedAtMs) &&
      isValidCopilotConsentSelection(event.selection),
    validConsentUpdate: ({ context, event }) =>
      event.type === 'CONSENT_UPDATED' &&
      matchesDossier(context, event) &&
      context.consent !== null &&
      Number.isFinite(event.confirmedAtMs) &&
      event.confirmedAtMs >= context.consent.confirmedAtMs &&
      isValidCopilotConsentSelection(event.selection) &&
      isMonotonicConsentExpansion(context.consent, event.selection),
    validAnalysisRequest: ({ context, event }) =>
      event.type === 'ANALYSIS_REQUESTED' &&
      matchesDossier(context, event) &&
      context.consent !== null &&
      context.activeJob === null &&
      nonEmpty(event.jobId),
    validArtifactRequest: ({ context, event }) =>
      event.type === 'ARTIFACT_REQUESTED' &&
      matchesDossier(context, event) &&
      context.consent !== null &&
      context.activeJob === null &&
      context.artifacts.length < MAX_COPILOT_APPROVED_ARTIFACTS &&
      nonEmpty(event.jobId),
    validReviewCandidate: ({ context, event }) =>
      event.type === 'JOB_REVIEW_READY' &&
      context.activeJob !== null &&
      context.consent !== null &&
      matchesActiveJob(context, event) &&
      canAcceptSession(context, event.sessionId) &&
      event.result.kind === context.activeJob.kind &&
      isReviewableCopilotResult(
        event.result,
        context.activeJob.kind,
        event.suppliedEvidenceIds,
        event.suppliedTjmFactIds ?? [],
        event.grounding ?? null
      ),
    matchingJobFailure: ({ context, event }) =>
      event.type === 'JOB_FAILED' && matchesActiveJob(context, event),
    matchingAnalysisApproval: ({ context, event }) =>
      event.type === 'ANALYSIS_APPROVED' &&
      reviewMatches(context, event) &&
      context.reviewCandidate?.result.kind === 'analysis' &&
      Number.isFinite(event.approvedAtMs),
    matchingArtifactApproval: ({ context, event }) =>
      event.type === 'ARTIFACT_APPROVED' &&
      reviewMatches(context, event) &&
      context.reviewCandidate?.result.kind !== 'analysis' &&
      context.reviewCandidate?.result.draftSegments !== undefined &&
      nonEmpty(event.artifactId) &&
      context.artifacts.length < MAX_COPILOT_APPROVED_ARTIFACTS &&
      !context.artifacts.some((artifact) => artifact.artifactId === event.artifactId) &&
      Number.isFinite(event.approvedAtMs),
    matchingArtifactRejection: ({ context, event }) =>
      event.type === 'ARTIFACT_REJECTED' &&
      reviewMatches(context, event) &&
      context.reviewCandidate?.result.kind !== 'analysis',
    matchingAnalysisRejection: ({ context, event }) =>
      event.type === 'ANALYSIS_REJECTED' &&
      reviewMatches(context, event) &&
      context.reviewCandidate?.result.kind === 'analysis',
    validDeleteRequest: ({ context, event }) =>
      event.type === 'DELETE_REQUESTED' &&
      matchesDossier(context, event) &&
      Number.isFinite(event.requestedAtMs),
    deletionConfirmed: ({ context, event }) =>
      event.type === 'DELETE_CONFIRMED' &&
      matchesDossier(context, event) &&
      event.missionPulseRecordsDeleted &&
      deletedEveObligationsSatisfied(context, event.eveDisposition),
    matchingDeleteFailure: ({ context, event }) =>
      event.type === 'DELETE_FAILED' && matchesDossier(context, event),
    matchingDeleteRetry: ({ context, event }) =>
      event.type === 'DELETE_RETRIED' &&
      matchesDossier(context, event) &&
      context.error?.code === 'DELETE_FAILED' &&
      context.error.retryable,
  },
  actions: {
    confirmConsent: assign(({ event }) => {
      if (event.type !== 'CONSENT_CONFIRMED') return {};
      return {
        consent: {
          missionFields: [...event.selection.missionFields],
          profileFields: [...event.selection.profileFields],
          evidenceIds: [...event.selection.evidenceIds],
          confirmedAtMs: event.confirmedAtMs,
        },
        error: null,
      };
    }),
    updateConsent: assign(({ event }) => {
      if (event.type !== 'CONSENT_UPDATED') return {};
      return {
        consent: {
          missionFields: [...event.selection.missionFields],
          profileFields: [...event.selection.profileFields],
          evidenceIds: [...event.selection.evidenceIds],
          confirmedAtMs: event.confirmedAtMs,
        },
        error: null,
      };
    }),
    clearConsent: assign(() => ({
      consent: null,
      activeJob: null,
      reviewCandidate: null,
      error: null,
    })),
    beginAnalysis: assign(({ event }) => ({
      activeJob:
        event.type === 'ANALYSIS_REQUESTED'
          ? { jobId: event.jobId, kind: 'analysis' as const }
          : null,
      reviewCandidate: null,
      error: null,
    })),
    beginArtifact: assign(({ event }) => ({
      activeJob:
        event.type === 'ARTIFACT_REQUESTED' ? { jobId: event.jobId, kind: event.kind } : null,
      reviewCandidate: null,
      error: null,
    })),
    stageReviewCandidate: assign(({ event }) => {
      if (event.type !== 'JOB_REVIEW_READY') return {};
      return {
        session: {
          sessionId: event.sessionId,
          continuationToken: event.continuationToken,
        },
        providerMayExist: true,
        reviewCandidate: {
          jobId: event.jobId,
          result: event.result,
        },
        error: null,
      };
    }),
    recordJobFailure: assign(({ event }) => ({
      session: null,
      activeJob: null,
      reviewCandidate: null,
      error: event.type === 'JOB_FAILED' ? event.error : null,
    })),
    approveAnalysis: assign(({ context, event }) => {
      if (
        event.type !== 'ANALYSIS_APPROVED' ||
        context.reviewCandidate?.result.kind !== 'analysis'
      ) {
        return {};
      }
      return {
        analysis: {
          jobId: context.reviewCandidate.jobId,
          result: context.reviewCandidate.result as CopilotValidatedResult & { kind: 'analysis' },
          approvedAtMs: event.approvedAtMs,
        },
        activeJob: null,
        reviewCandidate: null,
        error: null,
      };
    }),
    approveArtifact: assign(({ context, event }) => {
      if (
        event.type !== 'ARTIFACT_APPROVED' ||
        context.reviewCandidate === null ||
        context.reviewCandidate.result.kind === 'analysis' ||
        context.reviewCandidate.result.draftSegments === undefined
      ) {
        return {};
      }

      return {
        artifacts: [
          ...context.artifacts,
          {
            artifactId: event.artifactId,
            jobId: context.reviewCandidate.jobId,
            kind: context.reviewCandidate.result.kind,
            draft: context.reviewCandidate.result.draftSegments
              .map((segment) => segment.text)
              .join('\n\n'),
            approvedAtMs: event.approvedAtMs,
          },
        ],
        activeJob: null,
        reviewCandidate: null,
        error: null,
      };
    }),
    rejectCandidate: assign(() => ({
      session: null,
      activeJob: null,
      reviewCandidate: null,
      error: null,
    })),
    beginDeletion: assign(({ event }) => ({
      deletionRequestedAtMs: event.type === 'DELETE_REQUESTED' ? event.requestedAtMs : null,
      activeJob: null,
      reviewCandidate: null,
      error: null,
    })),
    recordDeletionFailure: assign(({ event }) => ({
      error: event.type === 'DELETE_FAILED' ? event.error : null,
    })),
    retryDeletion: assign(() => ({ error: null })),
    purgeDeletedDossier: assign(({ context }) => ({
      userId: context.userId,
      missionId: context.missionId,
      consent: null,
      session: null,
      activeJob: null,
      reviewCandidate: null,
      analysis: null,
      artifacts: [],
      deletionRequestedAtMs: context.deletionRequestedAtMs,
      error: null,
    })),
  },
});

const DELETE_REQUEST_TRANSITION = {
  target: 'deleting',
  guard: 'validDeleteRequest',
  actions: 'beginDeletion',
} as const;

export const copilotDossierMachine = copilotDossierSetup.createMachine({
  id: 'copilot-dossier',
  initial: 'empty',
  context: ({ input }) => ({
    userId: input.userId,
    missionId: input.missionId,
    consent: null,
    session: null,
    activeJob: null,
    reviewCandidate: null,
    analysis: null,
    artifacts: [],
    deletionRequestedAtMs: null,
    error: null,
    providerMayExist: input.providerMayExist ?? false,
  }),
  states: {
    empty: {
      on: {
        CONSENT_STARTED: {
          target: 'consenting',
          guard: 'matchingDossier',
        },
      },
    },
    consenting: {
      on: {
        CONSENT_CONFIRMED: {
          target: 'ready',
          guard: 'validConsent',
          actions: 'confirmConsent',
        },
        CONSENT_CANCELLED: {
          target: 'empty',
          guard: 'matchingDossier',
          actions: 'clearConsent',
        },
      },
    },
    ready: {
      on: {
        CONSENT_UPDATED: {
          target: 'ready',
          guard: 'validConsentUpdate',
          actions: 'updateConsent',
        },
        ANALYSIS_REQUESTED: {
          target: 'processing',
          guard: 'validAnalysisRequest',
          actions: 'beginAnalysis',
        },
        ARTIFACT_REQUESTED: {
          target: 'processing',
          guard: 'validArtifactRequest',
          actions: 'beginArtifact',
        },
        DELETE_REQUESTED: DELETE_REQUEST_TRANSITION,
      },
    },
    processing: {
      on: {
        JOB_REVIEW_READY: {
          target: 'reviewing',
          guard: 'validReviewCandidate',
          actions: 'stageReviewCandidate',
        },
        JOB_FAILED: {
          target: 'ready',
          guard: 'matchingJobFailure',
          actions: 'recordJobFailure',
        },
      },
    },
    reviewing: {
      on: {
        ANALYSIS_APPROVED: {
          target: 'ready',
          guard: 'matchingAnalysisApproval',
          actions: 'approveAnalysis',
        },
        ARTIFACT_APPROVED: {
          target: 'ready',
          guard: 'matchingArtifactApproval',
          actions: 'approveArtifact',
        },
        ARTIFACT_REJECTED: {
          target: 'ready',
          guard: 'matchingArtifactRejection',
          actions: 'rejectCandidate',
        },
        ANALYSIS_REJECTED: {
          target: 'ready',
          guard: 'matchingAnalysisRejection',
          actions: 'rejectCandidate',
        },
      },
    },
    deleting: {
      on: {
        DELETE_CONFIRMED: {
          target: 'deleted',
          guard: 'deletionConfirmed',
          actions: 'purgeDeletedDossier',
        },
        DELETE_FAILED: {
          target: 'deletionFailed',
          guard: 'matchingDeleteFailure',
          actions: 'recordDeletionFailure',
        },
      },
    },
    deletionFailed: {
      on: {
        DELETE_RETRIED: {
          target: 'deleting',
          guard: 'matchingDeleteRetry',
          actions: 'retryDeletion',
        },
      },
    },
    deleted: { type: 'final' },
  },
});

export type CopilotDossierSnapshot = SnapshotFrom<typeof copilotDossierMachine>;

export interface PersistedCopilotDossierProjection {
  state: CopilotDossierStateValue;
  context: CopilotDossierContext;
}

function validPersistedSession(session: CopilotDossierSession | null): boolean {
  return (
    session === null ||
    (nonEmpty(session.sessionId) &&
      (session.continuationToken === null || nonEmpty(session.continuationToken)))
  );
}

/**
 * Resolve a durable dossier projection without replaying synthetic history.
 * Invalid state/context combinations fail closed instead of becoming actors.
 */
export function resolveCopilotDossierSnapshot(
  projection: PersistedCopilotDossierProjection
): CopilotDossierSnapshot | null {
  const { state, context } = projection;
  const hasConsent =
    context.consent !== null &&
    Number.isFinite(context.consent.confirmedAtMs) &&
    isValidCopilotConsentSelection(context.consent);
  const noWork = context.activeJob === null && context.reviewCandidate === null;
  const baseValid =
    nonEmpty(context.userId) &&
    nonEmpty(context.missionId) &&
    validPersistedSession(context.session) &&
    Array.isArray(context.artifacts) &&
    context.artifacts.length <= MAX_COPILOT_APPROVED_ARTIFACTS &&
    typeof context.providerMayExist === 'boolean';
  if (!baseValid) return null;

  const valid = (() => {
    switch (state) {
      case 'empty':
      case 'consenting':
        return context.consent === null && noWork && context.reviewCandidate === null;
      case 'ready':
        return hasConsent && noWork && context.error?.code !== 'DELETE_FAILED';
      case 'processing':
        return (
          hasConsent &&
          context.activeJob !== null &&
          nonEmpty(context.activeJob.jobId) &&
          context.reviewCandidate === null &&
          context.error === null
        );
      case 'reviewing':
        return (
          hasConsent &&
          context.activeJob !== null &&
          nonEmpty(context.activeJob.jobId) &&
          context.reviewCandidate !== null &&
          nonEmpty(context.reviewCandidate.jobId) &&
          context.activeJob.jobId === context.reviewCandidate.jobId &&
          context.activeJob.kind === context.reviewCandidate.result.kind &&
          context.session !== null &&
          context.error === null
        );
      case 'deleting':
        return (
          hasConsent &&
          noWork &&
          context.error === null &&
          context.deletionRequestedAtMs !== null &&
          Number.isFinite(context.deletionRequestedAtMs)
        );
      case 'deletionFailed':
        return (
          hasConsent &&
          noWork &&
          context.error?.code === 'DELETE_FAILED' &&
          context.deletionRequestedAtMs !== null &&
          Number.isFinite(context.deletionRequestedAtMs)
        );
      case 'deleted':
        return (
          context.consent === null &&
          context.session === null &&
          noWork &&
          context.analysis === null &&
          context.artifacts.length === 0 &&
          context.error === null
        );
    }
  })();
  if (!valid) return null;

  try {
    return copilotDossierMachine.resolveState({ value: state, context });
  } catch {
    return null;
  }
}
