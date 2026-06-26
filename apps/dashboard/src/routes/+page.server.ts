import { env } from '$env/dynamic/public';
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
  APPLICATION_STAGES,
  transitionApplicationStage,
  type ApplicationPipelineEvent,
  type ApplicationStage,
} from '@pulse/domain';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  buildDashboardAlertPreferencesPatch,
  buildApplicationDetailsUpdatePatch,
  buildApplicationStageUpdatePatch,
  buildApplicationSyncConflictResolution,
  buildDashboardPipelineClientEventId,
  buildConnectedDataDeletionRequest,
  buildCvFieldSuggestionResolution,
  buildEmptyCvSnapshot,
  buildCvProfileUpdatePatch,
  buildMissionArchiveInsertPatch,
  buildMissionSelectionInsertPatch,
  buildSyncConflictResolutionPatch,
  buildTjmRadarSnapshot,
  canonicalRowsToApplications,
  dashboardAlertPreferencesRowToSnapshot,
  favoriteMissionToApplication,
  generatedAssetRowsToHistory,
  getDashboardFeatureAccess,
  healthEventsToPlatformSyncStatuses,
  mergeApplicationCompatibilityFallbacks,
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
  type DashboardAlertPreferencesRow,
  type DashboardSubscriptionStatus,
  type MissionApplication,
} from '$lib/core/dashboard';
import { markEntityPendingExtensionPull } from '$lib/server/sync-status';
import { upsertDashboardPipelineEvent } from '$lib/server/pipeline-events';

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

type ApplicationConflictUpdatePayload = {
  revision: number;
  updated_by: 'dashboard';
  updated_at: string;
  stage?: ApplicationStage;
  applied_at?: string | null;
  archived_at?: string | null;
  notes?: string;
  user_rating?: number | null;
  next_action_at?: string | null;
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
  revision: number;
};

type MissionSelectionRow = {
  id: string;
  title: string;
};

type ExistingApplicationSelectionRow = {
  id: string;
  stage: string;
  revision: number;
};

type CandidateProfileIdentityRow = {
  id: string;
};

type SyncConflictIdentityRow = {
  id: string;
};

type SyncConflictResolutionRow = {
  id: string;
  entity: string;
  entity_id: string;
  field: string;
  local_value: string | null;
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

const isCvSuggestionResolutionAction = (value: unknown): value is 'apply' | 'dismiss' =>
  value === 'apply' || value === 'dismiss';

const isManualSyncConflictResolutionAction = (
  value: unknown
): value is 'resolved' | 'keep_remote' | 'apply_local' | 'dismissed' =>
  value === 'resolved' ||
  value === 'keep_remote' ||
  value === 'apply_local' ||
  value === 'dismissed';

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

    const syncStatuses = healthEventsToPlatformSyncStatuses([]);

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
      syncStatuses,
      connectedSyncStatuses: [],
      syncConflicts: [],
      alertPreferences: dashboardAlertPreferencesRowToSnapshot(null, new Date().toISOString()),
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
              'mission_id, deterministic_score, semantic_score, total_score, grade, criteria, semantic_reason'
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

  const { data: connectorHealthRows } = await supabase
    .from('connector_health_events')
    .select(
      'source, status, error_code, error_message, occurred_at, revision, updated_by, updated_at'
    )
    .eq('user_id', session.user.id)
    .order('occurred_at', { ascending: false })
    .limit(50)
    .returns<DashboardConnectorHealthEventRow[]>();

  const syncStatuses = healthEventsToPlatformSyncStatuses(connectorHealthRows ?? []);

  const missionFeed = missionRowsToFeedItems(
    missionFeedRows ?? [],
    new Map((missionFeedScoreRows ?? []).map((row) => [row.mission_id, row])),
    new Map((missionFeedApplicationRows ?? []).map((row) => [row.mission_id, row])),
    missionDuplicateRows ?? [],
    new Date(),
    new Map(syncStatuses.map((status) => [status.id, status]))
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
          .select(
            'id, application_id, from_stage, to_stage, note, occurred_at, created_by, revision, updated_by, updated_at'
          )
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
    .select(
      'id, title, summary, updated_at, completeness, target_role, location, tjm_min, tjm_max, remote_preference, seniority'
    )
    .eq('user_id', session.user.id)
    .maybeSingle<DashboardCandidateProfileRow>();

  const { data: profileImports } = await supabase
    .from('profile_imports')
    .select(
      'id, source, status, imported_at, extractor_version, error_code, error_message, field_counts, revision, updated_by, updated_at'
    )
    .eq('user_id', session.user.id)
    .order('imported_at', { ascending: false })
    .limit(5)
    .returns<DashboardProfileImportRow[]>();

  const [
    { data: candidateSkills },
    { data: candidateExperiences },
    { data: candidateEducation },
    { data: candidateLinks },
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
          .from('candidate_profile_field_suggestions')
          .select(
            'id, field, current_value, suggested_value, source, status, revision, updated_by, created_at, updated_at'
          )
          .eq('user_id', session.user.id)
          .eq('profile_id', candidateProfile.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10)
          .returns<DashboardCandidateProfileFieldSuggestionRow[]>(),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

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
      'id, device_id, entity, entity_id, field, local_value, remote_value, local_updated_by, remote_updated_by, status, detected_at, revision'
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

  const { data: alertPreferencesRow } = await supabase
    .from('dashboard_alert_preferences')
    .select(
      'enabled, score_threshold, min_daily_rate, required_stacks, max_results, revision, updated_by, updated_at'
    )
    .eq('user_id', session.user.id)
    .maybeSingle<DashboardAlertPreferencesRow>();

  return {
    session,
    loginUrl,
    configurationMissing: false,
    entitlements,
    featureAccess: getDashboardFeatureAccess(entitlements, new Date()),
    missionFeed,
    tjmRadar,
    applications: mergeApplicationCompatibilityFallbacks(canonicalApplications, syncedApplications),
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
      : buildEmptyCvSnapshot({
          updatedAt: new Date().toISOString(),
          imports: profileImports ?? [],
        }),
    syncStatuses,
    connectedSyncStatuses,
    syncConflicts,
    alertPreferences: dashboardAlertPreferencesRowToSnapshot(
      alertPreferencesRow ?? null,
      new Date().toISOString()
    ),
  };
};

export const actions: Actions = {
  updateAlertPreferences: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { alertError: 'Dashboard connecté indisponible pour le moment.' });
    }

    const supabase = createSupabaseServerClient(cookies);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return fail(401, { alertError: 'Session requise.' });
    }

    const formData = await request.formData();
    const scoreThreshold = Number(formData.get('scoreThreshold'));
    const minDailyRate = Number(formData.get('minDailyRate'));
    const requiredStacksText = formData.get('requiredStacks');
    const maxResults = Number(formData.get('maxResults'));
    const enabled = formData.get('enabled') === 'on';

    if (typeof requiredStacksText !== 'string') {
      return fail(400, { alertError: "Préférences d'alertes invalides." });
    }

    const { data: existingPreferences, error: existingPreferencesError } = await supabase
      .from('dashboard_alert_preferences')
      .select('revision')
      .eq('user_id', session.user.id)
      .maybeSingle<{ revision: number }>();

    if (existingPreferencesError) {
      return fail(500, { alertError: "Les préférences d'alertes n'ont pas pu être chargées." });
    }

    const patch = buildDashboardAlertPreferencesPatch({
      enabled,
      scoreThreshold,
      minDailyRate,
      requiredStacksText,
      maxResults,
      currentRevision: existingPreferences?.revision ?? null,
    });

    if (!patch) {
      return fail(400, {
        alertError: 'Seuil, TJM ou nombre de résultats hors limites.',
      });
    }

    const updatedAt = new Date().toISOString();
    const { error } = await supabase.from('dashboard_alert_preferences').upsert(
      {
        user_id: session.user.id,
        ...patch,
        updated_by: 'dashboard',
        updated_at: updatedAt,
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      return fail(500, { alertError: "Les préférences d'alertes n'ont pas pu être enregistrées." });
    }

    await markEntityPendingExtensionPull(supabase, session.user.id, 'alert_preferences', updatedAt);

    return { alertSuccess: "Préférences d'alertes enregistrées." };
  },

  resolveCvSuggestion: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { cvError: 'Dashboard connecté indisponible pour le moment.' });
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
      .select('id, profile_id, field, suggested_value, revision')
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
      revision: suggestion.revision,
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
      .eq('revision', suggestion.revision)
      .select('id')
      .single<{ id: string }>();

    if (suggestionUpdateError) {
      return fail(500, { cvError: "La suggestion n'a pas pu être marquée comme traitée." });
    }

    const { data: pendingConflict, error: conflictReadError } = await supabase
      .from('sync_conflicts')
      .select('id, revision')
      .eq('user_id', session.user.id)
      .eq('entity', 'candidate_profile')
      .eq('entity_id', suggestion.profile_id)
      .eq('field', suggestion.field)
      .eq('status', 'pending')
      .maybeSingle<{ id: string; revision: number }>();

    if (conflictReadError) {
      return fail(500, { cvError: "Le conflit de synchronisation n'a pas pu être lu." });
    }

    if (pendingConflict) {
      const { error: conflictUpdateError } = await supabase
        .from('sync_conflicts')
        .update(
          buildSyncConflictResolutionPatch(
            resolution.suggestion.status,
            resolvedAt,
            pendingConflict.revision
          )
        )
        .eq('id', pendingConflict.id)
        .eq('user_id', session.user.id)
        .eq('status', 'pending')
        .eq('revision', pendingConflict.revision)
        .select('id')
        .single<{ id: string }>();

      if (conflictUpdateError) {
        return fail(500, { cvError: "Le conflit de synchronisation n'a pas pu être traité." });
      }
    }

    if (resolution.profile) {
      await markEntityPendingExtensionPull(
        supabase,
        session.user.id,
        'candidate_profile',
        resolvedAt
      );
    }

    return {
      cvSuccess:
        resolution.suggestion.status === 'applied'
          ? 'Suggestion CV appliquée.'
          : 'Suggestion CV ignorée.',
    };
  },

  resolveSyncConflict: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { syncConflictError: 'Dashboard connecté indisponible pour le moment.' });
    }

    const supabase = createSupabaseServerClient(cookies);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return fail(401, { syncConflictError: 'Session requise.' });
    }

    const formData = await request.formData();
    const conflictId = formData.get('conflictId');
    const resolutionAction = formData.get('resolutionAction');

    if (typeof conflictId !== 'string' || !isManualSyncConflictResolutionAction(resolutionAction)) {
      return fail(400, { syncConflictError: 'Résolution de conflit invalide.' });
    }

    const { data: conflict, error: readError } = await supabase
      .from('sync_conflicts')
      .select('id, entity, entity_id, field, local_value, revision')
      .eq('id', conflictId)
      .eq('user_id', session.user.id)
      .eq('status', 'pending')
      .single<SyncConflictResolutionRow>();

    if (readError || !conflict) {
      return fail(404, { syncConflictError: 'Conflit de synchronisation introuvable.' });
    }

    const resolvedAt = new Date().toISOString();
    const resolution =
      conflict.entity === 'applications'
        ? buildApplicationSyncConflictResolution({
            field: conflict.field,
            localValue: conflict.local_value,
            action: resolutionAction,
            resolvedAt,
            currentRevision: conflict.revision,
          })
        : {
            conflict: buildSyncConflictResolutionPatch(
              resolutionAction,
              resolvedAt,
              conflict.revision
            ),
            application: null,
            stageTransition: null,
          };

    if (!resolution || (conflict.entity !== 'applications' && resolutionAction === 'apply_local')) {
      return fail(400, { syncConflictError: 'Résolution incompatible avec ce conflit.' });
    }

    if (resolution.application) {
      const { data: application, error: applicationReadError } = await supabase
        .from('applications')
        .select('id, stage, revision')
        .eq('id', conflict.entity_id)
        .eq('user_id', session.user.id)
        .single<ApplicationTransitionRow>();

      if (applicationReadError || !application || !isApplicationStage(application.stage)) {
        return fail(404, { syncConflictError: 'Candidature liée au conflit introuvable.' });
      }

      let pipelineEvent: ApplicationPipelineEvent | null = null;
      let pipelineEventMetadata: Record<string, string> | null = null;

      if (resolution.stageTransition && resolution.stageTransition !== application.stage) {
        const occurredAt = new Date(resolvedAt);
        const event = transitionApplicationStage({
          applicationId: application.id,
          fromStage: application.stage,
          toStage: resolution.stageTransition,
          occurredAt,
          createdBy: 'dashboard',
          clientEventId: buildDashboardPipelineClientEventId({
            action: 'conflict',
            applicationId: application.id,
            revision: application.revision,
            fromStage: application.stage,
            toStage: resolution.stageTransition,
          }),
          note: 'Conflit de synchronisation résolu depuis le dashboard.',
        });

        if (!event) {
          return fail(400, {
            syncConflictError:
              'La valeur extension ne respecte pas la progression canonique du pipeline.',
          });
        }

        pipelineEvent = event;
        pipelineEventMetadata = {
          source: 'sync_conflict',
          conflict_id: conflict.id,
        };
      }

      const updatePayload: ApplicationConflictUpdatePayload = {
        revision: application.revision + 1,
        updated_by: 'dashboard',
        updated_at: resolvedAt,
      };

      if ('stage' in resolution.application) {
        updatePayload.stage = resolution.application.stage;
        if (resolution.application.applied_at !== undefined) {
          updatePayload.applied_at = resolution.application.applied_at;
        }
        if (resolution.application.archived_at !== undefined) {
          updatePayload.archived_at = resolution.application.archived_at;
        }
      } else if ('notes' in resolution.application) {
        updatePayload.notes = resolution.application.notes;
      } else if ('user_rating' in resolution.application) {
        updatePayload.user_rating = resolution.application.user_rating;
      } else {
        updatePayload.next_action_at = resolution.application.next_action_at;
      }

      const { error: applicationUpdateError } = await supabase
        .from('applications')
        .update(updatePayload)
        .eq('id', application.id)
        .eq('user_id', session.user.id)
        .eq('revision', application.revision)
        .select('id')
        .single<{ id: string }>();

      if (applicationUpdateError) {
        if (applicationUpdateError.code !== 'PGRST116') {
          return fail(500, {
            syncConflictError: "La valeur du conflit n'a pas pu être appliquée.",
          });
        }

        return fail(409, {
          syncConflictError:
            "La candidature a changé depuis l'ouverture de la page. Rechargez avant de résoudre.",
        });
      }

      if (pipelineEvent && pipelineEventMetadata) {
        const eventInserted = await upsertDashboardPipelineEvent(
          supabase,
          session.user.id,
          pipelineEvent,
          pipelineEventMetadata
        );

        if (!eventInserted) {
          return fail(500, {
            syncConflictError: "L'événement pipeline du conflit n'a pas pu être enregistré.",
          });
        }
      }
    }

    const { error: updateError } = await supabase
      .from('sync_conflicts')
      .update(resolution.conflict)
      .eq('id', conflict.id)
      .eq('user_id', session.user.id)
      .eq('status', 'pending')
      .eq('revision', conflict.revision)
      .select('id')
      .single<SyncConflictIdentityRow>();

    if (updateError) {
      return fail(500, { syncConflictError: "Le conflit n'a pas pu être traité." });
    }

    if (conflict.entity === 'applications') {
      await markEntityPendingExtensionPull(supabase, session.user.id, 'applications', resolvedAt);
    }

    return {
      syncConflictSuccess:
        resolutionAction === 'apply_local'
          ? 'Valeur extension appliquée.'
          : resolutionAction === 'dismissed'
            ? 'Conflit ignoré.'
            : 'Valeur dashboard conservée.',
    };
  },

  deleteConnectedData: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { privacyError: 'Dashboard connecté indisponible pour le moment.' });
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
      await deleteRowsByUserId(supabase, 'dashboard_alert_preferences', session.user.id);
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
      return fail(503, { cvError: 'Dashboard connecté indisponible pour le moment.' });
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
    const location = formData.get('location');
    const tjmMin = formData.get('tjmMin');
    const tjmMax = formData.get('tjmMax');
    const remotePreference = formData.get('remotePreference');
    const seniority = formData.get('seniority');

    if (
      typeof title !== 'string' ||
      typeof summary !== 'string' ||
      typeof targetRole !== 'string' ||
      typeof location !== 'string' ||
      typeof tjmMin !== 'string' ||
      typeof tjmMax !== 'string' ||
      typeof remotePreference !== 'string' ||
      typeof seniority !== 'string'
    ) {
      return fail(400, { cvError: 'Profil CV invalide.' });
    }

    const patch = buildCvProfileUpdatePatch(
      title,
      summary,
      targetRole,
      location,
      tjmMin,
      tjmMax,
      remotePreference,
      seniority
    );
    if (!patch) {
      return fail(400, {
        cvError: 'Profil CV invalide: titre, TJM, localisation ou préférences hors limites.',
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

      await markEntityPendingExtensionPull(
        supabase,
        session.user.id,
        'candidate_profile',
        updatedAt
      );

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

    await markEntityPendingExtensionPull(supabase, session.user.id, 'candidate_profile', updatedAt);

    return { cvSuccess: 'Profil CV enregistré.' };
  },

  updateApplicationDetails: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { detailsError: 'Dashboard connecté indisponible pour le moment.' });
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

    const updatedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        ...patch,
        revision: application.revision + 1,
        updated_at: updatedAt,
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

    await markEntityPendingExtensionPull(supabase, session.user.id, 'applications', updatedAt);

    return { detailsSuccess: 'Détails de candidature enregistrés.' };
  },

  selectMission: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { selectionError: 'Dashboard connecté indisponible pour le moment.' });
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
      .select('id, stage, revision')
      .eq('mission_id', missionId)
      .eq('user_id', session.user.id)
      .maybeSingle<ExistingApplicationSelectionRow>();

    if (existingApplication) {
      if (existingApplication.stage === 'detected') {
        const occurredAt = new Date();
        const event = transitionApplicationStage({
          applicationId: existingApplication.id,
          fromStage: 'detected',
          toStage: 'selected',
          occurredAt,
          createdBy: 'dashboard',
          clientEventId: buildDashboardPipelineClientEventId({
            action: 'select',
            applicationId: existingApplication.id,
            revision: existingApplication.revision,
            fromStage: 'detected',
            toStage: 'selected',
          }),
          note: 'Mission sélectionnée depuis le feed dashboard.',
        });

        if (!event) {
          return fail(500, { selectionError: 'Transition de sélection invalide.' });
        }

        const patch = buildApplicationStageUpdatePatch('selected', event.occurredAt);
        const { error: updateError } = await supabase
          .from('applications')
          .update({
            stage: patch.stage,
            archived_at: patch.archived_at,
            revision: existingApplication.revision + 1,
            updated_by: patch.updated_by,
            updated_at: event.occurredAt,
          })
          .eq('id', existingApplication.id)
          .eq('user_id', session.user.id)
          .eq('revision', existingApplication.revision)
          .select('id')
          .single<{ id: string }>();

        if (updateError) {
          if (updateError.code !== 'PGRST116') {
            return fail(500, { selectionError: "La mission n'a pas pu être sélectionnée." });
          }

          return fail(409, {
            selectionError:
              "La candidature a changé depuis l'ouverture de la page. Rechargez avant de sélectionner.",
          });
        }

        const eventInserted = await upsertDashboardPipelineEvent(supabase, session.user.id, event, {
          source: 'dashboard_feed',
          mission_id: missionId,
        });

        if (!eventInserted) {
          return fail(500, {
            selectionError:
              "La mission est sélectionnée, mais l'événement pipeline n'a pas pu être enregistré.",
          });
        }

        await markEntityPendingExtensionPull(
          supabase,
          session.user.id,
          'applications',
          event.occurredAt
        );

        return { selectionSuccess: `Mission sélectionnée: ${mission.title}.` };
      }

      return {
        selectionSuccess: `Mission déjà suivie en ${existingApplication.stage}.`,
      };
    }

    const occurredAt = new Date();
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
        updated_at: occurredAt.toISOString(),
      })
      .select('id')
      .single<{ id: string }>();

    if (insertError || !application) {
      return fail(500, { selectionError: "La mission n'a pas pu être sélectionnée." });
    }

    const detectedAt = new Date(occurredAt.getTime() - 1);
    const detectedEvent = transitionApplicationStage({
      applicationId: application.id,
      fromStage: null,
      toStage: 'detected',
      occurredAt: detectedAt,
      createdBy: 'dashboard',
      clientEventId: buildDashboardPipelineClientEventId({
        action: 'detect',
        applicationId: application.id,
        revision: patch.revision,
        fromStage: null,
        toStage: 'detected',
      }),
      note: 'Mission détectée depuis le feed dashboard.',
    });
    const event = transitionApplicationStage({
      applicationId: application.id,
      fromStage: 'detected',
      toStage: 'selected',
      occurredAt,
      createdBy: 'dashboard',
      clientEventId: buildDashboardPipelineClientEventId({
        action: 'select',
        applicationId: application.id,
        revision: patch.revision,
        fromStage: 'detected',
        toStage: 'selected',
      }),
      note: 'Mission sélectionnée depuis le feed dashboard.',
    });

    if (!event) {
      return fail(500, { selectionError: 'Transition de sélection invalide.' });
    }

    if (!detectedEvent) {
      return fail(500, { selectionError: 'Transition de détection invalide.' });
    }

    const detectedEventInserted = await upsertDashboardPipelineEvent(
      supabase,
      session.user.id,
      detectedEvent,
      {
        source: 'dashboard_feed',
        mission_id: missionId,
      }
    );
    const eventInserted = await upsertDashboardPipelineEvent(supabase, session.user.id, event, {
      source: 'dashboard_feed',
      mission_id: missionId,
    });

    if (!detectedEventInserted || !eventInserted) {
      return fail(500, {
        selectionError:
          "La mission est sélectionnée, mais l'événement pipeline n'a pas pu être enregistré.",
      });
    }

    await markEntityPendingExtensionPull(
      supabase,
      session.user.id,
      'applications',
      event.occurredAt
    );

    return { selectionSuccess: `Mission sélectionnée: ${mission.title}.` };
  },

  archiveMission: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { selectionError: 'Dashboard connecté indisponible pour le moment.' });
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
      .select('id, stage, revision')
      .eq('mission_id', missionId)
      .eq('user_id', session.user.id)
      .maybeSingle<ExistingApplicationSelectionRow>();

    if (existingApplication) {
      if (existingApplication.stage === 'detected') {
        const occurredAt = new Date();
        const event = transitionApplicationStage({
          applicationId: existingApplication.id,
          fromStage: 'detected',
          toStage: 'archived',
          occurredAt,
          createdBy: 'dashboard',
          clientEventId: buildDashboardPipelineClientEventId({
            action: 'archive',
            applicationId: existingApplication.id,
            revision: existingApplication.revision,
            fromStage: 'detected',
            toStage: 'archived',
          }),
          note: 'Mission archivée depuis le feed dashboard.',
        });

        if (!event) {
          return fail(500, { selectionError: "Transition d'archivage invalide." });
        }

        const patch = buildApplicationStageUpdatePatch('archived', event.occurredAt);
        const { error: updateError } = await supabase
          .from('applications')
          .update({
            stage: patch.stage,
            archived_at: patch.archived_at,
            revision: existingApplication.revision + 1,
            updated_by: patch.updated_by,
            updated_at: event.occurredAt,
          })
          .eq('id', existingApplication.id)
          .eq('user_id', session.user.id)
          .eq('revision', existingApplication.revision)
          .select('id')
          .single<{ id: string }>();

        if (updateError) {
          if (updateError.code !== 'PGRST116') {
            return fail(500, { selectionError: "La mission n'a pas pu être archivée." });
          }

          return fail(409, {
            selectionError:
              "La candidature a changé depuis l'ouverture de la page. Rechargez avant d'archiver.",
          });
        }

        const eventInserted = await upsertDashboardPipelineEvent(supabase, session.user.id, event, {
          source: 'dashboard_feed',
          mission_id: missionId,
        });

        if (!eventInserted) {
          return fail(500, {
            selectionError:
              "La mission est archivée, mais l'événement pipeline n'a pas pu être enregistré.",
          });
        }

        await markEntityPendingExtensionPull(
          supabase,
          session.user.id,
          'applications',
          event.occurredAt
        );

        return { selectionSuccess: `Mission archivée: ${mission.title}.` };
      }

      return {
        selectionSuccess: `Mission déjà suivie en ${existingApplication.stage}.`,
      };
    }

    const occurredAt = new Date();
    const detectedAt = new Date(occurredAt.getTime() - 1);
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
        updated_at: occurredAt.toISOString(),
      })
      .select('id')
      .single<{ id: string }>();

    if (insertError || !application) {
      return fail(500, { selectionError: "La mission n'a pas pu être archivée." });
    }

    const event = transitionApplicationStage({
      applicationId: application.id,
      fromStage: null,
      toStage: 'detected',
      occurredAt: detectedAt,
      createdBy: 'dashboard',
      clientEventId: buildDashboardPipelineClientEventId({
        action: 'detect',
        applicationId: application.id,
        revision: patch.revision,
        fromStage: null,
        toStage: 'detected',
      }),
      note: 'Mission détectée depuis le feed dashboard.',
    });
    const archivedEvent = transitionApplicationStage({
      applicationId: application.id,
      fromStage: 'detected',
      toStage: 'archived',
      occurredAt,
      createdBy: 'dashboard',
      clientEventId: buildDashboardPipelineClientEventId({
        action: 'archive',
        applicationId: application.id,
        revision: patch.revision,
        fromStage: 'detected',
        toStage: 'archived',
      }),
      note: 'Mission archivée depuis le feed dashboard.',
    });

    if (!event || !archivedEvent) {
      return fail(500, { selectionError: "Transition d'archivage invalide." });
    }

    const eventInserted = await upsertDashboardPipelineEvent(supabase, session.user.id, event, {
      source: 'dashboard_feed',
      mission_id: missionId,
    });
    const archivedEventInserted = await upsertDashboardPipelineEvent(
      supabase,
      session.user.id,
      archivedEvent,
      {
        source: 'dashboard_feed',
        mission_id: missionId,
      }
    );

    if (!eventInserted || !archivedEventInserted) {
      return fail(500, {
        selectionError:
          "La mission est archivée, mais l'événement pipeline n'a pas pu être enregistré.",
      });
    }

    await markEntityPendingExtensionPull(
      supabase,
      session.user.id,
      'applications',
      archivedEvent.occurredAt
    );

    return { selectionSuccess: `Mission archivée: ${mission.title}.` };
  },

  transitionApplication: async ({ cookies, request }) => {
    const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
    if (!hasSupabaseConfig) {
      return fail(503, { transitionError: 'Dashboard connecté indisponible pour le moment.' });
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
      clientEventId: buildDashboardPipelineClientEventId({
        action: 'transition',
        applicationId,
        revision: application.revision,
        fromStage: application.stage,
        toStage,
      }),
    });

    if (!event) {
      return fail(400, { transitionError: 'Transition non autorisée.' });
    }

    const patch = buildApplicationStageUpdatePatch(toStage, event.occurredAt);
    const updatePayload: {
      stage: ApplicationStage;
      revision: number;
      updated_by: 'dashboard';
      updated_at: string;
      applied_at?: string | null;
      archived_at?: string | null;
    } = {
      stage: patch.stage,
      revision: application.revision + 1,
      updated_by: patch.updated_by,
      updated_at: event.occurredAt,
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

    const eventInserted = await upsertDashboardPipelineEvent(supabase, session.user.id, event, {
      source: 'dashboard',
    });

    if (!eventInserted) {
      return fail(500, { transitionError: "L'événement pipeline n'a pas pu être enregistré." });
    }

    await markEntityPendingExtensionPull(
      supabase,
      session.user.id,
      'applications',
      event.occurredAt
    );

    return { transitionSuccess: `Candidature passée en ${toStage}.` };
  },
};
