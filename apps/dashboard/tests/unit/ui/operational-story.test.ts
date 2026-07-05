import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('connected dashboard operational story', () => {
  const source = readFileSync('src/routes/+page.svelte', 'utf8');
  const normalizedSource = source.replace(/\s+/g, ' ');

  it('renders a compact status banner only on attention or incident', () => {
    // The operational story is a decision function (model) that drives a compact
    // banner — not an always-on corporate narrative.
    expect(source).toContain('interface DashboardOperationalStory');
    expect(source).toContain('function getDashboardOperationalStory');
    // The banner renders only for actionable tones; success never paints chrome.
    expect(source).toContain(
      "operationalStory.tone === 'attention' || operationalStory.tone === 'incident'"
    );
    // The decorative storytelling chrome is gone.
    expect(source).not.toContain('État opérationnel');
    expect(source).not.toContain('Action recommandée');
    expect(source).not.toContain('Aller à l’action');
    expect(source).not.toContain('operationalStory.signals');
    // Copy is concrete and verifiable (counts + verbs), not vague adjectives.
    expect(source).toContain('de sync à arbitrer');
    expect(source).toContain('Relance à préparer:');
    // Ordering: when it renders, the banner precedes the metrics region.
    expect(source.indexOf('operational-story-title')).toBeLessThan(
      source.indexOf('aria-label="Indicateurs candidatures"')
    );
  });

  it('hides empty hero metrics until meaningful data exists', () => {
    // M2: metrics visibility is the source of truth for the hero metrics region.
    expect(source).toContain('deriveMetricsVisibility');
    expect(source).toContain('const metricsVisibility = $derived(');
    // When every metric is empty, the 4-card grid is replaced by one honest line.
    expect(source).toContain("metricsVisibility.phase === 'hidden'");
    expect(source).toContain('Aucune candidature suivie');
    // Cards render per-metric availability, so no "0 / N/A / Aucun" ever ships.
    expect(source).toContain("metricsVisibility.availability.applications === 'has_data'");
    expect(source).toContain("metricsVisibility.availability.interviews === 'has_data'");
    expect(source).toContain("metricsVisibility.availability.nextFollowUp === 'has_data'");
    expect(source).toContain("metricsVisibility.availability.averageScore === 'has_data'");
  });

  it('does not mark the dashboard ready before an extension is linked', () => {
    expect(source).toContain('const hasConnectedExtension = $derived');
    expect(source).toContain(
      'const dashboardReady = $derived(isConnected && !configurationMissing && hasConnectedExtension)'
    );
    expect(source).toContain('hasConnectedExtension,');
    expect(source).toContain('const sidebarConnectionTitle = $derived');
    expect(source).toContain("  ? 'Extension Chrome'");
    expect(source).toContain(
      '{completedDashboardSetupStepCount}/{dashboardSetupSteps.length} setup'
    );
    expect(source).not.toContain(
      'const dashboardReady = $derived(isConnected && !configurationMissing);'
    );
  });

  it('surfaces the mission feed as the primary dashboard surface', () => {
    // M1: the dashboard phase is the single source of truth for what renders, in what order.
    expect(source).toContain('deriveDashboardPhase');
    expect(source).toContain('const dashboardPhase = $derived(');
    expect(source).toContain('const feedIsPrimary = $derived(isFeedPrimary(dashboardPhase))');
    // The feed renders first in onboarding + live, gated by the model (not by setup chrome).
    expect(source).toContain("{#if dashboardPhase === 'onboarding' || feedIsPrimary}");
    // The capped slice is gone; progressive disclosure replaces it.
    expect(source).not.toContain('.slice(0, 6)');
    expect(source).toContain('visibleMissionFeed');
    expect(source).toContain('Afficher plus de missions');
    // The "Surfaces activées après setup" preview grid + its vacuous-metrics line are gone.
    expect(source).not.toContain('Surfaces activées après setup');
    expect(source).not.toContain('dashboardSetupPreviewItems');
    expect(source).not.toContain('DashboardSetupPreviewItem');
    expect(source).not.toContain('Le dashboard évite ainsi les métriques vides ou les N/A');
    // Metrics remain in the authenticated surface, behind the setup guard (tightened next).
    expect(source).toContain('{#if !setupRequired}');
    expect(source).toContain('aria-label="Indicateurs candidatures"');
  });

  it('keeps core dashboard vocabulary without an in-page anchor nav', () => {
    expect(source).toContain('Candidatures');
    // The 3-tab anchor nav that sat between the user and the feed is removed (distill).
    expect(normalizedSource).not.toContain('>Synchronisation</a');
    expect(normalizedSource).not.toContain('href="#cv">CV</a');
    expect(normalizedSource).not.toContain('> Explore </a');
    expect(normalizedSource).not.toContain('> Profil CV </a');
    expect(normalizedSource).not.toContain('> Synchronisations</a');
  });

  it('guides sync conflict resolution before showing action buttons', () => {
    expect(source).toContain('interface SyncConflictResolutionStep');
    expect(source).toContain('Guide de résolution guidée');
    expect(source).toContain('1. Identifier la source fiable');
    expect(source).toContain('2. Choisir l’arbitrage');
    expect(source).toContain('3. Ignorer seulement le bruit');
    expect(source).toContain('Garder dashboard conserve la donnée web');
    expect(source.indexOf('Guide de résolution guidée')).toBeLessThan(
      source.indexOf('value="keep_remote"')
    );
  });

  it('surfaces success milestones before raw dashboard metrics', () => {
    expect(source).toContain('buildDashboardSuccessMilestones');
    expect(source).toContain('Résultats débloqués');
    expect(source).toContain('Jalons de confiance');
    expect(normalizedSource).toContain(
      'mission qualifiée, relance traitée, CV prêt et export disponible'
    );
    expect(source.indexOf('success-milestones-title')).toBeLessThan(
      source.indexOf('aria-label="Indicateurs candidatures"')
    );
  });
});
