/**
 * Derived scoring tables for location matching.
 *
 * Pure derivation from `LOCATION_CATALOG` so the catalog is the single source
 * of truth for French place data. Consumed by `core/scoring/location-matching.ts`,
 * which builds its synonym / metro caches from these tables with its algorithm
 * unchanged.
 *
 * Layering: this module is in `core/locations/` and imports only the catalog
 * (also core). The scorer (`core/scoring/location-matching.ts`) imports these
 * tables — core → core, no shell involvement. See
 * `models/location-tables-derivation.model.md` for the full contract.
 *
 * @module derive-location-tables
 */

import { LOCATION_CATALOG, normalizeLocationAlias, type LocationEntry } from './location-catalog';

/**
 * Metropolitan area data. Shape mirrors the structure previously hardcoded in
 * `location-matching.ts` so the cache builders there are unchanged.
 */
export interface MetroAreaData {
  /** Cities in this metro area (normalized), excluding the metro's own canonical name. */
  readonly cities: readonly string[];
  /** Department codes (2-3 digit) that belong to this metro area. */
  readonly departments: readonly string[];
}

/** Matches a standalone department code (2 digits métropole, 3 digits DOM). */
const DEPARTMENT_CODE = /^\d{2,3}$/;

/**
 * True for entries that mint their own synonym group: standalone places (no
 * `metro`) and the canonical city of a metro area (`normalizeLocationAlias(label)
 * === metro`). Suburbs — `metro` set and label ≠ metro — return false so they
 * don't rebind shared department codes (e.g. `'69'`, shared by Lyon and its
 * suburbs) away from the metro canonical.
 */
const isSynonymCanonical = (entry: LocationEntry): boolean => {
  if (!entry.metro) {
    return true;
  }
  return normalizeLocationAlias(entry.label) === entry.metro;
};

/**
 * Build the synonym table: canonical normalized name → equivalent normalized
 * forms. One entry per canonical catalog entry only (see
 * `isSynonymCanonical`).
 */
const buildRegionSynonyms = (
  catalog: readonly LocationEntry[]
): Record<string, readonly string[]> => {
  const out: Record<string, readonly string[]> = {};
  for (const e of catalog) {
    if (!isSynonymCanonical(e)) {
      continue;
    }
    const canonical = normalizeLocationAlias(e.label);
    if (!canonical) {
      continue;
    }
    // `entry.aliases` already includes the canonical (the catalog's `entry()`
    // helper prepends the normalized label) and is already normalized.
    out[canonical] = e.aliases;
  }
  return out;
};

/**
 * Build the metro-area table keyed by normalized metro name. For each metro:
 * - `cities` = normalized labels of member entries, excluding the metro's own
 *   canonical name (it is added to the scorer's cache separately as
 *   `metroName → metroName`).
 * - `departments` = union of 2-3 digit aliases across all member entries
 *   (petite + grande couronne).
 */
const buildMetroAreas = (catalog: readonly LocationEntry[]): Record<string, MetroAreaData> => {
  const citySets = new Map<string, Set<string>>();
  const deptSets = new Map<string, Set<string>>();
  const order: string[] = [];

  const ensure = (metro: string): { cities: Set<string>; depts: Set<string> } => {
    let cities = citySets.get(metro);
    let depts = deptSets.get(metro);
    if (!cities || !depts) {
      cities = new Set<string>();
      depts = new Set<string>();
      citySets.set(metro, cities);
      deptSets.set(metro, depts);
      order.push(metro);
    }
    return { cities, depts };
  };

  for (const e of catalog) {
    if (!e.metro) {
      continue;
    }
    const { cities, depts } = ensure(e.metro);
    const canonical = normalizeLocationAlias(e.label);
    if (canonical && canonical !== e.metro) {
      cities.add(canonical);
    }
    for (const alias of e.aliases) {
      if (DEPARTMENT_CODE.test(alias)) {
        depts.add(alias);
      }
    }
  }

  const out: Record<string, MetroAreaData> = {};
  for (const metro of order) {
    out[metro] = {
      cities: [...(citySets.get(metro) ?? [])],
      departments: [...(deptSets.get(metro) ?? [])],
    };
  }
  return out;
};

/**
 * Canonical location name → equivalent normalized forms.
 *
 * Replaces the former hardcoded `REGION_SYNONYMS` in `location-matching.ts`.
 * Built once at module load.
 */
export const REGION_SYNONYMS: Readonly<Record<string, readonly string[]>> =
  buildRegionSynonyms(LOCATION_CATALOG);

/**
 * Metro areas keyed by normalized metro name.
 *
 * Replaces the former hardcoded `METRO_AREAS` in `location-matching.ts`.
 * Built once at module load.
 */
export const METRO_AREAS: Readonly<Record<string, MetroAreaData>> =
  buildMetroAreas(LOCATION_CATALOG);
