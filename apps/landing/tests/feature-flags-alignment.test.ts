import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTENSION_SURFACE_FLAGS } from '@pulse/domain';

const testDir = dirname(fileURLToPath(import.meta.url));
const landingDir = resolve(testDir, '..');
const homePage = readFileSync(resolve(landingDir, 'src/routes/+page.svelte'), 'utf8');

describe('landing / extension surface flag alignment', () => {
  it('derives the homepage discourse from the shared domain flags', () => {
    expect(homePage).toContain("import { EXTENSION_SURFACE_FLAGS } from '@pulse/domain'");
    expect(homePage).toContain('const trackingLive = EXTENSION_SURFACE_FLAGS.applications');
    expect(homePage).toContain('const connectedLive = EXTENSION_SURFACE_FLAGS.connected');
    expect(homePage).toContain('upcomingFeatures');
  });

  it('never labels a disabled surface as free in the feature matrix', () => {
    // The suivi row must be flag-driven: 'free' only when tracking ships.
    expect(homePage).toContain("tier: trackingLive ? 'free' : 'soon'");
    // The connected-dependent rows follow the connected flag.
    expect(homePage).toContain("tier: connectedLive ? 'premium' : 'soon'");
  });

  it('renders an explicit "À venir" tier badge', () => {
    expect(homePage).toContain("soon: 'À venir'");
    expect(homePage).toContain('tierLabels[row.tier]');
  });

  it('qualifies disabled surfaces as upcoming when flags are off', () => {
    if (!EXTENSION_SURFACE_FLAGS.applications) {
      // No hard-coded free tier for suivi: the row must be flag-driven.
      expect(homePage).not.toMatch(
        /Suivi de candidatures \(pipeline, notes, relances\)', tier: 'free'/
      );
    }
    if (!EXTENSION_SURFACE_FLAGS.connected) {
      // No hard-coded premium tier for the dashboard: the row must be flag-driven.
      expect(homePage).not.toMatch(
        /Dashboard connecté \(crédits, gestion de compte\)', tier: 'premium'/
      );
    }
  });

  it('gates account CTAs on the connected flag so no sign-up path is offered while it is off', () => {
    // Both account CTAs (Premium sign-up and dashboard/credits management)
    // must be flag-driven: rendered as anchors when connected is live and as
    // inert "coming soon" placeholders otherwise.
    expect(homePage).toContain('{#if connectedLive}');
    expect(homePage).toContain('Créer mon compte Premium');
    expect(homePage).toContain('Gérer mon compte et mes crédits');
    expect(homePage).toContain('aria-disabled="true"');
    expect(homePage).toContain('bientôt disponible');
  });
});
