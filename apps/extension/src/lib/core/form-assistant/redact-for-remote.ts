import type { FieldDescriptor, RemoteFieldRequest } from './types';
import type { UserProfile } from '../types/profile';

/** Garde-fou : nombre max de compétences projetées vers Eve. */
const MAX_KEYWORDS = 16;

/**
 * Projette le profil vers un objet ne contenant QUE les champs professionnels
 * allowlistés (jamais d'email/téléphone : le profil n'en contient pas, et
 * `experiences.description` est exclu). Utilisé pour construire la requête
 * envoyée à Eve (Phase 2).
 *
 * Pur, déterministe, sans I/O.
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
