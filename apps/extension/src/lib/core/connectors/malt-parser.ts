import type { Mission } from '../types/mission';
import { createMission, detectRemote, stripHtml } from './parser-utils';

/**
 * Malt project/mission row shape — represents the expected fields from
 * Malt's mission search API.
 *
 * Malt is a SPA (no server-rendered HTML), so missions come from a JSON API.
 * Field names are based on Malt's public search response shape; the parser
 * uses generous fallbacks to handle API variations.
 *
 * ⚠️ The exact field names should be verified against the live API response.
 *    Update this interface if the API shape differs.
 */
export interface MaltProjectRow {
  id: string;
  title: string | null;
  /** Alternative title field used by some Malt API versions */
  name: string | null;
  description: string | null;
  /** Client/company info — Malt nests this under `company` or `client` */
  company: { name?: string | null } | null;
  client: { name?: string | null } | null;
  /** Flat client name (some endpoints flatten the nesting) */
  clientName: string | null;
  /** Skills — array of objects with name/label, or plain strings */
  skills: Array<{ name?: string; label?: string } | string> | null;
  /** Daily rate (TJM) — Malt may use dailyRate, averageDailyRate, or budget */
  dailyRate: number | null;
  averageDailyRate: number | null;
  budget: number | null;
  /** Location — Malt uses `location` (city) or `city` */
  location: string | null;
  city: string | null;
  /** Working mode — Malt uses `workingMode` or `remote` */
  workingMode: string | null;
  remote: string | null;
  /** Duration — free-text string like "6 months", "3-6 mois" */
  duration: string | null;
  missionLength: string | null;
  /** Dates — ISO 8601 */
  startDate: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  /** For building the mission URL */
  slug: string | null;
  url: string | null;
}

// ── Pure helpers ──────────────────────────────────────────────────

/**
 * Extract the title from a Malt project row.
 * Tries `title` first, then `name`.
 */
export function extractTitle(row: MaltProjectRow): string | null {
  const title = row.title?.trim() || row.name?.trim();
  return title || null;
}

/**
 * Extract the client/company name from a Malt project row.
 * Handles nested `company.name`, `client.name`, and flat `clientName`.
 */
export function extractClient(row: MaltProjectRow): string | null {
  return row.company?.name?.trim() || row.client?.name?.trim() || row.clientName?.trim() || null;
}

/**
 * Normalize Malt's skills array into a flat string array.
 * Handles objects with `name`/`label` and plain strings.
 *
 *   [{ name: "React" }, { label: "TypeScript" }, "Node.js"]
 *   → ["React", "TypeScript", "Node.js"]
 */
export function extractSkills(skills: MaltProjectRow['skills']): string[] {
  if (!Array.isArray(skills)) {
    return [];
  }
  return skills
    .map((skill) => {
      if (typeof skill === 'string') {
        return skill.trim();
      }
      if (skill && typeof skill === 'object') {
        return (skill.name ?? skill.label ?? '').trim();
      }
      return '';
    })
    .filter((s): s is string => s.length > 0);
}

/**
 * Extract the daily rate (TJM) from a Malt project row.
 * Tries `dailyRate`, `averageDailyRate`, then `budget`.
 * Returns null if the value is missing or unreasonable.
 */
export function extractTJM(row: MaltProjectRow): number | null {
  const raw = row.dailyRate ?? row.averageDailyRate ?? row.budget;
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== 'number' || isNaN(raw)) {
    return null;
  }
  // Sanity bounds — reject values outside plausible TJM range
  if (raw < 50 || raw > 9999) {
    return null;
  }
  return raw;
}

/**
 * Extract the location string from a Malt project row.
 * Tries `location`, then `city`.
 */
export function extractLocation(row: MaltProjectRow): string | null {
  return row.location?.trim() || row.city?.trim() || null;
}

/**
 * Detect remote type from Malt's working mode field.
 * Malt uses English values: "remote", "hybrid", "on-site".
 * Falls back to the generic French-aware detector for other formats.
 */
export function detectMaltRemote(row: MaltProjectRow): Mission['remote'] {
  const raw = row.workingMode ?? row.remote;
  if (!raw) {
    return null;
  }
  const lower = raw.toLowerCase();
  if (lower.includes('full') || lower === 'remote' || lower.includes('remote only')) {
    return 'full';
  }
  if (lower.includes('hybrid') || lower.includes('mixed')) {
    return 'hybrid';
  }
  if (lower.includes('on-site') || lower.includes('onsite') || lower.includes('office')) {
    return 'onsite';
  }
  // Fallback to generic detector (handles French: "télétravail", "présentiel", etc.)
  return detectRemote(raw);
}

/**
 * Extract the duration string from a Malt project row.
 * Tries `duration`, then `missionLength`.
 */
export function extractDuration(row: MaltProjectRow): string | null {
  return row.duration?.trim() || row.missionLength?.trim() || null;
}

/**
 * Build the mission URL from a Malt project row.
 * Prefers an explicit URL, then builds from slug, then from id.
 */
export function buildMaltUrl(row: MaltProjectRow, baseUrl: string): string {
  if (row.url) {
    return row.url;
  }
  const slug = row.slug?.trim();
  if (slug) {
    return `${baseUrl}/fr/mission/${slug}`;
  }
  return `${baseUrl}/fr/mission/${row.id}`;
}

// ── Main parser ───────────────────────────────────────────────────

/**
 * Normalize a MaltProjectRow into a Mission object.
 * Pure function — no I/O, handles all field variations.
 *
 * @returns Mission, or null if the row is missing required fields (id, title)
 */
export function parseMaltProjectRow(
  row: MaltProjectRow,
  now: Date,
  baseUrl: string
): Mission | null {
  // Required: id
  if (!row.id || typeof row.id !== 'string') {
    return null;
  }

  // Required: title
  const title = extractTitle(row);
  if (!title) {
    return null;
  }

  return createMission({
    id: `malt-${row.id}`,
    title,
    client: extractClient(row),
    description: stripHtml(row.description ?? ''),
    stack: extractSkills(row.skills),
    tjm: extractTJM(row),
    location: extractLocation(row),
    remote: detectMaltRemote(row),
    duration: extractDuration(row),
    startDate: row.startDate?.trim() || null,
    publishedAt: row.publishedAt ?? row.createdAt ?? null,
    url: buildMaltUrl(row, baseUrl),
    source: 'malt',
    scrapedAt: now,
  });
}

/**
 * Parses an array of Malt project rows into Mission objects.
 * Pure function — filters out invalid rows.
 *
 * @param rows - Array of raw API response objects
 * @param now - Current date (injected)
 * @param baseUrl - Malt base URL for building mission links
 * @returns Filtered array of valid Mission objects
 */
export const parseMaltJSON = (rows: unknown[], now: Date, baseUrl: string): Mission[] => {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      if (typeof row !== 'object' || row === null) {
        return null;
      }
      return parseMaltProjectRow(row as MaltProjectRow, now, baseUrl);
    })
    .filter((m): m is Mission => m !== null);
};
