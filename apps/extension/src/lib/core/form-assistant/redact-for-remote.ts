import type { FieldDescriptor, RemoteFieldRequest } from './types';
import type { UserProfile } from '../types/profile';

/** Guardrail: max number of skills projected to Eve. */
const MAX_KEYWORDS = 16;

/**
 * Projects the profile into an object containing ONLY the allowlisted
 * professional fields (never email/phone: the profile doesn't contain any, and
 * `experiences.description` is excluded). Used to build the request sent to
 * Eve (Phase 2).
 *
 * Pure, deterministic, no I/O.
 */
export function redactForRemote(field: FieldDescriptor, profile: UserProfile): RemoteFieldRequest {
  const safe: Record<string, string | string[]> = {};

  if (profile.firstName) {
    safe.firstName = profile.firstName;
  }
  if (profile.jobTitle) {
    safe.jobTitle = profile.jobTitle;
  }
  safe.seniority = profile.seniority;
  if (profile.location) {
    safe.location = profile.location;
  }
  safe.remote = profile.remote;
  if (typeof profile.tjmMin === 'number') {
    safe.tjmMin = String(profile.tjmMin);
  }
  if (typeof profile.tjmMax === 'number') {
    safe.tjmMax = String(profile.tjmMax);
  }
  if (profile.keywords.length > 0) {
    safe.keywords = profile.keywords.slice(0, MAX_KEYWORDS);
  }

  return {
    kind: field.kind,
    label: field.label,
    placeholder: field.placeholder,
    inputType: field.inputType,
    required: field.required,
    profile: safe,
  };
}
