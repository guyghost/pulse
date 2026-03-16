import type { Metric, MetricUnit, ScanMetrics, CacheMetrics } from '../../core/metrics/types';
import { calculateHitRate } from '../../core/metrics/types';

/**
 * Collecteur de métriques
 * Shell = I/O et side effects autorisés
 * Mode dev uniquement (tree-shaken en prod)
 */
class MetricsCollector {
	private metrics: Metric[] = [];
	private maxSize = 1000;

	/**
	 * Enregistre une métrique
	 */
	record(metric: Metric): void {
		if (!import.meta.env.DEV) return;

		this.metrics.push(metric);

		// Limiter la taille pour éviter les fuites mémoire
		if (this.metrics.length > this.maxSize) {
			this.metrics = this.metrics.slice(-this.maxSize);
		}
	}

	/**
	 * Enregistre une métrique de timing
	 */
	recordTiming(operation: string, durationMs: number, tags?: Record<string, string>): void {
		this.record({
			name: `timing.${operation}`,
			value: durationMs,
			unit: 'ms',
			timestamp: Date.now(),
			tags,
		});
	}

	/**
	 * Enregistre les métriques d'un scan complet
	 */
	recordScanMetrics(metrics: ScanMetrics): void {
		const timestamp = Date.now();

		// Durée totale
		this.record({
			name: 'scan.duration',
			value: metrics.durationMs,
			unit: 'ms',
			timestamp,
		});

		// Total missions
		this.record({
			name: 'scan.missions.total',
			value: metrics.totalMissions,
			unit: 'count',
			timestamp,
		});

		// Missions par connecteur
		for (const [connectorId, count] of Object.entries(metrics.missionsPerConnector)) {
			this.record({
				name: 'scan.missions.per_connector',
				value: count,
				unit: 'count',
				timestamp,
				tags: { connectorId },
			});
		}

		// Taux de déduplication
		this.record({
			name: 'scan.dedup_ratio',
			value: metrics.dedupRatio,
			unit: 'percent',
			timestamp,
		});

		// Erreurs par connecteur
		for (const error of metrics.errors) {
			this.record({
				name: 'scan.error',
				value: 1,
				unit: 'count',
				timestamp,
				tags: { connectorId: error.connectorId, errorType: error.errorType },
			});
		}
	}

	/**
	 * Enregistre les métriques de cache
	 */
	recordCacheMetrics(name: string, metrics: CacheMetrics): void {
		const timestamp = Date.now();

		this.record({
			name: `cache.${name}.hits`,
			value: metrics.hits,
			unit: 'count',
			timestamp,
		});

		this.record({
			name: `cache.${name}.misses`,
			value: metrics.misses,
			unit: 'count',
			timestamp,
		});

		this.record({
			name: `cache.${name}.hit_rate`,
			value: metrics.hitRate,
			unit: 'percent',
			timestamp,
		});

		this.record({
			name: `cache.${name}.size`,
			value: metrics.size,
			unit: 'count',
			timestamp,
		});
	}

	/**
	 * Récupère toutes les métriques
	 */
	getMetrics(): Metric[] {
		return [...this.metrics];
	}

	/**
	 * Récupère les métriques filtrées par nom
	 */
	getMetricsByName(namePattern: string): Metric[] {
		const regex = new RegExp(namePattern.replace('*', '.*'));
		return this.metrics.filter((m) => regex.test(m.name));
	}

	/**
	 * Calcule la moyenne d'une métrique
	 */
	getAverage(name: string): number {
		const metrics = this.metrics.filter((m) => m.name === name);
		if (metrics.length === 0) return 0;
		const sum = metrics.reduce((acc, m) => acc + m.value, 0);
		return Math.round((sum / metrics.length) * 100) / 100;
	}

	/**
	 * Récupère la dernière valeur d'une métrique
	 */
	getLast(name: string): Metric | undefined {
		return this.metrics
			.filter((m) => m.name === name)
			.sort((a, b) => b.timestamp - a.timestamp)[0];
	}

	/**
	 * Efface toutes les métriques
	 */
	clear(): void {
		this.metrics = [];
	}

	/**
	 * Exporte les métriques en JSON (pour debug)
	 */
	export(): string {
		return JSON.stringify(
			{
				metrics: this.metrics,
				summary: {
					total: this.metrics.length,
					uniqueNames: [...new Set(this.metrics.map((m) => m.name))],
					timeRange: {
						start: this.metrics[0]?.timestamp,
						end: this.metrics[this.metrics.length - 1]?.timestamp,
					},
				},
			},
			null,
			2
		);
	}
}

// Singleton
export const metricsCollector = new MetricsCollector();

/**
 * Helper pour mesurer une fonction async
 */
export async function measureAsync<T>(
	operation: string,
	fn: () => Promise<T>,
	tags?: Record<string, string>
): Promise<T> {
	const start = performance.now();
	try {
		const result = await fn();
		const duration = Math.round(performance.now() - start);
		metricsCollector.recordTiming(operation, duration, { ...tags, status: 'success' });
		return result;
	} catch (error) {
		const duration = Math.round(performance.now() - start);
		metricsCollector.recordTiming(operation, duration, {
			...tags,
			status: 'error',
			errorType: error instanceof Error ? error.name : 'unknown',
		});
		throw error;
	}
}

/**
 * Helper pour mesurer une fonction sync
 */
export function measureSync<T>(
	operation: string,
	fn: () => T,
	tags?: Record<string, string>
): T {
	const start = performance.now();
	try {
		const result = fn();
		const duration = Math.round(performance.now() - start);
		metricsCollector.recordTiming(operation, duration, { ...tags, status: 'success' });
		return result;
	} catch (error) {
		const duration = Math.round(performance.now() - start);
		metricsCollector.recordTiming(operation, duration, {
			...tags,
			status: 'error',
			errorType: error instanceof Error ? error.name : 'unknown',
		});
		throw error;
	}
}
