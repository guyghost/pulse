import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const landingDir = resolve(testDir, '..');

const readRoute = (path: string) => readFileSync(resolve(landingDir, path), 'utf8');

describe('connected privacy copy', () => {
  const homePage = readRoute('src/routes/+page.svelte');
  const privacyPage = readRoute('src/routes/privacy/+page.svelte');
  const publicCopy = `${homePage}\n${privacyPage}`;

  it('does not promise a serverless local-only product after connected sync launch', () => {
    expect(publicCopy).not.toContain('100% local');
    expect(publicCopy).not.toContain('Aucun serveur');
    expect(publicCopy).not.toContain("nous n'en avons pas");
  });

  it('describes local execution and optional dashboard cloud sync explicitly', () => {
    expect(homePage).toContain('Exécution navigateur');
    expect(homePage).toContain('dashboard connecté optionnel');
    expect(privacyPage).toContain("L'exécution plateforme reste locale dans votre navigateur");
    expect(privacyPage).toContain('snapshots normalisés via Supabase');
    expect(privacyPage).toContain('Nous ne synchronisons pas les mots de passe');
  });
});
