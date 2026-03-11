import type { TJMAnalysis, SeniorityLevel } from '../../core/types/tjm';
import { aggregateFromPoints } from '../../core/tjm/aggregator';
import { getTJMDataPoints } from '../storage/db';
import { getApiKey } from '../storage/chrome-storage';
import { getCachedAnalysis, cacheAnalysis } from '../storage/tjm-cache';

export interface AnalyzeTJMInput {
  title: string;
  location: string;
  seniority: SeniorityLevel;
}

export async function analyzeTJM(input: AnalyzeTJMInput): Promise<TJMAnalysis> {
  const { title, location, seniority } = input;

  // 1. Check cache
  const cached = await getCachedAnalysis(title, location, seniority);
  if (cached) return cached;

  // 2. Aggregate from storage (Shell reads data, Core processes it)
  const allPoints = await getTJMDataPoints();
  const now = new Date();
  const aggregatedData = aggregateFromPoints(allPoints, title, location, now);

  if (!aggregatedData || aggregatedData.count === 0) {
    throw new Error('Pas assez de donn\u00e9es pour analyser le TJM.');
  }

  // 3. Call LLM
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Cl\u00e9 API Anthropic non configur\u00e9e. Ajoutez-la dans les param\u00e8tres.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `Tu es un analyste du march\u00e9 freelance tech fran\u00e7ais. Tu re\u00e7ois des donn\u00e9es agr\u00e9g\u00e9es de TJM et tu produis une analyse structur\u00e9e. R\u00e9ponds UNIQUEMENT en JSON valide, sans markdown.`,
      messages: [{
        role: 'user',
        content: `Analyse l'\u00e9volution des taux journaliers moyens (TJM) pour "${title}" dans la zone "${location}" pour le niveau "${seniority}".

Donn\u00e9es collect\u00e9es localement (${aggregatedData.count} missions) :
${JSON.stringify({
  min: aggregatedData.min,
  median: aggregatedData.median,
  max: aggregatedData.max,
  count: aggregatedData.count,
  stddev: aggregatedData.stddev,
})}

Retourne un JSON avec cette structure exacte :
{
  "junior": { "min": number, "median": number, "max": number },
  "confirmed": { "min": number, "median": number, "max": number },
  "senior": { "min": number, "median": number, "max": number },
  "trend": "up" | "stable" | "down",
  "trendDetail": "explication courte de la tendance",
  "recommendation": "conseil pour ajuster le tarif",
  "confidence": number entre 0 et 1,
  "dataPoints": number
}`,
      }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Erreur API Anthropic (${response.status}): ${errorBody}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const textContent = data.content.find(c => c.type === 'text');
  if (!textContent) {
    throw new Error('R\u00e9ponse API vide');
  }

  const parsed = JSON.parse(textContent.text) as Omit<TJMAnalysis, 'analyzedAt'>;

  const analysis: TJMAnalysis = {
    ...parsed,
    analyzedAt: now,
  };

  // 4. Cache result
  await cacheAnalysis(title, location, seniority, analysis);

  return analysis;
}
