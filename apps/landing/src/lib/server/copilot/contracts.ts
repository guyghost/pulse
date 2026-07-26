import {
  COPILOT_DOSSIER_STATES,
  COPILOT_MISSION_FIELD_ALLOWLIST,
  MAX_COPILOT_APPROVED_ARTIFACTS,
  COPILOT_OPERATION_KINDS,
  COPILOT_PROFILE_FIELD_ALLOWLIST,
  MAX_COPILOT_EVIDENCE_ITEMS,
  REMOTE_COPILOT_JOB_STATES,
  isReviewableCopilotResult,
  type CopilotConsentSelection,
} from '@pulse/domain';
import { z } from 'zod';

import type { PublicCopilotDossierProjection } from './types';

const consentSchema = z
  .object({
    missionFields: z.array(z.string()).max(9),
    profileFields: z.array(z.string()).max(6),
    evidenceIds: z.array(z.string().trim().min(1).max(256)).max(24),
  })
  .strict();

export const createDossierBodySchema = z
  .object({
    missionId: z.string().trim().min(1).max(256),
    consent: consentSchema,
  })
  .strict();

export const createJobBodySchema = z
  .object({
    schemaVersion: z.literal(1),
    inputHash: z.string().regex(/^[0-9a-f]{64}$/),
    missionId: z.string().trim().min(1).max(256),
    kind: z.enum(COPILOT_OPERATION_KINDS),
    consent: consentSchema,
    input: z.unknown(),
    tjmFacts: z.unknown(),
  })
  .strict();

const publicConsentSchema = z
  .object({
    missionFields: z
      .array(z.enum(COPILOT_MISSION_FIELD_ALLOWLIST))
      .max(COPILOT_MISSION_FIELD_ALLOWLIST.length),
    profileFields: z
      .array(z.enum(COPILOT_PROFILE_FIELD_ALLOWLIST))
      .max(COPILOT_PROFILE_FIELD_ALLOWLIST.length),
    evidenceIds: z.array(z.string().trim().min(1).max(256)).max(MAX_COPILOT_EVIDENCE_ITEMS),
  })
  .strict();

const publicTimestampSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const publicApprovedAnalysisResultSchema = z.custom<
  NonNullable<PublicCopilotDossierProjection['analysis']>['result']
>(
  (value) =>
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'analysis',
  'Approved analysis result is required'
);
const publicApprovedAnalysisSchema = z
  .object({
    jobId: z.string().trim().min(1).max(256),
    result: publicApprovedAnalysisResultSchema,
    approvedAtMs: publicTimestampSchema,
  })
  .strict();
const publicApprovedArtifactSchema = z
  .object({
    artifactId: z.string().trim().min(1).max(256),
    jobId: z.string().trim().min(1).max(256),
    kind: z.enum(['pitch', 'cover-message', 'cv-summary', 'tjm-coach']),
    draft: z.string().trim().min(1).max(256_000),
    approvedAtMs: publicTimestampSchema,
  })
  .strict();

/** Fail-closed response contract for the owner-only, side-effect-free read. */
export const publicCopilotDossierSchema: z.ZodType<PublicCopilotDossierProjection> = z
  .object({
    missionId: z.string().trim().min(1).max(256),
    state: z.enum(COPILOT_DOSSIER_STATES),
    consent: publicConsentSchema,
    analysis: publicApprovedAnalysisSchema.nullable(),
    approvedArtifacts: z.array(publicApprovedArtifactSchema).max(MAX_COPILOT_APPROVED_ARTIFACTS),
    activeJob: z
      .object({
        jobId: z.string().trim().min(1).max(256),
        kind: z.enum(COPILOT_OPERATION_KINDS),
        state: z.enum(REMOTE_COPILOT_JOB_STATES),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((projection, context) => {
    const consentHasDuplicates = [
      projection.consent.missionFields,
      projection.consent.profileFields,
      projection.consent.evidenceIds,
    ].some((identifiers) => new Set(identifiers.map(String)).size !== identifiers.length);
    if (consentHasDuplicates) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['consent'],
        message: 'Duplicate consent',
      });
    }
    if (
      projection.analysis !== null &&
      !isReviewableCopilotResult(
        projection.analysis.result,
        'analysis',
        projection.consent.evidenceIds
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['analysis'],
        message: 'Approved analysis is invalid',
      });
    }
    const requiresActiveJob = projection.state === 'processing' || projection.state === 'reviewing';
    if (requiresActiveJob !== (projection.activeJob !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['activeJob'],
        message: 'Active job correlation does not match dossier state',
      });
    }
  });

export function parseConsent(value: unknown): CopilotConsentSelection {
  return consentSchema.parse(value) as CopilotConsentSelection;
}

export function validIdempotencyKey(value: string | null): value is string {
  return (
    value !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  );
}
