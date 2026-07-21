import {
  COPILOT_DOSSIER_STATES,
  MAX_COPILOT_APPROVED_ARTIFACTS,
  COPILOT_MISSION_FIELD_ALLOWLIST,
  COPILOT_OPERATION_KINDS,
  COPILOT_PROFILE_FIELD_ALLOWLIST,
  COPILOT_TJM_FACT_IDS,
  MAX_COPILOT_EVIDENCE_ITEMS,
  MAX_COPILOT_LIST_ITEMS,
  MAX_COPILOT_TEXT_CHARS,
  PREMIUM_ENTITLEMENT_STATES,
  REMOTE_COPILOT_JOB_STATES,
  copilotTjmFactIds,
  isCopilotTjmCoachFacts,
  isCopilotTransmissionAllowed,
  isReviewableCopilotResult,
  type CopilotTransmittedPayload,
} from '@pulse/domain';
import { z } from 'zod';

import { COPILOT_ERROR_CODES, COPILOT_JOB_STATUSES, type CopilotCreateApiInput } from './contracts';

export const CopilotRequestIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

export const CopilotMissionIdSchema = z.string().trim().min(1).max(256);
export const CopilotJobIdSchema = z.string().trim().min(1).max(256);
export const CopilotInputHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const CopilotOperationKindSchema = z.enum(COPILOT_OPERATION_KINDS);
export const CopilotMissionFieldSchema = z.enum(COPILOT_MISSION_FIELD_ALLOWLIST);
export const CopilotProfileFieldSchema = z.enum(COPILOT_PROFILE_FIELD_ALLOWLIST);

const unique = <T>(values: readonly T[]): boolean => new Set(values).size === values.length;

export const CopilotConsentSelectionSchema = z
  .object({
    missionFields: z
      .array(CopilotMissionFieldSchema)
      .max(COPILOT_MISSION_FIELD_ALLOWLIST.length)
      .refine(unique, 'Mission fields must be unique'),
    profileFields: z
      .array(CopilotProfileFieldSchema)
      .max(COPILOT_PROFILE_FIELD_ALLOWLIST.length)
      .refine(unique, 'Profile fields must be unique'),
    evidenceIds: z
      .array(z.string().trim().min(1).max(256))
      .max(MAX_COPILOT_EVIDENCE_ITEMS)
      .refine(unique, 'Evidence IDs must be unique'),
  })
  .strict()
  .refine(
    ({ missionFields, profileFields, evidenceIds }) =>
      missionFields.length + profileFields.length + evidenceIds.length > 0,
    'Consent selection must not be empty'
  );

export const CopilotErrorSchema = z
  .object({
    code: z.enum(COPILOT_ERROR_CODES),
    message: z.string().trim().min(1).max(512),
    retryable: z.boolean(),
  })
  .strict();

const CopilotEvidenceClaimSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_COPILOT_TEXT_CHARS),
    evidenceIds: z
      .array(z.string().trim().min(1).max(256))
      .min(1)
      .max(MAX_COPILOT_EVIDENCE_ITEMS)
      .refine(unique, 'Claim evidence IDs must be unique'),
  })
  .strict();

const BoundedTextListSchema = z
  .array(z.string().trim().min(1).max(MAX_COPILOT_TEXT_CHARS))
  .max(MAX_COPILOT_LIST_ITEMS);

const CopilotSourceRefSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('experience'),
      id: z.string().trim().min(1).max(256),
      quote: z.string().trim().min(1).max(MAX_COPILOT_TEXT_CHARS),
    })
    .strict(),
  z
    .object({
      kind: z.literal('mission-field'),
      id: CopilotMissionFieldSchema,
      quote: z.string().trim().min(1).max(MAX_COPILOT_TEXT_CHARS),
    })
    .strict(),
  z
    .object({
      kind: z.literal('profile-field'),
      id: CopilotProfileFieldSchema,
      quote: z.string().trim().min(1).max(MAX_COPILOT_TEXT_CHARS),
    })
    .strict(),
  z
    .object({
      kind: z.literal('tjm-fact'),
      id: z.enum(COPILOT_TJM_FACT_IDS),
      quote: z.string().trim().min(1).max(MAX_COPILOT_TEXT_CHARS),
    })
    .strict(),
]);

const CopilotDraftSegmentSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_COPILOT_TEXT_CHARS),
    sourceRefs: z
      .array(CopilotSourceRefSchema)
      .min(1)
      .max(MAX_COPILOT_EVIDENCE_ITEMS)
      .refine(
        (refs) => unique(refs.map((ref) => `${ref.kind}:${ref.id}`)),
        'Segment source references must be unique'
      ),
  })
  .strict();

export const CopilotValidatedResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: CopilotOperationKindSchema,
    evidenceClaims: z.array(CopilotEvidenceClaimSchema).max(MAX_COPILOT_LIST_ITEMS),
    gaps: BoundedTextListSchema,
    risks: BoundedTextListSchema,
    questions: BoundedTextListSchema,
    draftSegments: z.array(CopilotDraftSegmentSchema).min(1).max(MAX_COPILOT_LIST_ITEMS).optional(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.kind === 'analysis' && result.draftSegments !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['draftSegments'],
        message: 'Analysis has no draft segments',
      });
    }
    if (result.kind !== 'analysis' && result.draftSegments === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['draftSegments'],
        message: 'Grounded artifact segments are required',
      });
    }
  });

export const CopilotEntitlementSchema = z
  .object({
    status: z.enum(['free', 'active', 'expired', 'revoked']),
    subject: z.string().trim().min(1).max(256),
    issuedAtMs: z.number().int().nonnegative().nullable(),
    expiresAtMs: z.number().int().nonnegative().nullable(),
    creditsRemaining: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((entitlement, context) => {
    if (
      entitlement.status === 'active' &&
      (entitlement.issuedAtMs === null ||
        entitlement.expiresAtMs === null ||
        entitlement.expiresAtMs <= entitlement.issuedAtMs)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAtMs'],
        message: 'Active entitlement requires a valid time window',
      });
    }
  });

export const CopilotTjmCoachFactsSchema = z
  .object({
    schemaVersion: z.literal(1),
    confidence: z.enum(['insufficient', 'low', 'medium', 'high']),
    missionDisplayedTjm: z.number().finite().nullable(),
    profileBounds: z
      .object({
        min: z.number().finite(),
        target: z.number().finite(),
        max: z.number().finite(),
        currency: z.literal('EUR'),
      })
      .strict()
      .refine(({ min, target, max }) => min <= target && target <= max),
    market: z
      .object({
        matchedStacks: z.array(z.string().trim().min(1).max(120)).max(48),
        recordCount: z.number().int().nonnegative(),
        sampleCount: z.number().int().nonnegative(),
        min: z.number().finite().nullable(),
        weightedAverage: z.number().finite().nullable(),
        max: z.number().finite().nullable(),
        trend: z.enum(['up', 'stable', 'down']),
        lastObservedAt: z.string().trim().min(1).max(40).nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((facts, context) => {
    if (!isCopilotTjmCoachFacts(facts)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'TJM coach facts violate the shared deterministic contract',
      });
    }
  });

const CopilotTransmittedPayloadSchema = z.custom<CopilotTransmittedPayload>(
  (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  'Copilot payload must be an object'
);

export const CopilotCreateApiInputSchema: z.ZodType<CopilotCreateApiInput> = z
  .object({
    schemaVersion: z.literal(1),
    missionId: CopilotMissionIdSchema,
    kind: CopilotOperationKindSchema,
    consent: CopilotConsentSelectionSchema,
    input: CopilotTransmittedPayloadSchema,
    tjmFacts: CopilotTjmCoachFactsSchema.nullable(),
    inputHash: CopilotInputHashSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (!isCopilotTransmissionAllowed(input.input, input.consent)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['input'],
        message: 'Stored Copilot payload exceeds its consent snapshot',
      });
    }
    if ((input.kind === 'tjm-coach') !== (input.tjmFacts !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tjmFacts'],
        message: 'TJM facts must exist only for a TJM coach input',
      });
    }
  });

const CopilotJobSourceSnapshotSchema = z
  .object({
    inputHash: CopilotInputHashSchema,
    payload: CopilotTransmittedPayloadSchema,
  })
  .strict();

const CopilotJobStateObjectSchema = z
  .object({
    jobId: CopilotJobIdSchema.nullable(),
    missionId: CopilotMissionIdSchema,
    requestId: CopilotRequestIdSchema,
    kind: CopilotOperationKindSchema,
    creditCost: z.union([z.literal(0), z.literal(1)]),
    selection: CopilotConsentSelectionSchema,
    status: z.enum(COPILOT_JOB_STATUSES),
    tjmFacts: CopilotTjmCoachFactsSchema.nullable(),
    result: CopilotValidatedResultSchema.nullable(),
    error: CopilotErrorSchema.nullable(),
    creditsRemaining: z.number().int().nonnegative().nullable(),
    createdAtMs: z.number().int().nonnegative(),
    updatedAtMs: z.number().int().nonnegative(),
  })
  .strict();

export const CopilotJobSnapshotSchema = CopilotJobStateObjectSchema.extend({
  sourceSnapshot: CopilotJobSourceSnapshotSchema,
})
  .strict()
  .superRefine((job, context) => {
    if (job.updatedAtMs < job.createdAtMs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Job timestamps are not monotonic',
      });
    }
    if ((job.kind === 'tjm-coach') !== (job.tjmFacts !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tjmFacts'],
        message: 'TJM facts must exist only for a TJM coach job',
      });
    }
    if (!isCopilotTransmissionAllowed(job.sourceSnapshot.payload, job.selection)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceSnapshot', 'payload'],
        message: 'Job source snapshot exceeds its consent selection',
      });
    }
    if (
      job.result !== null &&
      !isReviewableCopilotResult(
        job.result,
        job.kind,
        job.selection.evidenceIds,
        copilotTjmFactIds(job.tjmFacts),
        { payload: job.sourceSnapshot.payload, tjmFacts: job.tjmFacts }
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['result'],
        message: 'Job result is not grounded in its immutable source snapshot',
      });
    }
  });

export const CopilotJobCheckpointSchema = CopilotJobStateObjectSchema.extend({
  version: z.literal(1),
  createInput: CopilotCreateApiInputSchema,
})
  .strict()
  .superRefine((checkpoint, context) => {
    if ((checkpoint.kind === 'tjm-coach') !== (checkpoint.tjmFacts !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tjmFacts'],
        message: 'TJM facts must exist only for a TJM coach job',
      });
    }
    if (
      checkpoint.result !== null &&
      !isReviewableCopilotResult(
        checkpoint.result,
        checkpoint.kind,
        checkpoint.selection.evidenceIds,
        copilotTjmFactIds(checkpoint.tjmFacts),
        {
          payload: checkpoint.createInput.input,
          tjmFacts: checkpoint.createInput.tjmFacts,
        }
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['result'],
        message: 'Stored result is not reviewable for this consent',
      });
    }
    if (
      checkpoint.createInput.missionId !== checkpoint.missionId ||
      checkpoint.createInput.kind !== checkpoint.kind ||
      JSON.stringify(checkpoint.createInput.consent) !== JSON.stringify(checkpoint.selection) ||
      JSON.stringify(checkpoint.createInput.tjmFacts) !== JSON.stringify(checkpoint.tjmFacts)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['createInput'],
        message: 'Stored create input diverges from its checkpoint correlation',
      });
    }
  });

export const CopilotRemoteJobSchema = CopilotJobStateObjectSchema.omit({
  jobId: true,
  creditCost: true,
  selection: true,
})
  .extend({
    jobId: CopilotJobIdSchema,
    inputHash: CopilotInputHashSchema,
    status: z.enum([
      'queued',
      'running',
      'uncertain',
      'review',
      'accepted',
      'rejected',
      'cancelling',
      'cancelled',
      'failed',
    ]),
  })
  .strict()
  .superRefine((job, context) => {
    if ((job.kind === 'tjm-coach') !== (job.tjmFacts !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tjmFacts'],
        message: 'TJM facts must exist only for a TJM coach job',
      });
    }
  });

const CopilotApprovedAnalysisResultSchema = CopilotValidatedResultSchema.and(
  z.object({ kind: z.literal('analysis') }).passthrough()
);

const CopilotApprovedAnalysisSchema = z
  .object({
    jobId: CopilotJobIdSchema,
    result: CopilotApprovedAnalysisResultSchema,
    approvedAtMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const CopilotApprovedArtifactSchema = z
  .object({
    artifactId: z.string().trim().min(1).max(256),
    jobId: CopilotJobIdSchema,
    kind: z.enum(['pitch', 'cover-message', 'cv-summary', 'tjm-coach']),
    draft: z.string().trim().min(1).max(256_000),
    approvedAtMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const CopilotDossierProjectionSchema = z
  .object({
    missionId: CopilotMissionIdSchema,
    state: z.enum(COPILOT_DOSSIER_STATES),
    consent: CopilotConsentSelectionSchema,
    analysis: CopilotApprovedAnalysisSchema.nullable(),
    approvedArtifacts: z.array(CopilotApprovedArtifactSchema).max(MAX_COPILOT_APPROVED_ARTIFACTS),
    activeJob: z
      .object({
        jobId: CopilotJobIdSchema,
        kind: CopilotOperationKindSchema,
        state: z.enum(REMOTE_COPILOT_JOB_STATES),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((dossier, context) => {
    if (
      dossier.analysis !== null &&
      !isReviewableCopilotResult(dossier.analysis.result, 'analysis', dossier.consent.evidenceIds)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['analysis'],
        message: 'Approved analysis is not grounded in cumulative consent',
      });
    }
    if (
      new Set(dossier.approvedArtifacts.map((artifact) => artifact.artifactId)).size !==
      dossier.approvedArtifacts.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approvedArtifacts'],
        message: 'Approved artifact IDs must be unique',
      });
    }
    const requiresActiveJob = dossier.state === 'processing' || dossier.state === 'reviewing';
    if (requiresActiveJob !== (dossier.activeJob !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['activeJob'],
        message: 'Active job correlation does not match dossier state',
      });
    }
  });

export const CopilotSessionCredentialSchema = z
  .object({
    version: z.literal(1),
    subject: z.string().trim().min(1).max(256),
    bearer: z.string().trim().min(16).max(8192),
  })
  .strict();

export const CopilotDeletionReceiptSchema = z
  .object({
    version: z.literal(1),
    missionId: CopilotMissionIdSchema,
    disposition: z.enum(['deleted', 'retention-confirmed', 'not-created']),
    confirmedAtMs: z.number().int().nonnegative(),
  })
  .strict();

export const CopilotLinkResultPayloadSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      requestId: CopilotRequestIdSchema,
      outcome: z.literal('linked'),
      subject: z.string().trim().min(1).max(256),
      error: z.null(),
    })
    .strict(),
  z
    .object({
      requestId: CopilotRequestIdSchema,
      outcome: z.literal('error'),
      subject: z.null(),
      error: CopilotErrorSchema,
    })
    .strict(),
]);

export const CopilotEntitlementResultPayloadSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      requestId: CopilotRequestIdSchema,
      outcome: z.literal('synced'),
      state: z.enum(PREMIUM_ENTITLEMENT_STATES),
      entitlement: CopilotEntitlementSchema,
      error: z.null(),
    })
    .strict(),
  z
    .object({
      requestId: CopilotRequestIdSchema,
      outcome: z.literal('error'),
      state: z.enum(PREMIUM_ENTITLEMENT_STATES),
      entitlement: z.null(),
      error: CopilotErrorSchema,
    })
    .strict(),
]);

export const CopilotJobResultPayloadSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      requestId: CopilotRequestIdSchema,
      missionId: CopilotMissionIdSchema,
      outcome: z.literal('ok'),
      job: CopilotJobSnapshotSchema,
      deletionReceipt: z.null(),
      error: z.null(),
    })
    .strict(),
  z
    .object({
      requestId: CopilotRequestIdSchema,
      missionId: CopilotMissionIdSchema,
      outcome: z.literal('local'),
      job: CopilotJobSnapshotSchema,
      deletionReceipt: z.null(),
      error: CopilotErrorSchema,
    })
    .strict(),
  z
    .object({
      requestId: CopilotRequestIdSchema,
      missionId: CopilotMissionIdSchema,
      outcome: z.literal('not_found'),
      job: z.null(),
      deletionReceipt: CopilotDeletionReceiptSchema.nullable(),
      error: z.null(),
    })
    .strict(),
  z
    .object({
      requestId: CopilotRequestIdSchema,
      missionId: CopilotMissionIdSchema,
      outcome: z.literal('error'),
      job: z.null(),
      deletionReceipt: z.null(),
      error: CopilotErrorSchema,
    })
    .strict(),
]);

export const CopilotDossierResultPayloadSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      requestId: CopilotRequestIdSchema,
      missionId: CopilotMissionIdSchema,
      outcome: z.literal('ok'),
      dossier: CopilotDossierProjectionSchema,
      error: z.null(),
    })
    .strict(),
  z
    .object({
      requestId: CopilotRequestIdSchema,
      missionId: CopilotMissionIdSchema,
      outcome: z.literal('not_found'),
      dossier: z.null(),
      error: z.null(),
    })
    .strict(),
  z
    .object({
      requestId: CopilotRequestIdSchema,
      missionId: CopilotMissionIdSchema,
      outcome: z.literal('error'),
      dossier: z.null(),
      error: CopilotErrorSchema,
    })
    .strict(),
]);

export const CopilotDeleteResultPayloadSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      requestId: CopilotRequestIdSchema,
      missionId: CopilotMissionIdSchema,
      outcome: z.literal('deleted'),
      disposition: z.enum(['deleted', 'retention-confirmed', 'not-created']),
      receipt: CopilotDeletionReceiptSchema,
      error: z.null(),
    })
    .strict(),
  z
    .object({
      requestId: CopilotRequestIdSchema,
      missionId: CopilotMissionIdSchema,
      outcome: z.literal('error'),
      disposition: z.null(),
      receipt: z.null(),
      error: CopilotErrorSchema,
    })
    .strict(),
]);

export const CopilotRemoteErrorEnvelopeSchema = z.object({ error: CopilotErrorSchema }).strict();

export const CopilotRemoteDeleteSchema = z
  .object({
    missionId: CopilotMissionIdSchema,
    disposition: z.enum(['deleted', 'retention-confirmed', 'not-created']),
  })
  .strict();
