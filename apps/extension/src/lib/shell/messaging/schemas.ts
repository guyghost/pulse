/**
 * Bridge Message Schemas — Validation Zod pour tous les variants de BridgeMessage.
 *
 * Shell only : schémas de validation à la frontière de confiance.
 * Les types inférés sont compatibles avec BridgeMessage (pas de duplication).
 *
 * Limites de payload :
 *   - MISSIONS_UPDATED : ≤ 500 missions
 *   - SAVE_PROFILE     : payload ≤ 10 Ko sérialisé
 *   - URLs             : https:// uniquement, ≤ 2048 chars
 */

import { z } from 'zod';

// ============================================================================
// Helpers de validation réutilisables
// ============================================================================

const SafeString = z.string().max(4096);

/** Valide qu'un objet sérialisé ne dépasse pas N octets */
function maxBytes(maxB: number) {
  return (val: unknown): boolean => {
    try {
      return JSON.stringify(val).length <= maxB;
    } catch {
      return false;
    }
  };
}

// ============================================================================
// Schémas par type de message
// ============================================================================

// ── Missions ─────────────────────────────────────────────────────────────────

const MissionSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    source: z.string(),
  })
  .passthrough(); // Les autres champs de Mission sont acceptés

const MissionsPayloadSchema = z.array(MissionSchema).max(500, {
  message: 'MISSIONS_UPDATED payload exceeds 500 items limit',
});

const FeedIdTimestampMapSchema = z
  .record(z.string().max(256), z.number().int().min(0))
  .refine(maxBytes(120_000), { message: 'Feed id map payload exceeds 120KB limit' });

const SeenMissionIdsSchema = z
  .array(z.string().min(1).max(256))
  .max(10_000)
  .refine(maxBytes(160_000), { message: 'Seen mission ids payload exceeds 160KB limit' });

const FeedSortSchema = z.enum(['score', 'date', 'tjm']);

const FeedSavedViewSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(48),
    filters: z
      .object({
        searchQuery: z.string().max(120),
        selectedStacks: z.array(z.string().min(1).max(48)).max(24),
        selectedSource: z
          .enum(['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick', 'malt'])
          .nullable(),
        selectedRemote: z.enum(['full', 'hybrid', 'onsite']).nullable(),
        selectedSeniority: z.enum(['junior', 'confirmed', 'senior']).nullable(),
        selectedScoreBucket: z.enum(['strong', 'good', 'weak']).nullable(),
        decisionPreset: z
          .enum(['priority', 'remote-compatible', 'tjm-negotiation', 'new'])
          .nullable()
          .default(null),
        showNewOnly: z.boolean(),
        showFavoritesOnly: z.boolean(),
        showHidden: z.boolean(),
        sortBy: FeedSortSchema,
      })
      .strict(),
    createdAt: z.number().int().min(0),
    updatedAt: z.number().int().min(0),
  })
  .strict();

const FeedSavedViewsSchema = z
  .array(FeedSavedViewSchema)
  .max(12)
  .refine(maxBytes(30_000), { message: 'Feed saved views payload exceeds 30KB limit' });

const ConnectedAlertPreferencesSchema = z
  .object({
    enabled: z.boolean(),
    scoreThreshold: z.number().int().min(0).max(100),
    minDailyRate: z.number().int().min(0).max(5000),
    requiredStacks: z.array(z.string().min(1).max(40)).max(12),
    maxResults: z.number().int().min(1).max(20),
    mutedUntil: z.string().max(40).nullable(),
    revision: z.number().int().min(1),
    updatedAt: z.string().max(40),
  })
  .strict()
  .refine(maxBytes(4_000), { message: 'Alert preferences payload exceeds 4KB limit' });

const AlertHistoryEntrySchema = z
  .object({
    id: z.string().min(1).max(180),
    triggeredAt: z.number().int().min(0),
    missionCount: z.number().int().min(0).max(500),
    missionIds: z.array(z.string().min(1).max(256)).max(20),
    missionTitles: z.array(z.string().min(1).max(180)).max(5),
    scoreThreshold: z.number().int().min(0).max(100),
    minDailyRate: z.number().int().min(0).max(5000),
    requiredStacks: z.array(z.string().min(1).max(40)).max(12),
    maxResults: z.number().int().min(1).max(20),
  })
  .strict();

const AlertHistorySchema = z
  .array(AlertHistoryEntrySchema)
  .max(20)
  .refine(maxBytes(30_000), { message: 'Alert history payload exceeds 30KB limit' });

const TJMRegionSchema = z.enum([
  'ile-de-france',
  'lyon',
  'marseille',
  'toulouse',
  'bordeaux',
  'nantes',
  'lille',
  'strasbourg',
  'rennes',
  'grenoble',
  'montpellier',
  'nice',
  'remote',
  'other',
]);

const TJMTrendSchema = z.enum(['up', 'stable', 'down']);

const TJMRangeSchema = z
  .object({
    min: z.number(),
    max: z.number(),
    median: z.number(),
  })
  .strict();

const TJMAnalysisSchema = z
  .object({
    trend: TJMTrendSchema,
    confidence: z.number().min(0).max(1),
    dataPoints: z.number().int().min(0),
    junior: TJMRangeSchema,
    confirmed: TJMRangeSchema,
    senior: TJMRangeSchema,
    trendDetail: z.string().nullable(),
    recommendation: z.string().nullable(),
    lastUpdated: z.string().nullable(),
    topStacks: z.array(
      z
        .object({
          stack: z.string().min(1).max(120),
          average: z.number(),
          trend: TJMTrendSchema,
          sampleCount: z.number().int().min(0),
          lastUpdated: z.string().nullable(),
        })
        .strict()
    ),
    regionInsights: z.array(
      z
        .object({
          region: TJMRegionSchema,
          label: z.string().min(1).max(120),
          average: z.number(),
          min: z.number(),
          max: z.number(),
          sampleCount: z.number().int().min(0),
          trend: TJMTrendSchema,
        })
        .strict()
    ),
  })
  .strict();

const TJMAnalysisRequestSchema = z
  .object({
    profileStacks: z.array(z.string().min(1).max(120)).max(50).optional(),
    region: TJMRegionSchema.optional(),
  })
  .strict();

const PersistedConnectorStatusSchema = z
  .object({
    connectorId: z.string().min(1).max(120),
    connectorName: z.string().min(1).max(120),
    lastState: z.enum(['done', 'error']),
    missionsCount: z.number().int().min(0),
    error: z.record(z.string(), z.unknown()).nullable(),
    lastSyncAt: z.number().int().min(0),
    lastSuccessAt: z.number().int().min(0).nullable(),
  })
  .strict();

const AppSettingsSchema = z
  .object({
    scanIntervalMinutes: z.number().int().min(1).max(1440),
    enabledConnectors: z.array(z.string().min(1).max(120)).max(50),
    notifications: z.boolean(),
    autoScan: z.boolean(),
    maxSemanticPerScan: z.number().int().min(0).max(100),
    notificationScoreThreshold: z.number().int().min(0).max(100),
    respectRateLimits: z.boolean(),
    customDelayMs: z.number().int().min(0).max(60000),
    theme: z.enum(['light', 'dark', 'system']),
  })
  .strict();

// ── Profile ──────────────────────────────────────────────────────────────────

const ProfilePayloadSchema = z
  .object({
    skills: z.array(z.string()).optional(),
    location: z.string().optional(),
    tjmMin: z.number().optional(),
    tjmMax: z.number().optional(),
  })
  .passthrough()
  .refine(maxBytes(80_000), { message: 'SAVE_PROFILE payload exceeds 80KB limit' });

const LinkedInTabPayloadSchema = z.object({ tabId: z.number().int().positive().optional() });

const ProfileSyncFieldSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  value: z.string().max(4096),
});

const ProfileFieldComparisonSchema = z.object({
  fieldId: z.string().max(120),
  label: z.string().max(120),
  expected: z.string().max(4096),
  status: z.enum(['match', 'mismatch', 'missing', 'unknown']),
});

const ProfilePageReadResultSchema = z.union([
  z
    .object({
      status: z.literal('available'),
      finalUrl: z.string().min(1).max(2048),
    })
    .strict(),
  z
    .object({
      status: z.literal('auth-required'),
      finalUrl: z.string().min(1).max(2048),
    })
    .strict(),
  z
    .object({
      status: z.literal('blocked'),
      finalUrl: z.string().min(1).max(2048),
      reason: z.string().max(4096),
    })
    .strict(),
]);

const VerifyProfileResultSchema = z.object({
  read: ProfilePageReadResultSchema,
  comparisons: z.array(ProfileFieldComparisonSchema).max(50),
  summary: z.object({
    matches: z.number().int().min(0),
    mismatches: z.number().int().min(0),
    missing: z.number().int().min(0),
  }),
});

const ProfileExtractorSourceSchema = z.enum(['linkedin', 'malt', 'other']);

const CandidateExperienceDraftSchema = z.object({
  title: SafeString,
  company: SafeString.nullable(),
  employmentType: SafeString.nullable().default(null),
  location: SafeString.nullable(),
  startDate: z.string().max(32).nullable(),
  endDate: z.string().max(32).nullable(),
  isCurrent: z.boolean(),
  description: SafeString,
  skills: z.array(z.string().max(120)).max(100),
  source: ProfileExtractorSourceSchema,
  sourceExternalId: SafeString.nullable(),
  positionIndex: z.number().int().min(0).max(500),
});

const CandidateEducationDraftSchema = z.object({
  school: SafeString,
  degree: SafeString.nullable(),
  field: SafeString.nullable(),
  startDate: z.string().max(32).nullable(),
  endDate: z.string().max(32).nullable(),
  description: SafeString,
  source: ProfileExtractorSourceSchema,
  positionIndex: z.number().int().min(0).max(500),
});

const CandidateSkillDraftSchema = z.object({
  skill: z.string().min(1).max(120),
  source: ProfileExtractorSourceSchema,
  confidence: z.number().min(0).max(1),
});

const CandidateLinkDraftSchema = z.object({
  label: z.string().min(1).max(120),
  url: z.string().min(1).max(2048),
  source: ProfileExtractorSourceSchema,
});

const CanonicalCandidateProfileDraftSchema = z
  .object({
    title: SafeString,
    summary: SafeString,
    experiences: z.array(CandidateExperienceDraftSchema).max(200),
    skills: z.array(CandidateSkillDraftSchema).max(300),
    education: z.array(CandidateEducationDraftSchema).max(100),
    links: z.array(CandidateLinkDraftSchema).max(100),
    source: ProfileExtractorSourceSchema,
    confidence: z.number().min(0).max(1),
    capturedAt: z.string().min(1).max(64),
    profileUrl: z.string().min(1).max(2048),
  })
  .refine(
    (draft) =>
      draft.experiences.every((experience) => experience.source === draft.source) &&
      draft.skills.every((skill) => skill.source === draft.source) &&
      draft.education.every((education) => education.source === draft.source) &&
      draft.links.every((link) => link.source === draft.source),
    { message: 'Profile draft child sources must match the root source' }
  )
  .refine(maxBytes(80_000), { message: 'Platform profile draft exceeds 80KB limit' });

// ── Scan ─────────────────────────────────────────────────────────────────────

const ScanProgressPhaseSchema = z.enum(['connecting', 'scanning', 'post-processing', 'done']);

const ConnectorProgressSchema = z.object({
  connectorId: z.string(),
  connectorName: z.string(),
  state: z.enum(['pending', 'detecting', 'fetching', 'retrying', 'done', 'error']),
  missionsCount: z.number().int().min(0),
  error: z.unknown().nullable(),
  retryCount: z.number().int().min(0),
});

// ── Tracking ─────────────────────────────────────────────────────────────────

const ApplicationStatusSchema = z.enum([
  'detected',
  'selected',
  'application_prepared',
  'applied',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'archived',
]);
const StatusTransitionSchema = z.object({
  from: ApplicationStatusSchema.nullable(),
  to: ApplicationStatusSchema,
  timestamp: z.number().int().min(0),
  note: z.string().max(2048).nullable(),
});
const IsoDateTimeOrNullSchema = z
  .string()
  .max(64)
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: 'Expected an ISO-parseable date string',
  })
  .nullable();
const MissionTrackingSchema = z
  .object({
    missionId: z.string().max(256),
    currentStatus: ApplicationStatusSchema,
    history: z.array(StatusTransitionSchema).min(1).max(200),
    generatedAssetIds: z.array(z.string().max(256)).max(100),
    userRating: z.number().int().min(1).max(5).nullable(),
    notes: z.string().max(10_000),
    nextActionAt: IsoDateTimeOrNullSchema.optional(),
  })
  .refine(maxBytes(40_000), { message: 'Mission tracking payload exceeds 40KB limit' });

// ── Generation ───────────────────────────────────────────────────────────────

const GenerationTypeSchema = z.enum(['cover-message', 'cv-summary', 'pitch']);

// ── Toast ────────────────────────────────────────────────────────────────────

const ToastTypeSchema = z.enum(['info', 'success', 'warning', 'error']);

// ── Health ───────────────────────────────────────────────────────────────────

const CircuitStateSchema = z.enum(['closed', 'open', 'half-open']);

const ConnectorHealthSnapshotSchema = z.object({
  connectorId: z.string(),
  circuitState: CircuitStateSchema,
  consecutiveFailures: z.number().int().min(0),
  totalFailures: z.number().int().min(0),
  totalSuccesses: z.number().int().min(0),
  lastSuccessAt: z.number().nullable(),
  lastFailureAt: z.number().nullable(),
  lastStateChangeAt: z.number(),
  recentLatenciesMs: z.array(z.number()).max(200),
});

// ============================================================================
// Registre des schémas par type de message
// ============================================================================

/**
 * Schéma de validation pour chaque type de message entrant.
 * Les messages sans payload utilisent z.undefined() ou z.unknown().
 */
export const MessageSchemas = {
  // Feed local data
  GET_FEED_MISSIONS: z.object({ type: z.literal('GET_FEED_MISSIONS') }),
  FEED_MISSIONS_RESULT: z.object({
    type: z.literal('FEED_MISSIONS_RESULT'),
    payload: MissionsPayloadSchema,
  }),
  GET_FEED_FAVORITES: z.object({ type: z.literal('GET_FEED_FAVORITES') }),
  FEED_FAVORITES_RESULT: z.object({
    type: z.literal('FEED_FAVORITES_RESULT'),
    payload: FeedIdTimestampMapSchema,
  }),
  SAVE_FEED_FAVORITES: z.object({
    type: z.literal('SAVE_FEED_FAVORITES'),
    payload: FeedIdTimestampMapSchema,
  }),
  FEED_FAVORITES_SAVED: z.object({
    type: z.literal('FEED_FAVORITES_SAVED'),
    payload: z.object({ saved: z.boolean() }),
  }),
  GET_FEED_HIDDEN: z.object({ type: z.literal('GET_FEED_HIDDEN') }),
  FEED_HIDDEN_RESULT: z.object({
    type: z.literal('FEED_HIDDEN_RESULT'),
    payload: FeedIdTimestampMapSchema,
  }),
  SAVE_FEED_HIDDEN: z.object({
    type: z.literal('SAVE_FEED_HIDDEN'),
    payload: FeedIdTimestampMapSchema,
  }),
  FEED_HIDDEN_SAVED: z.object({
    type: z.literal('FEED_HIDDEN_SAVED'),
    payload: z.object({ saved: z.boolean() }),
  }),
  GET_FEED_SORT: z.object({ type: z.literal('GET_FEED_SORT') }),
  FEED_SORT_RESULT: z.object({
    type: z.literal('FEED_SORT_RESULT'),
    payload: FeedSortSchema,
  }),
  SAVE_FEED_SORT: z.object({
    type: z.literal('SAVE_FEED_SORT'),
    payload: FeedSortSchema,
  }),
  FEED_SORT_SAVED: z.object({
    type: z.literal('FEED_SORT_SAVED'),
    payload: z.object({ saved: z.boolean() }),
  }),
  GET_FEED_SAVED_VIEWS: z.object({ type: z.literal('GET_FEED_SAVED_VIEWS') }),
  FEED_SAVED_VIEWS_RESULT: z.object({
    type: z.literal('FEED_SAVED_VIEWS_RESULT'),
    payload: FeedSavedViewsSchema,
  }),
  SAVE_FEED_SAVED_VIEWS: z.object({
    type: z.literal('SAVE_FEED_SAVED_VIEWS'),
    payload: FeedSavedViewsSchema,
  }),
  FEED_SAVED_VIEWS_SAVED: z.object({
    type: z.literal('FEED_SAVED_VIEWS_SAVED'),
    payload: z.object({ saved: z.boolean() }),
  }),
  GET_CONNECTED_ALERT_PREFERENCES: z.object({
    type: z.literal('GET_CONNECTED_ALERT_PREFERENCES'),
  }),
  CONNECTED_ALERT_PREFERENCES_RESULT: z.object({
    type: z.literal('CONNECTED_ALERT_PREFERENCES_RESULT'),
    payload: ConnectedAlertPreferencesSchema.nullable(),
  }),
  SAVE_CONNECTED_ALERT_PREFERENCES: z.object({
    type: z.literal('SAVE_CONNECTED_ALERT_PREFERENCES'),
    payload: ConnectedAlertPreferencesSchema,
  }),
  CONNECTED_ALERT_PREFERENCES_SAVED: z.object({
    type: z.literal('CONNECTED_ALERT_PREFERENCES_SAVED'),
    payload: z.object({ saved: z.boolean() }),
  }),
  GET_ALERT_HISTORY: z.object({
    type: z.literal('GET_ALERT_HISTORY'),
  }),
  ALERT_HISTORY_RESULT: z.object({
    type: z.literal('ALERT_HISTORY_RESULT'),
    payload: AlertHistorySchema,
  }),
  GET_TJM_ANALYSIS: z.object({
    type: z.literal('GET_TJM_ANALYSIS'),
    payload: TJMAnalysisRequestSchema.optional(),
  }),
  TJM_ANALYSIS_RESULT: z.object({
    type: z.literal('TJM_ANALYSIS_RESULT'),
    payload: z.object({ analysis: TJMAnalysisSchema.nullable() }).strict(),
  }),
  GET_SEEN_MISSIONS: z.object({ type: z.literal('GET_SEEN_MISSIONS') }),
  SEEN_MISSIONS_RESULT: z.object({
    type: z.literal('SEEN_MISSIONS_RESULT'),
    payload: SeenMissionIdsSchema,
  }),
  SAVE_SEEN_MISSIONS: z.object({
    type: z.literal('SAVE_SEEN_MISSIONS'),
    payload: SeenMissionIdsSchema,
  }),
  SEEN_MISSIONS_SAVED: z.object({
    type: z.literal('SEEN_MISSIONS_SAVED'),
    payload: z.object({ saved: z.boolean() }),
  }),
  RESET_NEW_MISSION_COUNT: z.object({ type: z.literal('RESET_NEW_MISSION_COUNT') }),
  NEW_MISSION_COUNT_RESET: z.object({
    type: z.literal('NEW_MISSION_COUNT_RESET'),
    payload: z.object({ reset: z.boolean() }),
  }),
  CLEAR_EXTENSION_BADGE: z.object({ type: z.literal('CLEAR_EXTENSION_BADGE') }),
  EXTENSION_BADGE_CLEARED: z.object({
    type: z.literal('EXTENSION_BADGE_CLEARED'),
    payload: z.object({ cleared: z.boolean() }),
  }),
  OPEN_EXTERNAL_URL: z.object({
    type: z.literal('OPEN_EXTERNAL_URL'),
    payload: z.object({
      url: z
        .string()
        .url()
        .max(2048)
        .refine((value) => value.startsWith('https://'), {
          message: 'External URLs must use HTTPS',
        }),
    }),
  }),
  EXTERNAL_URL_OPENED: z.object({
    type: z.literal('EXTERNAL_URL_OPENED'),
    payload: z.object({ opened: z.boolean() }),
  }),
  GET_FIRST_SCAN_DONE: z.object({ type: z.literal('GET_FIRST_SCAN_DONE') }),
  FIRST_SCAN_DONE_RESULT: z.object({
    type: z.literal('FIRST_SCAN_DONE_RESULT'),
    payload: z.boolean(),
  }),
  GET_PROFILE_BANNER_DISMISSED: z.object({ type: z.literal('GET_PROFILE_BANNER_DISMISSED') }),
  PROFILE_BANNER_DISMISSED_RESULT: z.object({
    type: z.literal('PROFILE_BANNER_DISMISSED_RESULT'),
    payload: z.boolean(),
  }),
  SET_PROFILE_BANNER_DISMISSED: z.object({ type: z.literal('SET_PROFILE_BANNER_DISMISSED') }),
  PROFILE_BANNER_DISMISSED_SET: z.object({
    type: z.literal('PROFILE_BANNER_DISMISSED_SET'),
    payload: z.object({ saved: z.boolean() }),
  }),
  GET_ONBOARDING_COMPLETED: z.object({ type: z.literal('GET_ONBOARDING_COMPLETED') }),
  ONBOARDING_COMPLETED_RESULT: z.object({
    type: z.literal('ONBOARDING_COMPLETED_RESULT'),
    payload: z.boolean(),
  }),
  SET_ONBOARDING_COMPLETED: z.object({ type: z.literal('SET_ONBOARDING_COMPLETED') }),
  ONBOARDING_COMPLETED_SET: z.object({
    type: z.literal('ONBOARDING_COMPLETED_SET'),
    payload: z.object({ saved: z.boolean() }),
  }),
  CLEAR_ONBOARDING_COMPLETED: z.object({ type: z.literal('CLEAR_ONBOARDING_COMPLETED') }),
  ONBOARDING_COMPLETED_CLEARED: z.object({
    type: z.literal('ONBOARDING_COMPLETED_CLEARED'),
    payload: z.object({ cleared: z.boolean() }),
  }),
  GET_FEED_TOUR_SEEN: z.object({ type: z.literal('GET_FEED_TOUR_SEEN') }),
  FEED_TOUR_SEEN_RESULT: z.object({
    type: z.literal('FEED_TOUR_SEEN_RESULT'),
    payload: z.boolean(),
  }),
  SET_FEED_TOUR_SEEN: z.object({ type: z.literal('SET_FEED_TOUR_SEEN') }),
  FEED_TOUR_SEEN_SET: z.object({
    type: z.literal('FEED_TOUR_SEEN_SET'),
    payload: z.object({ saved: z.boolean() }),
  }),
  CLEAR_FEED_TOUR_SEEN: z.object({ type: z.literal('CLEAR_FEED_TOUR_SEEN') }),
  FEED_TOUR_SEEN_CLEARED: z.object({
    type: z.literal('FEED_TOUR_SEEN_CLEARED'),
    payload: z.object({ cleared: z.boolean() }),
  }),
  GET_PERSISTED_CONNECTOR_STATUSES: z.object({
    type: z.literal('GET_PERSISTED_CONNECTOR_STATUSES'),
  }),
  PERSISTED_CONNECTOR_STATUSES_RESULT: z.object({
    type: z.literal('PERSISTED_CONNECTOR_STATUSES_RESULT'),
    payload: z.array(PersistedConnectorStatusSchema).max(50),
  }),
  GET_SETTINGS: z.object({ type: z.literal('GET_SETTINGS') }),
  SETTINGS_RESULT: z.object({
    type: z.literal('SETTINGS_RESULT'),
    payload: AppSettingsSchema,
  }),
  SAVE_SETTINGS: z.object({
    type: z.literal('SAVE_SETTINGS'),
    payload: AppSettingsSchema,
  }),
  SETTINGS_SAVED: z.object({
    type: z.literal('SETTINGS_SAVED'),
    payload: z.object({
      saved: z.boolean(),
      settings: AppSettingsSchema.nullable(),
    }),
  }),
  SETTINGS_UPDATED: z.object({
    type: z.literal('SETTINGS_UPDATED'),
    payload: AppSettingsSchema,
  }),
  // Profile
  GET_PROFILE: z.object({ type: z.literal('GET_PROFILE') }),
  PROFILE_RESULT: z.object({ type: z.literal('PROFILE_RESULT'), payload: z.unknown() }),
  SAVE_PROFILE: z.object({ type: z.literal('SAVE_PROFILE'), payload: ProfilePayloadSchema }),
  VERIFY_PROFILE_PAGE: z.object({
    type: z.literal('VERIFY_PROFILE_PAGE'),
    payload: z
      .object({
        url: z
          .string()
          .url()
          .max(2048)
          .refine((value) => value.startsWith('https://'), {
            message: 'Profile verification URL must use HTTPS',
          }),
        fields: z.array(ProfileSyncFieldSchema).max(20),
      })
      .refine(maxBytes(40_000), { message: 'VERIFY_PROFILE_PAGE payload exceeds 40KB limit' }),
  }),
  PROFILE_PAGE_VERIFIED: z.object({
    type: z.literal('PROFILE_PAGE_VERIFIED'),
    payload: VerifyProfileResultSchema,
  }),
  PREVIEW_LINKEDIN_PROFILE: z.object({
    type: z.literal('PREVIEW_LINKEDIN_PROFILE'),
    payload: LinkedInTabPayloadSchema.optional(),
  }),
  LINKEDIN_PROFILE_PREVIEWED: z.object({
    type: z.literal('LINKEDIN_PROFILE_PREVIEWED'),
    payload: z.union([
      z.object({ extracted: z.literal(true), profile: CanonicalCandidateProfileDraftSchema }),
      z.object({
        extracted: z.literal(false),
        errorCode: SafeString,
        errorMessage: SafeString,
      }),
    ]),
  }),
  SYNC_LINKEDIN_PROFILE_IMPORT: z.object({
    type: z.literal('SYNC_LINKEDIN_PROFILE_IMPORT'),
    payload: z.object({ profile: CanonicalCandidateProfileDraftSchema }),
  }),
  IMPORT_LINKEDIN_PROFILE: z.object({
    type: z.literal('IMPORT_LINKEDIN_PROFILE'),
    payload: LinkedInTabPayloadSchema.optional(),
  }),
  LINKEDIN_PROFILE_IMPORTED: z.object({
    type: z.literal('LINKEDIN_PROFILE_IMPORTED'),
    payload: z.union([
      z.object({
        imported: z.literal(true),
        profile: CanonicalCandidateProfileDraftSchema,
        addedCount: z.number().int().nonnegative().optional(),
      }),
      z.object({
        imported: z.literal(false),
        errorCode: SafeString,
        errorMessage: SafeString,
      }),
    ]),
  }),

  // Scan
  SCAN_START: z.object({ type: z.literal('SCAN_START') }),
  SCAN_PROGRESS: z.object({
    type: z.literal('SCAN_PROGRESS'),
    payload: z.object({
      phase: ScanProgressPhaseSchema,
      current: z.number().int().min(0),
      total: z.number().int().min(0),
      connectorProgress: z.array(ConnectorProgressSchema),
    }),
  }),
  SCAN_PARTIAL_RESULT: z.object({
    type: z.literal('SCAN_PARTIAL_RESULT'),
    payload: z.object({
      connectorId: SafeString,
      connectorName: SafeString,
      missions: MissionsPayloadSchema,
    }),
  }),
  SCAN_COMPLETE: z.object({ type: z.literal('SCAN_COMPLETE'), payload: MissionsPayloadSchema }),
  SCAN_ERROR: z.object({
    type: z.literal('SCAN_ERROR'),
    payload: z.object({ message: SafeString, code: SafeString }),
  }),
  SCAN_CANCEL: z.object({ type: z.literal('SCAN_CANCEL') }),

  // Missions
  MISSIONS_UPDATED: z.object({
    type: z.literal('MISSIONS_UPDATED'),
    payload: MissionsPayloadSchema,
  }),

  // Tracking
  UPDATE_TRACKING: z.object({
    type: z.literal('UPDATE_TRACKING'),
    payload: z.object({
      missionId: z.string().max(256),
      status: ApplicationStatusSchema,
      note: z.string().max(2048).optional(),
    }),
  }),
  UPDATE_TRACKING_DETAILS: z.object({
    type: z.literal('UPDATE_TRACKING_DETAILS'),
    payload: z.object({
      missionId: z.string().max(256),
      nextActionAt: IsoDateTimeOrNullSchema.optional(),
    }),
  }),
  RESTORE_TRACKING: z.object({
    type: z.literal('RESTORE_TRACKING'),
    payload: z.object({
      missionId: z.string().max(256),
      tracking: MissionTrackingSchema.nullable(),
    }),
  }),
  TRACKING_UPDATED: z.object({
    type: z.literal('TRACKING_UPDATED'),
    payload: MissionTrackingSchema,
  }),
  TRACKING_RESTORED: z.object({
    type: z.literal('TRACKING_RESTORED'),
    payload: MissionTrackingSchema.nullable(),
  }),
  GET_TRACKINGS: z.object({
    type: z.literal('GET_TRACKINGS'),
    payload: z.object({ status: ApplicationStatusSchema.optional() }).optional(),
  }),
  TRACKINGS_RESULT: z.object({ type: z.literal('TRACKINGS_RESULT'), payload: z.unknown() }),

  // Generation
  GENERATE_ASSET: z.object({
    type: z.literal('GENERATE_ASSET'),
    payload: z.object({
      missionId: z.string().max(256),
      generationType: GenerationTypeSchema,
    }),
  }),
  GENERATION_RESULT: z.object({ type: z.literal('GENERATION_RESULT'), payload: z.unknown() }),
  GET_GENERATED_ASSETS: z.object({
    type: z.literal('GET_GENERATED_ASSETS'),
    payload: z.object({ missionId: z.string().max(256) }),
  }),
  GENERATED_ASSETS_RESULT: z.object({
    type: z.literal('GENERATED_ASSETS_RESULT'),
    payload: z.unknown(),
  }),

  // Toast
  SHOW_TOAST: z.object({
    type: z.literal('SHOW_TOAST'),
    payload: z.object({
      message: z.string().max(512),
      toastType: ToastTypeSchema,
      duration: z.number().int().min(0).max(30_000).optional(),
    }),
  }),
  TOAST_SHOWN: z.object({ type: z.literal('TOAST_SHOWN') }),

  // Profile events
  PROFILE_UPDATED: z.object({ type: z.literal('PROFILE_UPDATED'), payload: ProfilePayloadSchema }),
  RESET_LOCAL_DATA: z.object({ type: z.literal('RESET_LOCAL_DATA') }),
  LOCAL_DATA_RESET: z.object({
    type: z.literal('LOCAL_DATA_RESET'),
    payload: z.object({
      reset: z.boolean(),
      reason: SafeString.optional(),
    }),
  }),

  // Connector health
  GET_CONNECTOR_HEALTH: z.object({ type: z.literal('GET_CONNECTOR_HEALTH') }),
  CONNECTOR_HEALTH_RESULT: z.object({
    type: z.literal('CONNECTOR_HEALTH_RESULT'),
    payload: z.array(ConnectorHealthSnapshotSchema),
  }),
  RECHECK_CONNECTOR_HEALTH: z.object({
    type: z.literal('RECHECK_CONNECTOR_HEALTH'),
    payload: z.object({
      connectorId: z.string(),
      enable: z.boolean().optional(),
    }),
  }),
  CONNECTOR_HEALTH_UPDATED: z.object({
    type: z.literal('CONNECTOR_HEALTH_UPDATED'),
    payload: z.object({
      snapshot: ConnectorHealthSnapshotSchema,
      stateChanged: z.boolean(),
    }),
  }),
  CONNECTOR_SKIPPED: z.object({
    type: z.literal('CONNECTOR_SKIPPED'),
    payload: z.object({
      connectorId: z.string(),
      connectorName: z.string(),
      reason: z.literal('circuit-open'),
    }),
  }),

  // Premium status
  GET_PREMIUM_STATUS: z.object({ type: z.literal('GET_PREMIUM_STATUS') }),
  PREMIUM_STATUS_RESULT: z.object({
    type: z.literal('PREMIUM_STATUS_RESULT'),
    payload: z.boolean(),
  }),
  SET_PREMIUM: z.object({
    type: z.literal('SET_PREMIUM'),
    payload: z.boolean(),
  }),
  PREMIUM_SET: z.object({
    type: z.literal('PREMIUM_SET'),
    payload: z.object({ saved: z.boolean() }),
  }),

  // Diagnostic export
  GET_DIAGNOSTIC_EXPORT: z.object({ type: z.literal('GET_DIAGNOSTIC_EXPORT') }),
  DIAGNOSTIC_EXPORT_RESULT: z.object({
    type: z.literal('DIAGNOSTIC_EXPORT_RESULT'),
    payload: z.object({
      version: z.literal('1'),
      exportedAt: z.string(),
      extensionVersion: z.string(),
      errors: z.object({
        summary: z.object({
          total: z.number(),
          byType: z.record(z.number()),
          last24h: z.number(),
        }),
        recent: z.array(
          z.object({
            type: z.string(),
            message: z.string(),
            timestamp: z.number(),
            connectorId: z.string().optional(),
          })
        ),
      }),
      connectors: z.array(
        z.object({
          connectorId: z.string(),
          circuitState: z.enum(['closed', 'open', 'half-open']),
          consecutiveFailures: z.number(),
          totalFailures: z.number(),
          totalSuccesses: z.number(),
          lastSuccessAt: z.number().nullable(),
          lastFailureAt: z.number().nullable(),
        })
      ),
      environment: z.object({
        userAgent: z.string().optional(),
        chromeVersion: z.string().optional(),
      }),
    }),
  }),

  // Parser health
  GET_PARSER_HEALTH: z.object({ type: z.literal('GET_PARSER_HEALTH') }),
  PARSER_HEALTH_RESULT: z.object({
    type: z.literal('PARSER_HEALTH_RESULT'),
    payload: z.array(
      z.object({
        connectorId: z.string(),
        lastMissionCount: z.number(),
        lastSuccessAt: z.number().nullable(),
        consecutiveZeros: z.number(),
      })
    ),
  }),

  // Deep-link focus intent
  CONSUME_DEEP_LINK_INTENT: z.object({ type: z.literal('CONSUME_DEEP_LINK_INTENT') }),
  DEEP_LINK_INTENT_CONSUMED: z.object({
    type: z.literal('DEEP_LINK_INTENT_CONSUMED'),
    payload: z.object({
      intent: z
        .object({
          focusMissionIds: z.array(z.string().min(1).max(200)).min(1).max(20),
          source: z.enum(['notification', 'digest']),
          triggeredAt: z.number().finite(),
        })
        .nullable(),
    }),
  }),
  // SW → live panel broadcast: re-consume a pending deep-link intent after a
  // notification click on an already-open panel. No payload needed.
  NOTIFICATION_CLICKED: z.object({ type: z.literal('NOTIFICATION_CLICKED') }),
} as const;

export type MessageType = keyof typeof MessageSchemas;

/**
 * Valide un message entrant contre son schéma.
 * Retourne le message typé si valide, ou une erreur structurée.
 */
export function validateMessage(raw: unknown):
  | {
      valid: true;
      message: { type: string; payload?: unknown };
    }
  | {
      valid: false;
      messageType: string | undefined;
      errors: string[];
    } {
  // 1. Le message doit être un objet avec un champ `type`
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('type' in raw) ||
    typeof (raw as Record<string, unknown>).type !== 'string'
  ) {
    return {
      valid: false,
      messageType: undefined,
      errors: ['Message must be an object with a string `type` field'],
    };
  }

  const messageType = (raw as Record<string, unknown>).type as string;
  const schema = MessageSchemas[messageType as MessageType];

  // 2. Type inconnu → on laisse passer sans validation (backward compat pour futures extensions)
  if (!schema) {
    return { valid: true, message: raw as { type: string } };
  }

  // 3. Valider avec Zod
  const result = schema.safeParse(raw);
  if (result.success) {
    return { valid: true, message: result.data as { type: string } };
  }

  return {
    valid: false,
    messageType,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}
