import {
  MAX_COPILOT_EVIDENCE_ITEMS,
  MAX_COPILOT_LIST_ITEMS,
  MAX_COPILOT_MISSION_DESCRIPTION_CHARS,
  MAX_COPILOT_TEXT_CHARS,
  type CopilotTransmittedPayload,
} from '@pulse/domain';
import { z } from 'zod';

const boundedText = z.string().min(1).max(MAX_COPILOT_TEXT_CHARS);
const nullableBoundedText = boundedText.nullable();
const boundedTextList = z.array(boundedText).max(MAX_COPILOT_LIST_ITEMS);

const missionSchema = z
  .object({
    title: boundedText.optional(),
    description: z.string().min(1).max(MAX_COPILOT_MISSION_DESCRIPTION_CHARS).optional(),
    client: nullableBoundedText.optional(),
    stack: boundedTextList.optional(),
    location: nullableBoundedText.optional(),
    remoteMode: nullableBoundedText.optional(),
    duration: nullableBoundedText.optional(),
    startDate: nullableBoundedText.optional(),
    displayedTjm: z
      .object({
        min: z.number().finite().nullable(),
        max: z.number().finite().nullable(),
        currency: z.literal('EUR'),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

const profileSchema = z
  .object({
    jobTitle: boundedText.optional(),
    seniority: boundedText.optional(),
    location: nullableBoundedText.optional(),
    keywords: boundedTextList.optional(),
    stack: boundedTextList.optional(),
    tjmBounds: z
      .object({
        min: z.number().finite(),
        target: z.number().finite(),
        max: z.number().finite(),
        currency: z.literal('EUR'),
      })
      .strict()
      .refine((value) => value.min <= value.target && value.target <= value.max)
      .nullable()
      .optional(),
  })
  .strict();

const experienceEvidenceSchema = z
  .object({
    evidenceId: boundedText,
    role: boundedText,
    company: nullableBoundedText,
    summary: boundedText,
    skills: boundedTextList,
  })
  .strict();

const transmittedPayloadSchema = z
  .object({
    mission: missionSchema,
    profile: profileSchema,
    experienceEvidence: z.array(experienceEvidenceSchema).max(MAX_COPILOT_EVIDENCE_ITEMS),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.experienceEvidence.map((item) => item.evidenceId)).size ===
      value.experienceEvidence.length
  );

export function validateEveCopilotPayload(value: unknown): CopilotTransmittedPayload | null {
  const parsed = transmittedPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
