import { describe, it, expect } from 'vitest';
import { parseCometHTML } from '../../../src/lib/core/connectors/comet-parser';

const NOW = new Date('2026-03-13T12:00:00Z');
const ID_PREFIX = 'comet-test';

const FIXTURE_HTML = `
<html><body>
<div class="mission-card" data-testid="mission-item">
  <a class="mission-card__link" href="/app/mission/architect-cloud-abc">
    <h3 class="mission-card__title">Architecte Cloud AWS</h3>
  </a>
  <span class="mission-card__client">BNP Paribas</span>
  <div class="mission-card__tags">
    <span class="tag">AWS</span>
    <span class="tag">Terraform</span>
    <span class="tag">Docker</span>
  </div>
  <span class="mission-card__tjm">800 EUR/j</span>
  <span class="mission-card__location">Paris</span>
  <span class="mission-card__remote">Teletravail complet</span>
  <span class="mission-card__duration">9 mois</span>
  <p class="mission-card__desc">Mission pour le departement cloud de BNP.</p>
</div>
<div class="mission-card" data-testid="mission-item">
  <a class="mission-card__link" href="/app/mission/dev-python-xyz">
    <h3 class="mission-card__title">Developpeur Python Data</h3>
  </a>
  <span class="mission-card__client">Societe Generale</span>
  <div class="mission-card__tags">
    <span class="tag">Python</span>
    <span class="tag">Pandas</span>
  </div>
  <span class="mission-card__tjm">700 EUR/j</span>
  <span class="mission-card__location">La Defense</span>
  <span class="mission-card__remote">Hybride</span>
  <span class="mission-card__duration">6 mois</span>
  <p class="mission-card__desc">Projet data pour la banque d'investissement.</p>
</div>
</body></html>
`;

describe('parseCometHTML', () => {
  it('parse les cartes de mission depuis le HTML', () => {
    const missions = parseCometHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions).toHaveLength(2);
    expect(missions[0]).toMatchObject({
      source: 'comet',
      title: 'Architecte Cloud AWS',
      client: 'BNP Paribas',
      url: expect.stringContaining('comet.co'),
      id: 'comet-test-0',
      scrapedAt: NOW,
    });
  });

  it('extrait les tags de stack', () => {
    const missions = parseCometHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].stack).toEqual(['AWS', 'Terraform', 'Docker']);
  });

  it('extrait le TJM comme nombre', () => {
    const missions = parseCometHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].tjm).toBe(800);
    expect(missions[1].tjm).toBe(700);
  });

  it('detecte le type remote', () => {
    const missions = parseCometHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].remote).toBe('full');
    expect(missions[1].remote).toBe('hybrid');
  });

  it('retourne un tableau vide pour du HTML vide', () => {
    expect(parseCometHTML('', NOW, ID_PREFIX)).toEqual([]);
  });

  it('retourne un tableau vide pour du HTML sans resultats', () => {
    expect(parseCometHTML('<html><body><p>Aucun resultat</p></body></html>', NOW, ID_PREFIX)).toEqual([]);
  });
});
