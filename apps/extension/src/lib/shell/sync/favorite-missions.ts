import { buildFavoriteMissionSnapshot } from '../../core/sync/favorite-mission';
import { getSupabaseClient } from '../auth/supabase-client';
import { getMissionById } from '../storage/db';

export type FavoriteMissionSyncResult =
  | { synced: true; missionId: string }
  | {
      synced: false;
      missionId: string;
      reason: 'unauthenticated' | 'mission-not-found' | 'remote-error';
    };

export async function syncFavoriteMissionChange(
  missionId: string,
  favoritedAt: number | null
): Promise<FavoriteMissionSyncResult> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return { synced: false, missionId, reason: 'unauthenticated' };
  }

  if (favoritedAt === null) {
    const { error } = await supabase
      .from('favorite_missions')
      .delete()
      .eq('user_id', session.user.id)
      .eq('mission_id', missionId);

    return error
      ? { synced: false, missionId, reason: 'remote-error' }
      : { synced: true, missionId };
  }

  const mission = await getMissionById(missionId);
  if (!mission) {
    return { synced: false, missionId, reason: 'mission-not-found' };
  }

  const favoritedDate = new Date(favoritedAt);
  const snapshot = buildFavoriteMissionSnapshot(mission, favoritedDate);
  const now = new Date().toISOString();

  const { error } = await supabase.from('favorite_missions').upsert(
    {
      user_id: session.user.id,
      mission_id: missionId,
      mission: snapshot,
      favorited_at: snapshot.favoritedAt,
      updated_at: now,
    },
    { onConflict: 'user_id,mission_id' }
  );

  return error ? { synced: false, missionId, reason: 'remote-error' } : { synced: true, missionId };
}
