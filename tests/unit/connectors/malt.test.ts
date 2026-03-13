import { describe, it, expect } from 'vitest';
import { parseMaltHTML } from '../../../src/lib/core/connectors/malt-parser';

const NOW = new Date('2026-03-13T12:00:00Z');
const ID_PREFIX = 'malt-test';

const FIXTURE_HTML = `
<html><body>
<div class="listing-card" data-testid="freelance-listing">
  <h3 class="listing-card__title"><a href="/project/dev-react-senior-abc123">Developpeur React Senior</a></h3>
  <span class="listing-card__company">FinTech Corp</span>
  <div class="listing-card__skills">
    <span class="skill-badge">React</span>
    <span class="skill-badge">TypeScript</span>
    <span class="skill-badge">GraphQL</span>
  </div>
  <span class="listing-card__rate">650 EUR/jour</span>
  <span class="listing-card__location">Paris, France</span>
  <span class="listing-card__duration">12 mois</span>
  <p class="listing-card__description">Mission pour un grand compte bancaire. Full remote possible.</p>
</div>
<div class="listing-card" data-testid="freelance-listing">
  <h3 class="listing-card__title"><a href="/project/dev-java-xyz789">Developpeur Java Backend</a></h3>
  <span class="listing-card__company">Banque SA</span>
  <div class="listing-card__skills">
    <span class="skill-badge">Java</span>
    <span class="skill-badge">Spring Boot</span>
  </div>
  <span class="listing-card__rate">550 EUR/jour</span>
  <span class="listing-card__location">Lyon</span>
  <span class="listing-card__duration">6 mois</span>
  <p class="listing-card__description">Mission Java sur site a Lyon.</p>
</div>
</body></html>
`;

describe('parseMaltHTML', () => {
  it('parse les cartes de mission depuis le HTML', () => {
    const missions = parseMaltHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions).toHaveLength(2);
    expect(missions[0]).toMatchObject({
      source: 'malt',
      title: 'Developpeur React Senior',
      client: 'FinTech Corp',
      url: expect.stringContaining('malt.fr'),
      id: 'malt-test-0',
      scrapedAt: NOW,
    });
  });

  it('extrait les tags de stack', () => {
    const missions = parseMaltHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].stack).toEqual(['React', 'TypeScript', 'GraphQL']);
  });

  it('extrait le TJM comme nombre', () => {
    const missions = parseMaltHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].tjm).toBe(650);
    expect(missions[1].tjm).toBe(550);
  });

  it('extrait la localisation', () => {
    const missions = parseMaltHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].location).toBe('Paris, France');
    expect(missions[1].location).toBe('Lyon');
  });

  it('detecte le type remote depuis le texte', () => {
    const missions = parseMaltHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].remote).toBe('full');
    expect(missions[1].remote).toBe('onsite');
  });

  it('retourne un tableau vide pour du HTML vide', () => {
    expect(parseMaltHTML('', NOW, ID_PREFIX)).toEqual([]);
  });

  it('retourne un tableau vide pour du HTML sans resultats', () => {
    expect(parseMaltHTML('<html><body><p>Aucun resultat</p></body></html>', NOW, ID_PREFIX)).toEqual([]);
  });
});
