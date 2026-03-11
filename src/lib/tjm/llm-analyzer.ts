import type { TJMAnalysis, SeniorityLevel } from '../core/types/tjm';
import type { AggregatedTJM } from './aggregator';
import { getApiKey } from '../storage/chrome-storage';
import { getCachedAnalysis, cacheAnalysis } from './cache';

export interface LLMAnalyzerOptions {
  title: string;
  location: string;
  seniority: SeniorityLevel;
  aggregatedData: AggregatedTJM;
}

export async function analyzeTJM(options: LLMAnalyzerOptions): Promise<TJMAnalysis> {
  const { title, location, seniority, aggregatedData } = options;

  // Check cache first
  const cached = await getCachedAnalysis(title, location, seniority);
  if (cached) return cached;

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Clé API Anthropic non configurée. Ajoutez-la dans les paramètres.');
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
      system: `Tu es un analyste du marché freelance tech français. Tu reçois des données agrégées de TJM et tu produis une analyse structurée. Réponds UNIQUEMENT en JSON valide, sans markdown.`,
      messages: [{
        role: 'user',
        content: `Analyse l'évolution des taux journaliers moyens (TJM) pour "${title}" dans la zone "${location}" pour le niveau "${seniority}".

Données collectées localement (${aggregatedData.count} missions) :
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
}`
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
    throw new Error('Réponse API vide');
  }

  const parsed = JSON.parse(textContent.text) as Omit<TJMAnalysis, 'analyzedAt'>;

  const analysis: TJMAnalysis = {
    ...parsed,
    analyzedAt: new Date(),
  };

  // Cache the result
  await cacheAnalysis(title, location, seniority, analysis);

  return analysis;
}
