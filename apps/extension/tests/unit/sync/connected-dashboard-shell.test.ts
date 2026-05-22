import { describe, expect, it, vi } from 'vitest';
import {
  pushApplicationsToConnectedDashboard,
  pushConnectorHealthToConnectedDashboard,
  pushCandidateProfileImportToConnectedDashboard,
  pullApplicationsFromConnectedDashboard,
  pushMissionsToConnectedDashboard,
  registerExtensionDevice,
  type ConnectedDashboardSyncGateway,
} from '../../../src/lib/shell/sync/connected-dashboard';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';
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
    insertConnectorHealthEvents: vi.fn(async () => undefined),
    upsertCandidateProfile: vi.fn(async () => ({ id: 'profile-1', revision: 3 })),
    replaceCandidateProfileChildren: vi.fn(async () => undefined),
    insertProfileImport: vi.fn(async () => undefined),
    upsertSyncStatus: vi.fn(async () => undefined),
  };
}

describe('connected dashboard shell sync', () => {
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
      },
    });
    expect(gateway.upsertCandidateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        title: 'Lead Frontend Svelte',
        completeness: 86,
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
});
