import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('landing account dashboard operational UI', () => {
  const source = readFileSync('src/routes/dashboard/+page.svelte', 'utf8');
  const homeSource = readFileSync('src/routes/+page.svelte', 'utf8');

  it('opens with a business diagnosis and a recommended next action', () => {
    expect(source).toContain('type AccountTone');
    expect(source).toContain('interface AccountDecision');
    expect(source).toContain('function getAccountDecision');
    expect(source).toContain('État opérationnel');
    expect(source).toContain('Prochaine action:');
    expect(source).toContain('Impact');
    expect(source).toContain('accountDecision.primaryAction');
  });

  it('keeps credit purchase details behind progressive disclosure', () => {
    expect(source).toContain('<details class="credit-drawer"');
    expect(source).toContain('Choisir un pack de crédits');
    expect(source).toContain('Recommandation: {recommendedPack.label}');
    expect(source).toContain('credit-pack--recommended');
    expect(source).not.toContain('<table');
  });

  it('keeps the public proof strip decision-oriented instead of raw stats', () => {
    expect(homeSource).toContain('Preuves operationnelles');
    expect(homeSource).toContain('Chaque signal doit mener a une action');
    expect(homeSource).toContain('Vous voyez ou chercher en premier');
    expect(homeSource).toContain('Le score explique la decision');
    expect(homeSource).toContain('Les generations restent pilotees');
    expect(homeSource).not.toContain('stat-item__value');
    expect(homeSource).not.toContain('Crédits Premium / mois');
  });

  it('implements the freelance acquisition wedge on the public landing', () => {
    expect(homeSource).toContain('Les bonnes missions freelance');
    expect(homeSource).toContain('Développeurs 3+ ans');
    expect(homeSource).toContain('TJM 450-900€');
    expect(homeSource).toContain('Shortlist quotidienne');
    expect(homeSource).toContain('missions Java, Spring Boot et frontend senior');
    expect(homeSource).toContain('Tester Premium');
    expect(homeSource).toContain('prix 9-15€/mois');
    expect(homeSource).toContain('12€<small>/mois</small>');
  });
});
