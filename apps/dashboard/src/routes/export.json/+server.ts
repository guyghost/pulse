import { json, type RequestHandler } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';

const USER_OWNED_TABLES = [
  'missions',
  'applications',
  'application_pipeline_events',
  'generated_application_assets',
  'mission_duplicates',
  'profile_imports',
  'connector_health_events',
  'extension_devices',
  'sync_status',
  'sync_conflicts',
  'favorite_missions',
  'candidate_profile_field_suggestions',
] as const;

const PROFILE_CHILD_TABLES = [
  'candidate_experiences',
  'candidate_education',
  'candidate_skills',
  'candidate_links',
] as const;

type UserOwnedTable = (typeof USER_OWNED_TABLES)[number];
type ProfileChildTable = (typeof PROFILE_CHILD_TABLES)[number];

type ConnectedExportPayload = {
  exportedAt: string;
  userId: string;
  tables: Record<UserOwnedTable | 'candidate_profiles' | ProfileChildTable, unknown[]>;
};

const readUserRows = async (
  supabase: ReturnType<typeof createSupabaseServerClient>,
  table: UserOwnedTable,
  userId: string
): Promise<unknown[]> => {
  const { data, error } = await supabase.from(table).select('*').eq('user_id', userId);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
};

const readProfileChildRows = async (
  supabase: ReturnType<typeof createSupabaseServerClient>,
  table: ProfileChildTable,
  profileIds: string[]
): Promise<unknown[]> => {
  if (profileIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase.from(table).select('*').in('profile_id', profileIds);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
};

export const GET: RequestHandler = async ({ cookies }) => {
  const supabase = createSupabaseServerClient(cookies);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return json({ error: 'Session requise.' }, { status: 401 });
  }

  try {
    const { data: profiles, error: profilesError } = await supabase
      .from('candidate_profiles')
      .select('*')
      .eq('user_id', session.user.id);

    if (profilesError) {
      throw new Error(profilesError.message);
    }

    const profileRows = profiles ?? [];
    const profileIds = profileRows
      .map((profile) =>
        typeof profile === 'object' && profile !== null && 'id' in profile ? profile.id : null
      )
      .filter((id): id is string => typeof id === 'string');

    const userTableRows = await Promise.all(
      USER_OWNED_TABLES.map(
        async (table) => [table, await readUserRows(supabase, table, session.user.id)] as const
      )
    );
    const profileChildRows = await Promise.all(
      PROFILE_CHILD_TABLES.map(
        async (table) => [table, await readProfileChildRows(supabase, table, profileIds)] as const
      )
    );

    const payload: ConnectedExportPayload = {
      exportedAt: new Date().toISOString(),
      userId: session.user.id,
      tables: {
        candidate_profiles: profileRows,
        ...Object.fromEntries(userTableRows),
        ...Object.fromEntries(profileChildRows),
      } as ConnectedExportPayload['tables'],
    };

    return json(payload, {
      headers: {
        'content-disposition': 'attachment; filename="missionpulse-connected-data.json"',
      },
    });
  } catch {
    return json({ error: "L'export des données connectées a échoué." }, { status: 500 });
  }
};
