import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('auth copy', () => {
  const registerSource = readFileSync('src/routes/register/+page.svelte', 'utf8');
  const loginSource = readFileSync('src/routes/login/+page.svelte', 'utf8');
  const registerPasskeySource = readFileSync('src/routes/register/passkey/+page.svelte', 'utf8');
  const passkeySource = readFileSync('src/lib/auth/passkey.ts', 'utf8');
  const normalizedRegisterSource = registerSource.replace(/\s+/g, ' ');
  const normalizedLoginSource = loginSource.replace(/\s+/g, ' ');
  const normalizedRegisterPasskeySource = registerPasskeySource.replace(/\s+/g, ' ');

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
    expect(normalizedLoginSource).toContain(
      'Le compte synchronise uniquement snapshots, CV, préférences et candidatures. Vos sessions plateforme restent dans Chrome.'
    );
    expect(loginSource).not.toContain('Supabase l');
  });

  it('keeps passkey registration copy accented and browser-oriented', () => {
    expect(normalizedRegisterPasskeySource).toContain(
      'Dernière étape avant votre dashboard MissionPulse'
    );
    expect(normalizedRegisterPasskeySource).toContain('Création du passkey');
    expect(normalizedRegisterPasskeySource).toContain('clé de sécurité');
    expect(registerPasskeySource).not.toContain('Creation du passkey');
    expect(registerPasskeySource).not.toContain('cle de securite');
  });

  it('keeps passkey error messages accented and user-facing', () => {
    expect(passkeySource).toContain('La création ou la validation du passkey a été annulée.');
    expect(passkeySource).toContain(
      "Le passkey doit être utilisé depuis l'origine locale autorisée."
    );
    expect(passkeySource).toContain("L'opération passkey a échoué.");
    expect(passkeySource).toContain('Réponse passkey invalide');
    expect(passkeySource).toContain('Le navigateur n’a pas retourné de passkey valide.');
    expect(passkeySource).toContain('La requête passkey a échoué.');
    expect(passkeySource).toContain('Session introuvable. Relancez la création de compte.');
    expect(passkeySource).toContain("La session passkey n'a pas pu être créée.");
    expect(passkeySource).not.toContain('creation');
    expect(passkeySource).not.toContain('Reponse passkey invalide');
    expect(passkeySource).not.toContain('requete passkey');
  });
});
