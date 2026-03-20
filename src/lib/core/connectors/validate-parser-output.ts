/**
 * Pure parser output validation - Runtime checks for parser results.
 *
 * This module provides validation utilities for parser outputs to catch
 * malformed data before it propagates through the system.
 *
 * Located in core/ because it's pure (no I/O, no async).
 */

import type { Mission } from '../types/mission';

export interface ParserValidationResult {
  valid: boolean;
  missions: Mission[];
  rejected: Array<{ mission: unknown; reason: string }>;
}

/**
 * Validate that a mission object has all required fields with correct types.
 */
export const validateMission = (raw: unknown): { valid: boolean; mission?: Mission; reason?: string } => {
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, reason: 'Mission is not an object' };
  }

  const m = raw as Record<string, unknown>;

  // Required: id (string)
  if (typeof m.id !== 'string' || m.id.length === 0) {
    return { valid: false, reason: 'Missing or invalid id' };
  }

  // Required: title (string)
  if (typeof m.title !== 'string') {
    return { valid: false, reason: 'Missing or invalid title' };
  }

  // Required: source (valid MissionSource)
  const validSources = ['free-work', 'comet', 'lehibou', 'hiway', 'collective', 'cherry-pick'];
  if (typeof m.source !== 'string' || !validSources.includes(m.source)) {
    return { valid: false, reason: `Invalid source: ${m.source}` };
  }

  // Required: scrapedAt (Date instance)
  if (!(m.scrapedAt instanceof Date) || isNaN(m.scrapedAt.getTime())) {
    return { valid: false, reason: 'Missing or invalid scrapedAt (must be Date)' };
  }

  // Required: url (string, valid URL)
  if (typeof m.url !== 'string' || !m.url.startsWith('http')) {
    return { valid: false, reason: 'Missing or invalid url' };
  }

  // Required: description (string, non-nullable per Mission type)
  if (typeof m.description !== 'string') {
    return { valid: false, reason: 'Missing or invalid description (must be string)' };
  }

  // Optional but must be correct type if present
  if (m.client !== null && typeof m.client !== 'string') {
    return { valid: false, reason: 'Invalid client type' };
  }

  if (!Array.isArray(m.stack)) {
    return { valid: false, reason: 'Invalid stack type (must be array)' };
  }

  if (m.tjm !== null && typeof m.tjm !== 'number') {
    return { valid: false, reason: 'Invalid tjm type' };
  }

  if (m.location !== null && typeof m.location !== 'string') {
    return { valid: false, reason: 'Invalid location type' };
  }

  // remote can be null, 'full', 'hybrid', or 'onsite'
  const validRemote = [null, 'full', 'hybrid', 'onsite'];
  if (m.remote !== null && !validRemote.includes(m.remote as string | null)) {
    return { valid: false, reason: `Invalid remote value: ${String(m.remote)}` };
  }

  if (m.duration !== null && typeof m.duration !== 'string') {
    return { valid: false, reason: 'Invalid duration type' };
  }

  return { valid: true, mission: m as unknown as Mission };
};

/**
 * Validate an array of parsed missions.
 * Returns valid missions and rejected ones with reasons.
 *
 * @param missions Raw parsed missions
 * @returns Validation result with valid missions and rejection details
 */
export const validateParserOutput = (
  missions: unknown[]
): ParserValidationResult => {
  const valid: Mission[] = [];
  const rejected: Array<{ mission: unknown; reason: string }> = [];

  for (const m of missions) {
    const result = validateMission(m);
    if (result.valid && result.mission) {
      valid.push(result.mission);
    } else {
      rejected.push({ mission: m, reason: result.reason ?? 'Unknown validation error' });
    }
  }

  // Note: Rejection info is returned in `rejected` array - caller decides whether to log
  return {
    valid: rejected.length === 0,
    missions: valid,
    rejected,
  };
};

/**
 * Validate __NEXT_DATA__ structure for React-based platforms.
 * Returns null if structure is missing or malformed.
 */
export const validateNextData = (html: string): Record<string, unknown> | null => {
  const match = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};
