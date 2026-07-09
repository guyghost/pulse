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
  'lehibou',
  'hiway',
  'collective',
  'cherry-pick',
  'malt',
]);

export const RemoteTypeSchema = z.enum(['full', 'hybrid', 'onsite']);

export const SeniorityLevelSchema = z.enum(['junior', 'confirmed', 'senior']);

export const GradeSchema = z.enum(['A', 'B', 'C', 'D', 'F']);

// ============================================
// Types complexes
// ============================================

export const ScoringWeightsSchema = z
  .object({
    stack: z.number().min(0).max(100),
    location: z.number().min(0).max(100),
    tjm: z.number().min(0).max(100),
    remote: z.number().min(0).max(100),
  })
  .refine(
    (w) => {
      const sum = w.stack + w.location + w.tjm + w.remote;
      return sum >= 90 && sum <= 110;
    },
    { message: 'La somme des poids doit être proche de 100 (entre 90 et 110)' }
  );

// ============================================
// Score Breakdown
// ============================================

export const DeterministicBreakdownSchema = z.object({
  stack: z.number().min(0).max(100),
  location: z.number().min(0).max(100),
  tjm: z.number().min(0).max(100),
  remote: z.number().min(0).max(100),
  seniorityBonus: z.number().min(0).max(5),
  startDateBonus: z.number().min(0).max(5),
});

export const ScoreBreakdownSchema = z.object({
  criteria: DeterministicBreakdownSchema,
  deterministic: z.number().min(0).max(100),
  semantic: z.number().min(0).max(100).nullable(),
  semanticReason: z.string().nullable(),
  total: z.number().min(0).max(100),
  grade: GradeSchema,
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
  startDate: z.string().nullable(),
  publishedAt: z.string().nullable(),
  url: z.string(),
  source: MissionSourceSchema,
  scrapedAt: z.date(),
  seniority: SeniorityLevelSchema.nullable(),
  scoreBreakdown: ScoreBreakdownSchema.nullable(),
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
  startDate: z.string().nullable(),
  url: z.string(),
  source: MissionSourceSchema,
  scrapedAt: z.union([z.date(), z.string()]),
  seniority: SeniorityLevelSchema.nullable(),
  scoreBreakdown: ScoreBreakdownSchema.nullable(),
  score: z.number().nullable(),
  semanticScore: z.number().nullable(),
  semanticReason: z.string().nullable(),
  publishedAt: z.string().nullable(),
});
// ============================================

/**
 * Normalizes legacy profile records into the unified `keywords` shape before
 * validation. Records that still carry `stack` and/or `searchKeywords`
 * (pre-unification schema) are merged into a single `keywords` list with
 * case-insensitive dedup (first-seen casing wins) and trimmed to the 40-entry
 * cap so the schema never rejects a migrated record for length. New-shape
 * records that already have `keywords` pass through untouched (legacy fields
 * are stripped). This makes reads resilient even before the v1→v2 data
 * migration has run. See `models/keywords-unification.model.md`.
 */
const normalizeLegacyProfileInput = (data: unknown): unknown => {
  if (!data || typeof data !== 'object') {
    return data;
  }
  const record = data as Record<string, unknown>;
  // Only touch records that carry legacy `stack`/`searchKeywords` fields.
  // Records with neither legacy fields nor `keywords` are invalid (missing a
  // required field) and must be rejected by the schema, not silently healed.
  if (!('stack' in record) && !('searchKeywords' in record)) {
    return record;
  }
  const { stack: legacyStackRaw, searchKeywords: legacyKeywordsRaw, ...rest } = record;
  if ('keywords' in record) {
    return rest;
  }
  const legacyStack = Array.isArray(legacyStackRaw) ? legacyStackRaw : [];
  const legacyKeywords = Array.isArray(legacyKeywordsRaw) ? legacyKeywordsRaw : [];
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const entry of [...legacyStack, ...legacyKeywords]) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      continue;
    }
    const key = entry.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(entry);
  }
  return { ...rest, keywords: merged.slice(0, 40) };
};

export const UserProfileSchema = z
  .preprocess(
    normalizeLegacyProfileInput,
    z.object({
      firstName: z.string().max(50, 'Le prénom ne doit pas dépasser 50 caractères'),
      keywords: z
        .array(z.string().min(1, 'Chaque mot-clé doit être non vide'))
        .max(40, 'Maximum 40 mots-clés'),
      tjmMin: z
        .number()
        .min(0, 'Le TJM minimum doit être positif')
        .max(5000, 'Le TJM minimum ne doit pas dépasser 5000'),
      tjmMax: z
        .number()
        .min(0, 'Le TJM maximum doit être positif')
        .max(5000, 'Le TJM maximum ne doit pas dépasser 5000'),
      location: z.string(),
      remote: z.union([RemoteTypeSchema, z.literal('any')]),
      seniority: SeniorityLevelSchema,
      jobTitle: z.string(),
      scoringWeights: ScoringWeightsSchema.optional(),
    })
  )
  .refine((p) => p.tjmMax === 0 || p.tjmMax >= p.tjmMin, {
    message: 'Le TJM maximum doit être supérieur ou égal au TJM minimum',
    path: ['tjmMax'],
  });

// ============================================
// Semantic Scoring (réponses LLM)
// ============================================

export const SemanticResultSchema = z.object({
  score: z
    .union([
      z.number(),
      z.string().transform((val) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed)) {
          throw new Error('Invalid score string');
        }
        return parsed;
      }),
    ])
    .transform((val) => Math.max(0, Math.min(100, Math.round(val)))),
  reason: z.string(),
});

// ============================================
// App Settings
// ============================================

export const AppSettingsSchema = z.object({
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
  schemaVersion: z.number().default(1),
  lastSyncAt: z.union([z.date(), z.string()]).optional(),
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
