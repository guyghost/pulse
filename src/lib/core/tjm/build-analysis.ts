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

  // Tendance — sans donnees temporelles, on ne peut que mesurer la dispersion
  const trend: TJMTrend = cv < 0.15 ? 'stable' : 'up';

  const trendDetail = cv < 0.15
    ? `Les TJM sont concentres autour de ${median} EUR/jour (ecart-type : ${stddev} EUR). Marche homogene.`
    : `Les TJM sont disperses (ecart-type : ${stddev} EUR). Fourchette large, le positionnement depend du contexte mission.`;

  const recommendation = confidence >= 0.5
    ? `Basee sur ${count} mission${count > 1 ? 's' : ''}, la fourchette recommandee pour un profil confirme est ${confirmed.min}-${confirmed.max} EUR/jour.`
    : `Donnees insuffisantes (${count} mission${count > 1 ? 's' : ''}). Elargissez votre recherche pour une analyse plus fiable.`;

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
