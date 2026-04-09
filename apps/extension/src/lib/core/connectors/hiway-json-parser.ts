import type { Mission } from '../types/mission';
import { createMission, detectRemote, stripHtml } from './parser-utils';

/**
 * Hiway Supabase row shape for `freelance_posted_missions` table.
 * Matches the REAL columns discovered from the live API (2026-03-30).
 *
 * Notable differences from a naive guess:
 *   - `budget` is a STRING (e.g. "550"), not a number called `tjm`
 *   - `skills` is a comma-separated STRING, not string[]
 *   - `mission_location` is the city (e.g. "lille")
 *   - `location` is remote info (e.g. "Télétravail 2j/semaine"), NOT the city
 *   - `duration` is a range string like "12+", "6-12", "3-6"
 *   - Fields like `tjm`, `daily_rate`, `stack`, `city`, `slug` do NOT exist
 */
export interface HiwayMissionRow {
  id: string;
  title: string | null;
  description: string | null;
  company: string | null;
  budget: string | null; // TJM as string, e.g. "550", "600"
  skills: string | null; // Comma-separated, e.g. "scrum, agile, safe"
  start_date: string | null; // ISO date, e.g. "2026-04-01"
  posted_date: string | null; // ISO date, e.g. "2026-03-20"
  mission_location: string | null; // City, e.g. "lille", "Paris"
  location: string | null; // Remote info, e.g. "Télétravail 2j/semaine"
  duration: string | null; // Range string, e.g. "12+", "6-12", "3-6"
  status: string | null; // e.g. "En attente"
  posted_by: string | null; // e.g. "freelance"
  business_fee_type: string | null; // e.g. "fixed", "percentage"
  business_fee_amount: string | null; // e.g. "30", "5"
  created_at: string | null;
  updated_at: string | null;
}

// ── Pure helpers ─────────────────────────────────────────────────

/**
 * Parse a budget string (e.g. "550", "600") into a TJM number.
 * Returns null if the value cannot be parsed or is unreasonable (< 50 or > 9999).
 */
export function parseBudgetToTJM(budget: string | null | undefined): number | null {
  if (!budget) {
    return null;
  }
  const trimmed = budget.trim().replace(/[^\d]/g, '');
  if (!trimmed) {
    return null;
  }
  const n = parseInt(trimmed, 10);
  if (isNaN(n) || n < 50 || n > 9999) {
    return null;
  }
  return n;
}

/**
 * Split a comma-separated skills string into a cleaned array.
 * e.g. "scrum, agile, safe" → ["scrum", "agile", "safe"]
 */
export function parseSkillsString(skills: string | null | undefined): string[] {
  if (!skills || typeof skills !== 'string') {
    return [];
  }
  return skills
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Normalize Hiway duration strings into human-readable French.
 *   "12+"  → "12+ mois"
 *   "6-12" → "6-12 mois"
 *   "3-6"  → "3-6 mois"
 *   "3"    → "3 mois"
 *   Already has "mois" → keep as-is
 */
export function normalizeDuration(duration: string | null | undefined): string | null {
  if (!duration || typeof duration !== 'string') {
    return null;
  }
  const trimmed = duration.trim();
  if (!trimmed) {
    return null;
  }
  // Already has a unit → keep as-is
  if (/mois|month|an|year|jour|day|semaine|week/i.test(trimmed)) {
    return trimmed;
  }
  // Looks like a number or range (e.g. "12+", "6-12", "3")
  if (/^[\d][\d+-]*$/.test(trimmed)) {
    return `${trimmed} mois`;
  }
  return trimmed;
}

/**
 * Detect remote type from Hiway's `location` field (which is actually remote info).
 * Examples: "Télétravail 2j/semaine", "Télétravail", "Présentiel", "Hybride"
 */
function detectRemoteFromHiway(remoteInfo: string | null | undefined): Mission['remote'] {
  if (!remoteInfo) {
    return null;
  }
  const lower = remoteInfo.toLowerCase();
  // Full remote: no mention of days on-site
  if (
    lower.includes('full remote') ||
    lower.includes('télétravail complet') ||
    lower.includes('teletravail complet') ||
    (lower.includes('télétravail') && !lower.includes('/semaine') && !lower.includes('jour'))
  ) {
    return 'full';
  }
  // Hybrid: mentions days per week or partial remote
  if (
    lower.includes('hybride') ||
    lower.includes('hybrid') ||
    lower.includes('/semaine') ||
    lower.includes('jour')
  ) {
    return 'hybrid';
  }
  // On-site
  if (
    lower.includes('présentiel') ||
    lower.includes('presentiel') ||
    lower.includes('sur site') ||
    lower.includes('on-site') ||
    lower.includes('onsite')
  ) {
    return 'onsite';
  }
  // Fallback to generic detector
  return detectRemote(remoteInfo);
}

// ── Main parser ──────────────────────────────────────────────────

/**
 * Normalizes a HiwayMissionRow into a Mission object.
 * Pure function — no I/O, handles all field variations from the real Supabase API.
 */
export function parseHiwayMissionRow(
  row: HiwayMissionRow,
  now: Date,
  baseUrl: string
): Mission | null {
  // Required field: id
  if (!row.id || typeof row.id !== 'string') {
    return null;
  }

  // Required field: title
  const title = row.title?.trim();
  if (!title) {
    return null;
  }

  // Build URL — Hiway has no slug or URL field, use ID
  const url = `${baseUrl}/admin/freelance/mission/${row.id}`;

  // Client = company
  const client = row.company?.trim() || null;

  // Skills: comma-separated string → array
  const stack = parseSkillsString(row.skills);

  // TJM: budget string → number
  const tjm = parseBudgetToTJM(row.budget);

  // Location: mission_location is the city, location is the remote info
  const location = row.mission_location?.trim() || null;

  // Remote: derived from the `location` field (which is remote info)
  const remote = detectRemoteFromHiway(row.location);

  // Duration: normalize range strings
  const duration = normalizeDuration(row.duration);

  // Start date: ISO date string passthrough
  const startDate = row.start_date?.trim() || null;

  // Description
  const description = stripHtml(row.description ?? '');

  return createMission({
    id: `hw-${row.id}`,
    title,
    client,
    description,
    stack,
    tjm,
    location,
    remote,
    duration,
    startDate,
    url,
    source: 'hiway',
    scrapedAt: now,
    publishedAt: row.created_at ?? row.posted_date ?? null,
  });
}

/**
 * Parses an array of Hiway Supabase rows into Mission objects.
 * Pure function — filters out invalid rows.
 */
export const parseHiwayJSON = (rows: unknown[], now: Date, baseUrl: string): Mission[] => {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      // Type guard: ensure row is an object
      if (typeof row !== 'object' || row === null) {
        return null;
      }
      return parseHiwayMissionRow(row as HiwayMissionRow, now, baseUrl);
    })
    .filter((m): m is Mission => m !== null);
};
