import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import { getConnector } from '../connectors/index';
import { getSettings } from '../storage/chrome-storage';
import { getProfile, saveMissions } from '../storage/db';
import { deduplicateMissions } from '../../core/scoring/dedup';
import { scoreMission } from '../../core/scoring/relevance';
import { setScanState } from '../storage/session-storage';
import { scoreMissionsSemantic } from '../ai/semantic-scorer';

export interface ScanResult {
  missions: Mission[];
  errors: { connectorId: string; message: string }[];
}

export async function runScan(signal?: AbortSignal): Promise<ScanResult> {
  const settings = await getSettings();
  const enabledIds = settings.enabledConnectors;
  const errors: ScanResult['errors'] = [];
  try { await setScanState('scanning'); } catch {}

  if (enabledIds.length === 0) {
    try { await setScanState('idle'); } catch {}
    return { missions: [], errors: [{ connectorId: '*', message: 'Aucun connecteur actif' }] };
  }

  // Resolve connectors, collect unknown IDs as errors
  const connectors = enabledIds.map(id => {
    const connector = getConnector(id);
    if (!connector) errors.push({ connectorId: id, message: 'Connecteur introuvable' });
    return connector;
  }).filter((c): c is NonNullable<typeof c> => c != null);

  if (signal?.aborted) {
    try { await setScanState('idle'); } catch {}
    return { missions: [], errors };
  }

  // Fetch all connectors in parallel
  const results = await Promise.allSettled(
    connectors.map(async connector => {
      if (signal?.aborted) return { connectorId: connector.id, missions: [] as Mission[] };
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

  if (signal?.aborted) {
    try { await setScanState('idle'); } catch {}
    return { missions: [], errors };
  }

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

  // Semantic scoring (async enrichment, non-blocking)
  if (profile && !signal?.aborted) {
    try {
      const semanticResults = await scoreMissionsSemantic(scored, profile);
      for (const mission of scored) {
        const semantic = semanticResults.get(mission.id);
        if (semantic) {
          mission.semanticScore = semantic.score;
          mission.semanticReason = semantic.reason;
        }
      }
    } catch {
      // Gemini Nano unavailable, continue with basic scoring
    }
  }

  // Persist
  if (scored.length > 0) {
    try {
      await saveMissions(scored);
    } catch {
      // Storage not available
    }
  }

  try { await setScanState('idle'); } catch {}
  return { missions: scored, errors };
}
