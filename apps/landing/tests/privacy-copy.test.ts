import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const landingDir = resolve(testDir, '..');
const repoDir = resolve(landingDir, '..', '..');

const readRoute = (path: string) => readFileSync(resolve(landingDir, path), 'utf8');
const readRepoFile = (path: string) => readFileSync(resolve(repoDir, path), 'utf8');

describe('V1 local-first privacy copy', () => {
  const homePage = readRoute('src/routes/+page.svelte');
  const privacyPage = readRoute('src/routes/privacy/+page.svelte');
  const storeListing = readRepoFile('docs/store-listing.md');
  const privacyPolicy = readRepoFile('docs/privacy-policy.md');
  const publicCopy = `${homePage}\n${privacyPage}\n${storeListing}\n${privacyPolicy}`;

  it('does not promise a serverless local-only product after connected sync launch', () => {
    // Reject "100% local" and any "100% ... local(e)" variant (e.g. "100% gratuite et locale"):
    // the connected dashboard path makes a pure-local claim inaccurate (see
    // docs/specs/dashboard-microfrontend.md). Execution is local; sync is optional/à venir.
    expect(publicCopy).not.toMatch(/100\s*%[^\n.]*\blocal/i);
    expect(publicCopy).not.toContain('Aucun serveur');
    expect(publicCopy).not.toContain("nous n'en avons pas");
    expect(publicCopy).not.toContain('Aucun compte à créer');
    expect(publicCopy).not.toContain('Vos données restent chez vous');
  });

  it('keeps launch surfaces local-first while legal copy describes the dormant connected layer', () => {
    expect(homePage).toContain('depuis vos sessions navigateur');
    expect(homePage).toContain('en local');
    expect(homePage).toContain('sans compte');
    expect(privacyPage).toContain("L'exécution plateforme reste locale dans votre navigateur");
    expect(privacyPage).toContain('snapshots normalisés via Supabase');
    expect(privacyPage).toContain('Nous ne synchronisons pas les mots de passe');
    expect(storeListing).toMatch(/sans\s+compte\s+MissionPulse/);
    expect(storeListing).not.toContain('Dashboard connecté optionnel');
    expect(privacyPolicy).toContain('snapshots normalisés via Supabase');
    expect(privacyPolicy).toContain('Nous ne synchronisons pas les mots de passe');
  });

  it('keeps Premium boundaries in legal copy without offering Premium publicly', () => {
    expect(privacyPage).toContain('consentement explicite');
    expect(privacyPage).toContain('MissionPulse ne soumet jamais le formulaire');
    expect(privacyPolicy).toContain('Worker local dedie');
    expect(privacyPolicy).toContain('aucun fallback cloud');
    expect(homePage).not.toContain('Premium');
    expect(storeListing).not.toContain('Premium');
  });
});
