/**
 * Schémas Zod pour la validation runtime des données externes.
 * Core = fonctions pures, pas d'I/O
 */
import { z } from 'zod';

// ============================================
// Enums
// ============================================

export const MissionSourceSchema = z.enum([
  'free-work',
  'comet',
  'lehibou',
  'hiway',
  'collective',
  'cherry-pick',
]);

export const RemoteTypeSchema = z.enum(['full', 'hybrid', 'onsite']);

export const SeniorityLevelSchema = z.enum(['junior', 'confirmed', 'senior']);

// ============================================
// Types complexes
// ============================================

export const ScoringWeightsSchema = z.object({
  stack: z.number(),
  location: z.number(),
  tjm: z.number(),
  remote: z.number(),
});

// ============================================
// Mission
// ============================================

export const MissionSchema = z.object({
  id: z.string(),
  title: z.string(),
  client: z.string().nullable(),
  description: z.string(),
  stack: z.array(z.string()),
  tjm: z.number().nullable(),
  location: z.string().nullable(),
  remote: RemoteTypeSchema.nullable(),
  duration: z.string().nullable(),
  url: z.string(),
  source: MissionSourceSchema,
  scrapedAt: z.date(),
  score: z.number().nullable(),
  semanticScore: z.number().nullable(),
  semanticReason: z.string().nullable(),
});

// Schéma pour les missions sérialisées (dates en string depuis IndexedDB ou API)
export const MissionSerializedSchema = z.object({
  id: z.string(),
  title: z.string(),
  client: z.string().nullable(),
  description: z.string(),
  stack: z.array(z.string()),
  tjm: z.number().nullable(),
  location: z.string().nullable(),
  remote: RemoteTypeSchema.nullable(),
  duration: z.string().nullable(),
  url: z.string(),
  source: MissionSourceSchema,
  scrapedAt: z.union([z.date(), z.string()]).transform((val) =>
    typeof val === 'string' ? new Date(val) : val
  ),
  score: z.number().nullable(),
  semanticScore: z.number().nullable(),
  semanticReason: z.string().nullable(),
});

// ============================================
// Profile
// ============================================

export const UserProfileSchema = z.object({
  firstName: z.string(),
  stack: z.array(z.string()),
  tjmMin: z.number(),
  tjmMax: z.number(),
  location: z.string(),
  remote: z.union([RemoteTypeSchema, z.literal('any')]),
  seniority: SeniorityLevelSchema,
  jobTitle: z.string(),
  scoringWeights: ScoringWeightsSchema.optional(),
});

// ============================================
// Semantic Scoring (réponses LLM)
// ============================================

export const SemanticResultSchema = z.object({
  score: z.union([
    z.number(),
    z.string().transform((val) => {
      const parsed = parseInt(val, 10);
      if (isNaN(parsed)) {
        throw new Error('Invalid score string');
      }
      return parsed;
    }),
  ]).transform((val) => Math.max(0, Math.min(100, Math.round(val)))),
  reason: z.string(),
});

// ============================================
// App Settings
// ============================================

export const AppSettingsSchema = z.object({
  /** Clé API Anthropic pour l'analyse LLM */
  apiKey: z.string().optional(),
  /** Version du schéma de données */
  schemaVersion: z.number().default(1),
  /** Date de dernière synchronisation */
  lastSyncAt: z.date().optional(),
  /** Préférences d'affichage */
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  /** Notifications activées */
  notificationsEnabled: z.boolean().default(true),
});

// Schéma pour les settings sérialisés (dates en string)
export const AppSettingsSerializedSchema = z.object({
  apiKey: z.string().optional(),
  schemaVersion: z.number().default(1),
  lastSyncAt: z
    .union([z.date(), z.string()])
    .optional()
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  notificationsEnabled: z.boolean().default(true),
});

// ============================================
// Types dérivés des schémas (pour compatibilité)
// ============================================

export type MissionFromSchema = z.infer<typeof MissionSchema>;
export type UserProfileFromSchema = z.infer<typeof UserProfileSchema>;
export type SemanticResultFromSchema = z.infer<typeof SemanticResultSchema>;
export type AppSettingsFromSchema = z.infer<typeof AppSettingsSchema>;
