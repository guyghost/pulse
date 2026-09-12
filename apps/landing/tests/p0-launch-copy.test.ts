import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const landingDir = resolve(testDir, '..');
const repoDir = resolve(landingDir, '..', '..');

const homePage = readFileSync(resolve(landingDir, 'src/routes/+page.svelte'), 'utf8');
const privacyPage = readFileSync(resolve(landingDir, 'src/routes/privacy/+page.svelte'), 'utf8');
const storeListing = readFileSync(resolve(repoDir, 'docs/store-listing.md'), 'utf8');

describe('P0 launch copy (Comex / Tor)', () => {
  it('keeps the hero platforms sentence and drops the fake 42/8 scan proof', () => {
    expect(homePage).toContain(
      'Free-Work, LeHibou, Hiway et Cherry Pick dans un seul feed, scoré selon votre stack, votre'
    );
    expect(homePage).toContain('TJM et votre remote.');
    expect(homePage).not.toContain('Le dernier scan a remonté 42 missions');
    expect(homePage).not.toContain('8 à contacter maintenant');
  });

  it('labels the scanner 42/31/8 counters as an illustrative Exemple', () => {
    const scannerBlockStart = homePage.indexOf("activeShowcaseStep === 'scanner'");
    const countersStart = homePage.indexOf('<strong>42</strong>', scannerBlockStart);
    const exampleBadge = homePage.indexOf('>Exemple<', scannerBlockStart);

    expect(exampleBadge).toBeGreaterThan(-1);
    expect(exampleBadge).toBeLessThan(countersStart);
    expect(homePage).toContain('<strong>31</strong>');
    expect(homePage).toContain('score-flow__example-badge');
  });

  it('never advertises Chrome Web Store when the public store URL is empty', () => {
    expect(homePage).toContain('const installCtaLabel = "Installer l\'extension gratuite"');
    expect(homePage).toContain("configuredChromeStoreUrl || '#install'");
    expect(homePage).not.toContain('Installer sur Chrome Web Store');
  });

  it('uses the sealed short Store listing', () => {
    expect(storeListing).toContain(
      'Radar freelance tech : 4 plateformes, 1 feed scoré, exécution navigateur. Local-first.'
    );
    expect(storeListing).not.toContain(
      'Radar freelance tech : 4 plateformes, 1 feed scoré, dashboard connecté optionnel. Exécution navigateur.'
    );
  });

  it('aligns the live privacy page date with docs/privacy-policy.md', () => {
    expect(privacyPage).toContain('2026-07-30');
    expect(privacyPage).toContain('datetime="2026-07-30"');
    expect(privacyPage).not.toContain('Mai 2026');
  });
});
