/**
 * Unit tests for buildFeedStory — pure feed operational story resolver.
 *
 * Model: src/models/feed-story.model.md
 *
 * Tests the precedence rules, copy matrix, and empty-state discrimination
 * (P0 fix: never-scanned vs scanned-empty).
 */

import { describe, it, expect } from 'vitest';
import { buildFeedStory, type FeedStoryInput } from '$lib/core/feed/build-feed-story';

const DEFAULT_INPUT: FeedStoryInput = {
  error: null,
  isOffline: false,
  brokenConnectorCount: 0,
  firstBrokenConnectorName: null,
  newCount: 0,
  highScoreCount: 0,
  visibleCount: 0,
  alertEnabled: true,
  alertScoreThreshold: 75,
  hasCompletedScan: false,
  filterActive: false,
  totalMissionCount: 0,
  searchQuery: '',
};

describe('buildFeedStory', () => {
  describe('error states (highest precedence)', () => {
    it('returns critical error when error and no visible missions', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        error: 'Network timeout',
        visibleCount: 0,
      });

      expect(result.severity).toBe('critical');
      expect(result.statusLabel).toBe('Incident');
      expect(result.title).toContain('Impossible de récupérer');
      expect(result.primaryActionLabel).toBe('Réessayer le scan');
      expect(result.primaryActionIcon).toBe('refresh-cw');
    });

    it('returns incident error when error but missions are cached', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        error: 'Network timeout',
        visibleCount: 12,
      });

      expect(result.severity).toBe('incident');
      expect(result.statusLabel).toBe('Données en cache');
      expect(result.title).toContain('Récupération interrompue');
      expect(result.description).toContain('12 missions');
      expect(result.primaryActionLabel).toBe('Réessayer le scan');
    });
  });

  describe('offline state', () => {
    it('returns incident offline state when offline', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        isOffline: true,
        visibleCount: 8,
      });

      expect(result.severity).toBe('incident');
      expect(result.statusLabel).toBe('Hors ligne');
      expect(result.title).toContain('Pulse affiche les données en cache');
      expect(result.primaryActionLabel).toContain('Voir les 8 missions');
      expect(result.primaryActionIcon).toBe('chevron-down');
    });

    it('returns offline state with no action when no cached missions', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        isOffline: true,
        visibleCount: 0,
      });

      expect(result.severity).toBe('incident');
      expect(result.primaryActionLabel).toBe('Hors ligne');
      expect(result.primaryActionIcon).toBe('database');
    });
  });

  describe('broken sources state', () => {
    it('returns critical broken-sources state', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        brokenConnectorCount: 2,
        firstBrokenConnectorName: 'Malt',
      });

      expect(result.severity).toBe('critical');
      expect(result.statusLabel).toBe('Action requise');
      expect(result.title).toContain('2 sources à corriger');
      expect(result.description).toContain('Malt');
      expect(result.primaryActionLabel).toBe('Relancer le diagnostic');
      expect(result.primaryActionIcon).toBe('refresh-cw');
    });

    it('handles missing connector name gracefully', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        brokenConnectorCount: 1,
        firstBrokenConnectorName: null,
      });

      expect(result.description).toContain('Une source');
    });
  });

  describe('new missions state (attention)', () => {
    it('returns attention state for new missions with high scores', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        newCount: 8,
        highScoreCount: 3,
        visibleCount: 20,
      });

      expect(result.severity).toBe('attention');
      expect(result.statusLabel).toBe('À traiter');
      expect(result.title).toContain('3 missions prioritaires');
      expect(result.description).toContain('8 nouvelles missions au total');
      expect(result.primaryActionLabel).toContain('Voir les 3 missions prioritaires');
      expect(result.primaryActionIcon).toBe('chevron-down');
    });

    it('returns attention state for new missions without high scores', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        newCount: 5,
        highScoreCount: 0,
        visibleCount: 15,
      });

      expect(result.severity).toBe('attention');
      expect(result.title).toContain('5 nouvelles missions');
      expect(result.description).toContain('Aucune urgence détectée');
      expect(result.primaryActionLabel).toBe('Voir les 5 nouvelles missions');
    });

    it('uses singular form when newCount is 1', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        newCount: 1,
        visibleCount: 1,
      });

      expect(result.title).toContain('1 nouvelle mission');
      expect(result.primaryActionLabel).toBe('Voir la nouvelle mission');
    });
  });

  describe('priority-ready state (success)', () => {
    it('returns success state when only priority missions available', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        newCount: 0,
        highScoreCount: 4,
        visibleCount: 20,
        alertEnabled: true,
        alertScoreThreshold: 80,
      });

      expect(result.severity).toBe('success');
      expect(result.statusLabel).toBe('Priorités prêtes');
      expect(result.title).toContain('4 opportunités prioritaires');
      expect(result.description).toContain('seuil 80+');
      expect(result.primaryActionLabel).toContain('Voir les 4 missions prioritaires');
    });

    it('adjusts copy for threshold >= 80', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        highScoreCount: 2,
        visibleCount: 10,
        alertEnabled: true,
        alertScoreThreshold: 85,
      });

      expect(result.primaryActionLabel).toContain('prioritaires');
    });

    it('adjusts copy for threshold < 80', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        highScoreCount: 3,
        visibleCount: 10,
        alertEnabled: true,
        alertScoreThreshold: 70,
      });

      expect(result.primaryActionLabel).toContain('prioritaires');
    });

    it('does not show priority-ready when alertEnabled is false', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        highScoreCount: 3,
        visibleCount: 10,
        alertEnabled: false,
      });

      // Should fall through to feed-ready
      expect(result.severity).toBe('success');
      expect(result.statusLabel).toBe('Normal');
    });
  });

  describe('empty states (filtered-empty / scanned-empty / never-scanned)', () => {
    it('returns attention filtered-empty when filters hide all cached missions', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        visibleCount: 0,
        filterActive: true,
        totalMissionCount: 8, // 8 missions cached but hidden by filters
        hasCompletedScan: true,
      });

      expect(result.severity).toBe('attention');
      expect(result.statusLabel).toBe('Filtres sans résultat');
      expect(result.title).toBe('Aucune mission ne correspond à vos filtres actifs');
      expect(result.description).toContain('filtres les masquent');
      expect(result.primaryActionLabel).toBe('Effacer les filtres');
      expect(result.primaryActionIcon).toBe('filter-x');
    });

    it('filtered-empty takes precedence over scanned-empty', () => {
      // Missions exist + filters active + scan completed: filters win.
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        visibleCount: 0,
        filterActive: true,
        totalMissionCount: 5,
        hasCompletedScan: true,
      });

      expect(result.statusLabel).toBe('Filtres sans résultat');
      expect(result.primaryActionLabel).toBe('Effacer les filtres');
    });

    it('projects a dedicated empty state for a search with no result', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        visibleCount: 0,
        filterActive: true,
        totalMissionCount: 10,
        searchQuery: 'Rust introuvable',
        hasCompletedScan: true,
      });

      expect(result.statusLabel).toBe('Recherche sans résultat');
      expect(result.title).toBe('Aucune mission pour « Rust introuvable »');
      expect(result.description).toContain('cette recherche');
      expect(result.primaryActionLabel).toBe('Effacer la recherche');
    });

    it('does not show filtered-empty when no filter is active even if missions cached', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        visibleCount: 0,
        filterActive: false,
        totalMissionCount: 8,
        hasCompletedScan: true,
      });

      expect(result.statusLabel).toBe('Aucune correspondance');
      expect(result.primaryActionLabel).toBe('Ajuster le profil');
    });

    it('does not show filtered-empty when totalMissionCount is 0 (no cached missions)', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        visibleCount: 0,
        filterActive: true,
        totalMissionCount: 0,
        hasCompletedScan: true,
      });

      expect(result.statusLabel).toBe('Aucune correspondance');
    });

    it('returns attention scanned-empty when scanned but no matches', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        visibleCount: 0,
        hasCompletedScan: true, // ← Key discriminator
      });

      expect(result.severity).toBe('attention');
      expect(result.statusLabel).toBe('Aucune correspondance');
      expect(result.title).toBe('Aucune mission ne correspond à votre profil actuel');
      expect(result.description).toContain('Ajustez vos critères');
      expect(result.primaryActionLabel).toBe('Ajuster le profil');
      expect(result.primaryActionIcon).toBe('user');
    });

    it('returns neutral never-scanned when never scanned', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        visibleCount: 0,
        hasCompletedScan: false, // ← Key discriminator
      });

      expect(result.severity).toBe('neutral');
      expect(result.statusLabel).toBe('Aucune donnée');
      expect(result.title).toBe('Lancez un premier scan pour voir vos missions');
      expect(result.description).toContain('Connectez ou vérifiez les sources');
      expect(result.primaryActionLabel).toBe('Lancer le scan');
      expect(result.primaryActionIcon).toBe('play');
    });

    it('scanned-empty takes precedence over never-scanned when both conditions could apply', () => {
      // Edge case: visibleCount === 0 and hasCompletedScan === true
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        visibleCount: 0,
        hasCompletedScan: true,
      });

      expect(result.severity).toBe('attention');
      expect(result.title).toContain('Aucune mission ne correspond');
    });
  });

  describe('French action inflection', () => {
    it('uses singular labels for one priority mission', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        newCount: 1,
        highScoreCount: 1,
        visibleCount: 1,
      });

      expect(result.primaryActionLabel).toBe('Voir la mission prioritaire');
      expect(result.primaryActionLabel).not.toContain('1 missions');
    });
  });

  describe('feed-ready state (success, fallback)', () => {
    it('returns success feed-ready when missions available, no new/priority', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        newCount: 0,
        highScoreCount: 0,
        visibleCount: 15,
        hasCompletedScan: true,
      });

      expect(result.severity).toBe('success');
      expect(result.statusLabel).toBe('Normal');
      expect(result.title).toContain('15 missions disponibles');
      expect(result.description).toContain('Le système est stable');
      expect(result.primaryActionLabel).toContain('Voir les 15 missions');
      expect(result.primaryActionIcon).toBe('chevron-down');
    });

    it('uses singular form when visibleCount is 1', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        visibleCount: 1,
        hasCompletedScan: true,
      });

      expect(result.title).toContain('1 mission disponible');
    });
  });

  describe('evidence array', () => {
    it('always includes Nouvelles, Prioritaires, Sources en erreur', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        newCount: 3,
        highScoreCount: 1,
        brokenConnectorCount: 0,
        visibleCount: 10,
      });

      expect(result.evidence).toHaveLength(3);
      expect(result.evidence[0].label).toBe('Nouvelles');
      expect(result.evidence[0].value).toBe(3);
      expect(result.evidence[1].label).toContain('Prioritaires');
      expect(result.evidence[1].value).toBe(1);
      expect(result.evidence[2].label).toBe('Sources en erreur');
      expect(result.evidence[2].value).toBe(0);
    });

    it('reflects threshold in Prioritaires label', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        alertScoreThreshold: 85,
        visibleCount: 5,
      });

      expect(result.evidence[1].label).toBe('Prioritaires 85+');
    });

    it('sets attention severity when newCount > 0', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        newCount: 2,
        visibleCount: 5,
      });

      expect(result.evidence[0].severity).toBe('attention');
    });

    it('sets success severity when highScoreCount > 0', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        highScoreCount: 1,
        visibleCount: 5,
      });

      expect(result.evidence[1].severity).toBe('success');
    });

    it('sets critical severity when brokenConnectorCount > 0', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        brokenConnectorCount: 1,
        visibleCount: 5,
      });

      expect(result.evidence[2].severity).toBe('critical');
      expect(result.evidence[2].icon).toBe('triangle-alert');
    });

    it('sets success icon when no broken connectors', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        brokenConnectorCount: 0,
        visibleCount: 5,
      });

      expect(result.evidence[2].severity).toBe('success');
      expect(result.evidence[2].icon).toBe('shield-check');
    });
  });

  describe('precedence (model contract)', () => {
    it('error > offline', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        error: 'Test error',
        isOffline: true,
        visibleCount: 0,
      });

      expect(result.severity).toBe('critical');
      expect(result.title).toContain('Impossible de récupérer');
    });

    it('offline > broken sources', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        isOffline: true,
        brokenConnectorCount: 1,
        visibleCount: 5,
      });

      expect(result.severity).toBe('incident');
      expect(result.statusLabel).toBe('Hors ligne');
    });

    it('broken sources > new missions', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        brokenConnectorCount: 1,
        newCount: 3,
        visibleCount: 10,
      });

      expect(result.severity).toBe('critical');
      expect(result.statusLabel).toBe('Action requise');
    });

    it('new missions > priority-ready', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        newCount: 2,
        highScoreCount: 1,
        visibleCount: 10,
      });

      expect(result.severity).toBe('attention');
      expect(result.statusLabel).toBe('À traiter');
    });

    it('priority-ready > empty states', () => {
      const result = buildFeedStory({
        ...DEFAULT_INPUT,
        highScoreCount: 1,
        visibleCount: 0, // This shouldn't happen in practice but tests precedence
        alertEnabled: true,
      });

      // Priority check comes before empty check
      expect(result.severity).toBe('success');
      expect(result.statusLabel).toBe('Priorités prêtes');
    });

    it('scanned-empty > never-scanned (same visibleCount)', () => {
      const scanned = buildFeedStory({
        ...DEFAULT_INPUT,
        visibleCount: 0,
        hasCompletedScan: true,
      });
      const neverScanned = buildFeedStory({
        ...DEFAULT_INPUT,
        visibleCount: 0,
        hasCompletedScan: false,
      });

      expect(scanned.severity).toBe('attention');
      expect(neverScanned.severity).toBe('neutral');
    });
  });
});
