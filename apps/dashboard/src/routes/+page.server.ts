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
  buildApplicationDetailsUpdatePatch,
  buildApplicationStageUpdatePatch,
  buildConnectedDataDeletionRequest,
  buildCvFieldSuggestionResolution,
  buildEmptyCvSnapshot,
  buildCvProfileUpdatePatch,
  buildMissionArchiveInsertPatch,
  buildMissionSelectionInsertPatch,
  buildSyncConflictResolutionPatch,
  buildTjmRadarSnapshot,
  canonicalRowsToApplications,
  favoriteMissionToApplication,
  generatedAssetRowsToHistory,
  getDashboardFeatureAccess,
  healthEventsToPlatformSyncStatuses,
  missionRowsToFeedItems,
  pipelineEventRowsToTimeline,
  parseDashboardFavoriteMission,
  profileRowsToCvSnapshot,
  syncConflictRowsToDashboardConflicts,
  syncRowsToConnectedSyncStatuses,
  type DashboardApplicationPipelineEventRow,
  type DashboardCandidateProfileRow,
  type DashboardCandidateEducationRow,
  type DashboardCandidateExperienceRow,
  type DashboardCandidateLinkRow,
  type DashboardCandidateProfileFieldSuggestionRow,
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
  type DashboardSyncConflictRow,
  type DashboardSyncStatusRow,
  type DashboardAccountEntitlements,
  type DashboardSubscriptionStatus,
  type MissionApplication,
} from '$lib/core/dashboard';

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

type ApplicationDetailsRow = {
  id: string;
  revision: number;
};

type CvProfileEditRow = {
  id: string;
  revision: number;
};

type CvSuggestionResolutionRow = {
  id: string;
  profile_id: string;
  field: string;
  suggested_value: string | null;
};

type MissionSelectionRow = {
  id: string;
  title: string;
};

type ExistingApplicationSelectionRow = {
  id: string;
  stage: string;
};

type CandidateProfileIdentityRow = {
  id: string;
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

const isCvSuggestionResolutionAction = (value: unknown): value is 'apply' | 'dismiss' =>
  value === 'apply' || value === 'dismiss';

const deleteRowsByUserId = async (
  supabase: ReturnType<typeof createSupabaseServerClient>,
  table: string,
  userId: string
): Promise<void> => {
  const { error } = await supabase.from(table).delete().eq('user_id', userId);

  if (error) {
    throw new Error(error.message);
  }
};

const deleteProfileChildRows = async (
  supabase: ReturnType<typeof createSupabaseServerClient>,
  table: string,
  profileIds: string[]
): Promise<void> => {
  if (profileIds.length === 0) {
    return;
  }

  const { error } = await supabase.from(table).delete().in('profile_id', profileIds);

  if (error) {
    throw new Error(error.message);
  }
};

export const load: PageServerLoad = async ({ cookies }) => {
  const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
  const loginUrl = getLoginUrl();

  if (!hasSupabaseConfig) {
    const entitlements = getAnonymousEntitlements();
    const missionFeed: [] = [];

    return {
      session: null,
      loginUrl,
      configurationMissing: true,
      entitlements,
      featureAccess: getDashboardFeatureAccess(entitlements, new Date()),
      missionFeed,
      tjmRadar: buildTjmRadarSnapshot(missionFeed),
      applications: [],
      applicationTimeline: [],
      generatedAssets: [],
      cv: buildEmptyCvSnapshot({ updatedAt: new Date().toISOString() }),
      syncStatuses: [],
      connectedSyncStatuses: [],
      syncConflicts: [],
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
    .select('id, mission_id, stage, notes, user_rating, applied_at, next_action_at')
    .eq('user_id', session.user.id)
    .order('updated_at', { ascending: false })
    .limit(100)
    .returns<DashboardCanonicalApplicationRow[]>();

  const missionIds = [...new Set((canonicalApplicationRows ?? []).map((row) => row.mission_id))];
  const { data: canonicalMissionRows } =
    missionIds.length > 0
      ? await supabase
          .from('missions')
          .select('id, title, client, source, tjm, location, url')
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

  const { data: pipelineEventRows } =
    canonicalApplicationIds.length > 0
      ? await supabase
          .from('application_pipeline_events')
          .select('id, application_id, from_stage, to_stage, note, occurred_at, created_by')
          .eq('user_id', session.user.id)
          .in('application_id', canonicalApplicationIds)
          .order('occurred_at', { ascending: false })
          .limit(100)
          .returns<DashboardApplicationPipelineEventRow[]>()
      : { data: [] };

  const applicationTimeline = pipelineEventRowsToTimeline(pipelineEventRows ?? []);

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
    { data: profileSuggestions },
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
        supabase
          .from('candidate_profile_field_suggestions')
          .select('id, field, current_value, suggested_value, source, status, created_at')
          .eq('user_id', session.user.id)
          .eq('profile_id', candidateProfile.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10)
          .returns<DashboardCandidateProfileFieldSuggestionRow[]>(),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

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
            'device_id, entity, last_pull_at, last_push_at, pending_upload_count, pending_download_count, last_error_code, last_error_message, retry_after_at, updated_at'
          )
          .eq('user_id', session.user.id)
          .in('device_id', extensionDeviceIds)
          .returns<DashboardSyncStatusRow[]>()
      : { data: [] };

  const extensionDevicesById = new Map(
    (extensionDeviceRows ?? []).map((device) => [device.id, device])
  );

  const connectedSyncStatuses = syncRowsToConnectedSyncStatuses(
    syncStatusRows ?? [],
    extensionDevicesById
  );

  const { data: syncConflictRows } = await supabase
    .from('sync_conflicts')
    .select(
      'id, device_id, entity, entity_id, field, local_value, remote_value, local_updated_by, remote_updated_by, status, detected_at'
    )
    .eq('user_id', session.user.id)
    .eq('status', 'pending')
    .order('detected_at', { ascending: false })
    .limit(20)
    .returns<DashboardSyncConflictRow[]>();

  const syncConflicts = syncConflictRowsToDashboardConflicts(
    syncConflictRows ?? [],
    extensionDevicesById
  );

  return {
    session,
    loginUrl,
    configurationMissing: false,
    entitlements,
    featureAccess: getDashboardFeatureAccess(entitlements, new Date()),
    missionFeed,
    tjmRadar,
    applications: canonicalApplications.length > 0 ? canonicalApplications : syncedApplications,
    applicationTimeline,
    generatedAssets,
    cv: candidateProfile
      ? profileRowsToCvSnapshot(
          candidateProfile,
          candidateSkills ?? [],
          candidateExperiences ?? [],
          candidateEducation ?? [],
          candidateLinks ?? [],
          profileImports ?? [],
          profileSuggestions ?? []
        )
      : buildEmptyCvSnapshot({ updatedAt: new Date().toISOString() }),
    syncStatuses,
    connectedSyncStatuses,
    syncConflicts,
  };
};

export const actions: Actions = {
  resolveCvSuggestion: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { cvError: 'Configuration Supabase absente.' });
    }

    const supabase = createSupabaseServerClient(cookies);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return fail(401, { cvError: 'Session requise.' });
    }

    const formData = await request.formData();
    const suggestionId = formData.get('suggestionId');
    const resolutionAction = formData.get('resolutionAction');

    if (typeof suggestionId !== 'string' || !isCvSuggestionResolutionAction(resolutionAction)) {
      return fail(400, { cvError: 'Suggestion CV invalide.' });
    }

    const { data: suggestion, error: suggestionError } = await supabase
      .from('candidate_profile_field_suggestions')
      .select('id, profile_id, field, suggested_value')
      .eq('id', suggestionId)
      .eq('user_id', session.user.id)
      .eq('status', 'pending')
      .single<CvSuggestionResolutionRow>();

    if (suggestionError || !suggestion) {
      return fail(404, { cvError: 'Suggestion CV introuvable.' });
    }

    const resolvedAt = new Date().toISOString();
    const resolution = buildCvFieldSuggestionResolution({
      field: suggestion.field,
      suggestedValue: suggestion.suggested_value,
      action: resolutionAction,
      resolvedAt,
    });

    if (!resolution) {
      return fail(400, { cvError: 'Suggestion CV incompatible avec le champ cible.' });
    }

    if (resolution.profile) {
      const { data: profile, error: profileError } = await supabase
        .from('candidate_profiles')
        .select('id, revision')
        .eq('id', suggestion.profile_id)
        .eq('user_id', session.user.id)
        .single<CvProfileEditRow>();

      if (profileError || !profile) {
        return fail(404, { cvError: 'Profil CV introuvable.' });
      }

      const { error: profileUpdateError } = await supabase
        .from('candidate_profiles')
        .update({
          ...resolution.profile,
          revision: profile.revision + 1,
          updated_at: resolvedAt,
        })
        .eq('id', profile.id)
        .eq('user_id', session.user.id)
        .eq('revision', profile.revision)
        .select('id')
        .single<{ id: string }>();

      if (profileUpdateError) {
        if (profileUpdateError.code !== 'PGRST116') {
          return fail(500, { cvError: "La suggestion n'a pas pu être appliquée." });
        }

        return fail(409, {
          cvError: "Le profil CV a changé depuis l'ouverture de la page. Rechargez avant d'éditer.",
        });
      }
    }

    const { error: suggestionUpdateError } = await supabase
      .from('candidate_profile_field_suggestions')
      .update(resolution.suggestion)
      .eq('id', suggestion.id)
      .eq('user_id', session.user.id)
      .eq('status', 'pending')
      .select('id')
      .single<{ id: string }>();

    if (suggestionUpdateError) {
      return fail(500, { cvError: "La suggestion n'a pas pu être marquée comme traitée." });
    }

    const { error: conflictUpdateError } = await supabase
      .from('sync_conflicts')
      .update(buildSyncConflictResolutionPatch(resolution.suggestion.status, resolvedAt))
      .eq('user_id', session.user.id)
      .eq('entity', 'candidate_profile')
      .eq('entity_id', suggestion.profile_id)
      .eq('field', suggestion.field)
      .eq('status', 'pending');

    if (conflictUpdateError) {
      return fail(500, { cvError: "Le conflit de synchronisation n'a pas pu être traité." });
    }

    return {
      cvSuccess:
        resolution.suggestion.status === 'applied'
          ? 'Suggestion CV appliquée.'
          : 'Suggestion CV ignorée.',
    };
  },

  deleteConnectedData: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { privacyError: 'Configuration Supabase absente.' });
    }

    const supabase = createSupabaseServerClient(cookies);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return fail(401, { privacyError: 'Session requise.' });
    }

    const formData = await request.formData();
    const confirmation = formData.get('confirmation');

    if (typeof confirmation !== 'string' || !buildConnectedDataDeletionRequest(confirmation)) {
      return fail(400, { privacyError: 'Confirmation invalide.' });
    }

    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('candidate_profiles')
        .select('id')
        .eq('user_id', session.user.id)
        .returns<CandidateProfileIdentityRow[]>();

      if (profilesError) {
        throw new Error(profilesError.message);
      }

      const profileIds = (profiles ?? []).map((profile) => profile.id);

      await Promise.all([
        deleteProfileChildRows(supabase, 'candidate_experiences', profileIds),
        deleteProfileChildRows(supabase, 'candidate_education', profileIds),
        deleteProfileChildRows(supabase, 'candidate_skills', profileIds),
        deleteProfileChildRows(supabase, 'candidate_links', profileIds),
      ]);

      await deleteRowsByUserId(supabase, 'generated_application_assets', session.user.id);
      await deleteRowsByUserId(supabase, 'application_pipeline_events', session.user.id);
      await deleteRowsByUserId(supabase, 'applications', session.user.id);
      await deleteRowsByUserId(supabase, 'mission_duplicates', session.user.id);
      await deleteRowsByUserId(supabase, 'missions', session.user.id);
      await deleteRowsByUserId(supabase, 'candidate_profile_field_suggestions', session.user.id);
      await deleteRowsByUserId(supabase, 'candidate_profiles', session.user.id);
      await deleteRowsByUserId(supabase, 'profile_imports', session.user.id);
      await deleteRowsByUserId(supabase, 'connector_health_events', session.user.id);
      await deleteRowsByUserId(supabase, 'sync_conflicts', session.user.id);
      await deleteRowsByUserId(supabase, 'sync_status', session.user.id);
      await deleteRowsByUserId(supabase, 'extension_devices', session.user.id);
      await deleteRowsByUserId(supabase, 'favorite_missions', session.user.id);
    } catch {
      return fail(500, { privacyError: "Les données connectées n'ont pas pu être supprimées." });
    }

    return { privacySuccess: 'Données connectées supprimées.' };
  },

  updateCvProfile: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { cvError: 'Configuration Supabase absente.' });
    }

    const supabase = createSupabaseServerClient(cookies);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return fail(401, { cvError: 'Session requise.' });
    }

    const formData = await request.formData();
    const title = formData.get('title');
    const summary = formData.get('summary');
    const targetRole = formData.get('targetRole');

    if (
      typeof title !== 'string' ||
      typeof summary !== 'string' ||
      typeof targetRole !== 'string'
    ) {
      return fail(400, { cvError: 'Profil CV invalide.' });
    }

    const patch = buildCvProfileUpdatePatch(title, summary, targetRole);
    if (!patch) {
      return fail(400, {
        cvError: 'Titre requis. Résumé et rôle cible trop longs refusés.',
      });
    }

    const updatedAt = new Date().toISOString();
    const { data: currentProfile, error: readError } = await supabase
      .from('candidate_profiles')
      .select('id, revision')
      .eq('user_id', session.user.id)
      .maybeSingle<CvProfileEditRow>();

    if (readError) {
      return fail(500, { cvError: "Le profil CV n'a pas pu être lu." });
    }

    if (!currentProfile) {
      const { error: insertError } = await supabase
        .from('candidate_profiles')
        .insert({
          user_id: session.user.id,
          ...patch,
          completeness: 20,
          revision: 1,
          updated_by: 'dashboard',
          updated_at: updatedAt,
        })
        .select('id')
        .single<{ id: string }>();

      if (insertError) {
        return fail(500, { cvError: "Le profil CV n'a pas pu être créé." });
      }

      return { cvSuccess: 'Profil CV créé.' };
    }

    const { error: updateError } = await supabase
      .from('candidate_profiles')
      .update({
        ...patch,
        revision: currentProfile.revision + 1,
        updated_by: 'dashboard',
        updated_at: updatedAt,
      })
      .eq('id', currentProfile.id)
      .eq('user_id', session.user.id)
      .eq('revision', currentProfile.revision)
      .select('id')
      .single<{ id: string }>();

    if (updateError) {
      if (updateError.code !== 'PGRST116') {
        return fail(500, { cvError: "Le profil CV n'a pas pu être enregistré." });
      }

      return fail(409, {
        cvError: "Le profil CV a changé depuis l'ouverture de la page. Rechargez avant d'éditer.",
      });
    }

    return { cvSuccess: 'Profil CV enregistré.' };
  },

  updateApplicationDetails: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { detailsError: 'Configuration Supabase absente.' });
    }

    const supabase = createSupabaseServerClient(cookies);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return fail(401, { detailsError: 'Session requise.' });
    }

    const formData = await request.formData();
    const applicationId = formData.get('applicationId');
    const notes = formData.get('notes');
    const userRating = formData.get('userRating');
    const nextActionDate = formData.get('nextActionDate');

    if (
      typeof applicationId !== 'string' ||
      typeof notes !== 'string' ||
      typeof userRating !== 'string' ||
      typeof nextActionDate !== 'string'
    ) {
      return fail(400, { detailsError: 'Détails de candidature invalides.' });
    }

    const parsedRating = userRating === '' ? null : Number(userRating);
    const patch = buildApplicationDetailsUpdatePatch(
      notes,
      parsedRating,
      nextActionDate === '' ? null : nextActionDate
    );

    if (!patch) {
      return fail(400, { detailsError: 'Note, rating ou relance invalide.' });
    }

    const { data: application, error: readError } = await supabase
      .from('applications')
      .select('id, revision')
      .eq('id', applicationId)
      .eq('user_id', session.user.id)
      .single<ApplicationDetailsRow>();

    if (readError || !application) {
      return fail(404, { detailsError: 'Candidature introuvable.' });
    }

    const { error: updateError } = await supabase
      .from('applications')
      .update({
        ...patch,
        revision: application.revision + 1,
      })
      .eq('id', applicationId)
      .eq('user_id', session.user.id)
      .eq('revision', application.revision)
      .select('id')
      .single<{ id: string }>();

    if (updateError) {
      if (updateError.code !== 'PGRST116') {
        return fail(500, { detailsError: "Les détails n'ont pas pu être enregistrés." });
      }

      return fail(409, {
        detailsError:
          "La candidature a changé depuis l'ouverture de la page. Rechargez avant d'enregistrer.",
      });
    }

    return { detailsSuccess: 'Détails de candidature enregistrés.' };
  },

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

  archiveMission: async ({ cookies, request }) => {
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

    const occurredAt = new Date();
    const patch = buildMissionArchiveInsertPatch(occurredAt.toISOString());
    const { data: application, error: insertError } = await supabase
      .from('applications')
      .insert({
        user_id: session.user.id,
        mission_id: missionId,
        stage: patch.stage,
        notes: patch.notes,
        revision: patch.revision,
        updated_by: patch.updated_by,
        archived_at: patch.archived_at,
      })
      .select('id')
      .single<{ id: string }>();

    if (insertError || !application) {
      return fail(500, { selectionError: "La mission n'a pas pu être archivée." });
    }

    const event = transitionApplicationStage({
      applicationId: application.id,
      fromStage: 'detected',
      toStage: 'archived',
      occurredAt,
      createdBy: 'dashboard',
      clientEventId: `dashboard:archive:${application.id}:${occurredAt.getTime()}:${crypto.randomUUID()}`,
      note: 'Mission archivée depuis le feed dashboard.',
    });

    if (!event) {
      return fail(500, { selectionError: "Transition d'archivage invalide." });
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
          "La mission est archivée, mais l'événement pipeline n'a pas pu être enregistré.",
      });
    }

    return { selectionSuccess: `Mission archivée: ${mission.title}.` };
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
