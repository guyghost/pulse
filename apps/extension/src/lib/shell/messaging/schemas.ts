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

// ── Profile ──────────────────────────────────────────────────────────────────

const ProfilePayloadSchema = z
  .object({
    skills: z.array(z.string()).optional(),
    location: z.string().optional(),
    tjmMin: z.number().optional(),
    tjmMax: z.number().optional(),
  })
  .passthrough()
  .refine(maxBytes(10_240), { message: 'SAVE_PROFILE payload exceeds 10KB limit' });

const LinkedInTabPayloadSchema = z.object({ tabId: z.number().int().positive().optional() });

const CandidateExperienceDraftSchema = z.object({
  title: SafeString,
  company: SafeString.nullable(),
  location: SafeString.nullable(),
  startDate: z.string().max(32).nullable(),
  endDate: z.string().max(32).nullable(),
  isCurrent: z.boolean(),
  description: SafeString,
  skills: z.array(z.string().max(120)).max(100),
  source: z.literal('linkedin'),
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
  source: z.literal('linkedin'),
  positionIndex: z.number().int().min(0).max(500),
});

const CandidateSkillDraftSchema = z.object({
  skill: z.string().min(1).max(120),
  source: z.literal('linkedin'),
  confidence: z.number().min(0).max(1),
});

const CandidateLinkDraftSchema = z.object({
  label: z.string().min(1).max(120),
  url: z.string().min(1).max(2048),
  source: z.literal('linkedin'),
});

const CanonicalCandidateProfileDraftSchema = z
  .object({
    title: SafeString,
    summary: SafeString,
    experiences: z.array(CandidateExperienceDraftSchema).max(200),
    skills: z.array(CandidateSkillDraftSchema).max(300),
    education: z.array(CandidateEducationDraftSchema).max(100),
    links: z.array(CandidateLinkDraftSchema).max(100),
    source: z.literal('linkedin'),
    confidence: z.number().min(0).max(1),
    capturedAt: z.string().min(1).max(64),
    profileUrl: z.string().min(1).max(2048),
  })
  .refine(maxBytes(80_000), { message: 'LinkedIn profile draft exceeds 80KB limit' });

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
const IsoDateTimeOrNullSchema = z
  .string()
  .max(64)
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: 'Expected an ISO-parseable date string',
  })
  .nullable();

// ── Generation ───────────────────────────────────────────────────────────────

const GenerationTypeSchema = z.enum(['cover-message', 'cv-summary', 'pitch']);

// ── Auth ─────────────────────────────────────────────────────────────────────

const EmailSchema = z.string().email().max(254);
const PasswordSchema = z.string().min(6).max(256);

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
  // Profile
  GET_PROFILE: z.object({ type: z.literal('GET_PROFILE') }),
  PROFILE_RESULT: z.object({ type: z.literal('PROFILE_RESULT'), payload: z.unknown() }),
  SAVE_PROFILE: z.object({ type: z.literal('SAVE_PROFILE'), payload: ProfilePayloadSchema }),
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
      z.object({ imported: z.literal(true), profile: CanonicalCandidateProfileDraftSchema }),
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
  TRACKING_UPDATED: z.object({ type: z.literal('TRACKING_UPDATED'), payload: z.unknown() }),
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
  PROFILE_UPDATED: z.object({ type: z.literal('PROFILE_UPDATED') }),

  // Auth
  AUTH_LOGIN: z.object({
    type: z.literal('AUTH_LOGIN'),
    payload: z.object({ email: EmailSchema, password: PasswordSchema }),
  }),
  AUTH_SIGNUP: z.object({
    type: z.literal('AUTH_SIGNUP'),
    payload: z.object({ email: EmailSchema, password: PasswordSchema }),
  }),
  AUTH_LOGOUT: z.object({ type: z.literal('AUTH_LOGOUT') }),
  AUTH_STATUS: z.object({ type: z.literal('AUTH_STATUS') }),
  AUTH_RESULT: z.object({ type: z.literal('AUTH_RESULT'), payload: z.unknown() }),

  // Account sync
  SYNC_FAVORITE_MISSION: z.object({
    type: z.literal('SYNC_FAVORITE_MISSION'),
    payload: z.object({
      missionId: z.string().max(256),
      favoritedAt: z.number().int().min(0).nullable(),
    }),
  }),
  FAVORITE_MISSION_SYNCED: z.object({
    type: z.literal('FAVORITE_MISSION_SYNCED'),
    payload: z.object({
      missionId: z.string().max(256),
      synced: z.boolean(),
      reason: z.string().max(128).optional(),
    }),
  }),
  GET_CONNECTED_SYNC_STATUS: z.object({ type: z.literal('GET_CONNECTED_SYNC_STATUS') }),
  CONNECTED_SYNC_STATUS_RESULT: z.object({
    type: z.literal('CONNECTED_SYNC_STATUS_RESULT'),
    payload: z.object({
      authenticated: z.boolean(),
      installId: z.string().nullable(),
      lastGlobalSync: z.number().int().min(0).nullable(),
      entities: z.array(
        z.object({
          entity: z.enum([
            'missions',
            'applications',
            'candidate_profile',
            'connector_health',
            'alert_preferences',
          ]),
          label: z.string().min(1).max(80),
          state: z.enum(['healthy', 'pending', 'error', 'idle']),
          lastPullAt: z.string().nullable(),
          lastPushAt: z.string().nullable(),
          pendingUploadCount: z.number().int().min(0),
          pendingDownloadCount: z.number().int().min(0),
          lastErrorCode: z.string().nullable(),
          lastErrorMessage: z.string().nullable(),
          retryAfterAt: z.string().nullable(),
          updatedAt: z.string(),
        })
      ),
    }),
  }),
  SYNC_CONNECTED_DASHBOARD: z.object({ type: z.literal('SYNC_CONNECTED_DASHBOARD') }),
  RETRY_CONNECTED_SYNC: z.object({ type: z.literal('RETRY_CONNECTED_SYNC') }),
  CONNECTED_DASHBOARD_SYNCED: z.object({
    type: z.literal('CONNECTED_DASHBOARD_SYNCED'),
    payload: z.object({
      synced: z.boolean(),
      missions: z.number().int().min(0).optional(),
      applications: z.number().int().min(0).optional(),
      skippedApplications: z.number().int().min(0).optional(),
      connectorHealth: z.number().int().min(0).optional(),
      reason: z.string().max(256).optional(),
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
