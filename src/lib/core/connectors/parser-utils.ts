import type { Mission, MissionSource, RemoteType } from '../types/mission';

/**
 * Extract a TJM (daily rate) number from raw text.
 * Strips whitespace/non-breaking spaces, returns the first integer found.
 */
export function parseTJM(text: string): number | null {
  const normalized = text.replace(/[\s\u00A0]/g, '');
  const match = normalized.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Detect remote work type from free-text content.
 * Handles both accented and unaccented French variants.
 */
export function detectRemote(text: string): RemoteType | null {
  const lower = text.toLowerCase();
  if (
    lower.includes('full remote') ||
    lower.includes('télétravail complet') ||
    lower.includes('teletravail complet')
  ) {
    return 'full';
  }
  if (lower.includes('hybride') || lower.includes('hybrid')) {
    return 'hybrid';
  }
  if (
    lower.includes('sur site') ||
    lower.includes('on-site') ||
    lower.includes('onsite')
  ) {
    return 'onsite';
  }
  return null;
}

/**
 * Build a Mission with scoring fields defaulted to null.
 * Avoids repeating `score: null, semanticScore: null, semanticReason: null` in every parser.
 */
export type MissionFields = Omit<Mission, 'score' | 'semanticScore' | 'semanticReason'>;

export function createMission(fields: MissionFields): Mission {
  return {
    ...fields,
    score: null,
    semanticScore: null,
    semanticReason: null,
  };
}
