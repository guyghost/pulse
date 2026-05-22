import { describe, expect, it } from 'vitest';
import {
  countApplicationsByStage,
  canonicalRowsToApplications,
  buildApplicationDetailsUpdatePatch,
  buildCvProfileUpdatePatch,
  buildConnectedDataDeletionRequest,
  buildCvFieldSuggestionResolution,
  buildEmptyCvSnapshot,
  buildTjmRadarSnapshot,
  filterApplications,
  favoriteMissionToApplication,
  buildApplicationStageUpdatePatch,
  buildMissionSelectionInsertPatch,
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
        ],
        [
          {
            id: 'suggestion-1',
            field: 'summary',
            current_value: 'Résumé dashboard.',
            suggested_value: 'Résumé LinkedIn.',
            source: 'linkedin',
            status: 'pending',
            created_at: '2026-05-22T09:00:00.000Z',
          },
          {
            id: 'suggestion-ignored',
            field: 'unknown',
            current_value: null,
            suggested_value: null,
            source: 'linkedin',
            status: 'pending',
            created_at: '2026-05-22T10:00:00.000Z',
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
      skills: [],
      experiences: [],
      education: [],
      links: [],
      imports: [],
      suggestions: [],
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

  it('builds the insert patch for selecting a detected mission', () => {
    expect(buildMissionSelectionInsertPatch()).toEqual({
      stage: 'selected',
      notes: '',
      revision: 1,
      updated_by: 'dashboard',
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
        '  Lead Frontend Svelte  '
      )
    ).toEqual({
      title: 'Consultant Frontend Senior',
      summary: 'Architecture Svelte, TypeScript et design systems.',
      target_role: 'Lead Frontend Svelte',
    });

    expect(buildCvProfileUpdatePatch('Profil', '', '')).toEqual({
      title: 'Profil',
      summary: '',
      target_role: null,
    });

    expect(buildCvProfileUpdatePatch('', 'Résumé', 'Lead')).toBeNull();
    expect(buildCvProfileUpdatePatch('x'.repeat(121), '', '')).toBeNull();
    expect(buildCvProfileUpdatePatch('Profil', 'x'.repeat(4001), '')).toBeNull();
    expect(buildCvProfileUpdatePatch('Profil', '', 'x'.repeat(121))).toBeNull();
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
      })
    ).toEqual({
      suggestion: {
        status: 'applied',
        resolved_at: '2026-05-22T10:00:00.000Z',
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
      })
    ).toEqual({
      suggestion: {
        status: 'applied',
        resolved_at: '2026-05-22T10:00:00.000Z',
      },
      profile: {
        target_role: null,
        updated_by: 'dashboard',
      },
    });

    expect(
      buildCvFieldSuggestionResolution({
        field: 'title',
        suggestedValue: 'Titre ignoré',
        action: 'dismiss',
        resolvedAt: '2026-05-22T10:00:00.000Z',
      })
    ).toEqual({
      suggestion: {
        status: 'dismissed',
        resolved_at: '2026-05-22T10:00:00.000Z',
      },
      profile: null,
    });

    expect(
      buildCvFieldSuggestionResolution({
        field: 'unknown',
        suggestedValue: 'Valeur',
        action: 'apply',
        resolvedAt: '2026-05-22T10:00:00.000Z',
      })
    ).toBeNull();
    expect(
      buildCvFieldSuggestionResolution({
        field: 'title',
        suggestedValue: null,
        action: 'apply',
        resolvedAt: '2026-05-22T10:00:00.000Z',
      })
    ).toBeNull();
  });
});
