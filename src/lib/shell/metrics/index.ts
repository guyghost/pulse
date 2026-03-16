/**
 * Module de métriques de performance
 * Exporte tout ce qui est nécessaire pour instrumenter le code
 */

// Types (depuis Core)
export type { Metric, MetricUnit, ScanMetrics, CacheMetrics, TimingMetric } from '../../core/metrics/types';
export { calculateHitRate, calculateDedupRatio } from '../../core/metrics/types';

// Collector
export { metricsCollector, measureAsync, measureSync } from './collector';

// Performance monitoring
export { initPerformanceMonitoring, getWebVitals, markPerformance, measurePerformance } from './performance-monitor';
