/**
 * Parse and validate generation results from LLM output.
 *
 * Core module: pure functions, no I/O, no side effects.
 */

import { z } from 'zod';
import type { GeneratedAsset, GenerationType } from '../types/generation';

/**
 * Schema for a generated asset from LLM.
 */
export const GeneratedAssetSchema = z.object({
  type: z.enum(['pitch', 'cover-message', 'cv-summary']),
  content: z.string().min(10, 'Generated content too short'),
});

/**
 * Parse raw LLM output into a clean string.
 * Strips markdown formatting, code fences, etc.
 */
export const cleanGenerationOutput = (raw: string): string => {
  let cleaned = raw.trim();

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Strip surrounding quotes
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Strip leading/trailing lines that look like meta-commentary
  const lines = cleaned.split('\n');
  const contentLines = lines.filter((line) => {
    const trimmed = line.trim().toLowerCase();
    return (
      !trimmed.startsWith('voici') &&
      !trimmed.startsWith('here is') &&
      !trimmed.startsWith('voilà') &&
      !trimmed.startsWith('--') &&
      trimmed.length > 0
    );
  });

  return contentLines.join('\n').trim();
};

/**
 * Validate that generated content is usable.
 */
export const isValidGeneration = (content: string): boolean => {
  return content.length >= 20 && content.length <= 5000;
};

/**
 * Build a GeneratedAsset from raw LLM output.
 */
export const createGeneratedAsset = (
  missionId: string,
  type: GenerationType,
  rawContent: string,
  idPrefix: string,
  now: number,
  modelUsed: string = 'unknown'
): GeneratedAsset => {
  const content = cleanGenerationOutput(rawContent);
  return {
    id: `${idPrefix}-${type}-${now}`,
    missionId,
    type,
    content,
    createdAt: now,
    modelUsed,
  };
};
