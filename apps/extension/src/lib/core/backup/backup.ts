/**
 * Backup and restore of user data
 * Core = pure: validation, transformation, migration
 */

import { z } from 'zod';
import type { UserProfile } from '../types/profile';
import { UserProfileSchema } from '../types/schemas';
import type { AppSettings } from '../types/app-settings';

// ============================================
// Zod schemas for validation
// ============================================

export const BackupDataSchema = z.object({
  version: z.number().int().min(1),
  timestamp: z.number().int().positive(),
  profile: UserProfileSchema,
  settings: z.object({
    scanIntervalMinutes: z.number(),
    enabledConnectors: z.array(z.string()),
    notifications: z.boolean(),
    autoScan: z.boolean(),
    maxSemanticPerScan: z.number(),
    notificationScoreThreshold: z.number(),
    respectRateLimits: z.boolean(),
    customDelayMs: z.number(),
    theme: z.enum(['light', 'dark', 'system']).default('system'),
  }),
  favorites: z.record(z.string(), z.number()),
  hidden: z.record(z.string(), z.number()),
});

export type BackupData = z.infer<typeof BackupDataSchema>;

// ============================================
// Result types
// ============================================

export type ValidationError =
  | { type: 'INVALID_JSON'; message: string }
  | { type: 'SCHEMA_ERROR'; message: string; issues: z.ZodIssue[] }
  | { type: 'VERSION_UNSUPPORTED'; message: string; version: number };

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// ============================================
// Constantes
// ============================================

const CURRENT_BACKUP_VERSION = 1;
const MAX_SUPPORTED_VERSION = 1;

// ============================================
// Fonctions pures
// ============================================

/**
 * Builds a backup object from user data
 * Pure function
 */
export function createBackup(
  profile: UserProfile,
  settings: AppSettings,
  favorites: Record<string, number>,
  hidden: Record<string, number>,
  timestamp: number
): BackupData {
  const normalizedProfile: UserProfile = {
    ...profile,
    experiences: profile.experiences ?? [],
  };
  return {
    version: CURRENT_BACKUP_VERSION,
    timestamp,
    profile: normalizedProfile,
    settings,
    favorites,
    hidden,
  };
}

/**
 * Valide un objet backup
 * Pure function - utilise Zod pour la validation
 */
export function validateBackup(data: unknown): Result<BackupData, ValidationError> {
  // Check whether this is a valid object
  if (data === null || typeof data !== 'object') {
    return {
      ok: false,
      error: {
        type: 'INVALID_JSON',
        message: 'Data is not a valid JSON object',
      },
    };
  }

  // Check the version before full validation
  const versionCheck = data as { version?: unknown };
  if (typeof versionCheck.version !== 'number') {
    return {
      ok: false,
      error: {
        type: 'INVALID_JSON',
        message: 'La propriété "version" est manquante ou invalide',
      },
    };
  }

  if (versionCheck.version > MAX_SUPPORTED_VERSION) {
    return {
      ok: false,
      error: {
        type: 'VERSION_UNSUPPORTED',
        message: `Version ${versionCheck.version} non supportée. Version maximale: ${MAX_SUPPORTED_VERSION}`,
        version: versionCheck.version,
      },
    };
  }

  // Full Zod validation
  const result = BackupDataSchema.safeParse(data);

  if (!result.success) {
    return {
      ok: false,
      error: {
        type: 'SCHEMA_ERROR',
        message: 'Les données ne respectent pas le schéma attendu',
        issues: result.error.issues,
      },
    };
  }

  return {
    ok: true,
    value: result.data,
  };
}

/**
 * Migre un backup vers la version actuelle
 * Pure function
 */
export function migrateBackup(data: BackupData): BackupData {
  if (data.version === CURRENT_BACKUP_VERSION) {
    return data;
  }

  // Pour l'instant, une seule version existe
  // Ici on ajouterait les migrations futures

  // Exemple de migration future:
  // if (data.version === 1) {
  //   data = migrateV1ToV2(data);
  // }

  return {
    ...data,
    version: CURRENT_BACKUP_VERSION,
  };
}

/**
 * Serializes a backup to JSON
 * Pure function
 */
export function serializeBackup(backup: BackupData): string {
  return JSON.stringify(backup, null, 2);
}

/**
 * Parses a JSON string into an object
 * Pure function
 */
export function parseBackupJson(json: string): Result<unknown, ValidationError> {
  try {
    const parsed = JSON.parse(json);
    return { ok: true, value: parsed };
  } catch (e) {
    return {
      ok: false,
      error: {
        type: 'INVALID_JSON',
        message: e instanceof Error ? e.message : 'JSON invalide',
      },
    };
  }
}

/**
 * Extrait les statistiques d'un backup pour l'affichage
 * Pure function
 */
export function getBackupStats(backup: BackupData): {
  profileName: string;
  jobTitle: string;
  favoritesCount: number;
  hiddenCount: number;
  timestamp: number;
  version: number;
} {
  return {
    profileName: backup.profile.firstName,
    jobTitle: backup.profile.jobTitle,
    favoritesCount: Object.keys(backup.favorites).length,
    hiddenCount: Object.keys(backup.hidden).length,
    timestamp: backup.timestamp,
    version: backup.version,
  };
}

/**
 * Generates a filename for the backup
 * Pure function
 */
export function generateBackupFilename(
  timestamp: number,
  formatDateKey: (timestamp: number) => string
): string {
  const dateStr = formatDateKey(timestamp); // YYYY-MM-DD
  return `missionpulse-backup-${dateStr}.pulse-backup`;
}
