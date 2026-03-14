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

export interface ScanProgressInfo {
  current: number;
  total: number;
  connectorName: string;
}

export async function runScan(signal?: AbortSignal, onProgress?: (info: ScanProgressInfo) => void): Promise<ScanResult> {
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

  // Fetch connectors sequentially to report progress
  const connectorResults: { connectorId: string; missions: Mission[] }[] = [];
  for (let i = 0; i < connectors.length; i++) {
    if (signal?.aborted) {
      try { await setScanState('idle'); } catch {}
      return { missions: [], errors };
    }
    const connector = connectors[i];
    onProgress?.({ current: i, total: connectors.length, connectorName: connector.name });
    try {
      const missions = await connector.fetchMissions();
      connectorResults.push({ connectorId: connector.id, missions });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      errors.push({ connectorId: connector.id, message });
    }
  }
  onProgress?.({ current: connectors.length, total: connectors.length, connectorName: '' });

  const allMissions: Mission[] = [];
  for (const result of connectorResults) {
    allMissions.push(...result.missions);
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
      const semanticResults = await scoreMissionsSemantic(
        scored,
        profile,
        settings.maxSemanticPerScan,
      );
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
