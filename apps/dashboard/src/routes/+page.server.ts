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
  buildMissionSelectionInsertPatch,
  buildTjmRadarSnapshot,
  canonicalRowsToApplications,
  favoriteMissionToApplication,
  generatedAssetRowsToHistory,
  getDashboardFeatureAccess,
  healthEventsToPlatformSyncStatuses,
  missionRowsToFeedItems,
  parseDashboardFavoriteMission,
  profileRowsToCvSnapshot,
  syncRowsToConnectedSyncStatuses,
  type DashboardCandidateProfileRow,
  type DashboardCandidateEducationRow,
  type DashboardCandidateExperienceRow,
  type DashboardCandidateLinkRow,
  type DashboardCandidateSkillRow,
  type DashboardCanonicalApplicationRow,
  type DashboardCanonicalMissionRow,
  type DashboardCanonicalMissionScoreRow,
  type DashboardConnectorHealthEventRow,
  type DashboardExtensionDeviceRow,
  type DashboardGeneratedApplicationAssetRow,
  type DashboardMissionDuplicateRow,
  type DashboardMissionFeedApplicationRow,
  type DashboardMissionFeedRow,
  type DashboardMissionFeedScoreRow,
  type DashboardProfileImportRow,
  type DashboardSyncStatusRow,
  type ConnectedSyncStatus,
  type CvSnapshot,
  type DashboardAccountEntitlements,
  type DashboardSubscriptionStatus,
  type GeneratedApplicationAsset,
  type MissionApplication,
  type MissionFeedItem,
  type PlatformSyncStatus,
  type TjmRadarSnapshot,
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

const mockGeneratedAssets: GeneratedApplicationAsset[] = [
  {
    id: 'asset-preview-1',
    applicationId: 'app-001',
    applicationTitle: 'Lead Svelte / TypeScript',
    company: 'Atelier Nova',
    type: 'pitch',
    label: 'Pitch',
    content:
      "Bonjour, je peux accompagner Atelier Nova sur la mission Lead Svelte avec une approche progressive, des standards TypeScript stricts et une forte expérience d'architecture frontend.",
    preview:
      "Bonjour, je peux accompagner Atelier Nova sur la mission Lead Svelte avec une approche progressive, des standards TypeScript stricts et une forte expérience d'architecture frontend.",
    model: 'gemini-nano',
    createdAt: '2026-05-20T08:30:00.000Z',
  },
  {
    id: 'asset-preview-2',
    applicationId: 'app-002',
    applicationTitle: 'Architecte Frontend freelance',
    company: 'ScaleOps',
    type: 'cv_summary',
    label: 'Résumé CV',
    content:
      'Résumé orienté architecture frontend, design systems et migration progressive pour mission freelance senior.',
    preview:
      'Résumé orienté architecture frontend, design systems et migration progressive pour mission freelance senior.',
    model: 'gemini-nano',
    createdAt: '2026-05-18T09:00:00.000Z',
  },
];

const mockMissionFeed: MissionFeedItem[] = [
  {
    id: 'mission-preview-1',
    title: 'Lead Svelte / TypeScript',
    client: 'Atelier Nova',
    source: 'free-work',
    stack: ['Svelte 5', 'TypeScript', 'TailwindCSS'],
    score: 92,
    deterministicScore: 88,
    semanticScore: 96,
    grade: 'A',
    semanticReason: 'Stack et séniorité fortement alignées au profil cible.',
    dailyRate: 720,
    location: 'Paris hybride',
    scrapedAt: '2026-05-22T08:00:00.000Z',
    url: 'https://example.com/mission-preview-1',
    duplicateCount: 1,
    applicationStage: 'selected',
    freshness: 'fresh',
  },
  {
    id: 'mission-preview-2',
    title: 'Architecte Frontend freelance',
    client: 'ScaleOps',
    source: 'collective',
    stack: ['Design systems', 'Architecture frontend'],
    score: 86,
    deterministicScore: 86,
    semanticScore: null,
    grade: 'B',
    semanticReason: null,
    dailyRate: 680,
    location: 'Remote France',
    scrapedAt: '2026-05-20T08:00:00.000Z',
    url: 'https://example.com/mission-preview-2',
    duplicateCount: 0,
    applicationStage: null,
    freshness: 'stale',
  },
];

const mockTjmRadar: TjmRadarSnapshot = buildTjmRadarSnapshot(mockMissionFeed);

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

const mockConnectedSyncStatuses: ConnectedSyncStatus[] = [
  {
    deviceId: 'device-preview',
    deviceLabel: 'Chrome 0.4.0',
    entity: 'missions',
    label: 'Missions',
    state: 'healthy',
    lastPullAt: '2026-05-22T08:00:00.000Z',
    lastPushAt: '2026-05-22T08:05:00.000Z',
    pendingUploadCount: 0,
    pendingDownloadCount: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    updatedAt: '2026-05-22T08:05:00.000Z',
  },
  {
    deviceId: 'device-preview',
    deviceLabel: 'Chrome 0.4.0',
    entity: 'candidate_profile',
    label: 'Profil CV',
    state: 'pending',
    lastPullAt: '2026-05-22T07:00:00.000Z',
    lastPushAt: null,
    pendingUploadCount: 1,
    pendingDownloadCount: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    updatedAt: '2026-05-22T08:10:00.000Z',
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

type MissionSelectionRow = {
  id: string;
  title: string;
};

type ExistingApplicationSelectionRow = {
  id: string;
  stage: string;
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
      missionFeed: mockMissionFeed,
      tjmRadar: mockTjmRadar,
      applications: mockApplications,
      generatedAssets: mockGeneratedAssets,
      cv: mockCv,
      syncStatuses: mockSyncStatuses,
      connectedSyncStatuses: mockConnectedSyncStatuses,
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
  const { data: missionFeedRows } = await supabase
    .from('missions')
    .select('id, title, client, source, stack, tjm, location, scraped_at, url')
    .eq('user_id', session.user.id)
    .order('scraped_at', { ascending: false })
    .limit(100)
    .returns<DashboardMissionFeedRow[]>();

  const missionFeedIds = (missionFeedRows ?? []).map((row) => row.id);
  const [
    { data: missionFeedScoreRows },
    { data: missionFeedApplicationRows },
    { data: missionDuplicateRows },
  ] =
    missionFeedIds.length > 0
      ? await Promise.all([
          supabase
            .from('mission_scores')
            .select(
              'mission_id, deterministic_score, semantic_score, total_score, grade, semantic_reason'
            )
            .in('mission_id', missionFeedIds)
            .returns<DashboardMissionFeedScoreRow[]>(),
          supabase
            .from('applications')
            .select('mission_id, stage')
            .eq('user_id', session.user.id)
            .in('mission_id', missionFeedIds)
            .returns<DashboardMissionFeedApplicationRow[]>(),
          supabase
            .from('mission_duplicates')
            .select('canonical_mission_id, duplicate_mission_id')
            .eq('user_id', session.user.id)
            .returns<DashboardMissionDuplicateRow[]>(),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const missionFeed = missionRowsToFeedItems(
    missionFeedRows ?? [],
    new Map((missionFeedScoreRows ?? []).map((row) => [row.mission_id, row])),
    new Map((missionFeedApplicationRows ?? []).map((row) => [row.mission_id, row])),
    missionDuplicateRows ?? [],
    new Date()
  );
  const tjmRadar = buildTjmRadarSnapshot(missionFeed);

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

  const canonicalApplicationIds = canonicalApplications.map((application) => application.id);
  const { data: generatedAssetRows } =
    canonicalApplicationIds.length > 0
      ? await supabase
          .from('generated_application_assets')
          .select('id, application_id, type, content, model, created_at')
          .eq('user_id', session.user.id)
          .in('application_id', canonicalApplicationIds)
          .order('created_at', { ascending: false })
          .limit(50)
          .returns<DashboardGeneratedApplicationAssetRow[]>()
      : { data: [] };

  const generatedAssets = generatedAssetRowsToHistory(
    generatedAssetRows ?? [],
    new Map(canonicalApplications.map((application) => [application.id, application]))
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

  const { data: extensionDeviceRows } = await supabase
    .from('extension_devices')
    .select('id, install_id, browser, extension_version, last_seen_at')
    .eq('user_id', session.user.id)
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .limit(10)
    .returns<DashboardExtensionDeviceRow[]>();

  const extensionDeviceIds = (extensionDeviceRows ?? []).map((device) => device.id);
  const { data: syncStatusRows } =
    extensionDeviceIds.length > 0
      ? await supabase
          .from('sync_status')
          .select(
            'device_id, entity, last_pull_at, last_push_at, pending_upload_count, pending_download_count, last_error_code, last_error_message, updated_at'
          )
          .eq('user_id', session.user.id)
          .in('device_id', extensionDeviceIds)
          .returns<DashboardSyncStatusRow[]>()
      : { data: [] };

  const connectedSyncStatuses = syncRowsToConnectedSyncStatuses(
    syncStatusRows ?? [],
    new Map((extensionDeviceRows ?? []).map((device) => [device.id, device]))
  );

  return {
    session,
    loginUrl,
    entitlements,
    featureAccess: getDashboardFeatureAccess(entitlements, new Date()),
    missionFeed,
    tjmRadar,
    applications: canonicalApplications.length > 0 ? canonicalApplications : syncedApplications,
    generatedAssets,
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
    connectedSyncStatuses,
  };
};

export const actions: Actions = {
  selectMission: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { selectionError: 'Configuration Supabase absente.' });
    }

    const supabase = createSupabaseServerClient(cookies);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return fail(401, { selectionError: 'Session requise.' });
    }

    const formData = await request.formData();
    const missionId = formData.get('missionId');

    if (typeof missionId !== 'string' || missionId.length === 0) {
      return fail(400, { selectionError: 'Mission invalide.' });
    }

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('id, title')
      .eq('id', missionId)
      .eq('user_id', session.user.id)
      .single<MissionSelectionRow>();

    if (missionError || !mission) {
      return fail(404, { selectionError: 'Mission introuvable.' });
    }

    const { data: existingApplication } = await supabase
      .from('applications')
      .select('id, stage')
      .eq('mission_id', missionId)
      .eq('user_id', session.user.id)
      .maybeSingle<ExistingApplicationSelectionRow>();

    if (existingApplication) {
      return {
        selectionSuccess: `Mission déjà suivie en ${existingApplication.stage}.`,
      };
    }

    const patch = buildMissionSelectionInsertPatch();
    const { data: application, error: insertError } = await supabase
      .from('applications')
      .insert({
        user_id: session.user.id,
        mission_id: missionId,
        stage: patch.stage,
        notes: patch.notes,
        revision: patch.revision,
        updated_by: patch.updated_by,
      })
      .select('id')
      .single<{ id: string }>();

    if (insertError || !application) {
      return fail(500, { selectionError: "La mission n'a pas pu être sélectionnée." });
    }

    const occurredAt = new Date();
    const event = transitionApplicationStage({
      applicationId: application.id,
      fromStage: 'detected',
      toStage: 'selected',
      occurredAt,
      createdBy: 'dashboard',
      clientEventId: `dashboard:select:${application.id}:${occurredAt.getTime()}:${crypto.randomUUID()}`,
      note: 'Mission sélectionnée depuis le feed dashboard.',
    });

    if (!event) {
      return fail(500, { selectionError: 'Transition de sélection invalide.' });
    }

    const { error: eventError } = await supabase.from('application_pipeline_events').insert({
      user_id: session.user.id,
      application_id: application.id,
      from_stage: event.fromStage,
      to_stage: event.toStage,
      note: event.note,
      metadata: { source: 'dashboard_feed', mission_id: missionId },
      occurred_at: event.occurredAt,
      created_by: event.createdBy,
      client_event_id: event.clientEventId,
    });

    if (eventError) {
      return fail(500, {
        selectionError:
          "La mission est sélectionnée, mais l'événement pipeline n'a pas pu être enregistré.",
      });
    }

    return { selectionSuccess: `Mission sélectionnée: ${mission.title}.` };
  },

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
