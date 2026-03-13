import type { AggregatedTJM } from './aggregator';
import type { TJMAnalysis, TJMTrend } from '../types/tjm';

/**
 * Construit une analyse TJM complete a partir des donnees agregees.
 * Fonction pure — pas d'I/O, pas d'appel LLM.
 */
export function buildAnalysisFromAggregation(
  aggregated: AggregatedTJM,
  now: Date,
): TJMAnalysis {
  const { median, min, max, count, stddev } = aggregated;

  // Fourchettes par seniorite
  const junior = {
    min: Math.round(min * 0.8),
    median: Math.round(median * 0.8),
    max: Math.round(max * 0.8),
  };

  const confirmed = {
    min,
    median,
    max,
  };

  const senior = {
    min: Math.round(min * 1.25),
    median: Math.round(median * 1.25),
    max: Math.round(max * 1.25),
  };

  // Confiance = countFactor * 0.6 + cvFactor * 0.4
  const countFactor = Math.min(count / 20, 1);
  const cv = median > 0 ? stddev / median : 1;
  const cvFactor = Math.max(0, 1 - cv);
  const confidence = Math.round((countFactor * 0.6 + cvFactor * 0.4) * 100) / 100;

  // Tendance
  const trend: TJMTrend = cv < 0.1 ? 'stable' : 'up';

  const trendDetail = trend === 'stable'
    ? `Le marche est stable avec un ecart-type faible (${stddev} EUR). Les tarifs sont homogenes.`
    : `Le marche montre une tendance haussiere avec une dispersion notable (ecart-type : ${stddev} EUR).`;

  const recommendation = trend === 'stable'
    ? `Positionnez-vous autour de ${median} EUR/jour. Le marche est coherent et les clients s'attendent a cette fourchette.`
    : `Le marche est dynamique. Visez ${Math.round(median * 1.1)} EUR/jour pour capitaliser sur la tendance haussiere.`;

  return {
    junior,
    confirmed,
    senior,
    trend,
    trendDetail,
    recommendation,
    confidence,
    dataPoints: count,
    analyzedAt: now,
  };
}
