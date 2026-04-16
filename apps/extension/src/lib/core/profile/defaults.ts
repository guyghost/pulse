/**
 * Default profile for zero-config first scan.
 *
 * Used when no user profile exists yet (fresh install).
 * Deliberately permissive: no keyword filters, broad TJM range,
 * any remote type, any location — maximises mission coverage.
 *
 * Core rule: pure function, zero I/O.
 */

import type { UserProfile } from '../types/profile';

/**
 * Creates a permissive default profile for the first scan.
 * Results will be broad and unfiltered — the user refines later.
 */
export function createDefaultProfile(): UserProfile {
  return {
    firstName: '',
    stack: [],           // No keyword filtering — show all missions
    tjmMin: 0,           // No lower bound
    tjmMax: 9999,        // No upper bound
    location: '',        // No location filter
    remote: 'any',       // Accept all remote types
    seniority: 'senior', // Neutral default
    jobTitle: '',
    searchKeywords: [],
    scoringWeights: {
      stack: 0,          // No stack score without keywords
      location: 10,
      tjm: 20,
      remote: 10,
    },
  };
}
