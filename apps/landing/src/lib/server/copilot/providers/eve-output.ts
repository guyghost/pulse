import {
  COPILOT_OPERATION_KINDS,
  COPILOT_MISSION_FIELD_ALLOWLIST,
  COPILOT_PROFILE_FIELD_ALLOWLIST,
  COPILOT_TJM_FACT_IDS,
  MAX_COPILOT_EVIDENCE_ITEMS,
  MAX_COPILOT_LIST_ITEMS,
  MAX_COPILOT_TEXT_CHARS,
  isReviewableCopilotResult,
  type CopilotOperationKind,
  type CopilotTjmFactId,
  type CopilotValidatedResult,
} from '@pulse/domain';
import { z } from 'zod';

import type { EveJsonObject } from './eve-transport';

const boundedTextSchema = z
  .string()
  .min(1)
  .max(MAX_COPILOT_TEXT_CHARS)
  .refine((value) => value.trim().length > 0);

const evidenceClaimSchema = z
  .object({
    text: boundedTextSchema,
    evidenceIds: z
      .array(boundedTextSchema)
      .min(1)
      .max(MAX_COPILOT_EVIDENCE_ITEMS)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();

const sourceRefSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('experience'), id: boundedTextSchema, quote: boundedTextSchema })
    .strict(),
  z
    .object({
      kind: z.literal('mission-field'),
      id: z.enum(COPILOT_MISSION_FIELD_ALLOWLIST),
      quote: boundedTextSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('profile-field'),
      id: z.enum(COPILOT_PROFILE_FIELD_ALLOWLIST),
      quote: boundedTextSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('tjm-fact'),
      id: z.enum(COPILOT_TJM_FACT_IDS),
      quote: boundedTextSchema,
    })
    .strict(),
]);

const draftSegmentSchema = z
  .object({
    text: boundedTextSchema,
    sourceRefs: z.array(sourceRefSchema).min(1).max(MAX_COPILOT_EVIDENCE_ITEMS),
  })
  .strict();

const copilotResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(COPILOT_OPERATION_KINDS),
    evidenceClaims: z.array(evidenceClaimSchema).max(MAX_COPILOT_LIST_ITEMS),
    gaps: z.array(boundedTextSchema).max(MAX_COPILOT_LIST_ITEMS),
    risks: z.array(boundedTextSchema).max(MAX_COPILOT_LIST_ITEMS),
    questions: z.array(boundedTextSchema).max(MAX_COPILOT_LIST_ITEMS),
    draftSegments: z.array(draftSegmentSchema).min(1).max(MAX_COPILOT_LIST_ITEMS).optional(),
  })
  .strict();

export const COPILOT_RESULT_JSON_SCHEMA: EveJsonObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { const: 1 },
    kind: { enum: [...COPILOT_OPERATION_KINDS] },
    evidenceClaims: {
      type: 'array',
      maxItems: MAX_COPILOT_LIST_ITEMS,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: MAX_COPILOT_TEXT_CHARS },
          evidenceIds: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_COPILOT_EVIDENCE_ITEMS,
            uniqueItems: true,
            items: { type: 'string', minLength: 1, maxLength: MAX_COPILOT_TEXT_CHARS },
          },
        },
        required: ['text', 'evidenceIds'],
      },
    },
    gaps: {
      type: 'array',
      maxItems: MAX_COPILOT_LIST_ITEMS,
      items: { type: 'string', minLength: 1, maxLength: MAX_COPILOT_TEXT_CHARS },
    },
    risks: {
      type: 'array',
      maxItems: MAX_COPILOT_LIST_ITEMS,
      items: { type: 'string', minLength: 1, maxLength: MAX_COPILOT_TEXT_CHARS },
    },
    questions: {
      type: 'array',
      maxItems: MAX_COPILOT_LIST_ITEMS,
      items: { type: 'string', minLength: 1, maxLength: MAX_COPILOT_TEXT_CHARS },
    },
    draftSegments: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_COPILOT_LIST_ITEMS,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: MAX_COPILOT_TEXT_CHARS },
          sourceRefs: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_COPILOT_EVIDENCE_ITEMS,
            items: {
              oneOf: [
                {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    kind: { const: 'experience' },
                    id: { type: 'string', minLength: 1, maxLength: MAX_COPILOT_TEXT_CHARS },
                    quote: { type: 'string', minLength: 1, maxLength: MAX_COPILOT_TEXT_CHARS },
                  },
                  required: ['kind', 'id', 'quote'],
                },
                {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    kind: { const: 'mission-field' },
                    id: { enum: [...COPILOT_MISSION_FIELD_ALLOWLIST] },
                    quote: { type: 'string', minLength: 1, maxLength: MAX_COPILOT_TEXT_CHARS },
                  },
                  required: ['kind', 'id', 'quote'],
                },
                {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    kind: { const: 'profile-field' },
                    id: { enum: [...COPILOT_PROFILE_FIELD_ALLOWLIST] },
                    quote: { type: 'string', minLength: 1, maxLength: MAX_COPILOT_TEXT_CHARS },
                  },
                  required: ['kind', 'id', 'quote'],
                },
                {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    kind: { const: 'tjm-fact' },
                    id: { enum: [...COPILOT_TJM_FACT_IDS] },
                    quote: { type: 'string', minLength: 1, maxLength: MAX_COPILOT_TEXT_CHARS },
                  },
                  required: ['kind', 'id', 'quote'],
                },
              ],
            },
          },
        },
        required: ['text', 'sourceRefs'],
      },
    },
  },
  required: ['schemaVersion', 'kind', 'evidenceClaims', 'gaps', 'risks', 'questions'],
  allOf: [
    {
      if: { properties: { kind: { const: 'analysis' } }, required: ['kind'] },
      then: { not: { required: ['draftSegments'] } },
      else: { required: ['draftSegments'] },
    },
  ],
};

export function validateEveCopilotResult(
  value: unknown,
  expectedKind: CopilotOperationKind,
  suppliedEvidenceIds: readonly string[],
  suppliedTjmFactIds: readonly CopilotTjmFactId[] = [],
  grounding: import('@pulse/domain').CopilotGroundingContext | null = null
): CopilotValidatedResult | null {
  const parsed = copilotResultSchema.safeParse(value);
  if (!parsed.success) return null;

  return isReviewableCopilotResult(
    parsed.data,
    expectedKind,
    suppliedEvidenceIds,
    suppliedTjmFactIds,
    grounding
  )
    ? parsed.data
    : null;
}
