import { describe, expect, it } from 'vitest';
import {
  buildMissionScoreUpsertRow,
  buildMissionUpsertRow,
} from '../../../../extension/src/lib/core/sync/connected-dashboard';
import type { Mission } from '../../../../extension/src/lib/core/types/mission';
import {
  buildDashboardAlertPreferencesPatch,
  buildMissionComparisonSnapshot,
  countApplicationsByStage,
  canonicalRowsToApplications,
  dashboardAlertPreferencesRowToSnapshot,
  buildApplicationDetailsUpdatePatch,
  buildDashboardPipelineClientEventId,
  buildApplicationSyncConflictResolution,
  buildCvProfileUpdatePatch,
  buildConnectedDataDeletionRequest,
  buildCvFieldSuggestionResolution,
  buildEmptyCvSnapshot,
  buildMissionArchiveInsertPatch,
  buildTjmRadarSnapshot,
  filterApplications,
  filterMissionFeedItems,
  favoriteMissionToApplication,
  buildApplicationStageUpdatePatch,
  buildMissionSelectionInsertPatch,
  buildSyncConflictResolutionPatch,
  generatedAssetRowsToHistory,
  getNextApplicationStages,
  getAverageApplicationScore,
  healthEventsToPlatformSyncStatuses,
  getCvSyncReadiness,
  getDashboardFeatureAccess,
  getNextFollowUp,
  getReadyCvSyncPlatforms,
  getSyncBlockers,
  isDashboardPremiumActive,
  mergeApplicationCompatibilityFallbacks,
  missionRowsToFeedItems,
  pipelineEventRowsToTimeline,
  parseDashboardFavoriteMission,
  profileRowsToCvSnapshot,
  syncConflictRowsToDashboardConflicts,
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

const scoreCriteria = {
  stack: 80,
  tjm: 100,
  location: 60,
  remote: 100,
  seniorityBonus: 5,
  startDateBonus: 3,
};

const emptyScoreCriteria = {
  stack: null,
  tjm: null,
  location: null,
  remote: null,
  seniorityBonus: null,
  startDateBonus: null,
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
    sourceUrl: 'https://example.com/app-001',
    appliedAt: '2026-05-08',
    nextActionAt: '2026-05-19',
    notes: 'Relancer le recruteur.',
    userRating: 5,
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
    sourceUrl: 'https://example.com/app-002',
    appliedAt: '2026-05-11',
    nextActionAt: null,
    notes: '',
    userRating: null,
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
    sourceUrl: 'https://example.com/app-003',
    appliedAt: null,
    nextActionAt: '2026-05-20',
    notes: 'À comparer avec une mission remote.',
    userRating: 4,
  },
];

const cv: CvSnapshot = {
  id: 'cv-main',
  title: 'CV Consultant Frontend Senior',
  summary: 'Consultant frontend senior.',
  updatedAt: '2026-05-12T08:30:00.000Z',
  completeness: 84,
  targetRole: 'Lead Frontend Svelte / TypeScript',
  location: 'Paris',
  tjmMin: 650,
  tjmMax: 900,
  remotePreference: 'hybrid',
  seniority: 'senior',
  skills: ['Svelte 5', 'TypeScript'],
  experiences: [],
  education: [],
  links: [],
  imports: [],
  suggestions: [],
};

const syncStatuses: PlatformSyncStatus[] = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    status: 'ready',
    lastSyncAt: '2026-05-12T09:10:00.000Z',
    lastErrorCode: null,
    lastErrorMessage: null,
  },
  {
    id: 'free-work',
    name: 'Free-Work',
    status: 'needs-session',
    lastSyncAt: null,
    lastErrorCode: 'session_required',
    lastErrorMessage: 'Connexion Free-Work expirée.',
  },
  {
    id: 'malt',
    name: 'Malt',
    status: 'needs-extension',
    lastSyncAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
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

  it('builds a dashboard mission comparison shortlist from active pipeline applications', () => {
    const comparison = buildMissionComparisonSnapshot(
      [
        ...applications,
        {
          id: 'app-archived',
          title: 'Ancienne mission',
          company: 'ArchiveCo',
          source: 'hiway',
          stage: 'archived',
          score: 99,
          dailyRate: 1200,
          location: 'Paris',
          sourceUrl: 'https://example.com/archived',
          appliedAt: null,
          nextActionAt: '2026-05-18',
          notes: '',
          userRating: 5,
        },
        {
          id: 'app-offer',
          title: 'Staff Frontend',
          company: 'OfferOps',
          source: 'collective',
          stage: 'offer',
          score: 88,
          dailyRate: null,
          location: 'Remote Europe',
          sourceUrl: 'https://example.com/offer',
          appliedAt: '2026-05-12',
          nextActionAt: null,
          notes: '',
          userRating: 4,
        },
      ],
      3
    );

    expect(comparison.items.map((item) => item.id)).toEqual(['app-offer', 'app-001', 'app-002']);
    expect(comparison).toMatchObject({
      bestScoreId: 'app-001',
      bestRateId: 'app-001',
      earliestFollowUpId: 'app-001',
      averageScore: 89,
      averageDailyRate: 700,
    });
    expect(comparison.items[0]).toMatchObject({
      id: 'app-offer',
      dailyRateRank: null,
      followUpRank: null,
      strengths: ['Score fort', 'Rating utilisateur élevé', 'Pipeline avancé'],
      risks: ['TJM absent', 'Relance non planifiée'],
    });
  });

  it('maps and validates connected dashboard alert preferences', () => {
    expect(
      dashboardAlertPreferencesRowToSnapshot(
        {
          enabled: true,
          score_threshold: 82,
          min_daily_rate: 650,
          required_stacks: ['Svelte', 'svelte', ' TypeScript '],
          max_results: 4,
          updated_at: '2026-05-22T10:00:00.000Z',
        },
        '2026-05-22T09:00:00.000Z'
      )
    ).toEqual({
      enabled: true,
      scoreThreshold: 82,
      minDailyRate: 650,
      requiredStacks: ['Svelte', 'TypeScript'],
      maxResults: 4,
      updatedAt: '2026-05-22T10:00:00.000Z',
    });

    expect(dashboardAlertPreferencesRowToSnapshot(null, '2026-05-22T09:00:00.000Z')).toMatchObject({
      enabled: true,
      scoreThreshold: 70,
      minDailyRate: 0,
      requiredStacks: [],
      maxResults: 5,
      updatedAt: '2026-05-22T09:00:00.000Z',
    });

    expect(
      buildDashboardAlertPreferencesPatch({
        enabled: false,
        scoreThreshold: 85,
        minDailyRate: 700,
        requiredStacksText: 'Svelte, TypeScript, svelte',
        maxResults: 6,
      })
    ).toEqual({
      enabled: false,
      score_threshold: 85,
      min_daily_rate: 700,
      required_stacks: ['Svelte', 'TypeScript'],
      max_results: 6,
    });

    expect(
      buildDashboardAlertPreferencesPatch({
        enabled: true,
        scoreThreshold: 101,
        minDailyRate: 700,
        requiredStacksText: '',
        maxResults: 6,
      })
    ).toBeNull();
  });

  it('derives CV sync readiness from LinkedIn profile extractor readiness', () => {
    expect(getCvSyncReadiness(cv, syncStatuses)).toEqual({
      readyPlatforms: 1,
      totalPlatforms: 1,
      canSync: true,
    });

    expect(getCvSyncReadiness({ ...cv, completeness: 70 }, syncStatuses).canSync).toBe(false);
  });

  it('does not treat ready mission connectors as CV profile extractor readiness', () => {
    const missionOnlyStatuses: PlatformSyncStatus[] = [
      {
        id: 'free-work',
        name: 'Free-Work',
        status: 'ready',
        lastSyncAt: '2026-05-12T09:10:00.000Z',
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      {
        id: 'linkedin',
        name: 'LinkedIn',
        status: 'needs-permission',
        lastSyncAt: null,
        lastErrorCode: 'permission_required',
        lastErrorMessage: 'Permission LinkedIn manquante.',
      },
    ];

    expect(getCvSyncReadiness(cv, missionOnlyStatuses)).toEqual({
      readyPlatforms: 0,
      totalPlatforms: 1,
      canSync: false,
    });
    expect(getReadyCvSyncPlatforms(missionOnlyStatuses)).toEqual([]);
  });

  it('lists actionable CV sync blockers from LinkedIn extractor status only', () => {
    expect(getSyncBlockers(cv, syncStatuses)).toEqual([]);

    expect(
      getSyncBlockers(cv, [
        {
          id: 'free-work',
          name: 'Free-Work',
          status: 'needs-session',
          lastSyncAt: null,
          lastErrorCode: 'session_required',
          lastErrorMessage: 'Connexion Free-Work expirée.',
        },
        {
          id: 'linkedin',
          name: 'LinkedIn',
          status: 'needs-permission',
          lastSyncAt: null,
          lastErrorCode: 'permission_required',
          lastErrorMessage: 'Permission LinkedIn manquante.',
        },
      ])
    ).toEqual(["Autoriser LinkedIn dans l'extension"]);

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
      sourceUrl: 'https://example.com/mission',
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
            notes: 'Bon échange.',
            user_rating: 5,
            applied_at: '2026-05-21T08:00:00.000Z',
            next_action_at: '2026-05-24T08:00:00.000Z',
          },
          {
            id: 'application-2',
            mission_id: 'missing-mission',
            stage: 'selected',
            notes: '',
            user_rating: null,
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
              url: 'https://example.com/mission-1',
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
        sourceUrl: 'https://example.com/mission-1',
        appliedAt: '2026-05-21T08:00:00.000Z',
        nextActionAt: '2026-05-24T08:00:00.000Z',
        notes: 'Bon échange.',
        userRating: 5,
      },
    ]);
  });

  it('keeps compatible favorite applications when canonical applications already exist', () => {
    const canonical = [
      {
        ...applications[0],
        id: 'canonical-1',
        sourceUrl: 'https://example.com/app-001',
      },
    ];
    const favorites = [
      {
        ...applications[0],
        id: 'favorite-duplicate-url',
        sourceUrl: 'https://example.com/app-001',
      },
      {
        ...applications[1],
        id: 'favorite-only',
        sourceUrl: 'https://example.com/favorite-only',
      },
    ];

    expect(
      mergeApplicationCompatibilityFallbacks(canonical, favorites).map((item) => item.id)
    ).toEqual(['canonical-1', 'favorite-only']);
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
          {
            id: 'mission-duplicate',
            title: 'Lead Svelte duplicate',
            client: 'ScaleOps',
            source: 'lehibou',
            stack: ['Svelte'],
            tjm: 700,
            location: 'Remote',
            scraped_at: '2026-05-22T08:05:00.000Z',
            url: 'https://example.com/duplicate',
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
              criteria: scoreCriteria,
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
        scoreCriteria,
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

  it('keeps extension scan sync rows compatible with the dashboard mission feed', () => {
    const scannedMission: Mission = {
      id: 'free-work-scan-123',
      title: 'Lead Svelte 5',
      client: 'ScaleOps',
      description: 'Mission Svelte 5 et TypeScript strict',
      stack: ['Svelte', 'TypeScript'],
      tjm: 720,
      location: 'Remote France',
      remote: 'full',
      duration: '6 mois',
      startDate: '2026-06-01',
      publishedAt: '2026-05-20T08:00:00.000Z',
      url: 'https://example.com/mission',
      source: 'free-work',
      scrapedAt: new Date('2026-05-21T08:00:00.000Z'),
      seniority: 'senior',
      scoreBreakdown: {
        deterministic: 86,
        semantic: 92,
        total: 89,
        grade: 'A',
        criteria: scoreCriteria,
        semanticReason: 'Très bon match Svelte',
      },
      score: 89,
      semanticScore: 92,
      semanticReason: 'Très bon match Svelte',
    };
    const remoteMissionId = 'remote-mission-1';
    const missionRow = buildMissionUpsertRow(scannedMission, 'user-1');
    const scoreRow = buildMissionScoreUpsertRow(
      scannedMission,
      remoteMissionId,
      new Date('2026-05-21T08:01:00.000Z'),
      'missionpulse-v1'
    );

    expect(
      missionRowsToFeedItems(
        [{ id: remoteMissionId, ...missionRow }],
        new Map([[remoteMissionId, scoreRow]]),
        new Map([[remoteMissionId, { mission_id: remoteMissionId, stage: 'selected' }]]),
        [],
        new Date('2026-05-22T10:00:00.000Z')
      )
    ).toEqual([
      expect.objectContaining({
        id: remoteMissionId,
        title: 'Lead Svelte 5',
        client: 'ScaleOps',
        source: 'free-work',
        stack: ['Svelte', 'TypeScript'],
        score: 89,
        deterministicScore: 86,
        semanticScore: 92,
        grade: 'A',
        scoreCriteria,
        semanticReason: 'Très bon match Svelte',
        dailyRate: 720,
        location: 'Remote France',
        url: 'https://example.com/mission',
        applicationStage: 'selected',
        freshness: 'fresh',
      }),
    ]);
  });

  it('attaches source health to mission feed items', () => {
    expect(
      missionRowsToFeedItems(
        [
          {
            id: 'mission-1',
            title: 'Lead Svelte',
            client: 'ScaleOps',
            source: 'free-work',
            stack: ['Svelte'],
            tjm: 720,
            location: 'Remote France',
            scraped_at: '2026-05-22T08:00:00.000Z',
            url: 'https://example.com/1',
          },
        ],
        new Map(),
        new Map(),
        [],
        new Date('2026-05-22T10:00:00.000Z'),
        new Map([
          [
            'free-work',
            {
              id: 'free-work',
              name: 'Free-Work',
              status: 'needs-session',
              lastSyncAt: '2026-05-22T09:00:00.000Z',
              lastErrorCode: 'session_required',
              lastErrorMessage: 'Reconnectez Free-Work.',
            },
          ],
        ])
      )
    ).toEqual([
      expect.objectContaining({
        id: 'mission-1',
        sourceHealthStatus: 'needs-session',
        sourceHealthErrorCode: 'session_required',
        sourceHealthErrorMessage: 'Reconnectez Free-Work.',
      }),
    ]);
  });

  it('filters mission feed items by source, query, score, and freshness', () => {
    const feed = missionRowsToFeedItems(
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
          title: 'Architecte React',
          client: 'Blue Factory',
          source: 'lehibou',
          stack: ['React'],
          tjm: 620,
          location: 'Paris',
          scraped_at: '2026-05-18T08:00:00.000Z',
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
            criteria: scoreCriteria,
            semantic_reason: null,
          },
        ],
        [
          'mission-2',
          {
            mission_id: 'mission-2',
            deterministic_score: 72,
            semantic_score: null,
            total_score: 72,
            grade: 'B',
            criteria: {},
            semantic_reason: null,
          },
        ],
      ]),
      new Map(),
      [],
      new Date('2026-05-22T10:00:00.000Z')
    );

    expect(
      filterMissionFeedItems(
        feed,
        { query: 'typescript', source: 'all', minScore: 80, freshness: 'fresh' },
        sourceLabels
      ).map((mission) => mission.id)
    ).toEqual(['mission-1']);

    expect(
      filterMissionFeedItems(
        feed,
        { query: 'blue', source: 'lehibou', minScore: null, freshness: 'stale' },
        sourceLabels
      ).map((mission) => mission.id)
    ).toEqual(['mission-2']);
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
          scoreCriteria: emptyScoreCriteria,
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
          scoreCriteria: emptyScoreCriteria,
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
          scoreCriteria: emptyScoreCriteria,
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
          scoreCriteria: emptyScoreCriteria,
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
          scoreCriteria: emptyScoreCriteria,
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
          location: 'Paris',
          tjm_min: 650,
          tjm_max: 900,
          remote_preference: 'hybrid',
          seniority: 'senior',
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
            revision: 4,
            updated_by: 'extension',
            updated_at: '2026-05-22T08:00:00.000Z',
          },
        ],
        [
          {
            id: 'suggestion-1',
            field: 'summary',
            current_value: 'Résumé dashboard.',
            suggested_value: 'Résumé LinkedIn.',
            source: 'linkedin',
            status: 'pending',
            revision: 3,
            updated_by: 'extension',
            created_at: '2026-05-22T09:00:00.000Z',
            updated_at: '2026-05-22T09:00:00.000Z',
          },
          {
            id: 'suggestion-location',
            field: 'location',
            current_value: 'Lyon',
            suggested_value: 'Paris',
            source: 'linkedin',
            status: 'pending',
            revision: 3,
            updated_by: 'extension',
            created_at: '2026-05-22T09:30:00.000Z',
            updated_at: '2026-05-22T09:30:00.000Z',
          },
          {
            id: 'suggestion-ignored',
            field: 'unknown',
            current_value: null,
            suggested_value: null,
            source: 'linkedin',
            status: 'pending',
            revision: 1,
            updated_by: 'extension',
            created_at: '2026-05-22T10:00:00.000Z',
            updated_at: '2026-05-22T10:00:00.000Z',
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
      location: 'Paris',
      tjmMin: 650,
      tjmMax: 900,
      remotePreference: 'hybrid',
      seniority: 'senior',
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
      suggestions: [
        {
          id: 'suggestion-1',
          field: 'summary',
          fieldLabel: 'Résumé',
          currentValue: 'Résumé dashboard.',
          suggestedValue: 'Résumé LinkedIn.',
          source: 'linkedin',
          status: 'pending',
          createdAt: '2026-05-22T09:00:00.000Z',
        },
        {
          id: 'suggestion-location',
          field: 'location',
          fieldLabel: 'Localisation',
          currentValue: 'Lyon',
          suggestedValue: 'Paris',
          source: 'linkedin',
          status: 'pending',
          createdAt: '2026-05-22T09:30:00.000Z',
        },
      ],
    });
  });

  it('builds an empty connected CV snapshot without preview data', () => {
    expect(buildEmptyCvSnapshot({ updatedAt: '2026-05-22T12:00:00.000Z' })).toEqual({
      id: 'empty-cv',
      title: '',
      summary: '',
      updatedAt: '2026-05-22T12:00:00.000Z',
      completeness: 0,
      targetRole: '',
      location: '',
      tjmMin: null,
      tjmMax: null,
      remotePreference: null,
      seniority: null,
      skills: [],
      experiences: [],
      education: [],
      links: [],
      imports: [],
      suggestions: [],
    });
  });

  it('keeps failed import history visible before the canonical CV exists', () => {
    expect(
      buildEmptyCvSnapshot({
        updatedAt: '2026-05-22T12:00:00.000Z',
        imports: [
          {
            id: 'import-1',
            source: 'linkedin',
            status: 'error',
            imported_at: '2026-05-22T08:05:00.000Z',
            extractor_version: 'linkedin-v1',
            error_code: 'profile-sync-failed',
            error_message: 'profile write failed',
            field_counts: { experiences: 1, education: 0, skills: 2, links: 1 },
            revision: 1,
            updated_by: 'extension',
            updated_at: '2026-05-22T08:05:00.000Z',
          },
        ],
      }).imports
    ).toEqual([
      {
        id: 'import-1',
        source: 'linkedin',
        status: 'error',
        importedAt: '2026-05-22T08:05:00.000Z',
        extractorVersion: 'linkedin-v1',
        errorCode: 'profile-sync-failed',
        errorMessage: 'profile write failed',
        fieldCounts: { experiences: 1, education: 0, skills: 2, links: 1 },
      },
    ]);
  });

  it('keeps an empty editable CV target role when Supabase stores null', () => {
    expect(
      profileRowsToCvSnapshot(
        {
          id: 'profile-1',
          title: 'Consultant Frontend',
          summary: '',
          updated_at: '2026-05-22T08:00:00.000Z',
          completeness: 30,
          target_role: null,
          location: null,
          tjm_min: null,
          tjm_max: null,
          remote_preference: null,
          seniority: null,
        },
        []
      ).targetRole
    ).toBe('');
  });

  it('maps connector health events to platform sync statuses', () => {
    const statuses = healthEventsToPlatformSyncStatuses([
      {
        source: 'free-work',
        status: 'ready',
        error_code: null,
        error_message: null,
        occurred_at: '2026-05-21T08:00:00.000Z',
      },
      {
        source: 'linkedin',
        status: 'needs_permission',
        error_code: 'permission_required',
        error_message: 'Permission LinkedIn manquante.',
        occurred_at: '2026-05-21T09:00:00.000Z',
      },
      {
        source: 'unknown-source',
        status: 'ready',
        error_code: null,
        error_message: null,
        occurred_at: '2026-05-21T10:00:00.000Z',
      },
    ]);

    expect(statuses).toContainEqual({
      id: 'free-work',
      name: 'Free-Work',
      status: 'ready',
      lastSyncAt: '2026-05-21T08:00:00.000Z',
      lastErrorCode: null,
      lastErrorMessage: null,
    });
    expect(statuses).toContainEqual({
      id: 'linkedin',
      name: 'LinkedIn',
      status: 'needs-permission',
      lastSyncAt: '2026-05-21T09:00:00.000Z',
      lastErrorCode: 'permission_required',
      lastErrorMessage: 'Permission LinkedIn manquante.',
    });
    expect(statuses.find((status) => status.id === 'lehibou')).toMatchObject({
      status: 'needs-extension',
      lastSyncAt: null,
    });
  });

  it('keeps every connected mission and profile platform visible without health events', () => {
    const statuses = healthEventsToPlatformSyncStatuses([]);

    expect(statuses.map((status) => status.id)).toEqual([
      'free-work',
      'lehibou',
      'hiway',
      'collective',
      'cherry-pick',
      'linkedin',
    ]);
    expect(statuses.every((status) => status.status === 'needs-extension')).toBe(true);
    expect(statuses.every((status) => status.lastSyncAt === null)).toBe(true);
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
            retry_after_at: null,
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
            retry_after_at: null,
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
            retry_after_at: '2026-05-22T06:05:00.000Z',
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
            retry_after_at: null,
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
        retryAfterAt: '2026-05-22T06:05:00.000Z',
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
        retryAfterAt: null,
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
        retryAfterAt: null,
        updatedAt: '2026-05-22T08:00:00.000Z',
      },
    ]);
  });

  it('maps sync conflict rows to dashboard conflicts and filters invalid states', () => {
    expect(
      syncConflictRowsToDashboardConflicts(
        [
          {
            id: 'conflict-older',
            device_id: 'device-1',
            entity: 'candidate_profile',
            entity_id: 'profile-1',
            field: 'summary',
            local_value: 'Résumé LinkedIn',
            remote_value: 'Résumé dashboard',
            local_updated_by: 'extension',
            remote_updated_by: 'dashboard',
            status: 'pending',
            detected_at: '2026-05-22T08:00:00.000Z',
          },
          {
            id: 'conflict-latest',
            device_id: null,
            entity: 'applications',
            entity_id: 'application-1',
            field: 'stage',
            local_value: 'interview',
            remote_value: 'offer',
            local_updated_by: 'extension',
            remote_updated_by: 'dashboard',
            status: 'pending',
            detected_at: '2026-05-22T09:00:00.000Z',
          },
          {
            id: 'conflict-invalid',
            device_id: 'device-1',
            entity: 'candidate_profile',
            entity_id: 'profile-1',
            field: 'summary',
            local_value: 'x',
            remote_value: 'y',
            local_updated_by: 'robot',
            remote_updated_by: 'dashboard',
            status: 'pending',
            detected_at: '2026-05-22T10:00:00.000Z',
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
        id: 'conflict-latest',
        deviceId: null,
        deviceLabel: 'Dashboard',
        entity: 'applications',
        entityLabel: 'Candidature',
        entityId: 'application-1',
        field: 'stage',
        localValue: 'interview',
        remoteValue: 'offer',
        localUpdatedBy: 'extension',
        remoteUpdatedBy: 'dashboard',
        status: 'pending',
        detectedAt: '2026-05-22T09:00:00.000Z',
      },
      {
        id: 'conflict-older',
        deviceId: 'device-1',
        deviceLabel: 'Chrome 0.4.0',
        entity: 'candidate_profile',
        entityLabel: 'Profil CV',
        entityId: 'profile-1',
        field: 'summary',
        localValue: 'Résumé LinkedIn',
        remoteValue: 'Résumé dashboard',
        localUpdatedBy: 'extension',
        remoteUpdatedBy: 'dashboard',
        status: 'pending',
        detectedAt: '2026-05-22T08:00:00.000Z',
      },
    ]);
  });

  it('maps application pipeline events to a sorted dashboard timeline', () => {
    expect(
      pipelineEventRowsToTimeline([
        {
          id: 'event-older',
          application_id: 'app-001',
          from_stage: 'selected',
          to_stage: 'application_prepared',
          note: 'Message recruteur prêt.',
          occurred_at: '2026-05-21T08:00:00.000Z',
          created_by: 'extension',
        },
        {
          id: 'event-latest',
          application_id: 'app-001',
          from_stage: 'application_prepared',
          to_stage: 'applied',
          note: null,
          occurred_at: '2026-05-22T09:00:00.000Z',
          created_by: 'dashboard',
        },
        {
          id: 'event-invalid-stage',
          application_id: 'app-001',
          from_stage: 'applied',
          to_stage: 'unknown',
          note: null,
          occurred_at: '2026-05-23T09:00:00.000Z',
          created_by: 'dashboard',
        },
        {
          id: 'event-invalid-creator',
          application_id: 'app-001',
          from_stage: 'applied',
          to_stage: 'interview',
          note: null,
          occurred_at: '2026-05-24T09:00:00.000Z',
          created_by: 'robot',
        },
      ])
    ).toEqual([
      {
        id: 'event-latest',
        applicationId: 'app-001',
        fromStage: 'application_prepared',
        fromLabel: 'Candidature préparée',
        toStage: 'applied',
        toLabel: 'Postulé',
        note: null,
        occurredAt: '2026-05-22T09:00:00.000Z',
        createdBy: 'dashboard',
        createdByLabel: 'Dashboard',
      },
      {
        id: 'event-older',
        applicationId: 'app-001',
        fromStage: 'selected',
        fromLabel: 'Sélectionnée',
        toStage: 'application_prepared',
        toLabel: 'Candidature préparée',
        note: 'Message recruteur prêt.',
        occurredAt: '2026-05-21T08:00:00.000Z',
        createdBy: 'extension',
        createdByLabel: 'Extension',
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

  it('builds deterministic dashboard pipeline event ids for idempotent inserts', () => {
    expect(
      buildDashboardPipelineClientEventId({
        action: 'transition',
        applicationId: 'app-001',
        revision: 3,
        fromStage: 'selected',
        toStage: 'application_prepared',
      })
    ).toBe('dashboard:transition:app-001:3:selected:application_prepared');

    expect(
      buildDashboardPipelineClientEventId({
        action: 'detect',
        applicationId: 'app-001',
        revision: 1,
        fromStage: null,
        toStage: 'detected',
      })
    ).toBe('dashboard:detect:app-001:1:none:detected');
  });

  it('builds the insert patch for selecting a detected mission', () => {
    expect(buildMissionSelectionInsertPatch()).toEqual({
      stage: 'selected',
      notes: '',
      revision: 1,
      updated_by: 'dashboard',
    });
  });

  it('builds the insert patch for archiving a detected mission from the feed', () => {
    expect(buildMissionArchiveInsertPatch('2026-05-22T10:00:00.000Z')).toEqual({
      stage: 'archived',
      notes: '',
      revision: 1,
      updated_by: 'dashboard',
      archived_at: '2026-05-22T10:00:00.000Z',
    });
  });

  it('builds validated application details update patches', () => {
    expect(buildApplicationDetailsUpdatePatch('  Relancer lundi  ', 4, '2026-05-25')).toEqual({
      notes: 'Relancer lundi',
      user_rating: 4,
      next_action_at: '2026-05-25T12:00:00.000Z',
      updated_by: 'dashboard',
    });

    expect(buildApplicationDetailsUpdatePatch('', null, null)).toEqual({
      notes: '',
      user_rating: null,
      next_action_at: null,
      updated_by: 'dashboard',
    });

    expect(buildApplicationDetailsUpdatePatch('', 6, null)).toBeNull();
    expect(buildApplicationDetailsUpdatePatch('', 3, '25/05/2026')).toBeNull();
  });

  it('builds validated canonical CV profile update patches', () => {
    expect(
      buildCvProfileUpdatePatch(
        '  Consultant Frontend Senior  ',
        '  Architecture Svelte, TypeScript et design systems.  ',
        '  Lead Frontend Svelte  ',
        '  Paris  ',
        '650',
        '900',
        'hybrid',
        'senior'
      )
    ).toEqual({
      title: 'Consultant Frontend Senior',
      summary: 'Architecture Svelte, TypeScript et design systems.',
      target_role: 'Lead Frontend Svelte',
      location: 'Paris',
      tjm_min: 650,
      tjm_max: 900,
      remote_preference: 'hybrid',
      seniority: 'senior',
    });

    expect(buildCvProfileUpdatePatch('Profil', '', '')).toEqual({
      title: 'Profil',
      summary: '',
      target_role: null,
      location: null,
      tjm_min: null,
      tjm_max: null,
      remote_preference: null,
      seniority: null,
    });

    expect(buildCvProfileUpdatePatch('', 'Résumé', 'Lead')).toBeNull();
    expect(buildCvProfileUpdatePatch('x'.repeat(121), '', '')).toBeNull();
    expect(buildCvProfileUpdatePatch('Profil', 'x'.repeat(4001), '')).toBeNull();
    expect(buildCvProfileUpdatePatch('Profil', '', 'x'.repeat(121))).toBeNull();
    expect(buildCvProfileUpdatePatch('Profil', '', '', 'x'.repeat(121))).toBeNull();
    expect(buildCvProfileUpdatePatch('Profil', '', '', '', '900', '650')).toBeNull();
    expect(buildCvProfileUpdatePatch('Profil', '', '', '', 'abc', '')).toBeNull();
    expect(buildCvProfileUpdatePatch('Profil', '', '', '', '', '', 'remote')).toBeNull();
    expect(buildCvProfileUpdatePatch('Profil', '', '', '', '', '', '', 'expert')).toBeNull();
  });

  it('validates connected data deletion confirmation', () => {
    expect(buildConnectedDataDeletionRequest('SUPPRIMER')).toEqual({
      confirmed: true,
      confirmation: 'SUPPRIMER',
    });

    expect(buildConnectedDataDeletionRequest(' supprimer ')).toBeNull();
    expect(buildConnectedDataDeletionRequest('DELETE')).toBeNull();
  });

  it('builds validated CV suggestion resolution patches', () => {
    expect(
      buildCvFieldSuggestionResolution({
        field: 'summary',
        suggestedValue: 'Résumé importé',
        action: 'apply',
        resolvedAt: '2026-05-22T10:00:00.000Z',
        revision: 4,
      })
    ).toEqual({
      suggestion: {
        status: 'applied',
        resolved_at: '2026-05-22T10:00:00.000Z',
        revision: 5,
        updated_by: 'dashboard',
      },
      profile: {
        summary: 'Résumé importé',
        updated_by: 'dashboard',
      },
    });

    expect(
      buildCvFieldSuggestionResolution({
        field: 'target_role',
        suggestedValue: null,
        action: 'apply',
        resolvedAt: '2026-05-22T10:00:00.000Z',
        revision: 2,
      })
    ).toEqual({
      suggestion: {
        status: 'applied',
        resolved_at: '2026-05-22T10:00:00.000Z',
        revision: 3,
        updated_by: 'dashboard',
      },
      profile: {
        target_role: null,
        updated_by: 'dashboard',
      },
    });

    expect(
      buildCvFieldSuggestionResolution({
        field: 'location',
        suggestedValue: ' Paris ',
        action: 'apply',
        resolvedAt: '2026-05-22T10:00:00.000Z',
        revision: 9,
      })
    ).toEqual({
      suggestion: {
        status: 'applied',
        resolved_at: '2026-05-22T10:00:00.000Z',
        revision: 10,
        updated_by: 'dashboard',
      },
      profile: {
        location: 'Paris',
        updated_by: 'dashboard',
      },
    });

    expect(
      buildCvFieldSuggestionResolution({
        field: 'title',
        suggestedValue: 'Titre ignoré',
        action: 'dismiss',
        resolvedAt: '2026-05-22T10:00:00.000Z',
        revision: 1,
      })
    ).toEqual({
      suggestion: {
        status: 'dismissed',
        resolved_at: '2026-05-22T10:00:00.000Z',
        revision: 2,
        updated_by: 'dashboard',
      },
      profile: null,
    });

    expect(
      buildCvFieldSuggestionResolution({
        field: 'unknown',
        suggestedValue: 'Valeur',
        action: 'apply',
        resolvedAt: '2026-05-22T10:00:00.000Z',
        revision: 1,
      })
    ).toBeNull();
    expect(
      buildCvFieldSuggestionResolution({
        field: 'title',
        suggestedValue: null,
        action: 'apply',
        resolvedAt: '2026-05-22T10:00:00.000Z',
        revision: 1,
      })
    ).toBeNull();
  });

  it('builds sync conflict resolution patches from CV suggestion outcomes', () => {
    expect(buildSyncConflictResolutionPatch('applied', '2026-05-22T10:00:00.000Z')).toEqual({
      status: 'resolved',
      resolved_at: '2026-05-22T10:00:00.000Z',
    });

    expect(buildSyncConflictResolutionPatch('dismissed', '2026-05-22T10:00:00.000Z')).toEqual({
      status: 'dismissed',
      resolved_at: '2026-05-22T10:00:00.000Z',
    });

    expect(buildSyncConflictResolutionPatch('resolved', '2026-05-22T10:00:00.000Z')).toEqual({
      status: 'resolved',
      resolved_at: '2026-05-22T10:00:00.000Z',
    });
  });

  it('builds application sync conflict resolutions that apply extension values', () => {
    expect(
      buildApplicationSyncConflictResolution({
        field: 'notes',
        localValue: 'Note conservée côté extension',
        action: 'apply_local',
        resolvedAt: '2026-05-22T10:00:00.000Z',
      })
    ).toEqual({
      conflict: {
        status: 'resolved',
        resolved_at: '2026-05-22T10:00:00.000Z',
      },
      application: {
        notes: 'Note conservée côté extension',
        updated_by: 'dashboard',
      },
      stageTransition: null,
    });

    expect(
      buildApplicationSyncConflictResolution({
        field: 'user_rating',
        localValue: '5',
        action: 'apply_local',
        resolvedAt: '2026-05-22T10:00:00.000Z',
      })
    ).toMatchObject({
      application: {
        user_rating: 5,
        updated_by: 'dashboard',
      },
      stageTransition: null,
    });

    expect(
      buildApplicationSyncConflictResolution({
        field: 'next_action_at',
        localValue: '2026-05-28T09:00:00.000Z',
        action: 'apply_local',
        resolvedAt: '2026-05-22T10:00:00.000Z',
      })
    ).toMatchObject({
      application: {
        next_action_at: '2026-05-28T09:00:00.000Z',
        updated_by: 'dashboard',
      },
      stageTransition: null,
    });
  });

  it('builds application sync conflict stage resolutions through the canonical pipeline', () => {
    expect(
      buildApplicationSyncConflictResolution({
        field: 'stage',
        localValue: 'offer',
        action: 'apply_local',
        resolvedAt: '2026-05-22T10:00:00.000Z',
      })
    ).toEqual({
      conflict: {
        status: 'resolved',
        resolved_at: '2026-05-22T10:00:00.000Z',
      },
      application: {
        stage: 'offer',
        applied_at: undefined,
        archived_at: null,
        updated_by: 'dashboard',
      },
      stageTransition: 'offer',
    });
  });

  it('does not mutate applications when keeping dashboard conflict values', () => {
    expect(
      buildApplicationSyncConflictResolution({
        field: 'notes',
        localValue: 'Note extension',
        action: 'keep_remote',
        resolvedAt: '2026-05-22T10:00:00.000Z',
      })
    ).toEqual({
      conflict: {
        status: 'resolved',
        resolved_at: '2026-05-22T10:00:00.000Z',
      },
      application: null,
      stageTransition: null,
    });

    expect(
      buildApplicationSyncConflictResolution({
        field: 'notes',
        localValue: 'Note extension',
        action: 'dismissed',
        resolvedAt: '2026-05-22T10:00:00.000Z',
      })
    ).toEqual({
      conflict: {
        status: 'dismissed',
        resolved_at: '2026-05-22T10:00:00.000Z',
      },
      application: null,
      stageTransition: null,
    });
  });

  it('rejects invalid application sync conflict values', () => {
    expect(
      buildApplicationSyncConflictResolution({
        field: 'stage',
        localValue: 'done',
        action: 'apply_local',
        resolvedAt: '2026-05-22T10:00:00.000Z',
      })
    ).toBeNull();
    expect(
      buildApplicationSyncConflictResolution({
        field: 'user_rating',
        localValue: '8',
        action: 'apply_local',
        resolvedAt: '2026-05-22T10:00:00.000Z',
      })
    ).toBeNull();
    expect(
      buildApplicationSyncConflictResolution({
        field: 'next_action_at',
        localValue: '28/05/2026',
        action: 'apply_local',
        resolvedAt: '2026-05-22T10:00:00.000Z',
      })
    ).toBeNull();
    expect(
      buildApplicationSyncConflictResolution({
        field: 'unknown',
        localValue: 'x',
        action: 'apply_local',
        resolvedAt: '2026-05-22T10:00:00.000Z',
      })
    ).toBeNull();
  });
});
