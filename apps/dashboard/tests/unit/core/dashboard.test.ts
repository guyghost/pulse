import { describe, expect, it } from 'vitest';
import {
  countApplicationsByStage,
  canonicalRowsToApplications,
  filterApplications,
  favoriteMissionToApplication,
  getAverageApplicationScore,
  healthEventsToPlatformSyncStatuses,
  getCvSyncReadiness,
  getDashboardFeatureAccess,
  getNextFollowUp,
  getSyncBlockers,
  isDashboardPremiumActive,
  parseDashboardFavoriteMission,
  profileRowsToCvSnapshot,
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
  updatedAt: '2026-05-12T08:30:00.000Z',
  completeness: 84,
  targetRole: 'Lead Frontend Svelte / TypeScript',
  skills: ['Svelte 5', 'TypeScript'],
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

  it('maps canonical profile rows to a dashboard CV snapshot', () => {
    expect(
      profileRowsToCvSnapshot(
        {
          id: 'profile-1',
          title: 'Consultant Frontend',
          updated_at: '2026-05-21T08:00:00.000Z',
          completeness: 82,
          target_role: 'Lead Svelte',
        },
        [{ skill: 'Svelte' }, { skill: 'TypeScript' }]
      )
    ).toEqual({
      id: 'profile-1',
      title: 'Consultant Frontend',
      updatedAt: '2026-05-21T08:00:00.000Z',
      completeness: 82,
      targetRole: 'Lead Svelte',
      skills: ['Svelte', 'TypeScript'],
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
});
