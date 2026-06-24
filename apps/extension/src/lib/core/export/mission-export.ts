/**
 * Export des missions en différents formats
 * Core = pur : zéro I/O, zéro async, zéro side effect
 */

import type { Mission } from '../types/mission';

export type ExportFormat = 'json' | 'csv' | 'markdown';

export interface ExportOptions {
  format: ExportFormat;
  includeDescription?: boolean;
  dateFormat?: 'iso' | 'locale' | 'relative';
  /** Optional label describing the applied filters (e.g. "Favoris · React · Full remote") */
  filterLabel?: string;
}

/**
 * Formate une date selon le format spécifié
 * Pure function - injection de la date de référence pour testabilité
 */
function formatDate(date: Date, format: 'iso' | 'locale' | 'relative', now: Date): string {
  switch (format) {
    case 'iso':
      return date.toISOString();
    case 'locale':
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    case 'relative': {
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        return "Aujourd'hui";
      }
      if (diffDays === 1) {
        return 'Hier';
      }
      if (diffDays < 7) {
        return `Il y a ${diffDays} jours`;
      }
      if (diffDays < 30) {
        return `Il y a ${Math.floor(diffDays / 7)} semaines`;
      }
      return `Il y a ${Math.floor(diffDays / 30)} mois`;
    }
    default:
      return date.toISOString();
  }
}

/**
 * Exporte les missions en JSON
 * Pure function
 */
export function exportMissionsToJSON(
  missions: Mission[],
  options: ExportOptions | undefined,
  now: Date
): string {
  const includeDescription = options?.includeDescription ?? true;
  const dateFormat = options?.dateFormat ?? 'iso';

  const data = missions.map((mission) => ({
    id: mission.id,
    title: mission.title,
    client: mission.client,
    ...(includeDescription && { description: mission.description }),
    stack: mission.stack,
    tjm: mission.tjm,
    location: mission.location,
    remote: mission.remote,
    duration: mission.duration,
    url: mission.url,
    source: mission.source,
    scrapedAt: formatDate(mission.scrapedAt, dateFormat, now),
    score: mission.score,
    semanticScore: mission.semanticScore,
    semanticReason: mission.semanticReason,
  }));

  return JSON.stringify(data, null, 2);
}

/**
 * Échappe une valeur pour CSV
 * Pure function
 */
function escapeCSV(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // Si contient des caractères spéciaux, entourer de guillemets et échapper
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatMissionCount(count: number): string {
  return `${count} mission${count > 1 ? 's' : ''}`;
}

function getMissionScore(mission: Mission): number | null {
  return mission.scoreBreakdown?.total ?? mission.score;
}

function getMissionSignal(mission: Mission): string | null {
  return mission.scoreBreakdown?.semanticReason ?? mission.semanticReason;
}

function formatTJMRange(missions: Mission[]): string {
  const rates = missions
    .map((mission) => mission.tjm)
    .filter((rate): rate is number => typeof rate === 'number' && Number.isFinite(rate));

  if (rates.length === 0) {
    return 'Non renseigné';
  }

  const min = Math.min(...rates);
  const max = Math.max(...rates);

  return min === max ? `${min} EUR/jour` : `${min}-${max} EUR/jour`;
}

function summarizeStacks(missions: Mission[]): string {
  const counts = new Map<string, number>();

  for (const mission of missions) {
    for (const stack of mission.stack) {
      const clean = stack.trim();
      if (clean) {
        counts.set(clean, (counts.get(clean) ?? 0) + 1);
      }
    }
  }

  const stacks = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([stack]) => stack);

  return stacks.length > 0 ? stacks.join(', ') : 'Non renseigné';
}

function summarizeSources(missions: Mission[]): string {
  const sources = [...new Set(missions.map((mission) => mission.source))].sort();
  return sources.length > 0 ? sources.join(', ') : 'Non renseigné';
}

/**
 * Exporte les missions en CSV
 * Pure function
 */
export function exportMissionsToCSV(
  missions: Mission[],
  options: ExportOptions | undefined,
  now: Date
): string {
  const includeDescription = options?.includeDescription ?? false;
  const dateFormat = options?.dateFormat ?? 'locale';

  const headers = [
    'ID',
    'Titre',
    'Client',
    ...(includeDescription ? ['Description'] : []),
    'Stack',
    'TJM',
    'Localisation',
    'Remote',
    'Durée',
    'URL',
    'Source',
    'Date scraping',
    'Score',
    'Score sémantique',
    'Raison sémantique',
  ];

  const rows = missions.map((mission) => [
    escapeCSV(mission.id),
    escapeCSV(mission.title),
    escapeCSV(mission.client),
    ...(includeDescription ? [escapeCSV(mission.description)] : []),
    escapeCSV(mission.stack.join(', ')),
    escapeCSV(mission.tjm?.toString() ?? ''),
    escapeCSV(mission.location),
    escapeCSV(mission.remote),
    escapeCSV(mission.duration),
    escapeCSV(mission.url),
    escapeCSV(mission.source),
    escapeCSV(formatDate(mission.scrapedAt, dateFormat, now)),
    escapeCSV(mission.score?.toString() ?? ''),
    escapeCSV(mission.semanticScore?.toString() ?? ''),
    escapeCSV(mission.semanticReason),
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

/**
 * Exporte les missions en Markdown
 * Pure function
 */
export function exportMissionsToMarkdown(
  missions: Mission[],
  options: ExportOptions | undefined,
  now: Date
): string {
  const includeDescription = options?.includeDescription ?? true;
  const dateFormat = options?.dateFormat ?? 'locale';
  const title = options?.filterLabel ? options.filterLabel : 'Shortlist MissionPulse';
  const scores = missions
    .map((mission) => getMissionScore(mission))
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
  const bestScore = scores.length > 0 ? Math.max(...scores) : null;

  const lines: string[] = [`# ${title}\n`];

  lines.push('## Synthèse shortlist\n');
  lines.push(
    `- **Volume:** ${formatMissionCount(missions.length)} retenue${missions.length > 1 ? 's' : ''}`
  );
  lines.push(`- **TJM observé:** ${formatTJMRange(missions)}`);
  lines.push(`- **Stacks dominantes:** ${summarizeStacks(missions)}`);
  lines.push(`- **Sources:** ${summarizeSources(missions)}`);
  lines.push(`- **Meilleur score:** ${bestScore !== null ? `${bestScore}/100` : 'Non scoré'}`);
  lines.push(
    '- **Confidentialité:** rapport local généré depuis vos favoris; aucune session plateforme ni credential inclus.\n'
  );
  lines.push('## Missions retenues\n');

  for (const [index, mission] of missions.entries()) {
    lines.push(`### ${index + 1}. ${mission.title}\n`);

    if (mission.client) {
      lines.push(`**Client:** ${mission.client}\n`);
    }

    if (mission.tjm) {
      lines.push(`**TJM:** ${mission.tjm} EUR/jour\n`);
    }

    if (mission.location) {
      lines.push(`**Localisation:** ${mission.location}\n`);
    }

    if (mission.remote) {
      const remoteLabels: Record<string, string> = {
        full: 'Full remote',
        hybrid: 'Hybride',
        onsite: 'Sur site',
      };
      lines.push(`**Remote:** ${remoteLabels[mission.remote] ?? mission.remote}\n`);
    }

    if (mission.duration) {
      lines.push(`**Durée:** ${mission.duration}\n`);
    }

    if (mission.stack.length > 0) {
      lines.push(`**Stack:** ${mission.stack.join(', ')}\n`);
    }

    lines.push(`**Source:** ${mission.source}\n`);
    lines.push(`**Date:** ${formatDate(mission.scrapedAt, dateFormat, now)}\n`);

    const score = getMissionScore(mission);
    if (score !== null) {
      lines.push(`**Score:** ${score}/100\n`);
    }

    const signal = getMissionSignal(mission);
    if (signal) {
      lines.push(`**Signal score:** ${signal}\n`);
    }

    if (includeDescription && mission.description) {
      lines.push('\n### Description\n');
      lines.push(`${mission.description}\n`);
    }

    lines.push(`\n[Lien vers la mission](${mission.url})\n`);
    lines.push('---\n');
  }

  lines.push(`\n*Export généré le ${now.toLocaleDateString('fr-FR')}*\n`);

  return lines.join('\n');
}

/**
 * Génère un nom de fichier pour l'export
 * Pure function - injection de la date pour testabilité
 */
export function generateFilename(prefix: string, format: ExportFormat, now: Date): string {
  const timestamp = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const extensions: Record<ExportFormat, string> = {
    json: 'json',
    csv: 'csv',
    markdown: 'md',
  };
  return `${prefix}-${timestamp}.${extensions[format]}`;
}

/**
 * Exporte les missions dans le format spécifié
 * Fonction utilitaire qui délègue aux fonctions spécifiques
 * Pure function
 */
export function exportMissions(missions: Mission[], options: ExportOptions, now: Date): string {
  switch (options.format) {
    case 'json':
      return exportMissionsToJSON(missions, options, now);
    case 'csv':
      return exportMissionsToCSV(missions, options, now);
    case 'markdown':
      return exportMissionsToMarkdown(missions, options, now);
    default:
      throw new Error(`Format d'export non supporté: ${options.format}`);
  }
}
