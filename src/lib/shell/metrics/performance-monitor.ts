import { metricsCollector } from './collector';
import type { Metric } from '../../core/metrics/types';

/**
 * Web Vitals et métriques de performance navigateur
 * Mode dev uniquement
 */

interface WebVitals {
	fcp: number; // First Contentful Paint (ms)
	lcp: number; // Largest Contentful Paint (ms)
	cls: number; // Cumulative Layout Shift
	fid?: number; // First Input Delay (ms)
	ttfb?: number; // Time to First Byte (ms)
}

let webVitals: WebVitals = {
	fcp: 0,
	lcp: 0,
	cls: 0,
};

/**
 * Initialise le monitoring des performances web
 * À appeler une fois au démarrage de l'application
 */
export function initPerformanceMonitoring(): void {
	if (!import.meta.env.DEV || typeof window === 'undefined') return;

	// Observer pour Largest Contentful Paint
	if ('PerformanceObserver' in window) {
		// LCP
		try {
			const lcpObserver = new PerformanceObserver((list) => {
				const entries = list.getEntries();
				const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
				if (lastEntry) {
					webVitals.lcp = Math.round(lastEntry.startTime);
					metricsCollector.record({
						name: 'webvital.lcp',
						value: webVitals.lcp,
						unit: 'ms',
						timestamp: Date.now(),
					});
				}
			});
			lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
		} catch {
			// LCP non supporté
		}

		// FCP et autres paint metrics
		try {
			const paintObserver = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if (entry.name === 'first-contentful-paint') {
						webVitals.fcp = Math.round(entry.startTime);
						metricsCollector.record({
							name: 'webvital.fcp',
							value: webVitals.fcp,
							unit: 'ms',
							timestamp: Date.now(),
						});
					}
				}
			});
			paintObserver.observe({ entryTypes: ['paint'] });
		} catch {
			// Paint observer non supporté
		}

		// CLS
		try {
			const clsObserver = new PerformanceObserver((list) => {
				let clsValue = 0;
				for (const entry of list.getEntries()) {
					const layoutShift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
					if (!layoutShift.hadRecentInput) {
						clsValue += layoutShift.value;
					}
				}
				webVitals.cls = Math.round(clsValue * 1000) / 1000;
				metricsCollector.record({
					name: 'webvital.cls',
					value: webVitals.cls,
					unit: 'count',
					timestamp: Date.now(),
				});
			});
			clsObserver.observe({ entryTypes: ['layout-shift'] });
		} catch {
			// CLS non supporté
		}

		// First Input Delay via Event Timing
		try {
			const fidObserver = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					const eventEntry = entry as PerformanceEventTiming;
					if (eventEntry.processingStart && eventEntry.startTime) {
						const fid = Math.round(eventEntry.processingStart - eventEntry.startTime);
						webVitals.fid = fid;
						metricsCollector.record({
							name: 'webvital.fid',
							value: fid,
							unit: 'ms',
							timestamp: Date.now(),
						});
					}
				}
			});
			fidObserver.observe({ entryTypes: ['first-input'] });
		} catch {
			// FID non supporté
		}
	}

	// Navigation Timing
	if (typeof performance !== 'undefined' && performance.getEntriesByType) {
		// Attendre que la navigation soit complète
		setTimeout(() => {
			const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
			if (navEntries.length > 0) {
				const nav = navEntries[0];
				webVitals.ttfb = Math.round(nav.responseStart);
				metricsCollector.record({
					name: 'webvital.ttfb',
					value: webVitals.ttfb,
					unit: 'ms',
					timestamp: Date.now(),
				});

				// DOM Content Loaded
				const dcl = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
				metricsCollector.record({
					name: 'navigation.dcl',
					value: dcl,
					unit: 'ms',
					timestamp: Date.now(),
				});

				// Load complete
				const loadTime = Math.round(nav.loadEventEnd - nav.startTime);
				metricsCollector.record({
					name: 'navigation.load',
					value: loadTime,
					unit: 'ms',
					timestamp: Date.now(),
				});
			}
		}, 0);
	}
}

/**
 * Récupère les Web Vitals actuels
 */
export function getWebVitals(): WebVitals {
	return { ...webVitals };
}

/**
 * Mesure manuelle d'une entrée de performance
 */
export function measurePerformanceEntry(name: string): void {
	if (!import.meta.env.DEV || typeof performance === 'undefined') return;

	const entries = performance.getEntriesByName(name);
	for (const entry of entries) {
		metricsCollector.record({
			name: `performance.${name}`,
			value: Math.round(entry.duration),
			unit: 'ms',
			timestamp: Date.now(),
		});
	}
}

/**
 * Marque un point de performance
 */
export function markPerformance(markName: string): void {
	if (!import.meta.env.DEV || typeof performance === 'undefined') return;
	performance.mark(markName);
}

/**
 * Mesure entre deux marques
 */
export function measurePerformance(
	measureName: string,
	startMark: string,
	endMark?: string
): void {
	if (!import.meta.env.DEV || typeof performance === 'undefined') return;
	try {
		performance.measure(measureName, startMark, endMark);
		measurePerformanceEntry(measureName);
	} catch {
		// Ignorer les erreurs de mesure (marques manquantes)
	}
}
