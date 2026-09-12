/**
 * Type guards for runtime validation of external data.
 * Core = pure functions, no I/O
 */
import type { Mission, MissionSource, RemoteType } from './mission';
import type { UserProfile, SeniorityLevel } from './profile';
import {
  MissionSchema,
  UserProfileSchema,
  SemanticResultSchema,
  MissionSourceSchema,
  RemoteTypeSchema,
  SeniorityLevelSchema,
} from './schemas';

/**
 * Represents a semantic scoring result returned by the LLM.
 */
export interface SemanticResult {
  score: number;
  reason: string;
}

export type DateDeserializer = (value: string) => Date | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function normalizeMissionInput(data: unknown, deserializeDate?: DateDeserializer): unknown {
  if (!deserializeDate || !isRecord(data) || typeof data.scrapedAt !== 'string') {
    return data;
  }

  const scrapedAt = deserializeDate(data.scrapedAt);
  if (scrapedAt === null) {
    return data;
  }

  return { ...data, scrapedAt };
}

/**
 * Validates that an unknown object is a valid Mission.
 * Only accepts already-deserialized Dates.
 */
export function isMission(obj: unknown): obj is Mission {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const result = MissionSchema.safeParse(obj);
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
 * Validates that an unknown object is a valid SemanticResult.
 * The score can be a number or a numeric string.
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
 * Parses and validates a Mission from raw data (IndexedDB, API, etc.)
 * Returns the validated mission or null if invalid.
 */
export function parseMission(data: unknown, deserializeDate?: DateDeserializer): Mission | null {
  const result = MissionSchema.safeParse(normalizeMissionInput(data, deserializeDate));
  return result.success ? result.data : null;
}

/**
 * Parses and validates a UserProfile from raw data.
 * Returns the validated profile or null if invalid.
 */
export function parseUserProfile(data: unknown): UserProfile | null {
  const result = UserProfileSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Parses and validates a SemanticResult from raw data.
 * Returns the validated result or null if invalid.
 */
export function parseSemanticResultSafe(data: unknown): SemanticResult | null {
  const result = SemanticResultSchema.safeParse(data);
  return result.success ? result.data : null;
}
