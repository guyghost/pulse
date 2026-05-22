import { describe, expect, it, vi } from 'vitest';

const supabaseClientMock = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('../../../src/lib/shell/auth/supabase-client', () => ({
  getSupabaseClient: supabaseClientMock.getSupabaseClient,
}));

import {
  getConnectedDashboardSyncStatus,
  pushApplicationsToConnectedDashboard,
  pushConnectorHealthToConnectedDashboard,
  pushCandidateProfileImportToConnectedDashboard,
  pullAlertPreferencesFromConnectedDashboard,
  pullApplicationsFromConnectedDashboard,
  pushMissionsToConnectedDashboard,
  registerExtensionDevice,
  type ConnectedDashboardSyncGateway,
} from '../../../src/lib/shell/sync/connected-dashboard';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';
import type { GeneratedAsset } from '../../../src/lib/core/types/generation';
import type { ConnectorHealthSnapshot } from '../../../src/lib/core/types/health';
import type { CanonicalCandidateProfileDraft } from '../../../src/lib/core/profile-extractors/types';

const mission: Mission = {
  id: 'free-work-123',
  title: 'Lead Svelte',
  client: 'ScaleOps',
  description: 'Mission Svelte',
  stack: ['Svelte'],
  tjm: 700,
  location: 'Remote',
  remote: 'full',
  duration: '6 mois',
  startDate: null,
  publishedAt: null,
  url: 'https://example.com',
  source: 'free-work',
  scrapedAt: new Date('2026-05-21T08:00:00.000Z'),
  seniority: 'senior',
  scoreBreakdown: null,
  score: 84,
  semanticScore: null,
  semanticReason: null,
};

const tracking: MissionTracking = {
  missionId: 'free-work-123',
  currentStatus: 'selected',
  history: [
    { from: null, to: 'detected', timestamp: 1779340800000, note: null },
    { from: 'detected', to: 'selected', timestamp: 1779344400000, note: 'Go' },
  ],
  generatedAssetIds: [],
  userRating: null,
  notes: 'Bon fit',
};

const generatedAsset: GeneratedAsset = {
  id: 'asset-1',
  missionId: 'free-work-123',
  type: 'cover-message',
  content: 'Message de candidature',
  createdAt: 1779364800000,
  modelUsed: 'gemini-nano',
};

const linkedinDraft: CanonicalCandidateProfileDraft = {
  title: 'Lead Frontend Svelte',
  summary: 'Consultant frontend senior.',
  source: 'linkedin',
  confidence: 0.86,
  capturedAt: '2026-05-22T08:00:00.000Z',
  profileUrl: 'https://www.linkedin.com/in/example/',
  experiences: [
    {
      title: 'Lead Frontend',
      company: 'ScaleOps',
      location: 'Paris',
      startDate: '2021-01-01',
      endDate: null,
      isCurrent: true,
      description: 'Migration Svelte 5',
      skills: ['Svelte', 'TypeScript'],
      source: 'linkedin',
      sourceExternalId: 'experience-1',
      positionIndex: 0,
    },
  ],
  education: [],
  skills: [
    { skill: 'Svelte', source: 'linkedin', confidence: 0.8 },
    { skill: 'TypeScript', source: 'linkedin', confidence: 0.8 },
  ],
  links: [{ label: 'Portfolio', url: 'https://example.com', source: 'linkedin' }],
};

function createGateway(): ConnectedDashboardSyncGateway {
  return {
    upsertExtensionDevice: vi.fn(async () => ({ id: 'device-1' })),
    upsertMissions: vi.fn(async () => [
      {
        id: 'remote-mission-1',
        source: 'free-work',
        external_id: 'free-work-123',
      },
    ]),
    upsertMissionScores: vi.fn(async () => undefined),
    upsertMissionDuplicates: vi.fn(async () => undefined),
    upsertApplications: vi.fn(async () => [
      {
        id: 'application-1',
        mission_id: 'remote-mission-1',
      },
    ]),
    listApplicationsUpdatedSince: vi.fn(async () => [
      {
        id: 'application-1',
        mission_id: 'remote-mission-1',
        stage: 'offer',
        user_rating: 5,
        notes: 'Offre reçue',
        revision: 5,
        updated_at: '2026-05-21T11:00:00.000Z',
      },
    ]),
    upsertApplicationPipelineEvents: vi.fn(async () => undefined),
    upsertGeneratedApplicationAssets: vi.fn(async () => undefined),
    insertConnectorHealthEvents: vi.fn(async () => undefined),
    getCandidateProfile: vi.fn(async () => null),
    upsertCandidateProfile: vi.fn(async () => ({ id: 'profile-1', revision: 3 })),
    replaceCandidateProfileChildren: vi.fn(async () => undefined),
    insertCandidateProfileFieldSuggestions: vi.fn(async () => undefined),
    insertSyncConflicts: vi.fn(async () => undefined),
    insertProfileImport: vi.fn(async () => undefined),
    upsertSyncStatus: vi.fn(async () => undefined),
    getDashboardAlertPreferences: vi.fn(async () => ({
      enabled: true,
      scoreThreshold: 85,
      minDailyRate: 700,
      requiredStacks: ['Svelte'],
      maxResults: 3,
      updatedAt: '2026-05-22T08:00:00.000Z',
    })),
  };
}

interface MockSupabaseReadQuery {
  eq(column: string, value: unknown): MockSupabaseReadQuery;
  gt(column: string, value: unknown): MockSupabaseReadQuery;
  order(
    column: string,
    options?: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

function createReadQuery(data: unknown): MockSupabaseReadQuery {
  const query: MockSupabaseReadQuery = {
    eq: vi.fn(() => query),
    gt: vi.fn(() => query),
    order: vi.fn(async () => ({ data, error: null })),
  };

  return query;
}

describe('connected dashboard shell sync', () => {
  it('pulls dashboard alert preferences into extension local storage', async () => {
    const storageSet = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          set: storageSet,
        },
      },
    });
    const gateway = createGateway();

    const result = await pullAlertPreferencesFromConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      now: new Date('2026-05-22T08:05:00.000Z'),
    });

    expect(result).toEqual({
      ok: true,
      value: {
        pulled: true,
        preferences: {
          enabled: true,
          scoreThreshold: 85,
          minDailyRate: 700,
          requiredStacks: ['Svelte'],
          maxResults: 3,
          updatedAt: '2026-05-22T08:00:00.000Z',
        },
      },
    });
    expect(storageSet).toHaveBeenCalledWith({
      'missionpulse.connectedAlertPreferences': {
        enabled: true,
        scoreThreshold: 85,
        minDailyRate: 700,
        requiredStacks: ['Svelte'],
        maxResults: 3,
        updatedAt: '2026-05-22T08:00:00.000Z',
      },
    });
    expect(gateway.upsertSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'alert_preferences',
        last_pull_at: '2026-05-22T08:05:00.000Z',
      })
    );
  });

  it('reads per-entity sync status for the current extension device', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({
            'missionpulse.connectedSync.installId': 'install-1',
            lastGlobalSync: 1779340800000,
          })),
        },
      },
    });

    const deviceQuery = createReadQuery([{ id: 'device-1' }]);
    const statusQuery = createReadQuery([
      {
        entity: 'missions',
        last_pull_at: null,
        last_push_at: '2026-05-22T08:00:00.000Z',
        pending_upload_count: 0,
        pending_download_count: 0,
        last_error_code: null,
        last_error_message: null,
        retry_after_at: null,
        updated_at: '2026-05-22T08:00:00.000Z',
      },
      {
        entity: 'applications',
        last_pull_at: '2026-05-22T07:00:00.000Z',
        last_push_at: null,
        pending_upload_count: 2,
        pending_download_count: 1,
        last_error_code: 'remote-error',
        last_error_message: 'Supabase indisponible',
        retry_after_at: '2026-05-22T08:05:00.000Z',
        updated_at: '2026-05-22T08:01:00.000Z',
      },
      {
        entity: 'unknown',
        last_pull_at: null,
        last_push_at: null,
        pending_upload_count: 0,
        pending_download_count: 0,
        last_error_code: null,
        last_error_message: null,
        retry_after_at: null,
        updated_at: '2026-05-22T08:02:00.000Z',
      },
    ]);

    supabaseClientMock.getSupabaseClient.mockReturnValueOnce({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: 'user-1' } } },
        })),
      },
      from: vi.fn((table: string) => ({
        select: vi.fn(() => (table === 'extension_devices' ? deviceQuery : statusQuery)),
      })),
    });

    await expect(getConnectedDashboardSyncStatus()).resolves.toEqual({
      authenticated: true,
      installId: 'install-1',
      lastGlobalSync: 1779340800000,
      entities: [
        {
          entity: 'applications',
          label: 'Candidatures',
          state: 'error',
          lastPullAt: '2026-05-22T07:00:00.000Z',
          lastPushAt: null,
          pendingUploadCount: 2,
          pendingDownloadCount: 1,
          lastErrorCode: 'remote-error',
          lastErrorMessage: 'Supabase indisponible',
          retryAfterAt: '2026-05-22T08:05:00.000Z',
          updatedAt: '2026-05-22T08:01:00.000Z',
        },
        {
          entity: 'missions',
          label: 'Missions',
          state: 'healthy',
          lastPullAt: null,
          lastPushAt: '2026-05-22T08:00:00.000Z',
          pendingUploadCount: 0,
          pendingDownloadCount: 0,
          lastErrorCode: null,
          lastErrorMessage: null,
          retryAfterAt: null,
          updatedAt: '2026-05-22T08:00:00.000Z',
        },
      ],
    });
  });

  it('registers an extension device with last_seen_at', async () => {
    const gateway = createGateway();

    const result = await registerExtensionDevice(gateway, {
      userId: 'user-1',
      installId: 'install-1',
      browser: 'Chrome',
      extensionVersion: '0.2.1',
      now: new Date('2026-05-21T09:00:00.000Z'),
    });

    expect(result).toEqual({ ok: true, value: { id: 'device-1' } });
    expect(gateway.upsertExtensionDevice).toHaveBeenCalledWith({
      user_id: 'user-1',
      install_id: 'install-1',
      browser: 'Chrome',
      extension_version: '0.2.1',
      last_seen_at: '2026-05-21T09:00:00.000Z',
    });
  });

  it('pushes scan missions, score rows, and successful sync status', async () => {
    const gateway = createGateway();

    const result = await pushMissionsToConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      missions: [mission],
      now: new Date('2026-05-21T09:00:00.000Z'),
      scorerVersion: 'missionpulse-v1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.remoteMissionIds.get('free-work-123')).toBe('remote-mission-1');
      expect(result.value.pushedCount).toBe(1);
    }
    expect(gateway.upsertMissions).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: 'user-1',
        source: 'free-work',
        external_id: 'free-work-123',
      }),
    ]);
    expect(gateway.upsertMissionScores).toHaveBeenCalledWith([
      expect.objectContaining({
        mission_id: 'remote-mission-1',
        deterministic_score: 84,
        total_score: 84,
      }),
    ]);
    expect(gateway.upsertSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'missions',
        last_push_at: '2026-05-21T09:00:00.000Z',
        pending_upload_count: 0,
        last_error_code: null,
      })
    );
  });

  it('pushes duplicate source missions and mission duplicate relations', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.upsertMissions).mockResolvedValueOnce([
      {
        id: 'remote-canonical',
        source: 'free-work',
        external_id: 'free-work-123',
      },
      {
        id: 'remote-duplicate',
        source: 'lehibou',
        external_id: 'lehibou-456',
      },
    ]);
    const duplicateMission: Mission = {
      ...mission,
      id: 'lehibou-456',
      source: 'lehibou',
      url: 'https://lehibou.example/mission',
    };

    const result = await pushMissionsToConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      missions: [mission],
      sourceMissions: [mission, duplicateMission],
      duplicateRelations: [
        {
          canonicalMissionId: 'free-work-123',
          duplicateMissionId: 'lehibou-456',
          confidence: 0.92,
          reason: 'same_structured_signature',
        },
      ],
      now: new Date('2026-05-21T09:00:00.000Z'),
      scorerVersion: 'missionpulse-v1',
    });

    expect(result.ok).toBe(true);
    expect(gateway.upsertMissions).toHaveBeenCalledWith([
      expect.objectContaining({ external_id: 'free-work-123', source: 'free-work' }),
      expect.objectContaining({ external_id: 'lehibou-456', source: 'lehibou' }),
    ]);
    expect(gateway.upsertMissionScores).toHaveBeenCalledWith([
      expect.objectContaining({ mission_id: 'remote-canonical' }),
    ]);
    expect(gateway.upsertMissionDuplicates).toHaveBeenCalledWith([
      {
        user_id: 'user-1',
        canonical_mission_id: 'remote-canonical',
        duplicate_mission_id: 'remote-duplicate',
        confidence: 0.92,
        reason: 'same_structured_signature',
      },
    ]);
  });

  it('records retryable sync status when mission push fails', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.upsertMissions).mockRejectedValueOnce(new Error('Supabase unavailable'));

    const result = await pushMissionsToConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      missions: [mission],
      now: new Date('2026-05-21T09:00:00.000Z'),
      scorerVersion: 'missionpulse-v1',
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'remote-error',
        message: 'Supabase unavailable',
        retryable: true,
      },
    });
    expect(gateway.upsertSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'missions',
        pending_upload_count: 1,
        last_error_code: 'remote-error',
        last_error_message: 'Supabase unavailable',
        retry_after_at: '2026-05-21T09:05:00.000Z',
      })
    );
  });

  it('pushes application state and idempotent pipeline events', async () => {
    const gateway = createGateway();

    const result = await pushApplicationsToConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      installId: 'install-1',
      trackings: [tracking],
      remoteMissionIds: new Map([['free-work-123', 'remote-mission-1']]),
      now: new Date('2026-05-21T09:00:00.000Z'),
    });

    expect(result).toEqual({ ok: true, value: { pushedCount: 1, skippedCount: 0 } });
    expect(gateway.upsertApplications).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: 'user-1',
        mission_id: 'remote-mission-1',
        stage: 'selected',
        revision: 2,
      }),
    ]);
    expect(gateway.upsertApplicationPipelineEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        application_id: 'application-1',
        to_stage: 'detected',
        client_event_id: 'install-1:free-work-123:1779340800000:none:detected',
      }),
      expect.objectContaining({
        application_id: 'application-1',
        to_stage: 'selected',
        client_event_id: 'install-1:free-work-123:1779344400000:detected:selected',
      }),
    ]);
  });

  it('pushes generated application assets with idempotent client ids', async () => {
    const gateway = createGateway();

    const result = await pushApplicationsToConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      installId: 'install-1',
      trackings: [{ ...tracking, generatedAssetIds: ['asset-1'] }],
      remoteMissionIds: new Map([['free-work-123', 'remote-mission-1']]),
      generatedAssetsByMissionId: new Map([['free-work-123', [generatedAsset]]]),
      now: new Date('2026-05-21T09:00:00.000Z'),
    });

    expect(result).toEqual({ ok: true, value: { pushedCount: 1, skippedCount: 0 } });
    expect(gateway.upsertGeneratedApplicationAssets).toHaveBeenCalledWith([
      {
        user_id: 'user-1',
        application_id: 'application-1',
        client_asset_id: 'asset-1',
        type: 'cover_message',
        content: 'Message de candidature',
        model: 'gemini-nano',
        created_at: '2026-05-21T12:00:00.000Z',
      },
    ]);
  });

  it('skips application trackings whose mission has not been synced yet', async () => {
    const gateway = createGateway();

    const result = await pushApplicationsToConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      installId: 'install-1',
      trackings: [tracking],
      remoteMissionIds: new Map(),
      now: new Date('2026-05-21T09:00:00.000Z'),
    });

    expect(result).toEqual({ ok: true, value: { pushedCount: 0, skippedCount: 1 } });
    expect(gateway.upsertApplications).not.toHaveBeenCalled();
    expect(gateway.upsertSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'applications',
        pending_upload_count: 1,
      })
    );
  });

  it('pushes connector health events and sync status', async () => {
    const gateway = createGateway();
    const snapshot: ConnectorHealthSnapshot = {
      connectorId: 'free-work',
      circuitState: 'closed',
      consecutiveFailures: 0,
      totalFailures: 1,
      totalSuccesses: 3,
      lastSuccessAt: 1779340800000,
      lastFailureAt: 1779330000000,
      lastStateChangeAt: 1779340800000,
      recentLatenciesMs: [120],
    };

    const result = await pushConnectorHealthToConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      snapshots: [snapshot],
      now: new Date('2026-05-21T09:00:00.000Z'),
    });

    expect(result).toEqual({ ok: true, value: { pushedCount: 1 } });
    expect(gateway.insertConnectorHealthEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: 'user-1',
        device_id: 'device-1',
        source: 'free-work',
        status: 'ready',
      }),
    ]);
    expect(gateway.upsertSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'connector_health',
        pending_upload_count: 0,
      })
    );
  });

  it('pushes a LinkedIn profile import to canonical CV tables', async () => {
    const gateway = createGateway();

    const result = await pushCandidateProfileImportToConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      draft: linkedinDraft,
      now: new Date('2026-05-22T08:05:00.000Z'),
      extractorVersion: 'linkedin-v1',
      rawHash: 'sha256:abc123',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        profileId: 'profile-1',
        experiences: 1,
        education: 0,
        skills: 2,
        links: 1,
        suggestions: 0,
      },
    });
    expect(gateway.upsertCandidateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        title: 'Lead Frontend Svelte',
        completeness: 86,
        updated_by: 'extension',
      })
    );
    expect(gateway.replaceCandidateProfileChildren).toHaveBeenCalledWith({
      profileId: 'profile-1',
      experiences: [
        expect.objectContaining({
          profile_id: 'profile-1',
          title: 'Lead Frontend',
          source: 'linkedin',
        }),
      ],
      education: [],
      skills: [
        { profile_id: 'profile-1', skill: 'Svelte', source: 'linkedin', confidence: 0.8 },
        { profile_id: 'profile-1', skill: 'TypeScript', source: 'linkedin', confidence: 0.8 },
      ],
      links: [
        {
          profile_id: 'profile-1',
          label: 'Portfolio',
          url: 'https://example.com',
          source: 'linkedin',
        },
      ],
    });
    expect(gateway.insertProfileImport).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        source: 'linkedin',
        status: 'success',
        raw_hash: 'sha256:abc123',
      })
    );
    expect(gateway.upsertSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'candidate_profile',
        last_push_at: '2026-05-22T08:05:00.000Z',
        pending_upload_count: 0,
      })
    );
  });

  it('creates field suggestions when a LinkedIn import conflicts with dashboard CV edits', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.getCandidateProfile).mockResolvedValueOnce({
      id: 'profile-1',
      title: 'Profil dashboard',
      summary: 'Résumé manuel',
      target_role: 'Architecte frontend',
      revision: 8,
      updated_at: '2026-05-22T08:00:00.000Z',
      updated_by: 'dashboard',
    });

    const result = await pushCandidateProfileImportToConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      draft: linkedinDraft,
      now: new Date('2026-05-22T08:05:00.000Z'),
      extractorVersion: 'linkedin-v1',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        profileId: 'profile-1',
        experiences: 1,
        education: 0,
        skills: 2,
        links: 1,
        suggestions: 3,
      },
    });
    expect(gateway.upsertCandidateProfile).not.toHaveBeenCalled();
    expect(gateway.insertCandidateProfileFieldSuggestions).toHaveBeenCalledWith([
      expect.objectContaining({
        profile_id: 'profile-1',
        field: 'title',
        current_value: 'Profil dashboard',
        suggested_value: 'Lead Frontend Svelte',
      }),
      expect.objectContaining({
        profile_id: 'profile-1',
        field: 'summary',
        current_value: 'Résumé manuel',
        suggested_value: 'Consultant frontend senior.',
      }),
      expect.objectContaining({
        profile_id: 'profile-1',
        field: 'target_role',
        current_value: 'Architecte frontend',
        suggested_value: 'Lead Frontend Svelte',
      }),
    ]);
    expect(gateway.insertSyncConflicts).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: 'user-1',
        device_id: 'device-1',
        entity: 'candidate_profile',
        entity_id: 'profile-1',
        field: 'title',
        remote_value: 'Profil dashboard',
        local_value: 'Lead Frontend Svelte',
        remote_updated_by: 'dashboard',
        local_updated_by: 'extension',
        status: 'pending',
        detected_at: '2026-05-22T08:05:00.000Z',
      }),
      expect.objectContaining({ field: 'summary' }),
      expect.objectContaining({ field: 'target_role' }),
    ]);
  });

  it('records retryable sync status when profile import persistence fails', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.replaceCandidateProfileChildren).mockRejectedValueOnce(
      new Error('profile write failed')
    );

    const result = await pushCandidateProfileImportToConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      draft: linkedinDraft,
      now: new Date('2026-05-22T08:05:00.000Z'),
      extractorVersion: 'linkedin-v1',
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'profile-sync-failed',
        message: 'profile write failed',
        retryable: true,
      },
    });
    expect(gateway.upsertSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'candidate_profile',
        pending_upload_count: 1,
        last_error_code: 'profile-sync-failed',
        last_error_message: 'profile write failed',
        retry_after_at: '2026-05-22T08:10:00.000Z',
      })
    );
  });

  it('pulls remote dashboard applications into local tracking records', async () => {
    const gateway = createGateway();

    const result = await pullApplicationsFromConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      localMissionIdsByRemoteId: new Map([['remote-mission-1', 'free-work-123']]),
      existingTrackings: new Map([['free-work-123', tracking]]),
      since: new Date('2026-05-21T09:00:00.000Z'),
      now: new Date('2026-05-21T12:00:00.000Z'),
    });

    expect(result).toEqual({
      ok: true,
      value: {
        pulledCount: 1,
        skippedCount: 0,
        nextCursor: '2026-05-21T11:00:00.000Z',
        trackings: [
          {
            ...tracking,
            currentStatus: 'offer',
            history: [
              ...tracking.history,
              {
                from: 'selected',
                to: 'offer',
                timestamp: 1779364800000,
                note: 'Sync dashboard revision 5',
              },
            ],
            userRating: 5,
            notes: 'Offre reçue',
          },
        ],
      },
    });
    expect(gateway.listApplicationsUpdatedSince).toHaveBeenCalledWith({
      userId: 'user-1',
      since: '2026-05-21T09:00:00.000Z',
    });
    expect(gateway.upsertSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'applications',
        last_pull_at: '2026-05-21T12:00:00.000Z',
        pending_download_count: 0,
      })
    );
  });

  it('records pending downloads when pulled applications do not map to local missions', async () => {
    const gateway = createGateway();

    const result = await pullApplicationsFromConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      localMissionIdsByRemoteId: new Map(),
      existingTrackings: new Map(),
      since: null,
      now: new Date('2026-05-21T12:00:00.000Z'),
    });

    expect(result).toEqual({
      ok: true,
      value: {
        pulledCount: 0,
        skippedCount: 1,
        trackings: [],
        nextCursor: null,
      },
    });
    expect(gateway.upsertSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'applications',
        pending_download_count: 1,
      })
    );
  });

  it('covers scan push followed by dashboard application pull in one connected flow', async () => {
    const gateway = createGateway();
    const now = new Date('2026-05-21T09:00:00.000Z');

    const pushedMissions = await pushMissionsToConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      missions: [mission],
      now,
      scorerVersion: 'missionpulse-v1',
    });

    expect(pushedMissions.ok).toBe(true);
    if (!pushedMissions.ok) {
      return;
    }

    const pushedApplications = await pushApplicationsToConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      installId: 'install-1',
      trackings: [tracking],
      remoteMissionIds: pushedMissions.value.remoteMissionIds,
      now,
    });

    expect(pushedApplications).toEqual({
      ok: true,
      value: { pushedCount: 1, skippedCount: 0 },
    });

    const remoteMissionId = pushedMissions.value.remoteMissionIds.get(mission.id);
    expect(remoteMissionId).toBe('remote-mission-1');

    const pulledApplications = await pullApplicationsFromConnectedDashboard(gateway, {
      userId: 'user-1',
      deviceId: 'device-1',
      localMissionIdsByRemoteId: new Map([[remoteMissionId ?? '', mission.id]]),
      existingTrackings: new Map([[tracking.missionId, tracking]]),
      since: null,
      now: new Date('2026-05-21T12:00:00.000Z'),
    });

    expect(pulledApplications).toEqual({
      ok: true,
      value: {
        pulledCount: 1,
        skippedCount: 0,
        nextCursor: '2026-05-21T11:00:00.000Z',
        trackings: [
          {
            ...tracking,
            currentStatus: 'offer',
            history: [
              ...tracking.history,
              {
                from: 'selected',
                to: 'offer',
                timestamp: 1779364800000,
                note: 'Sync dashboard revision 5',
              },
            ],
            userRating: 5,
            notes: 'Offre reçue',
          },
        ],
      },
    });
    expect(gateway.upsertMissions).toHaveBeenCalledWith([
      expect.objectContaining({ external_id: 'free-work-123' }),
    ]);
    expect(gateway.upsertApplications).toHaveBeenCalledWith([
      expect.objectContaining({ mission_id: 'remote-mission-1', stage: 'selected' }),
    ]);
    expect(gateway.upsertApplicationPipelineEvents).toHaveBeenCalledWith([
      expect.objectContaining({ to_stage: 'detected' }),
      expect.objectContaining({ to_stage: 'selected' }),
    ]);
    expect(gateway.listApplicationsUpdatedSince).toHaveBeenCalledWith({
      userId: 'user-1',
      since: null,
    });
  });
});
