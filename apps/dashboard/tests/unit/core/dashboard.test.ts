import { describe, expect, it } from 'vitest';
import {
  countApplicationsByStage,
  canonicalRowsToApplications,
  buildTjmRadarSnapshot,
  filterApplications,
  favoriteMissionToApplication,
  buildApplicationStageUpdatePatch,
  generatedAssetRowsToHistory,
  getNextApplicationStages,
  getAverageApplicationScore,
  healthEventsToPlatformSyncStatuses,
  getCvSyncReadiness,
  getDashboardFeatureAccess,
  getNextFollowUp,
  getSyncBlockers,
  isDashboardPremiumActive,
  missionRowsToFeedItems,
  parseDashboardFavoriteMission,
  profileRowsToCvSnapshot,
  syncRowsToConnectedSyncStatuses,
  type ApplicationSource,
  type CvSnapshot,
  type DashboardAccountEntitlements,
  type MissionApplication,
  type PlatformSyncStatus,
} from '../../../src/lib/core/dashboard';

const sourceLabels: Record<ApplicationSource, string> = {
  linkedin: 'LinkedIn',
  'free-work': 'Free-Work',
  lehibou: 'LeHibou',
  hiway: 'Hiway',
  collective: 'Collective',
  'cherry-pick': 'Cherry Pick',
  malt: 'Malt',
  other: 'Autre',
};

const applications: MissionApplication[] = [
  {
    id: 'app-001',
    title: 'Lead Svelte',
    company: 'Atelier Nova',
    source: 'linkedin',
    stage: 'interview',
    score: 92,
    dailyRate: 720,
    location: 'Paris hybride',
    appliedAt: '2026-05-08',
    nextActionAt: '2026-05-19',
  },
  {
    id: 'app-002',
    title: 'Architecte Frontend',
    company: 'ScaleOps',
    source: 'free-work',
    stage: 'applied',
    score: 86,
    dailyRate: 680,
    location: 'Remote France',
    appliedAt: '2026-05-11',
    nextActionAt: null,
  },
  {
    id: 'app-003',
    title: 'Mission design system',
    company: 'Bluefoundry',
    source: 'malt',
    stage: 'selected',
    score: 78,
    dailyRate: 650,
    location: 'Lyon',
    appliedAt: null,
    nextActionAt: '2026-05-20',
  },
];

const cv: CvSnapshot = {
  id: 'cv-main',
  title: 'CV Consultant Frontend Senior',
  summary: 'Consultant frontend senior.',
  updatedAt: '2026-05-12T08:30:00.000Z',
  completeness: 84,
  targetRole: 'Lead Frontend Svelte / TypeScript',
  skills: ['Svelte 5', 'TypeScript'],
  experiences: [],
  education: [],
  links: [],
  imports: [],
};

const syncStatuses: PlatformSyncStatus[] = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    status: 'ready',
    lastSyncAt: '2026-05-12T09:10:00.000Z',
  },
  {
    id: 'free-work',
    name: 'Free-Work',
    status: 'needs-session',
    lastSyncAt: null,
  },
  {
    id: 'malt',
    name: 'Malt',
    status: 'needs-extension',
    lastSyncAt: null,
  },
];

describe('dashboard core', () => {
  it('counts applications by stage without mutating input', () => {
    expect(countApplicationsByStage(applications)).toEqual({
      detected: 0,
      selected: 1,
      application_prepared: 0,
      applied: 1,
      interview: 1,
      offer: 0,
      accepted: 0,
      rejected: 0,
      archived: 0,
    });
  });

  it('computes average score and handles empty lists', () => {
    expect(getAverageApplicationScore(applications)).toBe(85);
    expect(getAverageApplicationScore([])).toBe(0);
  });

  it('returns the earliest pending follow-up', () => {
    expect(getNextFollowUp(applications)?.id).toBe('app-001');
    expect(getNextFollowUp([{ ...applications[1] }])).toBeNull();
  });

  it('filters applications by source and free text', () => {
    expect(
      filterApplications(applications, { query: '', source: 'free-work' }, sourceLabels)
    ).toEqual([applications[1]]);

    expect(
      filterApplications(applications, { query: 'blue', source: 'all' }, sourceLabels)
    ).toEqual([applications[2]]);

    expect(
      filterApplications(applications, { query: 'linkedin', source: 'linkedin' }, sourceLabels)
    ).toEqual([applications[0]]);
  });

  it('derives sync readiness from CV completeness and ready platforms', () => {
    expect(getCvSyncReadiness(cv, syncStatuses)).toEqual({
      readyPlatforms: 1,
      totalPlatforms: 3,
      canSync: true,
    });

    expect(getCvSyncReadiness({ ...cv, completeness: 70 }, syncStatuses).canSync).toBe(false);
  });

  it('lists actionable sync blockers', () => {
    expect(getSyncBlockers(cv, syncStatuses)).toEqual([
      'Reconnecter la session Free-Work',
      "Activer le connecteur Malt dans l'extension",
    ]);

    expect(getSyncBlockers({ ...cv, completeness: 60 }, [syncStatuses[0]])).toEqual([
      'Compléter le CV à 80% minimum',
    ]);
  });

  it('keeps CV sync behind an authenticated account', () => {
    const anonymous: DashboardAccountEntitlements = {
      isAuthenticated: false,
      subscriptionStatus: 'free',
      subscriptionPeriodEndMs: null,
      creditBalance: 0,
    };

    const access = getDashboardFeatureAccess(anonymous, new Date('2026-05-21T00:00:00.000Z'));
    const cvSync = access.find((feature) => feature.id === 'cv-sync');
    const feed = access.find((feature) => feature.id === 'mission-feed');

    expect(feed?.enabled).toBe(true);
    expect(cvSync).toMatchObject({
      enabled: false,
      lockedReason: 'Compte requis',
    });
  });

  it('unlocks account and credit features from purchase entitlements', () => {
    const account: DashboardAccountEntitlements = {
      isAuthenticated: true,
      subscriptionStatus: 'free',
      subscriptionPeriodEndMs: null,
      creditBalance: 2,
    };

    const access = getDashboardFeatureAccess(account, new Date('2026-05-21T00:00:00.000Z'));

    expect(access.find((feature) => feature.id === 'cv-sync')?.enabled).toBe(true);
    expect(access.find((feature) => feature.id === 'generated-assets')?.enabled).toBe(true);
  });

  it('derives active premium status without reading ambient time', () => {
    const premium: DashboardAccountEntitlements = {
      isAuthenticated: true,
      subscriptionStatus: 'premium',
      subscriptionPeriodEndMs: Date.parse('2026-06-01T00:00:00.000Z'),
      creditBalance: 0,
    };

    expect(isDashboardPremiumActive(premium, new Date('2026-05-21T00:00:00.000Z'))).toBe(true);
    expect(isDashboardPremiumActive(premium, new Date('2026-06-02T00:00:00.000Z'))).toBe(false);
  });

  it('turns a synced extension favorite into a dashboard application', () => {
    const favorite = parseDashboardFavoriteMission({
      missionId: 'free-work-123',
      title: 'Mission Svelte',
      client: 'ScaleOps',
      source: 'free-work',
      url: 'https://example.com/mission',
      stack: ['Svelte', 'TypeScript'],
      tjm: 700,
      location: 'Remote',
      score: 91,
      favoritedAt: '2026-05-21T08:00:00.000Z',
    });

    expect(favorite).not.toBeNull();
    expect(favoriteMissionToApplication(favorite!)).toMatchObject({
      id: 'free-work-123',
      title: 'Mission Svelte',
      company: 'ScaleOps',
      source: 'free-work',
      stage: 'selected',
      score: 91,
      dailyRate: 700,
    });
  });

  it('maps canonical Supabase application rows to dashboard applications', () => {
    expect(
      canonicalRowsToApplications(
        [
          {
            id: 'application-1',
            mission_id: 'mission-1',
            stage: 'offer',
            applied_at: '2026-05-21T08:00:00.000Z',
            next_action_at: '2026-05-24T08:00:00.000Z',
          },
          {
            id: 'application-2',
            mission_id: 'missing-mission',
            stage: 'selected',
            applied_at: null,
            next_action_at: null,
          },
        ],
        new Map([
          [
            'mission-1',
            {
              id: 'mission-1',
              title: 'Lead Svelte',
              client: 'ScaleOps',
              source: 'free-work',
              tjm: 720,
              location: 'Remote France',
            },
          ],
        ]),
        new Map([['mission-1', { mission_id: 'mission-1', total_score: 91 }]])
      )
    ).toEqual([
      {
        id: 'application-1',
        title: 'Lead Svelte',
        company: 'ScaleOps',
        source: 'free-work',
        stage: 'offer',
        score: 91,
        dailyRate: 720,
        location: 'Remote France',
        appliedAt: '2026-05-21T08:00:00.000Z',
        nextActionAt: '2026-05-24T08:00:00.000Z',
      },
    ]);
  });

  it('maps mission rows to a score-sorted dashboard feed with freshness and duplicates', () => {
    expect(
      missionRowsToFeedItems(
        [
          {
            id: 'mission-1',
            title: 'Lead Svelte',
            client: 'ScaleOps',
            source: 'free-work',
            stack: ['Svelte', 'TypeScript'],
            tjm: 720,
            location: 'Remote France',
            scraped_at: '2026-05-22T08:00:00.000Z',
            url: 'https://example.com/1',
          },
          {
            id: 'mission-2',
            title: 'React legacy',
            client: null,
            source: 'unknown',
            stack: [],
            tjm: null,
            location: null,
            scraped_at: '2026-05-20T08:00:00.000Z',
            url: 'https://example.com/2',
          },
        ],
        new Map([
          [
            'mission-1',
            {
              mission_id: 'mission-1',
              deterministic_score: 82,
              semantic_score: 90,
              total_score: 87,
              grade: 'A',
              semantic_reason: 'Très bon match Svelte',
            },
          ],
        ]),
        new Map([['mission-1', { mission_id: 'mission-1', stage: 'selected' }]]),
        [
          {
            canonical_mission_id: 'mission-1',
            duplicate_mission_id: 'mission-duplicate',
          },
        ],
        new Date('2026-05-22T10:00:00.000Z')
      )
    ).toEqual([
      {
        id: 'mission-1',
        title: 'Lead Svelte',
        client: 'ScaleOps',
        source: 'free-work',
        stack: ['Svelte', 'TypeScript'],
        score: 87,
        deterministicScore: 82,
        semanticScore: 90,
        grade: 'A',
        semanticReason: 'Très bon match Svelte',
        dailyRate: 720,
        location: 'Remote France',
        scrapedAt: '2026-05-22T08:00:00.000Z',
        url: 'https://example.com/1',
        duplicateCount: 1,
        applicationStage: 'selected',
        freshness: 'fresh',
      },
    ]);
  });

  it('builds a TJM radar snapshot from synced mission feed items', () => {
    expect(
      buildTjmRadarSnapshot([
        {
          id: 'mission-1',
          title: 'Svelte 1',
          client: 'A',
          source: 'free-work',
          stack: ['Svelte', 'TypeScript'],
          score: 90,
          deterministicScore: 90,
          semanticScore: null,
          grade: 'A',
          semanticReason: null,
          dailyRate: 500,
          location: 'Paris',
          scrapedAt: '2026-05-18T08:00:00.000Z',
          url: 'https://example.com/1',
          duplicateCount: 0,
          applicationStage: null,
          freshness: 'stale',
        },
        {
          id: 'mission-2',
          title: 'Svelte 2',
          client: 'B',
          source: 'free-work',
          stack: ['Svelte'],
          score: 85,
          deterministicScore: 85,
          semanticScore: null,
          grade: 'B',
          semanticReason: null,
          dailyRate: 600,
          location: 'Remote',
          scrapedAt: '2026-05-19T08:00:00.000Z',
          url: 'https://example.com/2',
          duplicateCount: 0,
          applicationStage: null,
          freshness: 'stale',
        },
        {
          id: 'mission-3',
          title: 'React 1',
          client: 'C',
          source: 'lehibou',
          stack: ['React'],
          score: 80,
          deterministicScore: 80,
          semanticScore: null,
          grade: 'B',
          semanticReason: null,
          dailyRate: 700,
          location: 'Lyon',
          scrapedAt: '2026-05-21T08:00:00.000Z',
          url: 'https://example.com/3',
          duplicateCount: 0,
          applicationStage: null,
          freshness: 'fresh',
        },
        {
          id: 'mission-4',
          title: 'React 2',
          client: 'D',
          source: 'collective',
          stack: ['React', 'TypeScript'],
          score: 78,
          deterministicScore: 78,
          semanticScore: null,
          grade: 'B',
          semanticReason: null,
          dailyRate: 900,
          location: 'Remote',
          scrapedAt: '2026-05-22T08:00:00.000Z',
          url: 'https://example.com/4',
          duplicateCount: 0,
          applicationStage: null,
          freshness: 'fresh',
        },
        {
          id: 'mission-5',
          title: 'No TJM',
          client: null,
          source: 'hiway',
          stack: ['Go'],
          score: 70,
          deterministicScore: 70,
          semanticScore: null,
          grade: null,
          semanticReason: null,
          dailyRate: null,
          location: null,
          scrapedAt: '2026-05-22T09:00:00.000Z',
          url: 'https://example.com/5',
          duplicateCount: 0,
          applicationStage: null,
          freshness: 'fresh',
        },
      ])
    ).toEqual({
      missionCount: 4,
      averageDailyRate: 675,
      minDailyRate: 500,
      maxDailyRate: 900,
      trend: 'up',
      trendDelta: 250,
      topSource: 'Free-Work',
      topStack: 'React',
      sourceSegments: [
        {
          label: 'Free-Work',
          averageDailyRate: 550,
          minDailyRate: 500,
          maxDailyRate: 600,
          missionCount: 2,
        },
        {
          label: 'Collective',
          averageDailyRate: 900,
          minDailyRate: 900,
          maxDailyRate: 900,
          missionCount: 1,
        },
        {
          label: 'LeHibou',
          averageDailyRate: 700,
          minDailyRate: 700,
          maxDailyRate: 700,
          missionCount: 1,
        },
      ],
      stackSegments: [
        {
          label: 'React',
          averageDailyRate: 800,
          minDailyRate: 700,
          maxDailyRate: 900,
          missionCount: 2,
        },
        {
          label: 'TypeScript',
          averageDailyRate: 700,
          minDailyRate: 500,
          maxDailyRate: 900,
          missionCount: 2,
        },
        {
          label: 'Svelte',
          averageDailyRate: 550,
          minDailyRate: 500,
          maxDailyRate: 600,
          missionCount: 2,
        },
      ],
    });

    expect(buildTjmRadarSnapshot([])).toMatchObject({
      missionCount: 0,
      averageDailyRate: null,
      trend: 'unknown',
    });
  });

  it('maps generated application asset rows to dashboard history', () => {
    const longContent =
      'Bonjour, je peux accompagner votre équipe sur la migration Svelte avec une approche progressive, un design system stable et une attention forte portée à la qualité TypeScript.';

    expect(
      generatedAssetRowsToHistory(
        [
          {
            id: 'asset-older',
            application_id: 'app-001',
            type: 'pitch',
            content: 'Pitch court',
            model: 'gemini-nano',
            created_at: '2026-05-21T08:00:00.000Z',
          },
          {
            id: 'asset-latest',
            application_id: 'app-001',
            type: 'cover_message',
            content: longContent.repeat(2),
            model: 'gemini-nano',
            created_at: '2026-05-22T08:00:00.000Z',
          },
          {
            id: 'asset-unknown-type',
            application_id: 'app-001',
            type: 'unknown',
            content: 'ignored',
            model: 'gemini-nano',
            created_at: '2026-05-23T08:00:00.000Z',
          },
          {
            id: 'asset-missing-application',
            application_id: 'missing',
            type: 'pitch',
            content: 'ignored',
            model: 'gemini-nano',
            created_at: '2026-05-24T08:00:00.000Z',
          },
        ],
        new Map(applications.map((application) => [application.id, application]))
      )
    ).toEqual([
      {
        id: 'asset-latest',
        applicationId: 'app-001',
        applicationTitle: 'Lead Svelte',
        company: 'Atelier Nova',
        type: 'cover_message',
        label: 'Message recruteur',
        content: longContent.repeat(2),
        preview: `${longContent.repeat(2).slice(0, 177).trimEnd()}...`,
        model: 'gemini-nano',
        createdAt: '2026-05-22T08:00:00.000Z',
      },
      {
        id: 'asset-older',
        applicationId: 'app-001',
        applicationTitle: 'Lead Svelte',
        company: 'Atelier Nova',
        type: 'pitch',
        label: 'Pitch',
        content: 'Pitch court',
        preview: 'Pitch court',
        model: 'gemini-nano',
        createdAt: '2026-05-21T08:00:00.000Z',
      },
    ]);
  });

  it('maps canonical profile rows to a dashboard CV snapshot', () => {
    expect(
      profileRowsToCvSnapshot(
        {
          id: 'profile-1',
          title: 'Consultant Frontend',
          summary: 'Consultant frontend senior.',
          updated_at: '2026-05-21T08:00:00.000Z',
          completeness: 82,
          target_role: 'Lead Svelte',
        },
        [{ skill: 'Svelte' }, { skill: 'TypeScript' }],
        [
          {
            title: 'Lead Frontend',
            company: 'ScaleOps',
            location: 'Paris',
            start_date: '2021-01-01',
            end_date: null,
            is_current: true,
            description: 'Migration Svelte',
            skills: ['Svelte'],
            source: 'linkedin',
            position_index: 0,
          },
        ],
        [
          {
            school: 'Université Paris Cité',
            degree: 'Master',
            field: 'Informatique',
            start_date: '2014-01-01',
            end_date: '2016-01-01',
            source: 'linkedin',
            position_index: 0,
          },
        ],
        [{ label: 'Portfolio', url: 'https://example.com', source: 'linkedin' }],
        [
          {
            id: 'import-1',
            source: 'linkedin',
            status: 'success',
            imported_at: '2026-05-22T08:00:00.000Z',
            extractor_version: 'linkedin-v1',
            error_code: null,
            error_message: null,
            field_counts: { experiences: 1, skills: 2 },
          },
        ]
      )
    ).toEqual({
      id: 'profile-1',
      title: 'Consultant Frontend',
      summary: 'Consultant frontend senior.',
      updatedAt: '2026-05-21T08:00:00.000Z',
      completeness: 82,
      targetRole: 'Lead Svelte',
      skills: ['Svelte', 'TypeScript'],
      experiences: [
        {
          title: 'Lead Frontend',
          company: 'ScaleOps',
          location: 'Paris',
          dateRange: '2021-01 - Présent',
          description: 'Migration Svelte',
          skills: ['Svelte'],
          source: 'linkedin',
        },
      ],
      education: [
        {
          school: 'Université Paris Cité',
          degree: 'Master',
          field: 'Informatique',
          dateRange: '2014-01 - 2016-01',
          source: 'linkedin',
        },
      ],
      links: [{ label: 'Portfolio', url: 'https://example.com', source: 'linkedin' }],
      imports: [
        {
          id: 'import-1',
          source: 'linkedin',
          status: 'success',
          importedAt: '2026-05-22T08:00:00.000Z',
          extractorVersion: 'linkedin-v1',
          errorCode: null,
          errorMessage: null,
          fieldCounts: { experiences: 1, skills: 2 },
        },
      ],
    });
  });

  it('maps connector health events to platform sync statuses', () => {
    expect(
      healthEventsToPlatformSyncStatuses([
        {
          source: 'free-work',
          status: 'ready',
          occurred_at: '2026-05-21T08:00:00.000Z',
        },
        {
          source: 'linkedin',
          status: 'blocked',
          occurred_at: '2026-05-21T09:00:00.000Z',
        },
        {
          source: 'unknown-source',
          status: 'ready',
          occurred_at: '2026-05-21T10:00:00.000Z',
        },
      ])
    ).toEqual([
      {
        id: 'free-work',
        name: 'Free-Work',
        status: 'ready',
        lastSyncAt: '2026-05-21T08:00:00.000Z',
      },
      {
        id: 'linkedin',
        name: 'LinkedIn',
        status: 'needs-session',
        lastSyncAt: '2026-05-21T09:00:00.000Z',
      },
    ]);
  });

  it('maps sync rows to dashboard connected sync statuses ordered by actionability', () => {
    expect(
      syncRowsToConnectedSyncStatuses(
        [
          {
            device_id: 'device-1',
            entity: 'missions',
            last_pull_at: '2026-05-22T07:00:00.000Z',
            last_push_at: '2026-05-22T08:00:00.000Z',
            pending_upload_count: 0,
            pending_download_count: 0,
            last_error_code: null,
            last_error_message: null,
            updated_at: '2026-05-22T08:00:00.000Z',
          },
          {
            device_id: 'device-1',
            entity: 'applications',
            last_pull_at: '2026-05-22T07:00:00.000Z',
            last_push_at: null,
            pending_upload_count: 2,
            pending_download_count: 1,
            last_error_code: null,
            last_error_message: null,
            updated_at: '2026-05-22T09:00:00.000Z',
          },
          {
            device_id: 'device-2',
            entity: 'candidate_profile',
            last_pull_at: null,
            last_push_at: null,
            pending_upload_count: 0,
            pending_download_count: 0,
            last_error_code: 'sync_failed',
            last_error_message: 'Supabase indisponible',
            updated_at: '2026-05-22T06:00:00.000Z',
          },
          {
            device_id: 'device-1',
            entity: 'unknown',
            last_pull_at: null,
            last_push_at: null,
            pending_upload_count: 0,
            pending_download_count: 0,
            last_error_code: null,
            last_error_message: null,
            updated_at: '2026-05-22T10:00:00.000Z',
          },
        ],
        new Map([
          [
            'device-1',
            {
              id: 'device-1',
              install_id: 'install-1',
              browser: 'Chrome',
              extension_version: '0.4.0',
              last_seen_at: '2026-05-22T08:30:00.000Z',
            },
          ],
        ])
      )
    ).toEqual([
      {
        deviceId: 'device-2',
        deviceLabel: 'Extension device-2',
        entity: 'candidate_profile',
        label: 'Profil CV',
        state: 'error',
        lastPullAt: null,
        lastPushAt: null,
        pendingUploadCount: 0,
        pendingDownloadCount: 0,
        lastErrorCode: 'sync_failed',
        lastErrorMessage: 'Supabase indisponible',
        updatedAt: '2026-05-22T06:00:00.000Z',
      },
      {
        deviceId: 'device-1',
        deviceLabel: 'Chrome 0.4.0',
        entity: 'applications',
        label: 'Candidatures',
        state: 'pending',
        lastPullAt: '2026-05-22T07:00:00.000Z',
        lastPushAt: null,
        pendingUploadCount: 2,
        pendingDownloadCount: 1,
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: '2026-05-22T09:00:00.000Z',
      },
      {
        deviceId: 'device-1',
        deviceLabel: 'Chrome 0.4.0',
        entity: 'missions',
        label: 'Missions',
        state: 'healthy',
        lastPullAt: '2026-05-22T07:00:00.000Z',
        lastPushAt: '2026-05-22T08:00:00.000Z',
        pendingUploadCount: 0,
        pendingDownloadCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: '2026-05-22T08:00:00.000Z',
      },
    ]);
  });

  it('lists canonical next stages for dashboard actions', () => {
    expect(getNextApplicationStages('detected')).toEqual(['selected', 'archived']);
    expect(getNextApplicationStages('offer')).toEqual(['accepted', 'rejected', 'archived']);
  });

  it('builds application stage update patches without ambient time', () => {
    expect(buildApplicationStageUpdatePatch('applied', '2026-05-21T08:00:00.000Z')).toEqual({
      stage: 'applied',
      applied_at: '2026-05-21T08:00:00.000Z',
      archived_at: null,
      updated_by: 'dashboard',
    });

    expect(buildApplicationStageUpdatePatch('archived', '2026-05-22T08:00:00.000Z')).toEqual({
      stage: 'archived',
      applied_at: undefined,
      archived_at: '2026-05-22T08:00:00.000Z',
      updated_by: 'dashboard',
    });
  });
});
