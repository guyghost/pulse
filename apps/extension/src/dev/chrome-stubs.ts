import { mockProfile, mockMissions, generateMockTJMHistory } from './mocks';
import { analyzeTJMHistory } from '$lib/core/tjm-history';
import type { TJMHistory, TJMRegion } from '$lib/core/types/tjm';
import type { Mission, MissionSource } from '$lib/core/types/mission';
import type { UserProfile } from '$lib/core/types/profile';
import {
  DEFAULT_CONNECTED_ALERT_PREFERENCES,
  normalizeConnectedAlertPreferences,
  type ConnectedAlertPreferences,
} from '$lib/core/types/alert-preferences';
import { createInitialHealthSnapshot, type ConnectorHealthSnapshot } from '$lib/core/types/health';
import { scoreMission } from '$lib/core/scoring/relevance';
import { buildScoreBreakdown } from '$lib/core/scoring/final-score';
import type { CanonicalCandidateProfileDraft } from '$lib/core/profile-extractors/types';
import { mergeCandidateProfileIntoUserProfile } from '$lib/core/profile-extractors/merge-candidate-profile';
import { countNewlyAddedExperiences } from '$lib/core/cv/experience-helpers';
import type { ApplicationStatus, MissionTracking } from '$lib/core/types/tracking';
import type { GeneratedAsset, GenerationType } from '$lib/core/types/generation';
import { buildConsentedCopilotPayload } from '$lib/core/copilot/build-consented-payload';
import type {
  CopilotDeletionReceipt,
  CopilotDossierProjection,
  CopilotJobSnapshot,
} from '$lib/shell/copilot/contracts';
import { copilotCreditCost, renderCopilotDraft, type CopilotOperationKind } from '@pulse/domain';
import { createTracking, transitionStatus } from '$lib/core/tracking/transitions';
import {
  createSerializedApplicationTrackingError,
  type ApplicationTrackingIntent,
  type Task5ApplicationTrackingErrorCode,
} from '$lib/core/tracking/application-tracking-error';
import { isMissionTrackingPayload } from '$lib/shell/messaging/schemas';
import { isTerminalStatus } from '$lib/core/tracking/pipeline-summary';
import {
  DEV_PREMIUM_FEATURE_STORAGE_KEY,
  DEV_PREMIUM_ENABLED_STORAGE_KEY,
} from '$lib/state/features.svelte';
import type { AppSettings } from '$lib/core/types/app-settings';
import type { SettingsReleaseMutationIntent } from '$lib/shell/settings-release/settings-release.contract';

const DEV_MISSIONS_STORAGE_KEY = '__missionpulse_dev_missions';
const DEV_FAVORITES_STORAGE_KEY = '__missionpulse_dev_favorites';
const DEV_SAVED_VIEWS_STORAGE_KEY = '__missionpulse_dev_saved_views';
const DEV_ALERT_PREFERENCES_STORAGE_KEY = '__missionpulse_dev_alert_preferences';
const DEV_PROFILE_STORAGE_KEY = '__missionpulse_dev_profile';
// DEV-only extensions: persist hidden/seen/trackings/health + onboarding/first-scan
// flags so the QA seed (src/dev/qa-seed.ts) and the DevPanel can exercise every
// state deterministically, and so dev toggles survive reload.
const DEV_HIDDEN_STORAGE_KEY = '__missionpulse_dev_hidden';
const DEV_SEEN_STORAGE_KEY = '__missionpulse_dev_seen';
const DEV_TRACKINGS_STORAGE_KEY = '__missionpulse_dev_trackings';
const DEV_HEALTH_STORAGE_KEY = '__missionpulse_dev_health';
const DEV_ONBOARDING_COMPLETED_KEY = '__missionpulse_dev_onboarding_completed';
const DEV_FIRST_SCAN_DONE_KEY = '__missionpulse_dev_first_scan_done';
const DEV_COPILOT_JOBS_STORAGE_KEY = '__missionpulse_dev_copilot_jobs';
const DEV_COPILOT_DOSSIERS_STORAGE_KEY = '__missionpulse_dev_copilot_dossiers';
const DEV_COPILOT_DELETION_RECEIPTS_STORAGE_KEY = '__missionpulse_dev_copilot_deletion_receipts';

type RuntimeMessage = { type: string; payload?: unknown };
type RuntimeMessageListener = (
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void;
type SerializedMission = Omit<Mission, 'scrapedAt'> & { scrapedAt: string };

function devTrackingFailure(
  intent: ApplicationTrackingIntent,
  missionId: string | null,
  code: Task5ApplicationTrackingErrorCode
): RuntimeMessage {
  return {
    type: 'TRACKING_FAILED',
    payload: createSerializedApplicationTrackingError(intent, missionId, code),
  };
}

function readDevStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeDevStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Dev-only persistence should never break the app shell.
  }
}

function readDevCopilotJobs(): Record<string, CopilotJobSnapshot> {
  return readDevStorage<Record<string, CopilotJobSnapshot>>(DEV_COPILOT_JOBS_STORAGE_KEY, {});
}

function writeDevCopilotJob(job: CopilotJobSnapshot): void {
  writeDevStorage(DEV_COPILOT_JOBS_STORAGE_KEY, {
    ...readDevCopilotJobs(),
    [job.missionId]: job,
  });
}

function readDevCopilotDossiers(): Record<string, CopilotDossierProjection> {
  return readDevStorage<Record<string, CopilotDossierProjection>>(
    DEV_COPILOT_DOSSIERS_STORAGE_KEY,
    {}
  );
}

function writeDevCopilotDossier(dossier: CopilotDossierProjection): void {
  writeDevStorage(DEV_COPILOT_DOSSIERS_STORAGE_KEY, {
    ...readDevCopilotDossiers(),
    [dossier.missionId]: dossier,
  });
}

function devDossierForJob(job: CopilotJobSnapshot): CopilotDossierProjection {
  const existing = readDevCopilotDossiers()[job.missionId];
  return {
    missionId: job.missionId,
    state: 'reviewing',
    consent: {
      missionFields: [
        ...new Set([...(existing?.consent.missionFields ?? []), ...job.selection.missionFields]),
      ],
      profileFields: [
        ...new Set([...(existing?.consent.profileFields ?? []), ...job.selection.profileFields]),
      ],
      evidenceIds: [
        ...new Set([...(existing?.consent.evidenceIds ?? []), ...job.selection.evidenceIds]),
      ],
    },
    analysis: existing?.analysis ?? null,
    approvedArtifacts: existing?.approvedArtifacts ?? [],
    activeJob: { jobId: job.jobId ?? '', kind: job.kind, state: 'review' },
  };
}

function readDevCopilotDeletionReceipts(): Record<string, CopilotDeletionReceipt> {
  return readDevStorage<Record<string, CopilotDeletionReceipt>>(
    DEV_COPILOT_DELETION_RECEIPTS_STORAGE_KEY,
    {}
  );
}

function buildDevCopilotJob(input: {
  missionId: string;
  requestId: string;
  kind: CopilotOperationKind;
  evidenceIds: string[];
  missionFields: CopilotJobSnapshot['selection']['missionFields'];
  profileFields: CopilotJobSnapshot['selection']['profileFields'];
}): CopilotJobSnapshot {
  const now = Date.now();
  const primaryEvidenceId = input.evidenceIds[0] ?? null;
  const selection = {
    missionFields: input.missionFields,
    profileFields: input.profileFields,
    evidenceIds: input.evidenceIds,
  };
  const currentMission = readDevStorage<Mission[]>(DEV_MISSIONS_STORAGE_KEY, mockMissions).find(
    (mission) => mission.id === input.missionId
  );
  const currentProfile = readDevStorage<UserProfile>(DEV_PROFILE_STORAGE_KEY, mockProfile);
  const built = currentMission
    ? buildConsentedCopilotPayload(currentMission, currentProfile, selection)
    : null;
  const payload = built?.ok ? built.payload : { mission: {}, profile: {}, experienceEvidence: [] };
  const primaryEvidence = payload.experienceEvidence.find(
    (evidence) => evidence.evidenceId === primaryEvidenceId
  );
  const inputHash = input.requestId.replaceAll('-', '').repeat(2);
  const tjmFacts =
    input.kind === 'tjm-coach'
      ? {
          schemaVersion: 1 as const,
          confidence: 'medium' as const,
          missionDisplayedTjm: 700,
          profileBounds: { min: 500, target: 625, max: 750, currency: 'EUR' as const },
          market: {
            matchedStacks: ['svelte'],
            recordCount: 2,
            sampleCount: 10,
            min: 550,
            weightedAverage: 680,
            max: 800,
            trend: 'up' as const,
            lastObservedAt: '2026-07-20',
          },
        }
      : null;
  const result = {
    schemaVersion: 1 as const,
    kind: input.kind,
    evidenceClaims: primaryEvidenceId
      ? [
          {
            text: 'Une expérience sélectionnée soutient cette proposition.',
            evidenceIds: [primaryEvidenceId],
          },
        ]
      : [],
    gaps: [],
    risks: ['Contenu synthétique de démonstration : une relecture humaine reste requise.'],
    questions: ['Souhaitez-vous préciser votre disponibilité ?'],
    ...(input.kind === 'analysis'
      ? {}
      : {
          draftSegments: [
            {
              text: 'Je peux mobiliser mon expertise TypeScript et Svelte pour cadrer puis livrer cette mission avec une communication régulière.',
              sourceRefs:
                input.kind === 'tjm-coach'
                  ? [
                      {
                        kind: 'tjm-fact' as const,
                        id: 'profile-tjm-bounds' as const,
                        quote: '500 / 625 / 750 EUR',
                      },
                    ]
                  : [
                      {
                        kind: 'experience' as const,
                        id: primaryEvidenceId as string,
                        quote: primaryEvidence?.summary.slice(0, 80) ?? 'Source indisponible',
                      },
                    ],
            },
          ],
        }),
  };

  return {
    jobId: `dev-copilot-${input.missionId}-${now}`,
    missionId: input.missionId,
    requestId: input.requestId,
    kind: input.kind,
    creditCost: copilotCreditCost(input.kind),
    selection,
    sourceSnapshot: { inputHash, payload },
    status: 'review',
    tjmFacts,
    result,
    error: null,
    creditsRemaining: input.kind === 'analysis' ? 4 : 3,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

/**
 * Minimal in-memory Storage used only when the host environment has no real
 * `window.localStorage` (e.g. some vitest jsdom setups). In the real dev
 * browser this is a no-op — a native localStorage exists and is returned early.
 * This lets the localStorage-backed dev persistence (trackings, profile,
 * favorites, …) round-trip correctly in tests instead of silently no-op'ing.
 */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string): string | null => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string): void => {
      store.set(key, String(value));
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    clear: (): void => {
      store.clear();
    },
    key: (index: number): string | null => [...store.keys()][index] ?? null,
    get length(): number {
      return store.size;
    },
  };
}

function ensureDevStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (window.localStorage) {
      return;
    }
  } catch {
    // Accessing localStorage can throw in some sandboxed environments.
  }
  Object.defineProperty(window, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  });
}

/**
 * Mock canonical LinkedIn profile used by the PREVIEW/IMPORT/SYNC dev stubs so
 * the CV preview → persist flow is exercisable without a service worker.
 */
const mockLinkedInProfile: CanonicalCandidateProfileDraft = {
  title: 'Lead Frontend Svelte',
  summary: 'Architecte front-end spécialisée Svelte, TypeScript et design systems.',
  experiences: [
    {
      title: 'Lead Frontend',
      company: 'Acme Corp',
      employmentType: 'Freelance',
      location: 'Paris',
      startDate: '2022-01',
      endDate: null,
      isCurrent: true,
      description: 'Refonte de la plateforme interne en SvelteKit.',
      skills: ['Svelte', 'TypeScript'],
      source: 'linkedin',
      sourceExternalId: null,
      positionIndex: 0,
    },
    {
      title: 'Product Engineer',
      company: 'Studio Kanso',
      employmentType: 'CDI',
      location: 'Lyon',
      startDate: '2019-09',
      endDate: '2021-12',
      isCurrent: false,
      description: 'Construction d’un design system pour les équipes produit.',
      skills: ['TypeScript', 'Design Systems'],
      source: 'linkedin',
      sourceExternalId: null,
      positionIndex: 1,
    },
  ],
  skills: [
    { skill: 'Svelte', source: 'linkedin', confidence: 0.95 },
    { skill: 'TypeScript', source: 'linkedin', confidence: 0.9 },
    { skill: 'Tailwind CSS', source: 'linkedin', confidence: 0.85 },
  ],
  education: [
    {
      school: 'École Polytechnique',
      degree: "Diplôme d'ingénieur",
      field: 'Informatique',
      startDate: '2014',
      endDate: '2017',
      description: '',
      source: 'linkedin',
      positionIndex: 0,
    },
  ],
  links: [],
  source: 'linkedin',
  confidence: 0.92,
  capturedAt: '2026-06-27T00:00:00.000Z',
  profileUrl: 'https://www.linkedin.com/in/dev-preview',
};

/**
 * Default dev trackings (mirror the previous inline GET_TRACKINGS payload) used
 * to seed the localStorage-backed store on fresh storage.
 */
function defaultDevTrackings(now: number): MissionTracking[] {
  return [
    {
      missionId: 'mock-0',
      currentStatus: 'selected',
      history: [
        { from: null, to: 'detected', timestamp: now - 86_400_000, note: null },
        { from: 'detected', to: 'selected', timestamp: now - 43_200_000, note: null },
      ],
      generatedAssetIds: [],
      userRating: null,
      notes: '',
      nextActionAt: new Date(now - 3_600_000).toISOString(),
    },
    {
      missionId: 'mock-1',
      currentStatus: 'application_prepared',
      history: [
        { from: null, to: 'detected', timestamp: now - 172_800_000, note: null },
        { from: 'detected', to: 'selected', timestamp: now - 120_000_000, note: null },
        { from: 'selected', to: 'application_prepared', timestamp: now - 86_400_000, note: null },
      ],
      generatedAssetIds: ['asset-dev-1'],
      userRating: 4,
      notes: 'Relancer demain matin',
      nextActionAt: new Date(now + 86_400_000).toISOString(),
    },
    {
      missionId: 'mock-2',
      currentStatus: 'applied',
      history: [
        { from: null, to: 'detected', timestamp: now - 259_200_000, note: null },
        { from: 'detected', to: 'selected', timestamp: now - 220_000_000, note: null },
        {
          from: 'selected',
          to: 'application_prepared',
          timestamp: now - 180_000_000,
          note: null,
        },
        { from: 'application_prepared', to: 'applied', timestamp: now - 86_400_000, note: null },
      ],
      generatedAssetIds: [],
      userRating: null,
      notes: '',
      nextActionAt: null,
    },
  ];
}

function readDevTrackings(now: number): MissionTracking[] {
  const stored = readDevStorage<MissionTracking[] | null>(DEV_TRACKINGS_STORAGE_KEY, null);
  return stored !== null ? stored : defaultDevTrackings(now);
}

function writeDevTrackings(trackings: MissionTracking[]): void {
  writeDevStorage(DEV_TRACKINGS_STORAGE_KEY, trackings);
}

function serializeMissionForBridge(mission: Mission): SerializedMission {
  return {
    ...mission,
    scrapedAt:
      mission.scrapedAt instanceof Date
        ? mission.scrapedAt.toISOString()
        : String(mission.scrapedAt),
  };
}

function connectorDisplayName(connectorId: MissionSource): string {
  const names: Record<MissionSource, string> = {
    'free-work': 'Free-Work',
    lehibou: 'LeHibou',
    hiway: 'Hiway',
    collective: 'Collective',
    'cherry-pick': 'Cherry Pick',
    malt: 'Malt',
  };
  return names[connectorId];
}

function groupMissionsBySource(
  missions: SerializedMission[]
): Map<MissionSource, SerializedMission[]> {
  const grouped = new Map<MissionSource, SerializedMission[]>();

  for (const mission of missions) {
    grouped.set(mission.source, [...(grouped.get(mission.source) ?? []), mission]);
  }

  return grouped;
}

const storage: Record<string, unknown> = {
  settings: {
    scanIntervalMinutes: 30,
    enabledConnectors: ['free-work'],
    notifications: true,
    autoScan: true,
    maxSemanticPerScan: 10,
    notificationScoreThreshold: 70,
    respectRateLimits: true,
    customDelayMs: 0,
    theme: 'system',
  },
  favoriteMissions: readDevStorage<Record<string, number>>(DEV_FAVORITES_STORAGE_KEY, {}),
  hiddenMissions: readDevStorage<Record<string, number>>(DEV_HIDDEN_STORAGE_KEY, {}),
  seenMissions: readDevStorage<string[]>(DEV_SEEN_STORAGE_KEY, []),
  feedSavedViews: readDevStorage(DEV_SAVED_VIEWS_STORAGE_KEY, []),
  connectedAlertPreferences: readDevStorage<ConnectedAlertPreferences>(
    DEV_ALERT_PREFERENCES_STORAGE_KEY,
    DEFAULT_CONNECTED_ALERT_PREFERENCES
  ),
  newMissionCount: 0,
  deepLinkIntent: null as import('$lib/core/deep-link/deep-link-intent').DeepLinkIntent | null,
  feedSortBy: 'score',
  profile: readDevStorage<UserProfile>(DEV_PROFILE_STORAGE_KEY, mockProfile),
  premium_enabled: readDevStorage<boolean>(DEV_PREMIUM_ENABLED_STORAGE_KEY, true),
  premium_feature_enabled: readDevStorage<boolean>(DEV_PREMIUM_FEATURE_STORAGE_KEY, false),
  first_scan_done: readDevStorage<boolean>(DEV_FIRST_SCAN_DONE_KEY, true),
  profile_banner_dismissed: false,
  onboarding_completed: readDevStorage<boolean>(DEV_ONBOARDING_COMPLETED_KEY, true),
  feed_tour_seen: false,
  tjm_history: generateMockTJMHistory(),
};

let settingsReleaseRevision = 0;
let settingsReleaseGeneration = 0;

function devSettingsReleaseSnapshot() {
  return {
    settings: structuredClone(storage.settings as AppSettings),
    onboardingCompleted: storage.onboarding_completed === true,
    revision: settingsReleaseRevision,
    generation: settingsReleaseGeneration,
  };
}

function getDevConnectorHealthSnapshots(): ConnectorHealthSnapshot[] {
  const storedHealth = readDevStorage<ConnectorHealthSnapshot[] | null>(
    DEV_HEALTH_STORAGE_KEY,
    null
  );
  if (import.meta.env.DEV && Array.isArray(storedHealth) && storedHealth.length > 0) {
    return storedHealth;
  }
  const now = Date.now();
  return ['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick', 'malt'].map(
    (connectorId) => ({
      ...createInitialHealthSnapshot(connectorId, now - 10 * 60_000),
      totalSuccesses: connectorId === 'free-work' ? 3 : 1,
      lastSuccessAt: now - (connectorId === 'free-work' ? 2 : 18) * 60_000,
      recentLatenciesMs: connectorId === 'free-work' ? [420, 510, 460] : [780],
    })
  );
}

function createChromeStubs() {
  let activeDevScan: {
    operationId: string;
    timers: ReturnType<typeof setTimeout>[];
  } | null = null;

  const runtimeMessageListeners = new Set<RuntimeMessageListener>();

  function emitRuntimeMessage(message: RuntimeMessage): void {
    const sender = { id: 'dev-mode' } as chrome.runtime.MessageSender;

    for (const listener of runtimeMessageListeners) {
      try {
        listener(message, sender, () => {});
      } catch (error) {
        console.warn('[Chrome Stub] runtime listener failed:', error);
      }
    }
  }

  return {
    runtime: {
      id: 'dev-mode',
      getManifest: () => ({ version: '0.1.0-dev' }),
      getURL: (path: string) => path,
      sendMessage: async (message: { type: string; payload?: unknown }) => {
        console.log('[Chrome Stub] sendMessage:', message.type);

        switch (message.type) {
          case 'GET_SETTINGS_RELEASE':
            return {
              type: 'SETTINGS_RELEASE_RESULT',
              payload: { status: 'confirmed', snapshot: devSettingsReleaseSnapshot() },
            };
          case 'MUTATE_SETTINGS_RELEASE': {
            const intent = message.payload as SettingsReleaseMutationIntent;
            const current = devSettingsReleaseSnapshot();
            if (intent.baseRevision !== current.revision) {
              return {
                type: 'SETTINGS_RELEASE_MUTATION_RESULT',
                payload: {
                  status: 'not_admitted',
                  requestId: intent.requestId,
                  commandId: null,
                  reason: 'conflict',
                  snapshot: current,
                },
              };
            }
            const candidateSettings =
              intent.kind === 'save_settings' ? intent.settings : current.settings;
            const candidateConsent =
              intent.kind === 'save_settings' ? current.onboardingCompleted : intent.targetConsent;
            if (
              JSON.stringify(candidateSettings) === JSON.stringify(current.settings) &&
              candidateConsent === current.onboardingCompleted
            ) {
              return {
                type: 'SETTINGS_RELEASE_MUTATION_RESULT',
                payload: {
                  status: 'not_admitted',
                  requestId: intent.requestId,
                  commandId: null,
                  reason: 'already_confirmed',
                  snapshot: current,
                },
              };
            }
            storage.settings = structuredClone(candidateSettings);
            storage.onboarding_completed = candidateConsent;
            writeDevStorage(DEV_ONBOARDING_COMPLETED_KEY, candidateConsent);
            settingsReleaseRevision += 1;
            settingsReleaseGeneration += 1;
            const snapshot = devSettingsReleaseSnapshot();
            const commandId = `settings-release:92000000-0000-4000-8000-000000000001:${settingsReleaseRevision}:command`;
            return {
              type: 'SETTINGS_RELEASE_MUTATION_RESULT',
              payload: {
                status: 'settled',
                outcome: {
                  commandId,
                  requestId: intent.requestId,
                  intentDigest: '0'.repeat(64),
                  kind: intent.kind,
                  settledRevision: snapshot.revision,
                  settledGeneration: snapshot.generation,
                  snapshot,
                  status: 'committed',
                  reason: 'committed',
                },
              },
            };
          }
          case 'GET_SETTINGS':
            return { type: 'SETTINGS_RESULT', payload: storage.settings };
          case 'SAVE_SETTINGS':
            storage.settings = message.payload;
            return { type: 'SETTINGS_SAVED', payload: { saved: true, settings: message.payload } };
          case 'GET_PROFILE':
            return { type: 'PROFILE_RESULT', payload: storage.profile ?? null };
          case 'SAVE_PROFILE':
            console.log('[Chrome Stub] Profile saved:', message.payload);
            storage.profile = message.payload;
            writeDevStorage(DEV_PROFILE_STORAGE_KEY, message.payload);

            // Mirror the production service worker (background/index.ts SAVE_PROFILE):
            // rescore stored missions against the new profile and broadcast the
            // updated scores so the feed reflects the change in dev mode.
            try {
              const profile = message.payload as UserProfile;
              const missions = readDevStorage<Mission[]>(DEV_MISSIONS_STORAGE_KEY, mockMissions);
              const now = new Date();
              const rescored: Mission[] = missions.map((mission): Mission => {
                const result = scoreMission(mission, profile, now);
                return {
                  ...mission,
                  scoreBreakdown: buildScoreBreakdown(result.total, result.breakdown),
                  score: result.total,
                  semanticScore: null,
                  semanticReason: null,
                };
              });
              writeDevStorage(DEV_MISSIONS_STORAGE_KEY, rescored);
              emitRuntimeMessage({
                type: 'MISSIONS_UPDATED',
                payload: rescored.map(serializeMissionForBridge),
              });
            } catch (err) {
              if (import.meta.env.DEV) {
                console.warn('[Chrome Stub] Profile rescore failed:', err);
              }
            }

            emitRuntimeMessage({ type: 'PROFILE_UPDATED', payload: message.payload });
            return { type: 'PROFILE_RESULT', payload: message.payload };
          case 'GET_PREMIUM_STATUS':
            return {
              type: 'PREMIUM_STATUS_RESULT',
              payload: storage.premium_enabled === true,
            };
          case 'COPILOT_LINK': {
            const payload = message.payload as { requestId: string };
            return {
              type: 'COPILOT_LINK_RESULT',
              payload: {
                requestId: payload.requestId,
                outcome: 'linked',
                subject: 'dev-premium-user',
                error: null,
              },
            };
          }
          case 'COPILOT_SYNC_ENTITLEMENT': {
            const payload = message.payload as { requestId: string };
            const now = Date.now();
            return {
              type: 'COPILOT_ENTITLEMENT_RESULT',
              payload: {
                requestId: payload.requestId,
                outcome: 'synced',
                state: 'active',
                entitlement: {
                  status: 'active',
                  subject: 'dev-premium-user',
                  issuedAtMs: now,
                  expiresAtMs: now + 86_400_000,
                  creditsRemaining: 4,
                },
                error: null,
              },
            };
          }
          case 'COPILOT_CREATE_JOB': {
            const payload = message.payload as {
              requestId: string;
              missionId: string;
              kind: CopilotOperationKind;
              evidenceIds: string[];
              missionFields: CopilotJobSnapshot['selection']['missionFields'];
              profileFields: CopilotJobSnapshot['selection']['profileFields'];
            };
            if (
              payload.kind !== 'analysis' &&
              payload.kind !== 'tjm-coach' &&
              payload.evidenceIds.length === 0
            ) {
              return {
                type: 'COPILOT_CREATE_JOB_RESULT',
                payload: {
                  requestId: payload.requestId,
                  missionId: payload.missionId,
                  outcome: 'error',
                  job: null,
                  deletionReceipt: null,
                  error: {
                    code: 'INVALID_REQUEST',
                    message: 'Sélectionnez une expérience pour ancrer le contenu.',
                    retryable: false,
                  },
                },
              };
            }
            const job = buildDevCopilotJob(payload);
            writeDevCopilotJob(job);
            writeDevCopilotDossier(devDossierForJob(job));
            const receipts = readDevCopilotDeletionReceipts();
            delete receipts[payload.missionId];
            writeDevStorage(DEV_COPILOT_DELETION_RECEIPTS_STORAGE_KEY, receipts);
            return {
              type: 'COPILOT_CREATE_JOB_RESULT',
              payload: {
                requestId: payload.requestId,
                missionId: payload.missionId,
                outcome: 'ok',
                job,
                deletionReceipt: null,
                error: null,
              },
            };
          }
          case 'COPILOT_GET_DOSSIER': {
            const payload = message.payload as { requestId: string; missionId: string };
            const dossier = readDevCopilotDossiers()[payload.missionId] ?? null;
            return {
              type: 'COPILOT_GET_DOSSIER_RESULT',
              payload: {
                requestId: payload.requestId,
                missionId: payload.missionId,
                outcome: dossier ? 'ok' : 'not_found',
                dossier,
                error: null,
              },
            };
          }
          case 'COPILOT_GET_JOB': {
            const payload = message.payload as { requestId: string; missionId: string };
            const job = readDevCopilotJobs()[payload.missionId] ?? null;
            const deletionReceipt = readDevCopilotDeletionReceipts()[payload.missionId] ?? null;
            return {
              type: 'COPILOT_GET_JOB_RESULT',
              payload: {
                requestId: payload.requestId,
                missionId: payload.missionId,
                outcome: job ? 'ok' : 'not_found',
                job,
                deletionReceipt: job ? null : deletionReceipt,
                error: null,
              },
            };
          }
          case 'COPILOT_CANCEL_JOB': {
            const payload = message.payload as {
              requestId: string;
              missionId: string;
              jobId: string;
            };
            const existing = readDevCopilotJobs()[payload.missionId] ?? null;
            const job =
              existing && existing.jobId === payload.jobId
                ? { ...existing, status: 'cancelled' as const, updatedAtMs: Date.now() }
                : null;
            if (job) {
              writeDevCopilotJob(job);
            }
            if (job) {
              const dossier = readDevCopilotDossiers()[payload.missionId];
              if (dossier) {
                writeDevCopilotDossier({ ...dossier, state: 'ready', activeJob: null });
              }
            }
            return {
              type: 'COPILOT_CANCEL_JOB_RESULT',
              payload: {
                requestId: payload.requestId,
                missionId: payload.missionId,
                outcome: job ? 'ok' : 'error',
                job,
                deletionReceipt: null,
                error: job
                  ? null
                  : { code: 'JOB_NOT_FOUND', message: 'Job dev introuvable.', retryable: false },
              },
            };
          }
          case 'COPILOT_REVIEW_JOB': {
            const payload = message.payload as {
              requestId: string;
              missionId: string;
              jobId: string;
              decision: 'accept' | 'reject';
            };
            const existing = readDevCopilotJobs()[payload.missionId] ?? null;
            const job =
              existing && existing.jobId === payload.jobId && existing.status === 'review'
                ? {
                    ...existing,
                    jobId: payload.jobId,
                    status:
                      payload.decision === 'accept' ? ('accepted' as const) : ('rejected' as const),
                    updatedAtMs: Date.now(),
                  }
                : null;
            if (job) {
              writeDevCopilotJob(job);
              const dossier = readDevCopilotDossiers()[payload.missionId];
              if (dossier) {
                const reviewedAtMs = Date.now();
                const renderedDraft = job.result === null ? null : renderCopilotDraft(job.result);
                writeDevCopilotDossier({
                  ...dossier,
                  state: 'ready',
                  activeJob: null,
                  analysis:
                    payload.decision === 'accept' &&
                    job.kind === 'analysis' &&
                    job.result?.kind === 'analysis'
                      ? {
                          jobId: job.jobId,
                          result: job.result as NonNullable<
                            CopilotDossierProjection['analysis']
                          >['result'],
                          approvedAtMs: reviewedAtMs,
                        }
                      : dossier.analysis,
                  approvedArtifacts:
                    payload.decision === 'accept' &&
                    job.kind !== 'analysis' &&
                    job.result &&
                    renderedDraft !== null
                      ? [
                          ...dossier.approvedArtifacts,
                          {
                            artifactId: `dev-artifact-${job.jobId}`,
                            jobId: job.jobId,
                            kind: job.kind,
                            draft: renderedDraft,
                            approvedAtMs: reviewedAtMs,
                          },
                        ]
                      : dossier.approvedArtifacts,
                });
              }
            }
            return {
              type: 'COPILOT_REVIEW_JOB_RESULT',
              payload: {
                requestId: payload.requestId,
                missionId: payload.missionId,
                outcome: job ? 'ok' : 'error',
                job,
                deletionReceipt: null,
                error: job
                  ? null
                  : {
                      code: 'JOB_NOT_REVIEWABLE',
                      message: 'Job dev non révisable.',
                      retryable: false,
                    },
              },
            };
          }
          case 'COPILOT_DELETE_DOSSIER': {
            const payload = message.payload as { requestId: string; missionId: string };
            const jobs = readDevCopilotJobs();
            const dossiers = readDevCopilotDossiers();
            const existingDossier = dossiers[payload.missionId] ?? null;
            const deletable =
              existingDossier !== null &&
              (existingDossier.state === 'ready' || existingDossier.state === 'deletionFailed') &&
              existingDossier.activeJob === null;
            if (existingDossier && !deletable) {
              return {
                type: 'COPILOT_DELETE_DOSSIER_RESULT',
                payload: {
                  requestId: payload.requestId,
                  missionId: payload.missionId,
                  outcome: 'error',
                  disposition: null,
                  receipt: null,
                  error: {
                    code: 'DELETE_FAILED',
                    message: 'Le job dev doit être réglé avant la suppression.',
                    retryable: false,
                  },
                },
              };
            }
            const disposition = existingDossier ? 'deleted' : 'not-created';
            delete jobs[payload.missionId];
            writeDevStorage(DEV_COPILOT_JOBS_STORAGE_KEY, jobs);
            delete dossiers[payload.missionId];
            writeDevStorage(DEV_COPILOT_DOSSIERS_STORAGE_KEY, dossiers);
            const receipt = {
              version: 1 as const,
              missionId: payload.missionId,
              disposition,
              confirmedAtMs: Date.now(),
            };
            writeDevStorage(DEV_COPILOT_DELETION_RECEIPTS_STORAGE_KEY, {
              ...readDevCopilotDeletionReceipts(),
              [payload.missionId]: receipt,
            });
            return {
              type: 'COPILOT_DELETE_DOSSIER_RESULT',
              payload: {
                requestId: payload.requestId,
                missionId: payload.missionId,
                outcome: 'deleted',
                disposition,
                receipt,
                error: null,
              },
            };
          }
          case 'SET_PREMIUM':
            storage.premium_enabled = message.payload === true;
            writeDevStorage(DEV_PREMIUM_ENABLED_STORAGE_KEY, message.payload === true);
            return { type: 'PREMIUM_SET', payload: { saved: true } };
          case 'VERIFY_PROFILE_PAGE': {
            const p = message.payload as Record<string, unknown> | undefined;
            return {
              type: 'PROFILE_PAGE_VERIFIED',
              payload: {
                read: { status: 'blocked', finalUrl: String(p?.url ?? ''), reason: 'dev-mode' },
                comparisons: [],
                summary: { matches: 0, mismatches: 0, missing: 0 },
              },
            };
          }
          case 'PREVIEW_LINKEDIN_PROFILE':
            return {
              type: 'LINKEDIN_PROFILE_PREVIEWED',
              payload: { extracted: true, profile: mockLinkedInProfile },
            };
          case 'IMPORT_LINKEDIN_PROFILE':
            return {
              type: 'LINKEDIN_PROFILE_IMPORTED',
              payload: { imported: true, profile: mockLinkedInProfile },
            };
          case 'SYNC_LINKEDIN_PROFILE_IMPORT': {
            const draft = (message.payload as { profile: CanonicalCandidateProfileDraft }).profile;
            const current = readDevStorage<UserProfile>(DEV_PROFILE_STORAGE_KEY, mockProfile);
            const addedCount = countNewlyAddedExperiences(
              current?.experiences ?? [],
              draft.experiences
            );
            const merged = mergeCandidateProfileIntoUserProfile(current, draft, Date.now());
            writeDevStorage(DEV_PROFILE_STORAGE_KEY, merged);
            storage.profile = merged;
            emitRuntimeMessage({ type: 'PROFILE_UPDATED', payload: merged });
            return {
              type: 'LINKEDIN_PROFILE_IMPORTED',
              payload: { imported: true, profile: draft, addedCount },
            };
          }
          case 'GET_FEED_MISSIONS':
            return {
              type: 'FEED_MISSIONS_RESULT',
              payload: readDevStorage<Mission[]>(DEV_MISSIONS_STORAGE_KEY, mockMissions).map(
                (m) => ({
                  ...m,
                  scrapedAt: new Date(),
                })
              ),
            };
          case 'GET_FEED_FAVORITES':
            return { type: 'FEED_FAVORITES_RESULT', payload: storage.favoriteMissions };
          case 'SAVE_FEED_FAVORITES':
            storage.favoriteMissions = message.payload;
            writeDevStorage(DEV_FAVORITES_STORAGE_KEY, message.payload);
            return { type: 'FEED_FAVORITES_SAVED', payload: { saved: true } };
          case 'GET_FEED_HIDDEN':
            return { type: 'FEED_HIDDEN_RESULT', payload: storage.hiddenMissions };
          case 'SAVE_FEED_HIDDEN':
            storage.hiddenMissions = message.payload;
            return { type: 'FEED_HIDDEN_SAVED', payload: { saved: true } };
          case 'GET_FEED_SORT':
            return { type: 'FEED_SORT_RESULT', payload: storage.feedSortBy };
          case 'SAVE_FEED_SORT':
            storage.feedSortBy = message.payload;
            return { type: 'FEED_SORT_SAVED', payload: { saved: true } };
          case 'GET_FEED_SAVED_VIEWS':
            return { type: 'FEED_SAVED_VIEWS_RESULT', payload: storage.feedSavedViews };
          case 'SAVE_FEED_SAVED_VIEWS':
            storage.feedSavedViews = message.payload;
            writeDevStorage(DEV_SAVED_VIEWS_STORAGE_KEY, message.payload);
            return { type: 'FEED_SAVED_VIEWS_SAVED', payload: { saved: true } };
          case 'GET_CONNECTED_ALERT_PREFERENCES':
            return {
              type: 'CONNECTED_ALERT_PREFERENCES_RESULT',
              payload: normalizeConnectedAlertPreferences(
                storage.connectedAlertPreferences as ConnectedAlertPreferences
              ),
            };
          case 'SAVE_CONNECTED_ALERT_PREFERENCES':
            storage.connectedAlertPreferences = normalizeConnectedAlertPreferences(
              message.payload as ConnectedAlertPreferences
            );
            writeDevStorage(DEV_ALERT_PREFERENCES_STORAGE_KEY, storage.connectedAlertPreferences);
            return {
              type: 'CONNECTED_ALERT_PREFERENCES_SAVED',
              payload: { saved: true, preferences: storage.connectedAlertPreferences },
            };
          case 'GET_CONNECTOR_HEALTH':
            return {
              type: 'CONNECTOR_HEALTH_RESULT',
              payload: getDevConnectorHealthSnapshots(),
            };
          case 'RECHECK_CONNECTOR_HEALTH':
            return {
              type: 'CONNECTOR_HEALTH_RESULT',
              payload: getDevConnectorHealthSnapshots(),
            };
          case 'GET_TJM_ANALYSIS': {
            const history = storage.tjm_history as TJMHistory | undefined;
            const payload = message.payload as
              { profileStacks?: string[]; region?: TJMRegion } | undefined;
            const normalizedStacks =
              payload?.profileStacks && payload.profileStacks.length > 0
                ? new Set(payload.profileStacks.map((stack) => stack.toLowerCase().trim()))
                : null;
            const records = history?.records ?? [];
            const filteredRecords = records.filter((record) => {
              if (normalizedStacks && !normalizedStacks.has(record.stack.toLowerCase().trim())) {
                return false;
              }
              if (payload?.region && record.region !== payload.region) {
                return false;
              }
              return true;
            });

            return {
              type: 'TJM_ANALYSIS_RESULT',
              payload: {
                analysis: analyzeTJMHistory({ records: filteredRecords }),
              },
            };
          }
          case 'GET_SEEN_MISSIONS':
            return { type: 'SEEN_MISSIONS_RESULT', payload: storage.seenMissions };
          case 'SAVE_SEEN_MISSIONS':
            storage.seenMissions = message.payload;
            return { type: 'SEEN_MISSIONS_SAVED', payload: { saved: true } };
          case 'RESET_NEW_MISSION_COUNT':
            storage.newMissionCount = 0;
            return { type: 'NEW_MISSION_COUNT_RESET', payload: { reset: true } };
          case 'CONSUME_DEEP_LINK_INTENT': {
            // Atomic read + clear, mirroring the SW handler.
            const intent = storage.deepLinkIntent;
            storage.deepLinkIntent = null;
            return { type: 'DEEP_LINK_INTENT_CONSUMED', payload: { intent } };
          }
          case 'NOTIFICATION_CLICKED':
            // SW → live panel broadcast (thread A): fan out to onMessage
            // listeners so a dev-mode panel can re-consume the intent, mirroring
            // real Chrome's runtime message delivery.
            emitRuntimeMessage(message);
            return null;
          case 'GET_PERSISTED_CONNECTOR_STATUSES':
            return { type: 'PERSISTED_CONNECTOR_STATUSES_RESULT', payload: [] };
          case 'CLEAR_EXTENSION_BADGE':
            storage.newMissionCount = 0;
            return { type: 'EXTENSION_BADGE_CLEARED', payload: { cleared: true } };
          case 'OPEN_EXTERNAL_URL':
            console.log('[Chrome Stub] Open external URL:', message.payload);
            return { type: 'EXTERNAL_URL_OPENED', payload: { opened: true } };
          case 'GET_FIRST_SCAN_DONE':
            return { type: 'FIRST_SCAN_DONE_RESULT', payload: storage.first_scan_done === true };
          case 'SET_FIRST_SCAN_DONE':
            storage.first_scan_done = true;
            writeDevStorage(DEV_FIRST_SCAN_DONE_KEY, true);
            return { type: 'FIRST_SCAN_DONE_SET', payload: { saved: true } };
          case 'GET_PROFILE_BANNER_DISMISSED':
            return {
              type: 'PROFILE_BANNER_DISMISSED_RESULT',
              payload: storage.profile_banner_dismissed === true,
            };
          case 'SET_PROFILE_BANNER_DISMISSED':
            storage.profile_banner_dismissed = true;
            return { type: 'PROFILE_BANNER_DISMISSED_SET', payload: { saved: true } };
          case 'GET_ONBOARDING_COMPLETED':
            return {
              type: 'ONBOARDING_COMPLETED_RESULT',
              payload: storage.onboarding_completed === true,
            };
          case 'SET_ONBOARDING_COMPLETED':
            storage.onboarding_completed = true;
            writeDevStorage(DEV_ONBOARDING_COMPLETED_KEY, true);
            return { type: 'ONBOARDING_COMPLETED_SET', payload: { saved: true } };
          case 'CLEAR_ONBOARDING_COMPLETED':
            storage.onboarding_completed = false;
            writeDevStorage(DEV_ONBOARDING_COMPLETED_KEY, false);
            return { type: 'ONBOARDING_COMPLETED_CLEARED', payload: { cleared: true } };
          case 'GET_FEED_TOUR_SEEN':
            return { type: 'FEED_TOUR_SEEN_RESULT', payload: storage.feed_tour_seen === true };
          case 'SET_FEED_TOUR_SEEN':
            storage.feed_tour_seen = true;
            return { type: 'FEED_TOUR_SEEN_SET', payload: { saved: true } };
          case 'CLEAR_FEED_TOUR_SEEN':
            storage.feed_tour_seen = false;
            return { type: 'FEED_TOUR_SEEN_CLEARED', payload: { cleared: true } };
          case 'SCAN_START': {
            const operationId = (message.payload as { operationId: string }).operationId;
            if (activeDevScan) {
              return {
                type: 'SCAN_BUSY',
                payload: {
                  operationId,
                  activeOperationId: activeDevScan.operationId,
                },
              };
            }
            const runtimeMissions = readDevStorage<Mission[]>(
              DEV_MISSIONS_STORAGE_KEY,
              mockMissions
            ).map((m) => ({ ...m, scrapedAt: new Date() }));
            const bridgeMissions = runtimeMissions.map(serializeMissionForBridge);
            const groupedBySource = [...groupMissionsBySource(bridgeMissions).entries()];
            const timers: ReturnType<typeof setTimeout>[] = [];
            activeDevScan = { operationId, timers };

            groupedBySource.forEach(([connectorId, connectorMissions], index) => {
              timers.push(
                setTimeout(
                  () => {
                    emitRuntimeMessage({
                      type: 'SCAN_PARTIAL_RESULT',
                      payload: {
                        operationId,
                        connectorId,
                        connectorName: connectorDisplayName(connectorId),
                        missions: connectorMissions,
                      },
                    });
                  },
                  250 + index * 250
                )
              );
            });

            timers.push(
              setTimeout(
                () => {
                  if (activeDevScan?.operationId !== operationId) {
                    return;
                  }
                  activeDevScan = null;
                  emitRuntimeMessage({
                    type: 'SCAN_COMPLETE',
                    payload: { operationId, missions: bridgeMissions },
                  });
                  window.dispatchEvent(
                    new CustomEvent('dev:missions', {
                      detail: runtimeMissions,
                    })
                  );
                },
                Math.max(800, 500 + groupedBySource.length * 250)
              )
            );

            return { type: 'SCAN_STARTED', payload: { operationId } };
          }
          case 'SCAN_CANCEL': {
            const operationId = (message.payload as { operationId: string }).operationId;
            if (!activeDevScan || activeDevScan.operationId !== operationId) {
              return {
                type: 'SCAN_CANCEL_REJECTED',
                payload: {
                  operationId,
                  code: 'STALE_OPERATION',
                  message: 'Aucun scan actif ne correspond à cette opération.',
                },
              };
            }
            for (const timer of activeDevScan.timers) {
              clearTimeout(timer);
            }
            const cancelled = { type: 'SCAN_CANCELLED', payload: { operationId } };
            activeDevScan = null;
            setTimeout(() => {
              emitRuntimeMessage(cancelled);
            }, 0);
            return { type: 'SCAN_CANCEL_REQUESTED', payload: { operationId } };
          }
          case 'GET_TRACKINGS': {
            const now = Date.now();
            const all = readDevTrackings(now);
            const p = message.payload as { status?: ApplicationStatus } | undefined;
            const filtered = p?.status ? all.filter((t) => t.currentStatus === p.status) : all;
            return { type: 'TRACKINGS_RESULT', payload: filtered };
          }
          case 'UPDATE_TRACKING': {
            const p = message.payload as {
              missionId: string;
              status: ApplicationStatus;
              note?: string;
            };
            const now = Date.now();
            const all = readDevTrackings(now);
            const existing =
              all.find((t) => t.missionId === p.missionId) ?? createTracking(p.missionId, now);
            const updated = transitionStatus(existing, p.status, now, p.note ?? null);
            if (!updated) {
              return devTrackingFailure('transition', p.missionId, 'INVALID_TRANSITION');
            }
            const without = all.filter((t) => t.missionId !== p.missionId);
            writeDevTrackings([...without, updated]);
            return { type: 'TRACKING_UPDATED', payload: updated };
          }
          case 'UPDATE_TRACKING_DETAILS': {
            const p = message.payload as { missionId: string; nextActionAt?: string | null };
            const nextActionAt = p.nextActionAt ?? null;
            if (nextActionAt !== null && !Number.isFinite(Date.parse(nextActionAt))) {
              return devTrackingFailure('details', p.missionId, 'INVALID_DETAILS');
            }
            const now = Date.now();
            const all = readDevTrackings(now);
            const existing =
              all.find((t) => t.missionId === p.missionId) ?? createTracking(p.missionId, now);
            if (nextActionAt !== null && isTerminalStatus(existing.currentStatus)) {
              return devTrackingFailure('details', p.missionId, 'INVALID_DETAILS');
            }
            const updated: MissionTracking = { ...existing, nextActionAt };
            const without = all.filter((t) => t.missionId !== p.missionId);
            writeDevTrackings([...without, updated]);
            return { type: 'TRACKING_UPDATED', payload: updated };
          }
          case 'RESTORE_TRACKING': {
            const p = message.payload as { missionId: string; tracking: MissionTracking | null };
            const now = Date.now();
            const all = readDevTrackings(now);
            const without = all.filter((t) => t.missionId !== p.missionId);
            if (p.tracking !== null) {
              if (!isMissionTrackingPayload(p.tracking) || p.tracking.missionId !== p.missionId) {
                return devTrackingFailure('restore', p.missionId, 'INVALID_RESTORE');
              }
              writeDevTrackings([...without, p.tracking]);
              return {
                type: 'TRACKING_RESTORED',
                payload: { missionId: p.missionId, tracking: p.tracking },
              };
            }
            writeDevTrackings(without);
            return {
              type: 'TRACKING_RESTORED',
              payload: { missionId: p.missionId, tracking: null },
            };
          }
          case 'GENERATE_ASSET': {
            // Dev mode returns a realistic mock asset so the kit-generation UI
            // flow is exercisable without a service worker. Local Gemini Nano
            // generation remains free and independent from the Copilot Premium
            // entitlement. See models/premium-feature-flag.model.md.
            const { missionId: genMissionId, generationType: genType } = (message.payload ??
              {}) as {
              missionId: string;
              generationType: GenerationType;
            };
            const genNow = Date.now();
            const devContentByType: Record<GenerationType, string> = {
              pitch:
                'Développeur Svelte/TypeScript, 8 ans d’expérience. Disponible immédiatement pour cette mission en hybride à Paris.',
              'cover-message':
                'Bonjour, votre mission correspond à mon expertise Svelte et TypeScript. Disponible pour en discuter cette semaine.',
              'cv-summary':
                'Lead Frontend Svelte / TypeScript spécialisé en design systems, 8 ans d’expérience, TJM 650-900€.',
            };
            const devAsset: GeneratedAsset = {
              id: `gen-dev-${genType}-${genMissionId}-${genNow}`,
              missionId: genMissionId,
              type: genType,
              content: devContentByType[genType],
              createdAt: genNow,
              modelUsed: 'dev-mock',
            };
            return { type: 'GENERATION_RESULT', payload: { asset: devAsset } };
          }
          case 'GET_GENERATED_ASSETS':
            return { type: 'GENERATED_ASSETS_RESULT', payload: [] };
          case 'SHOW_TOAST':
            console.log('[Chrome Stub] Toast:', message.payload);
            return { type: 'TOAST_SHOWN' };
          case 'PROFILE_UPDATED':
            console.log('[Chrome Stub] Profile updated notification', message.payload);
            emitRuntimeMessage(message);
            return null;
          case 'RESET_LOCAL_DATA':
            for (const key of Object.keys(storage)) {
              delete storage[key];
            }
            return { type: 'LOCAL_DATA_RESET', payload: { reset: true } };
          default:
            console.log('[Chrome Stub] Unhandled message type:', message.type);
            return null;
        }
      },
      onMessage: {
        addListener: (listener: RuntimeMessageListener) => {
          runtimeMessageListeners.add(listener);
        },
        removeListener: (listener: RuntimeMessageListener) => {
          runtimeMessageListeners.delete(listener);
        },
      },
    },
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const keyArr = typeof keys === 'string' ? [keys] : keys;
          const result: Record<string, unknown> = {};
          for (const k of keyArr) {
            if (k in storage) {
              result[k] = storage[k];
            }
          }
          return result;
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(storage, items);
        },
        remove: async (keys: string | string[]) => {
          const keyArr = typeof keys === 'string' ? [keys] : keys;
          for (const k of keyArr) {
            delete storage[k];
          }
        },
        clear: async () => {
          for (const k of Object.keys(storage)) {
            delete storage[k];
          }
        },
      },
      session: {
        get: async (keys: string | string[]) => {
          const keyArr = typeof keys === 'string' ? [keys] : keys;
          const result: Record<string, unknown> = {};
          for (const k of keyArr) {
            if (k in storage) {
              result[k] = storage[k];
            }
          }
          return result;
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(storage, items);
        },
        remove: async (keys: string | string[]) => {
          const keyArr = typeof keys === 'string' ? [keys] : keys;
          for (const k of keyArr) {
            delete storage[k];
          }
        },
      },
      onChanged: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
    cookies: {
      getAll: async () => [{ name: 'session', value: 'mock-session' }],
    },
    permissions: {
      // Dev stub: pretend the optional LinkedIn host permission is always
      // granted so the side-panel permission gate (ensureLinkedInHostPermission)
      // passes in dev mode and e2e without a real Chrome prompt.
      contains: async () => true,
      request: async () => true,
    },
    sidePanel: {
      setPanelBehavior: () => {},
    },
    alarms: {
      create: async () => {},
      clearAll: async () => {},
      onAlarm: {
        addListener: () => {},
      },
    },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
      setBadgeTextColor: async () => {},
      onUserSettingsChanged: {
        addListener: () => {},
      },
    },
    notifications: {
      create: async () => {},
      clear: async () => {},
      onClicked: {
        addListener: () => {},
      },
    },
    tabs: {
      query: async () => [{ id: 1 }],
    },
  };
}

export function installChromeStubs(): void {
  ensureDevStorage();
  if (!globalThis.chrome?.runtime?.id) {
    (globalThis as Record<string, unknown>).chrome = createChromeStubs();
    console.log('[Dev] Chrome API stubs installed');
  }
}
