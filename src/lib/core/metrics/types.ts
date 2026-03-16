/**
 * Types pour les métriques de performance
 * Core = pur, zéro I/O, zéro side effects
 */

export type MetricUnit = 'ms' | 'bytes' | 'count' | 'percent';

export interface Metric {
	name: string;
	value: number;
	unit: MetricUnit;
	timestamp: number;
	tags?: Record<string, string>;
}

export interface ScanMetrics {
	durationMs: number;
	totalMissions: number;
	missionsPerConnector: Record<string, number>;
	errors: Array<{ connectorId: string; errorType: string }>;
	dedupRatio: number; // % de missions dédupliquées
}

export interface CacheMetrics {
	hits: number;
	misses: number;
	hitRate: number;
	size: number;
}

export interface TimingMetric {
	operation: string;
	startTime: number;
	endTime: number;
	duration: number;
}

/**
 * Calcule le hit rate à partir des hits et misses
 * Fonction pure, testable sans mocks
 */
export function calculateHitRate(hits: number, misses: number): number {
	const total = hits + misses;
	if (total === 0) return 0;
	return Math.round((hits / total) * 100 * 100) / 100; // Arrondi à 2 décimals
}

/**
 * Calcule le ratio de déduplication
 * Fonction pure
 */
export function calculateDedupRatio(beforeCount: number, afterCount: number): number {
	if (beforeCount === 0) return 0;
	const removed = beforeCount - afterCount;
	return Math.round((removed / beforeCount) * 100 * 100) / 100;
}
