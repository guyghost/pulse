/**
 * Type guards pour la validation runtime des données externes.
 * Core = fonctions pures, pas d'I/O
 */
import type { Mission, MissionSource, RemoteType } from './mission';
import type { UserProfile, SeniorityLevel } from './profile';
import {
  MissionSchema,
  MissionSerializedSchema,
  UserProfileSchema,
  SemanticResultSchema,
  MissionSourceSchema,
  RemoteTypeSchema,
  SeniorityLevelSchema,
} from './schemas';

/**
 * Représente un résultat de scoring sémantique retourné par le LLM.
 */
export interface SemanticResult {
  score: number;
  reason: string;
}

/**
 * Valide qu'un objet inconnu est une Mission valide.
 * Accepte les dates sous forme de Date ou de string ISO.
 */
export function isMission(obj: unknown): obj is Mission {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const result = MissionSerializedSchema.safeParse(obj);
  return result.success;
}

/**
 * Valide qu'un objet inconnu est un UserProfile valide.
 */
export function isUserProfile(obj: unknown): obj is UserProfile {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const result = UserProfileSchema.safeParse(obj);
  return result.success;
}

/**
 * Valide qu'un objet inconnu est un SemanticResult valide.
 * Le score peut être un nombre ou une chaîne numérique.
 */
export function isSemanticResult(obj: unknown): obj is SemanticResult {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const result = SemanticResultSchema.safeParse(obj);
  return result.success;
}

/**
 * Valide qu'une valeur est une MissionSource valide.
 */
export function isMissionSource(value: unknown): value is MissionSource {
  return MissionSourceSchema.safeParse(value).success;
}

/**
 * Valide qu'une valeur est un RemoteType valide.
 */
export function isRemoteType(value: unknown): value is RemoteType {
  return RemoteTypeSchema.safeParse(value).success;
}

/**
 * Valide qu'une valeur est un SeniorityLevel valide.
 */
export function isSeniorityLevel(value: unknown): value is SeniorityLevel {
  return SeniorityLevelSchema.safeParse(value).success;
}

/**
 * Parse et valide une Mission depuis des données brutes (IndexedDB, API, etc.)
 * Retourne la mission validée ou null si invalide.
 */
export function parseMission(data: unknown): Mission | null {
  const result = MissionSerializedSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Parse et valide un UserProfile depuis des données brutes.
 * Retourne le profil validé ou null si invalide.
 */
export function parseUserProfile(data: unknown): UserProfile | null {
  const result = UserProfileSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Parse et valide un SemanticResult depuis des données brutes.
 * Retourne le résultat validé ou null si invalide.
 */
export function parseSemanticResultSafe(data: unknown): SemanticResult | null {
  const result = SemanticResultSchema.safeParse(data);
  return result.success ? result.data : null;
}
