import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import { getConnector } from '../connectors/index';
import { getSettings } from '../storage/chrome-storage';
import { getProfile, saveMissions } from '../storage/db';
import { deduplicateMissions } from '../../core/scoring/dedup';
import { scoreMission } from '../../core/scoring/relevance';

export interface ScanResult {
  missions: Mission[];
  errors: { connectorId: string; message: string }[];
}

export async function runScan(): Promise<ScanResult> {
  const settings = await getSettings();
  const enabledIds = settings.enabledConnectors;
  const errors: ScanResult['errors'] = [];

  if (enabledIds.length === 0) {
    return { missions: [], errors: [{ connectorId: '*', message: 'Aucun connecteur actif' }] };
  }

  // Resolve connectors, collect unknown IDs as errors
  const connectors = enabledIds.map(id => {
    const connector = getConnector(id);
    if (!connector) errors.push({ connectorId: id, message: 'Connecteur introuvable' });
    return connector;
  }).filter((c): c is NonNullable<typeof c> => c != null);

  // Fetch all connectors in parallel
  const results = await Promise.allSettled(
    connectors.map(async connector => {
      try {
        const missions = await connector.fetchMissions();
        return { connectorId: connector.id, missions };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inconnue';
        errors.push({ connectorId: connector.id, message });
        return { connectorId: connector.id, missions: [] as Mission[] };
      }
    })
  );

  const allMissions: Mission[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allMissions.push(...result.value.missions);
    }
  }

  // Deduplicate
  const deduped = deduplicateMissions(allMissions);

  // Score against profile
  let profile: UserProfile | null = null;
  try {
    profile = await getProfile();
  } catch {
    // No profile available
  }

  const scored = profile
    ? deduped.map(m => ({ ...m, score: scoreMission(m, profile!) }))
    : deduped;

  // Persist
  if (scored.length > 0) {
    try {
      await saveMissions(scored);
    } catch {
      // Storage not available
    }
  }

  return { missions: scored, errors };
}
