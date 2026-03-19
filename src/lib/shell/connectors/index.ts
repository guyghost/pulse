import type { PlatformConnector } from './platform-connector';
import type { Result, AppError } from '$lib/core/errors';
import { handleError, isRetryable } from '../errors/error-handler';

// Factory functions with dynamic imports for lazy loading
// Each connector is loaded on-demand as a separate chunk
const CONNECTOR_REGISTRY = {
	'free-work': () => import('./freework.connector').then((m) => new m.FreeWorkConnector()),
	'comet': () => import('./comet.connector').then((m) => new m.CometConnector()),
	'lehibou': () => import('./lehibou.connector').then((m) => new m.LeHibouConnector()),
	'hiway': () => import('./hiway.connector').then((m) => new m.HiwayConnector()),
	'collective': () => import('./collective.connector').then((m) => new m.CollectiveConnector()),
	'cherry-pick': () => import('./cherrypick.connector').then((m) => new m.CherryPickConnector()),
} as const;

export type ConnectorId = keyof typeof CONNECTOR_REGISTRY;

// Static connector metadata for UI display (without loading full connector code)
export interface ConnectorMeta {
	id: ConnectorId;
	name: string;
	icon: string;
	url: string;
}

/**
 * Get list of all available connector IDs
 */
export function getConnectorIds(): ConnectorId[] {
	return Object.keys(CONNECTOR_REGISTRY) as ConnectorId[];
}

/**
 * Get static metadata for all connectors (lightweight, no dynamic import)
 * Used for UI display without loading connector code
 */
export function getConnectorsMeta(): ConnectorMeta[] {
	// Static metadata to avoid loading connector code
	// This should be kept in sync with actual connector implementations
	return [
		{
			id: 'free-work',
			name: 'Free-Work',
			icon: 'https://www.google.com/s2/favicons?domain=free-work.com&sz=32',
			url: 'https://www.free-work.com',
		},
		{
			id: 'comet',
			name: 'Comet',
			icon: 'https://www.google.com/s2/favicons?domain=comet.co&sz=32',
			url: 'https://app.comet.co',
		},
		{
			id: 'lehibou',
			name: 'LeHibou',
			icon: 'https://www.google.com/s2/favicons?domain=lehibou.com&sz=32',
			url: 'https://www.lehibou.com',
		},
		{
			id: 'hiway',
			name: 'Hiway',
			icon: 'https://www.google.com/s2/favicons?domain=hiway.fr&sz=32',
			url: 'https://app.hiway.fr',
		},
		{
			id: 'collective',
			name: 'Collective',
			icon: 'https://www.google.com/s2/favicons?domain=collective.work&sz=32',
			url: 'https://app.collective.work',
		},
		{
			id: 'cherry-pick',
			name: 'Cherry Pick',
			icon: 'https://www.google.com/s2/favicons?domain=cherry-pick.io&sz=32',
			url: 'https://www.cherry-pick.io',
		},
	];
}

/**
 * Load a connector by ID asynchronously
 * @returns The connector instance or null if not found
 */
export async function getConnector(id: string): Promise<PlatformConnector | null> {
	const factory = CONNECTOR_REGISTRY[id as ConnectorId];
	if (!factory) return null;

	try {
		return await factory();
	} catch (error) {
		console.error(`Failed to load connector "${id}":`, error);
		return null;
	}
}

/**
 * Load multiple connectors by ID asynchronously
 * @returns Array of successfully loaded connectors
 */
export async function getConnectors(ids: string[]): Promise<PlatformConnector[]> {
	const results = await Promise.allSettled(ids.map((id) => getConnector(id)));
	return results
		.filter((r): r is PromiseFulfilledResult<PlatformConnector | null> => r.status === 'fulfilled')
		.map((r) => r.value)
		.filter((c): c is PlatformConnector => c !== null);
}

// Track preloading promises to avoid duplicate requests
const preloadPromises = new Map<ConnectorId, Promise<void>>();

/**
 * Preload a connector in the background
 * Useful for preloading connectors that will likely be used soon
 */
export function preloadConnector(id: ConnectorId): void {
	if (preloadPromises.has(id)) return;

	const factory = CONNECTOR_REGISTRY[id];
	if (!factory) return;

	const promise = factory()
		.then(() => {
			// Successfully loaded, nothing else to do
		})
		.catch(() => {
			// Silently fail on preload - actual error handled when connector is used
		})
		.finally(() => {
			// Remove from tracking after completion
			preloadPromises.delete(id);
		});

	preloadPromises.set(id, promise);
}

/**
 * Preload all connectors (use with caution - loads all code)
 * Useful when user has enabled all connectors and scan is about to start
 */
export function preloadAllConnectors(): void {
	(getConnectorIds() as ConnectorId[]).forEach(preloadConnector);
}

// ============================================================================
// Détection de session avec gestion d'erreurs typées
// ============================================================================

export interface DetectionResult {
	connectorId: string;
	hasSession: boolean;
	error?: AppError;
}

/**
 * Détecte la session pour un connecteur avec gestion d'erreurs
 * @returns Result avec la détection ou l'erreur
 */
export async function detectConnectorSession(
	connector: PlatformConnector,
	now: number
): Promise<Result<DetectionResult, AppError>> {
	const result = await connector.detectSession(now);
	
	if (!result.ok) {
		// Gère l'erreur pour le logging/toast
		handleError(result.error);
		
		return result;
	}
	
	return {
		ok: true,
		value: {
			connectorId: connector.id,
			hasSession: result.value,
		},
	};
}

/**
 * Détecte les sessions pour tous les connecteurs avec gestion d'erreurs
 * Continue même si certains connecteurs échouent
 */
export async function detectAllConnectorSessions(
	connectors: PlatformConnector[],
	now: number
): Promise<DetectionResult[]> {
	const results = await Promise.all(
		connectors.map(async (connector) => {
			const result = await connector.detectSession(now);
			
			if (!result.ok) {
				handleError(result.error);
				return {
					connectorId: connector.id,
					hasSession: false,
					error: result.error,
				};
			}
			
			return {
				connectorId: connector.id,
				hasSession: result.value,
			};
		})
	);
	
	return results;
}

/**
 * Vérifie si une erreur de détection est retryable
 */
export function isDetectionRetryable(error: AppError): boolean {
	return isRetryable(error);
}

// Deprecated: kept for backward compatibility during migration
// TODO: Remove after all consumers migrate to async getConnector
export const connectorRegistry: PlatformConnector[] = [];
