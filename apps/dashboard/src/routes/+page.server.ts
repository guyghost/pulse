import { env } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  favoriteMissionToApplication,
  getDashboardFeatureAccess,
  parseDashboardFavoriteMission,
  type CvSnapshot,
  type DashboardAccountEntitlements,
  type DashboardSubscriptionStatus,
  type MissionApplication,
  type PlatformSyncStatus,
} from '$lib/core/dashboard';

const mockApplications: MissionApplication[] = [
  {
    id: 'app-001',
    title: 'Lead Svelte / TypeScript',
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
    title: 'Architecte Frontend freelance',
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
    title: 'Mission migration design system',
    company: 'Bluefoundry',
    source: 'malt',
    stage: 'draft',
    score: 78,
    dailyRate: 650,
    location: 'Lyon',
    appliedAt: null,
    nextActionAt: '2026-05-20',
  },
];

const mockCv: CvSnapshot = {
  id: 'cv-main',
  title: 'CV Consultant Frontend Senior',
  updatedAt: '2026-05-12T08:30:00.000Z',
  completeness: 84,
  targetRole: 'Lead Frontend Svelte / TypeScript',
  skills: [
    'Svelte 5',
    'TypeScript',
    'Design systems',
    'Chrome extensions',
    'Architecture frontend',
  ],
};

const mockSyncStatuses: PlatformSyncStatus[] = [
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

type DashboardProfileRow = {
  subscription_status: string | null;
  subscription_period_end: string | null;
  credit_balance: number | null;
};

type FavoriteMissionRow = {
  mission_id: string;
  mission: unknown;
  favorited_at: string | null;
};

const normalizeSubscriptionStatus = (value: string | null): DashboardSubscriptionStatus =>
  value === 'premium' ? 'premium' : value === 'expired' ? 'expired' : 'free';

const getAnonymousEntitlements = (): DashboardAccountEntitlements => ({
  isAuthenticated: false,
  subscriptionStatus: 'free',
  subscriptionPeriodEndMs: null,
  creditBalance: 0,
});

const parseOptionalDateMs = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getAuthenticatedEntitlements = (
  profile: DashboardProfileRow | null
): DashboardAccountEntitlements => ({
  isAuthenticated: true,
  subscriptionStatus: normalizeSubscriptionStatus(profile?.subscription_status ?? null),
  subscriptionPeriodEndMs: parseOptionalDateMs(profile?.subscription_period_end),
  creditBalance: profile?.credit_balance ?? 0,
});

const favoriteRowToApplication = (row: FavoriteMissionRow): MissionApplication | null => {
  const mission =
    typeof row.mission === 'object' && row.mission !== null
      ? (row.mission as Record<string, unknown>)
      : {};

  const favorite = parseDashboardFavoriteMission({
    ...mission,
    missionId: typeof mission.missionId === 'string' ? mission.missionId : row.mission_id,
    favoritedAt: typeof mission.favoritedAt === 'string' ? mission.favoritedAt : row.favorited_at,
  });

  return favorite ? favoriteMissionToApplication(favorite) : null;
};

export const load: PageServerLoad = async ({ cookies }) => {
  const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
  const loginUrl = `${env.PUBLIC_LANDING_URL ?? ''}/login`;

  if (!hasSupabaseConfig) {
    const entitlements = getAnonymousEntitlements();

    return {
      session: null,
      loginUrl,
      entitlements,
      featureAccess: getDashboardFeatureAccess(entitlements, new Date()),
      applications: mockApplications,
      cv: mockCv,
      syncStatuses: mockSyncStatuses,
    };
  }

  const session = hasSupabaseConfig
    ? (await createSupabaseServerClient(cookies).auth.getSession()).data.session
    : null;

  if (!session) {
    redirect(303, loginUrl);
  }

  const { data: profile } = await createSupabaseServerClient(cookies)
    .from('profiles')
    .select('subscription_status, subscription_period_end, credit_balance')
    .eq('id', session.user.id)
    .single<DashboardProfileRow>();

  const entitlements = getAuthenticatedEntitlements(profile ?? null);
  const { data: favoriteRows } = await createSupabaseServerClient(cookies)
    .from('favorite_missions')
    .select('mission_id, mission, favorited_at')
    .eq('user_id', session.user.id)
    .order('favorited_at', { ascending: false })
    .limit(100)
    .returns<FavoriteMissionRow[]>();

  const syncedApplications =
    favoriteRows?.flatMap((row) => {
      const application = favoriteRowToApplication(row);
      return application ? [application] : [];
    }) ?? [];

  return {
    session,
    loginUrl,
    entitlements,
    featureAccess: getDashboardFeatureAccess(entitlements, new Date()),
    applications: syncedApplications,
    cv: mockCv,
    syncStatuses: mockSyncStatuses,
  };
};
