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
/**
 * Intro words that LLMs prepend to generated content ("Voici le pitch:",
 * "Here is your cover message"). Matching is case-insensitive on the
 * trimmed line.
 */
const META_INTRO_WORDS = ['voici', 'here is', 'voilà'] as const;

const isMetaIntroLine = (line: string): boolean => {
  const lowered = line.trim().toLowerCase();
  return META_INTRO_WORDS.some((word) => lowered.startsWith(word));
};

/**
 * Split a meta-intro line at its first colon: "Voici ma candidature: text"
 * keeps "text". Returns null when the line is pure meta-commentary (nothing
 * usable after the colon).
 */
const stripMetaIntro = (line: string): string | null => {
  const trimmed = line.trim();
  const colonIndex = trimmed.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }
  const remainder = trimmed.slice(colonIndex + 1).trim();
  return remainder.length > 0 ? remainder : null;
};

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

  // Strip lines that look like meta-commentary ("Voici le pitch:", "--").
  // Content written after the intro colon survives; a pure intro line is
  // dropped. The filter can never empty a non-empty output: a single-line
  // generation starting with "Voici ..." IS the content (DAO #208).
  const contentLines: string[] = [];
  for (const line of cleaned.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('--')) {
      continue;
    }
    if (isMetaIntroLine(trimmed)) {
      const remainder = stripMetaIntro(trimmed);
      if (remainder !== null) {
        contentLines.push(remainder);
      }
      continue;
    }
    contentLines.push(line);
  }

  const filtered = contentLines.join('\n').trim();
  return filtered.length > 0 ? filtered : cleaned;
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
