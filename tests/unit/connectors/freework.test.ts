import { describe, it, expect } from 'vitest';
import { parseFreeWorkHTML } from '../../../src/lib/connectors/freework.connector';

const FIXTURE_HTML = `
<html><body>
<article class="mission">
  <h2><a href="/fr/tech-it/jobs/dev-react-senior-12345">Développeur React Senior</a></h2>
  <span class="company-name">Société ABC</span>
  <div class="tag">React</div>
  <div class="tag">TypeScript</div>
  <div class="tag">Node.js</div>
  <span class="daily-rate">550€/jour</span>
  <span class="location">Paris</span>
  <span class="duration">6 mois</span>
  <p class="description">Mission React/TypeScript pour un grand compte bancaire. Télétravail complet.</p>
</article>
<article class="mission">
  <h2><a href="/fr/tech-it/jobs/dev-java-67890">Développeur Java Spring</a></h2>
  <span class="company-name">Entreprise XYZ</span>
  <div class="tag">Java</div>
  <div class="tag">Spring Boot</div>
  <span class="daily-rate">500€/jour</span>
  <span class="location">Lyon</span>
  <span class="duration">3 mois</span>
  <p class="description">Mission Java hybride sur site à Lyon.</p>
</article>
</body></html>
`;

describe('parseFreeWorkHTML', () => {
  it('parses mission cards from HTML', () => {
    const missions = parseFreeWorkHTML(FIXTURE_HTML);
    expect(missions).toHaveLength(2);
    expect(missions[0]).toMatchObject({
      source: 'free-work',
      title: 'Développeur React Senior',
      client: 'Société ABC',
      url: expect.stringContaining('free-work.com'),
    });
  });

  it('extracts stack tags', () => {
    const missions = parseFreeWorkHTML(FIXTURE_HTML);
    expect(missions[0].stack).toEqual(['React', 'TypeScript', 'Node.js']);
  });

  it('extracts TJM as number', () => {
    const missions = parseFreeWorkHTML(FIXTURE_HTML);
    expect(missions[0].tjm).toBe(550);
    expect(missions[1].tjm).toBe(500);
  });

  it('extracts location', () => {
    const missions = parseFreeWorkHTML(FIXTURE_HTML);
    expect(missions[0].location).toBe('Paris');
    expect(missions[1].location).toBe('Lyon');
  });

  it('detects remote type from text', () => {
    const missions = parseFreeWorkHTML(FIXTURE_HTML);
    expect(missions[0].remote).toBe('full');
    expect(missions[1].remote).toBe('hybrid');
  });

  it('returns empty array for empty HTML', () => {
    expect(parseFreeWorkHTML('')).toEqual([]);
  });

  it('returns empty array for HTML with no mission cards', () => {
    expect(parseFreeWorkHTML('<html><body><p>No results</p></body></html>')).toEqual([]);
  });
});
