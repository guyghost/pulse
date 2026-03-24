import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';
import { buildSearchContext } from '../../core/connectors/search-context';
import { getConnectors, getConnector } from '../connectors/index';
import { getSettings } from '../storage/chrome-storage';
import { getProfile, saveMissions, purgeOldMissions } from '../storage/db';
import { deduplicateMissions } from '../../core/scoring/dedup';
import { scoreMission } from '../../core/scoring/relevance';
import { setScanState } from '../storage/session-storage';
import { scoreMissionsSemantic } from '../ai/semantic-scorer';
import { metricsCollector } from '../metrics/collector';
import { calculateDedupRatio } from '../../core/metrics/types';
import type { ScanMetrics } from '../../core/metrics/types';
import { isOnline } from '../utils/connection-monitor';
import { withResultRetry } from '../utils/retry-strategy';
import { trackParserHealth } from './parser-health';

/** Mutex pour empêcher les scans concurrents */
let scanInProgress = false;

/**
 * Erreur de scan avec code typé
 */
export class ScanError extends Error {
	constructor(
		message: string,
		public readonly code: 'OFFLINE' | 'NETWORK_ERROR' | 'CANCELLED' | 'MUTEX' | 'UNKNOWN'
	) {
		super(message);
		this.name = 'ScanError';
	}
}

export interface ScanResult {
	missions: Mission[];
	errors: { connectorId: string; message: string }[];
}

export interface ScanProgressInfo {
	current: number;
	total: number;
	connectorName: string;
}

export interface ScanOptions {
	/** Délai entre les pages d'un même connecteur en ms (défaut: 500) */
	pageDelayMs?: number;
	/** Respecter robots.txt (optionnel, pour future implémentation) */
	respectRobotsTxt?: boolean;
}

export async function runScan(
	signal?: AbortSignal,
	onProgress?: (info: ScanProgressInfo) => void,
	options?: ScanOptions
): Promise<ScanResult> {
	// Mutex : empêcher les scans concurrents
	if (scanInProgress) {
		throw new ScanError(
			'Un scan est déjà en cours. Veuillez patienter.',
			'MUTEX'
		);
	}
	scanInProgress = true;

	try {
		return await _runScanInternal(signal, onProgress, options);
	} finally {
		scanInProgress = false;
	}
}

async function _runScanInternal(
	signal?: AbortSignal,
	onProgress?: (info: ScanProgressInfo) => void,
	options?: ScanOptions
): Promise<ScanResult> {
	const scanStartTime = performance.now();

	// Vérifier la connexion avant de scanner
	if (!isOnline()) {
		throw new ScanError(
			'Aucune connexion internet. Le scan sera automatiquement relancé quand la connexion reviendra.',
			'OFFLINE'
		);
	}

	const settings = await getSettings();
	const enabledIds = settings.enabledConnectors;
	const errors: ScanResult['errors'] = [];

	try {
		await setScanState('scanning');
	} catch {}

	 if (enabledIds.length === 0) {
        try { await setScanState('idle'); } catch {}
        return { missions: [], errors: [{ connectorId: '*', message: 'Aucun connecteur actif' }] };
    }

    // Validate connector IDs and report unknown ones as errors
    const validConnectorIds: string[] = [];
    for (const id of enabledIds) {
        const connector = await getConnector(id);
        if (!connector) {
            errors.push({ connectorId: id, message: 'Connecteur introuvable' });
        } else {
            validConnectorIds.push(id);
        }
    }

    if (signal?.aborted) {
        try { await setScanState('idle'); } catch {}
        return { missions: [], errors };
    }

    // Load all connectors in parallel (they're lazy-loaded, so this loads only enabled ones)
    const connectors = await getConnectors(validConnectorIds);

	// Check for connectors that failed to load
	const loadedIds = new Set(connectors.map((c) => c.id));
	for (const id of validConnectorIds) {
		if (!loadedIds.has(id)) {
			errors.push({ connectorId: id, message: 'Échec du chargement du connecteur' });
		}
	}

	if (signal?.aborted) {
		try {
			await setScanState('idle');
		} catch {}
		return { missions: [], errors };
	}

	// Load profile early for connector search filtering + scoring
	let profile: UserProfile | null = null;
	try {
		profile = await getProfile();
	} catch {
		// No profile available — connectors will fetch without filters
	}

	// Build base search context from profile (without lastSync — that's per-connector)
	const baseSearchContext = profile ? buildSearchContext(profile, null) : null;

	// Fetch connectors sequentially to report progress
	const connectorResults: { connectorId: string; missions: Mission[] }[] = [];
	for (let i = 0; i < connectors.length; i++) {
		if (signal?.aborted) {
			try {
				await setScanState('idle');
			} catch {}
			return { missions: [], errors };
		}
		const connector = connectors[i];
		onProgress?.({ current: i, total: connectors.length, connectorName: connector.name });

		// Petit délai entre les connecteurs pour ne pas surcharger
		if (i > 0) {
			const interConnectorDelay = options?.pageDelayMs ?? 500;
			if (import.meta.env.DEV) {
				console.log(`[Scanner] Delay ${interConnectorDelay}ms before connector ${connector.id}`);
			}
			await new Promise((r) => setTimeout(r, interConnectorDelay));
		}

		const connectorStartTime = performance.now();
		const now = Date.now();

		// Build per-connector search context with lastSync
		let connectorContext: ConnectorSearchContext | undefined;
		if (baseSearchContext) {
			try {
				const lastSyncResult = await connector.getLastSync(now);
				const lastSync = lastSyncResult.ok ? lastSyncResult.value : null;
				connectorContext = { ...baseSearchContext, lastSync };
			} catch {
				// If getLastSync fails, use context without lastSync
				connectorContext = baseSearchContext;
			}
		}
		
		// Retry automatique pour les erreurs réseau avec backoff (Result-aware)
		const result = await withResultRetry(
			() => connector.fetchMissions(now, connectorContext),
			{
				maxAttempts: 3,
				baseDelayMs: 1000,
				maxDelayMs: 10000,
			}
		);
		
		const connectorDuration = Math.round(performance.now() - connectorStartTime);
		
		// Enregistrer le timing du connecteur
		metricsCollector.recordTiming('connector.fetch', connectorDuration, {
			connectorId: connector.id,
			status: result.ok ? 'success' : 'error',
		});
		
		if (!result.ok) {
			errors.push({ connectorId: connector.id, message: result.error.message });
			// Track health for failed connector (0 missions)
			trackParserHealth(connector.id, 0, now).catch(() => {});
		} else {
			// Track parser health for successful result
			trackParserHealth(connector.id, result.value.length, now).catch(() => {});
			connectorResults.push({ connectorId: connector.id, missions: result.value });
		}
	}
	onProgress?.({ current: connectors.length, total: connectors.length, connectorName: '' });

	const allMissions: Mission[] = [];
	for (const result of connectorResults) {
		allMissions.push(...result.missions);
	}

	// Deduplicate
	const missionsBeforeDedup = allMissions.length;
	const deduped = deduplicateMissions(allMissions);
	const dedupRatio = calculateDedupRatio(missionsBeforeDedup, deduped.length);

	// Score against profile (already loaded above for connector filtering)
	const scored = profile
		? deduped.map((m) => ({ ...m, score: scoreMission(m, profile!) }))
		: deduped;

	// Semantic scoring (async enrichment, non-blocking)
	if (profile && !signal?.aborted) {
		try {
			const semanticResults = await scoreMissionsSemantic(
				scored,
				profile,
				settings.maxSemanticPerScan
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

	// Purge old missions (older than 90 days) - non-blocking, silent failure
	try {
		const purged = await purgeOldMissions(90);
		if (purged > 0 && import.meta.env.DEV) {
			console.log(`[Scanner] Purged ${purged} old missions`);
		}
	} catch {
		// Purge failure is non-critical
	}

	// Calculer et enregistrer les métriques du scan
	const scanDuration = Math.round(performance.now() - scanStartTime);
	const missionsPerConnector: Record<string, number> = {};
	for (const result of connectorResults) {
		missionsPerConnector[result.connectorId] = result.missions.length;
	}

	const scanMetrics: ScanMetrics = {
		durationMs: scanDuration,
		totalMissions: scored.length,
		missionsPerConnector,
		errors: errors.map((e) => ({
			connectorId: e.connectorId,
			errorType: e.message.includes('timeout')
				? 'timeout'
				: e.message.includes('auth')
					? 'auth'
					: e.message.includes('network')
						? 'network'
						: 'unknown',
		})),
		dedupRatio,
	};
	metricsCollector.recordScanMetrics(scanMetrics);

	// Enregistrer le temps total de scan
	metricsCollector.recordTiming('scan.total', scanDuration, {
		connectorsCount: String(connectors.length),
		errorsCount: String(errors.length),
	});

	if (import.meta.env.DEV) {
		console.log(`[Scanner] Completed in ${scanDuration}ms, ${scored.length} missions, ${errors.length} errors`);
	}

	try {
		await setScanState('idle');
	} catch {}
	return { missions: scored, errors };
}
