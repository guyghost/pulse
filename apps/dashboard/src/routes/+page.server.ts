import { env } from '$env/dynamic/public';
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
  APPLICATION_STAGES,
  transitionApplicationStage,
  type ApplicationStage,
} from '@pulse/domain';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  buildApplicationStageUpdatePatch,
  canonicalRowsToApplications,
  favoriteMissionToApplication,
  getDashboardFeatureAccess,
  healthEventsToPlatformSyncStatuses,
  parseDashboardFavoriteMission,
  profileRowsToCvSnapshot,
  type DashboardCandidateProfileRow,
  type DashboardCandidateEducationRow,
  type DashboardCandidateExperienceRow,
  type DashboardCandidateLinkRow,
  type DashboardCandidateSkillRow,
  type DashboardCanonicalApplicationRow,
  type DashboardCanonicalMissionRow,
  type DashboardCanonicalMissionScoreRow,
  type DashboardConnectorHealthEventRow,
  type DashboardProfileImportRow,
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
    stage: 'selected',
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
  summary: 'Profil aperçu: import LinkedIn et données CV seront synchronisés via Supabase.',
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
  experiences: [
    {
      title: 'Lead Frontend',
      company: 'ScaleOps',
      location: 'Paris',
      dateRange: '2021-01 - Présent',
      description: 'Architecture Svelte, design system et extension Chrome.',
      skills: ['Svelte 5', 'TypeScript'],
      source: 'linkedin',
    },
  ],
  education: [],
  links: [],
  imports: [
    {
      id: 'import-preview',
      source: 'linkedin',
      status: 'success',
      importedAt: '2026-05-12T08:30:00.000Z',
      extractorVersion: 'linkedin-v1',
      errorCode: null,
      errorMessage: null,
      fieldCounts: { experiences: 1, education: 0, skills: 5, links: 0 },
    },
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

type ApplicationTransitionRow = {
  id: string;
  stage: string;
  revision: number;
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

const getLoginUrl = (): string => {
  const loginPath = `/login?redirectTo=${encodeURIComponent('/dashboard')}`;
  const landingUrl = env.PUBLIC_LANDING_URL?.replace(/\/$/, '');

  return landingUrl ? `${landingUrl}${loginPath}` : loginPath;
};

const isApplicationStage = (value: unknown): value is ApplicationStage =>
  APPLICATION_STAGES.includes(value as ApplicationStage);

export const load: PageServerLoad = async ({ cookies }) => {
  const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
  const loginUrl = getLoginUrl();

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

  const supabase = createSupabaseServerClient(cookies);

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_period_end, credit_balance')
    .eq('id', session.user.id)
    .single<DashboardProfileRow>();

  const entitlements = getAuthenticatedEntitlements(profile ?? null);
  const { data: canonicalApplicationRows } = await supabase
    .from('applications')
    .select('id, mission_id, stage, applied_at, next_action_at')
    .eq('user_id', session.user.id)
    .order('updated_at', { ascending: false })
    .limit(100)
    .returns<DashboardCanonicalApplicationRow[]>();

  const missionIds = [...new Set((canonicalApplicationRows ?? []).map((row) => row.mission_id))];
  const { data: canonicalMissionRows } =
    missionIds.length > 0
      ? await supabase
          .from('missions')
          .select('id, title, client, source, tjm, location')
          .in('id', missionIds)
          .returns<DashboardCanonicalMissionRow[]>()
      : { data: [] };
  const { data: canonicalScoreRows } =
    missionIds.length > 0
      ? await supabase
          .from('mission_scores')
          .select('mission_id, total_score')
          .in('mission_id', missionIds)
          .returns<DashboardCanonicalMissionScoreRow[]>()
      : { data: [] };

  const canonicalApplications = canonicalRowsToApplications(
    canonicalApplicationRows ?? [],
    new Map((canonicalMissionRows ?? []).map((row) => [row.id, row])),
    new Map((canonicalScoreRows ?? []).map((row) => [row.mission_id, row]))
  );

  const { data: favoriteRows } = await supabase
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

  const { data: candidateProfile } = await supabase
    .from('candidate_profiles')
    .select('id, title, summary, updated_at, completeness, target_role')
    .eq('user_id', session.user.id)
    .maybeSingle<DashboardCandidateProfileRow>();

  const [
    { data: candidateSkills },
    { data: candidateExperiences },
    { data: candidateEducation },
    { data: candidateLinks },
    { data: profileImports },
  ] = candidateProfile
    ? await Promise.all([
        supabase
          .from('candidate_skills')
          .select('skill')
          .eq('profile_id', candidateProfile.id)
          .returns<DashboardCandidateSkillRow[]>(),
        supabase
          .from('candidate_experiences')
          .select(
            'title, company, location, start_date, end_date, is_current, description, skills, source, position_index'
          )
          .eq('profile_id', candidateProfile.id)
          .order('position_index', { ascending: true })
          .returns<DashboardCandidateExperienceRow[]>(),
        supabase
          .from('candidate_education')
          .select('school, degree, field, start_date, end_date, source, position_index')
          .eq('profile_id', candidateProfile.id)
          .order('position_index', { ascending: true })
          .returns<DashboardCandidateEducationRow[]>(),
        supabase
          .from('candidate_links')
          .select('label, url, source')
          .eq('profile_id', candidateProfile.id)
          .returns<DashboardCandidateLinkRow[]>(),
        supabase
          .from('profile_imports')
          .select(
            'id, source, status, imported_at, extractor_version, error_code, error_message, field_counts'
          )
          .eq('user_id', session.user.id)
          .order('imported_at', { ascending: false })
          .limit(5)
          .returns<DashboardProfileImportRow[]>(),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const { data: connectorHealthRows } = await supabase
    .from('connector_health_events')
    .select('source, status, occurred_at')
    .eq('user_id', session.user.id)
    .order('occurred_at', { ascending: false })
    .limit(50)
    .returns<DashboardConnectorHealthEventRow[]>();

  const syncStatuses = healthEventsToPlatformSyncStatuses(connectorHealthRows ?? []);

  return {
    session,
    loginUrl,
    entitlements,
    featureAccess: getDashboardFeatureAccess(entitlements, new Date()),
    applications: canonicalApplications.length > 0 ? canonicalApplications : syncedApplications,
    cv: candidateProfile
      ? profileRowsToCvSnapshot(
          candidateProfile,
          candidateSkills ?? [],
          candidateExperiences ?? [],
          candidateEducation ?? [],
          candidateLinks ?? [],
          profileImports ?? []
        )
      : mockCv,
    syncStatuses: syncStatuses.length > 0 ? syncStatuses : mockSyncStatuses,
  };
};

export const actions: Actions = {
  transitionApplication: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { transitionError: 'Configuration Supabase absente.' });
    }

    const supabase = createSupabaseServerClient(cookies);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return fail(401, { transitionError: 'Session requise.' });
    }

    const formData = await request.formData();
    const applicationId = formData.get('applicationId');
    const toStage = formData.get('toStage');

    if (typeof applicationId !== 'string' || !isApplicationStage(toStage)) {
      return fail(400, { transitionError: 'Transition invalide.' });
    }

    const { data: application, error: readError } = await supabase
      .from('applications')
      .select('id, stage, revision')
      .eq('id', applicationId)
      .eq('user_id', session.user.id)
      .single<ApplicationTransitionRow>();

    if (readError || !application || !isApplicationStage(application.stage)) {
      return fail(404, { transitionError: 'Candidature introuvable.' });
    }

    const occurredAt = new Date();
    const event = transitionApplicationStage({
      applicationId,
      fromStage: application.stage,
      toStage,
      occurredAt,
      createdBy: 'dashboard',
      clientEventId: `dashboard:${applicationId}:${occurredAt.getTime()}:${crypto.randomUUID()}`,
    });

    if (!event) {
      return fail(400, { transitionError: 'Transition non autorisée.' });
    }

    const { error: insertError } = await supabase.from('application_pipeline_events').insert({
      user_id: session.user.id,
      application_id: applicationId,
      from_stage: event.fromStage,
      to_stage: event.toStage,
      note: event.note,
      metadata: { source: 'dashboard' },
      occurred_at: event.occurredAt,
      created_by: event.createdBy,
      client_event_id: event.clientEventId,
    });

    if (insertError) {
      return fail(500, { transitionError: "L'événement pipeline n'a pas pu être enregistré." });
    }

    const patch = buildApplicationStageUpdatePatch(toStage, event.occurredAt);
    const updatePayload: {
      stage: ApplicationStage;
      revision: number;
      updated_by: 'dashboard';
      applied_at?: string | null;
      archived_at?: string | null;
    } = {
      stage: patch.stage,
      revision: application.revision + 1,
      updated_by: patch.updated_by,
    };

    if (patch.applied_at !== undefined) {
      updatePayload.applied_at = patch.applied_at;
    }
    if (patch.archived_at !== undefined) {
      updatePayload.archived_at = patch.archived_at;
    }

    const { error: updateError } = await supabase
      .from('applications')
      .update(updatePayload)
      .eq('id', applicationId)
      .eq('user_id', session.user.id)
      .eq('revision', application.revision)
      .select('id')
      .single<{ id: string }>();

    if (updateError) {
      if (updateError.code !== 'PGRST116') {
        return fail(500, { transitionError: "La candidature n'a pas pu être mise à jour." });
      }

      return fail(409, {
        transitionError:
          "La candidature a changé depuis l'ouverture de la page. Rechargez avant de modifier l'étape.",
      });
    }

    return { transitionSuccess: `Candidature passée en ${toStage}.` };
  },
};
