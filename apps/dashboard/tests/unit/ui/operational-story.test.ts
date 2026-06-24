import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('connected dashboard operational story', () => {
  const source = readFileSync('src/routes/+page.svelte', 'utf8');

  it('prioritizes a narrative operational state before metrics', () => {
    expect(source).toContain('interface DashboardOperationalStory');
    expect(source).toContain('function getDashboardOperationalStory');
    expect(source).toContain('Etat operationnel');
    expect(source).toContain('Impact');
    expect(source).toContain('Action recommandée');
    expect(source).toContain("Prochaine action: installer l'extension");
    expect(source).toContain('La synchronisation demande une décision');
    expect(source).toContain('Relance à préparer');
    expect(source).toContain('ressort comme meilleure mission fraîche');
    expect(source.indexOf('operational-story-title')).toBeLessThan(
      source.indexOf('aria-label="Indicateurs candidatures"')
    );
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
});
