/**
 * Pure resolver for the feed operational story.
 *
 * Model: src/models/feed-story.model.md
 *
 * Extracted from FeedPage so the precedence rules (error vs offline vs broken
 * sources vs new/priority vs empty states) are unit-testable without mounting
 * the whole page. Shell/page wiring assembles the inputs; this function owns
 * the decision tree and the copy.
 *
 * PURE: no I/O, no async, no Date.now(), no chrome.*, no randomness.
 */

import type { IconName as FeedIconName } from '@pulse/ui';

export type FeedStorySeverity = 'critical' | 'incident' | 'attention' | 'success' | 'neutral';

export interface OperationalEvidence {
  label: string;
  value: string | number;
  icon?: FeedIconName;
  severity?: 'critical' | 'success' | 'attention' | 'neutral';
}

export interface FeedStory {
  severity: FeedStorySeverity;
  statusLabel: string;
  title: string;
  description: string;
  evidence: OperationalEvidence[];
  primaryActionLabel: string;
  primaryActionIcon: FeedIconName;
}

export interface FeedStoryInput {
  error: string | null;
  isOffline: boolean;
  brokenConnectorCount: number;
  firstBrokenConnectorName: string | null;
  newCount: number;
  highScoreCount: number;
  visibleCount: number;
  alertEnabled: boolean;
  alertScoreThreshold: number;
  hasCompletedScan: boolean;
  filterActive: boolean;
  totalMissionCount: number;
  searchQuery: string;
}

function formatStoryMissionCount(count: number): string {
  return `${count} mission${count > 1 ? 's' : ''}`;
}

function formatMissionAction(
  count: number,
  adjectiveSingular?: string,
  adjectivePlural = adjectiveSingular
): string {
  if (count === 1) {
    return `Voir la mission${adjectiveSingular ? ` ${adjectiveSingular}` : ''}`;
  }
  return `Voir les ${formatStoryMissionCount(count)}${adjectivePlural ? ` ${adjectivePlural}` : ''}`;
}

export function buildFeedStory(input: FeedStoryInput): FeedStory {
  const {
    error,
    isOffline,
    brokenConnectorCount,
    firstBrokenConnectorName,
    newCount,
    highScoreCount,
    visibleCount,
    alertEnabled,
    alertScoreThreshold,
    hasCompletedScan,
    filterActive,
    totalMissionCount,
    searchQuery,
  } = input;

  const evidence: OperationalEvidence[] = [
    {
      label: 'Nouvelles',
      value: newCount,
      icon: 'sparkles',
      severity: newCount > 0 ? 'attention' : 'neutral',
    },
    {
      label: `Prioritaires ${alertScoreThreshold}+`,
      value: highScoreCount,
      icon: 'target',
      severity: highScoreCount > 0 ? 'success' : 'neutral',
    },
    {
      label: 'Sources en erreur',
      value: brokenConnectorCount,
      icon: brokenConnectorCount > 0 ? 'triangle-alert' : 'shield-check',
      severity: brokenConnectorCount > 0 ? 'critical' : 'success',
    },
  ];

  // Precedence order (model): error > offline > broken sources > new > priority
  // > scanned-empty > never-scanned > feed-ready

  if (error) {
    // The feed list still renders cached missions, so degrade the hero
    // story to a warning rather than a critical "impossible to retrieve"
    // incident. Only escalate to critical when nothing is visible.
    if (visibleCount > 0) {
      return {
        severity: 'incident',
        statusLabel: 'Données en cache',
        title: 'Récupération interrompue — affichage en cache',
        description:
          visibleCount === 1
            ? 'La mission déjà récupérée reste disponible. Réessayez le scan ou vérifiez vos sources.'
            : `Les ${formatStoryMissionCount(visibleCount)} déjà récupérées restent disponibles. Réessayez le scan ou vérifiez vos sources.`,
        evidence,
        primaryActionLabel: 'Réessayer le scan',
        primaryActionIcon: 'refresh-cw',
      };
    }
    return {
      severity: 'critical',
      statusLabel: 'Incident',
      title: 'Impossible de récupérer les missions',
      description: 'Réessayez le scan ou vérifiez vos sources pour récupérer les missions.',
      evidence,
      primaryActionLabel: 'Réessayer le scan',
      primaryActionIcon: 'refresh-cw',
    };
  }

  if (isOffline) {
    return {
      severity: 'incident' as const,
      statusLabel: 'Hors ligne',
      title: 'Pulse affiche les données en cache',
      description:
        'Le scan est suspendu. Vous pouvez encore qualifier, filtrer et ouvrir les missions déjà stockées.',
      evidence,
      primaryActionLabel:
        visibleCount > 0 ? formatMissionAction(visibleCount, 'en cache', 'en cache') : 'Hors ligne',
      primaryActionIcon: visibleCount > 0 ? 'chevron-down' : 'database',
    };
  }

  if (brokenConnectorCount > 0) {
    return {
      severity: 'critical' as const,
      statusLabel: 'Action requise',
      title: `${brokenConnectorCount} source${brokenConnectorCount > 1 ? 's' : ''} à corriger avant de traiter les missions`,
      description: `${firstBrokenConnectorName ?? 'Une source'} ne remonte plus correctement. Le feed peut manquer des opportunités.`,
      evidence,
      primaryActionLabel: 'Relancer le diagnostic',
      primaryActionIcon: 'refresh-cw',
    };
  }

  if (newCount > 0) {
    return {
      severity: 'attention' as const,
      statusLabel: 'À traiter',
      title:
        highScoreCount > 0
          ? `${highScoreCount} mission${highScoreCount > 1 ? 's' : ''} prioritaire${highScoreCount > 1 ? 's' : ''} à examiner`
          : `${newCount} nouvelle${newCount > 1 ? 's' : ''} mission${newCount > 1 ? 's' : ''} à examiner`,
      description:
        highScoreCount > 0
          ? `${newCount} nouvelle${newCount > 1 ? 's' : ''} mission${newCount > 1 ? 's' : ''} au total. Commencez par celles qui dépassent le seuil ${alertScoreThreshold}+.`
          : 'Aucune urgence détectée, mais les nouvelles missions méritent une qualification rapide.',
      evidence,
      primaryActionLabel:
        highScoreCount > 0
          ? formatMissionAction(highScoreCount, 'prioritaire', 'prioritaires')
          : newCount === 1
            ? 'Voir la nouvelle mission'
            : `Voir les ${newCount} nouvelles missions`,
      primaryActionIcon: 'chevron-down',
    };
  }

  if (alertEnabled && highScoreCount > 0) {
    return {
      severity: 'success' as const,
      statusLabel: 'Priorités prêtes',
      title: `${highScoreCount} opportunité${highScoreCount > 1 ? 's' : ''} prioritaire${highScoreCount > 1 ? 's' : ''} prête${highScoreCount > 1 ? 's' : ''}`,
      description: `Elles dépassent votre seuil ${alertScoreThreshold}+. Comparez-les avant de mettre une mission en suivi.`,
      evidence,
      primaryActionLabel: formatMissionAction(highScoreCount, 'prioritaire', 'prioritaires'),
      primaryActionIcon: 'chevron-down',
    };
  }

  // Empty states — distinguish filtered-empty vs scanned-empty vs never-scanned
  if (visibleCount === 0) {
    // Cached missions exist but active filters hide them all — clear filters,
    // do not route to Profile or invite a redundant scan.
    if (filterActive && totalMissionCount > 0) {
      const normalizedQuery = searchQuery.trim();
      if (normalizedQuery) {
        return {
          severity: 'attention' as const,
          statusLabel: 'Recherche sans résultat',
          title: `Aucune mission pour « ${normalizedQuery} »`,
          description:
            'Des missions sont disponibles, mais aucune ne correspond à cette recherche.',
          evidence,
          primaryActionLabel: 'Effacer la recherche',
          primaryActionIcon: 'filter-x',
        };
      }
      return {
        severity: 'attention' as const,
        statusLabel: 'Filtres sans résultat',
        title: 'Aucune mission ne correspond à vos filtres actifs',
        description:
          'Des missions sont disponibles mais vos filtres les masquent toutes. Ajustez ou effacez les filtres pour les réafficher.',
        evidence,
        primaryActionLabel: 'Effacer les filtres',
        primaryActionIcon: 'filter-x',
      };
    }

    if (hasCompletedScan) {
      // Scanned, found nothing matching — attention state, route to Profile
      return {
        severity: 'attention' as const,
        statusLabel: 'Aucune correspondance',
        title: 'Aucune mission ne correspond à votre profil actuel',
        description:
          'Ajustez vos critères de recherche, compétences ou localisation dans votre profil pour élargir les résultats.',
        evidence,
        primaryActionLabel: 'Ajuster le profil',
        primaryActionIcon: 'user',
      };
    }

    // Never scanned — neutral state, invite to scan
    return {
      severity: 'neutral' as const,
      statusLabel: 'Aucune donnée',
      title: 'Lancez un premier scan pour voir vos missions',
      description:
        'Connectez ou vérifiez les sources, puis lancez un scan pour obtenir les premières recommandations.',
      evidence,
      primaryActionLabel: 'Lancer le scan',
      primaryActionIcon: 'play',
    };
  }

  // Feed ready — missions available, no action required
  return {
    severity: 'success' as const,
    statusLabel: 'Normal',
    title: `${visibleCount} mission${visibleCount > 1 ? 's' : ''} disponible${visibleCount > 1 ? 's' : ''}, aucune priorité critique`,
    description:
      'Le système est stable. Continuez par les favoris ou relancez un scan si la veille doit être rafraîchie.',
    evidence,
    primaryActionLabel: formatMissionAction(visibleCount),
    primaryActionIcon: 'chevron-down',
  };
}
