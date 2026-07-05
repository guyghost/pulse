import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const landingDir = resolve(testDir, '..');
const repoDir = resolve(landingDir, '..', '..');

const readRoute = (path: string) => readFileSync(resolve(landingDir, path), 'utf8');
const readRepoFile = (path: string) => readFileSync(resolve(repoDir, path), 'utf8');

describe('connected privacy copy', () => {
  const homePage = readRoute('src/routes/+page.svelte');
  const privacyPage = readRoute('src/routes/privacy/+page.svelte');
  const storeListing = readRepoFile('docs/store-listing.md');
  const privacyPolicy = readRepoFile('docs/privacy-policy.md');
  const publicCopy = `${homePage}\n${privacyPage}\n${storeListing}\n${privacyPolicy}`;

  it('does not promise a serverless local-only product after connected sync launch', () => {
    expect(publicCopy).not.toContain('100% local');
    expect(publicCopy).not.toContain('Aucun serveur');
    expect(publicCopy).not.toContain("nous n'en avons pas");
    expect(publicCopy).not.toContain('Aucun compte à créer');
    expect(publicCopy).not.toContain('Vos données restent chez vous');
  });

  it('describes local execution and optional dashboard cloud sync explicitly', () => {
    expect(homePage).toContain('depuis vos sessions navigateur');
    expect(homePage).toContain('dashboard connecté optionnel');
    expect(homePage).toMatch(/Le compte sert au\s+dashboard connecté optionnel/);
    expect(homePage).toContain("l'exécution plateforme reste dans votre navigateur");
    expect(homePage).toContain('Le dashboard connecté optionnel synchronise votre shortlist');
    expect(privacyPage).toContain("L'exécution plateforme reste locale dans votre navigateur");
    expect(privacyPage).toContain('snapshots normalisés via Supabase');
    expect(privacyPage).toContain('Nous ne synchronisons pas les mots de passe');
    expect(storeListing).toContain('dashboard connecté optionnel');
    expect(storeListing).toContain('snapshots normalisés via Supabase');
    expect(privacyPolicy).toContain('snapshots normalisés via Supabase');
    expect(privacyPolicy).toContain('Nous ne synchronisons pas les mots de passe');
  });
});
