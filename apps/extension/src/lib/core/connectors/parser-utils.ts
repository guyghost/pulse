import type { Mission, MissionSource, RemoteType } from '../types/mission';
import type { SeniorityLevel } from '../types/profile';

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
  if (lower.includes('sur site') || lower.includes('on-site') || lower.includes('onsite')) {
    return 'onsite';
  }
  return null;
}

/**
 * Strip HTML tags and normalize whitespace from raw text.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Build a Mission with scoring fields defaulted to null.
 * Avoids repeating `score: null, semanticScore: null, semanticReason: null` in every parser.
 * `startDate` is optional — defaults to null if not provided by the parser.
 */
export type MissionFields = Omit<
  Mission,
  | 'scoreBreakdown'
  | 'score'
  | 'semanticScore'
  | 'semanticReason'
  | 'startDate'
  | 'seniority'
  | 'publishedAt'
> & {
  startDate?: string | null;
  seniority?: SeniorityLevel | null;
  publishedAt?: string | null;
};

export function createMission(fields: MissionFields): Mission {
  return {
    ...fields,
    title: stripHtml(fields.title ?? ''),
    description: stripHtml(fields.description ?? ''),
    stack: fields.stack.filter((s): s is string => typeof s === 'string' && s.length > 0),
    startDate: fields.startDate ?? null,
    seniority: fields.seniority ?? null,
    publishedAt: fields.publishedAt ?? null,
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
  };
}
