import { z } from 'zod';

export const MAX_GENERATE_BODY_BYTES = 32 * 1024;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const StackSchema = z.array(z.string().trim().min(1).max(80)).max(40).optional();

export const GenerateBodySchema = z
  .object({
    missionId: z.string().trim().min(1).max(256).optional(),
    type: z.enum(['pitch', 'cover-message', 'cv-summary']),
    mission: z
      .object({
        title: optionalText(180),
        description: optionalText(8_000),
        client: optionalText(180),
        stack: StackSchema,
        location: optionalText(180),
      })
      .strict(),
    profile: z
      .object({
        jobTitle: optionalText(180),
        stack: StackSchema,
        seniority: optionalText(80),
        location: optionalText(180),
      })
      .strict(),
  })
  .strict();

export type GenerationType = z.infer<typeof GenerateBodySchema>['type'];
export type GenerateBody = z.infer<typeof GenerateBodySchema>;

type GenerateBodyParseResult =
  | { ok: true; body: GenerateBody }
  | { ok: false; status: 400 | 413; error: string };

function parseContentLength(contentLengthHeader: string | null): number | null {
  if (!contentLengthHeader) {
    return null;
  }

  const contentLength = Number(contentLengthHeader);
  return Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : null;
}

export function parseGenerateBodyText(
  rawBody: string,
  contentLengthHeader: string | null
): GenerateBodyParseResult {
  const contentLength = parseContentLength(contentLengthHeader);
  if (contentLength !== null && contentLength > MAX_GENERATE_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Request body too large' };
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_GENERATE_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Request body too large' };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body' };
  }

  const parsedBody = GenerateBodySchema.safeParse(parsedJson);
  if (!parsedBody.success) {
    return { ok: false, status: 400, error: 'Invalid generation request' };
  }

  return { ok: true, body: parsedBody.data };
}
