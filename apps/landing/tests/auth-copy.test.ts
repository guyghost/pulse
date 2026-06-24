import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('auth copy', () => {
  const registerSource = readFileSync('src/routes/register/+page.svelte', 'utf8');
  const loginSource = readFileSync('src/routes/login/+page.svelte', 'utf8');
  const normalizedRegisterSource = registerSource.replace(/\s+/g, ' ');
  const normalizedLoginSource = loginSource.replace(/\s+/g, ' ');

  it('explains account sync without exposing auth provider details', () => {
    expect(normalizedRegisterSource).toContain(
      'Le compte synchronise uniquement snapshots, CV, préférences et candidatures.'
    );
    expect(normalizedRegisterSource).toContain('Vos sessions plateforme restent dans Chrome.');
    expect(normalizedRegisterSource).toContain('Recevoir mon lien de création');
    expect(registerSource).not.toContain('Supabase les activera');
  });

  it('keeps login copy polished and provider-neutral', () => {
    expect(normalizedLoginSource).toContain('Nous avons envoyé un lien à');
    expect(normalizedLoginSource).toContain('accéder à la destination demandée');
    expect(normalizedLoginSource).toContain('environnements configurés');
    expect(normalizedLoginSource).toContain('disponible selon votre navigateur et votre compte');
    expect(loginSource).not.toContain('Supabase l');
  });
});
