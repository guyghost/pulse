import type { Mission, RemoteType } from '../types/mission';
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
 *
 * Safety (CodeQL js/double-escaping, js/incomplete-multi-character-sanitization):
 * entities are decoded in a SINGLE pass (the replacement output is never
 * re-scanned, so `&amp;lt;` stays `&lt;` instead of collapsing to `<`), and
 * tag-stripping runs AFTER decoding so entities cannot resurrect markup
 * (`&lt;script&gt;` decodes to `<script>` and is then removed).
 */
const HTML_ENTITY_RE = /&(nbsp|amp|lt|gt|quot|#39|#x[0-9a-f]+|#[0-9]+);/gi;

function decodeHtmlEntity(entity: string, code: string): string {
  const lower = entity.toLowerCase();
  const numeric = code.toLowerCase();
  switch (lower) {
    case '&nbsp;':
      return ' ';
    case '&amp;':
      return '&';
    case '&lt;':
      return '<';
    case '&gt;':
      return '>';
    case '&quot;':
      return '"';
    case '&#39;':
      return "'";
    default:
      return String.fromCodePoint(
        numeric.startsWith('#x') ? parseInt(numeric.slice(2), 16) : parseInt(numeric.slice(1), 10)
      );
  }
}

export function stripHtml(html: string): string {
  return (
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(HTML_ENTITY_RE, decodeHtmlEntity)
      .replace(/<[^>]*>/g, '')
      // Remove '<' that could still open a tag (unclosed fragments like
      // '<script src=x'). Comparisons like 'a < b' — '<' followed by a space —
      // are preserved. CodeQL js/incomplete-multi-character-sanitization.
      .replace(/<(?=[a-zA-Z!/?])/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim()
  );
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
    tjmMin: fields.tjmMin ?? null,
    tjmMax: fields.tjmMax ?? null,
    startDate: fields.startDate ?? null,
    seniority: fields.seniority ?? null,
    publishedAt: fields.publishedAt ?? null,
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
  };
}
