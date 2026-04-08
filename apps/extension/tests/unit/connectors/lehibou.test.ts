import { describe, it, expect } from 'vitest';
import { parseLeHibouHTML } from '../../../src/lib/core/connectors/lehibou-parser';

const NOW = new Date('2026-03-13T12:00:00Z');

const FIXTURE_HTML = `
<html><body>
<a class="mission-card" href="/annonce/aaa-bbb-ccc?source=search-engine">
  <span class="mission-card__publishedDate">Publiee il y a 6 heures</span>
  <header class="mission-card__header">
    <h1 class="mission-card__header__title">Expert Splunk H/F</h1>
    <span class="atom-badge"><span>Mission LeHibou</span></span>
  </header>
  <section class="mission-card__informations">
    <div class="mission-card__informations__item"><span></span><span>Paris</span></div>
    <div class="mission-card__informations__item"><span></span><span>24 mois</span></div>
    <div class="mission-card__informations__item"><span></span><span>ASAP</span></div>
  </section>
  <section class="mission-card__skills">
    <div class="tag"><span class="mission-card__skills--title">Splunk</span></div>
    <div class="tag"><span class="mission-card__skills--title">Qualys</span></div>
  </section>
  <footer class="mission-card__footer">
    <div class="mission-card__footer__dailyPrice">550 \u20ac/jour</div>
    <span class="mission-card__publishedDate">Publiee il y a 6 heures</span>
  </footer>
</a>
<a class="mission-card" href="/annonce/ddd-eee-fff?source=search-engine">
  <header class="mission-card__header">
    <h1 class="mission-card__header__title">Dev Java Backend</h1>
    <span class="atom-badge"><span>Mission externe</span></span>
  </header>
  <section class="mission-card__informations">
    <div class="mission-card__informations__item"><span></span><span>Lyon</span></div>
    <div class="mission-card__informations__item"><span></span><span>6 mois</span></div>
    <div class="mission-card__informations__item"><span></span><span>ASAP</span></div>
  </section>
  <section class="mission-card__skills">
    <div class="tag"><span class="mission-card__skills--title">Java</span></div>
    <div class="tag"><span class="mission-card__skills--title">Spring Boot</span></div>
  </section>
  <footer class="mission-card__footer">
    <div class="mission-card__footer__dailyPrice">650 \u20ac/jour</div>
  </footer>
</a>
</body></html>
`;

describe('parseLeHibouHTML', () => {
  it('parse les cartes de mission depuis le HTML', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW);
    expect(missions).toHaveLength(2);
    expect(missions[0]).toMatchObject({
      source: 'lehibou',
      title: 'Expert Splunk H/F',
      id: 'lh-aaa-bbb-ccc',
      scrapedAt: NOW,
    });
  });

  it('extrait le UUID du href comme ID (prefixe lh-)', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW);
    expect(missions[0].id).toBe('lh-aaa-bbb-ccc');
    expect(missions[1].id).toBe('lh-ddd-eee-fff');
  });

  it('construit l URL sans le query param source', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW);
    expect(missions[0].url).toBe('https://www.lehibou.com/annonce/aaa-bbb-ccc');
    expect(missions[1].url).toBe('https://www.lehibou.com/annonce/ddd-eee-fff');
  });

  it('extrait les tags de stack', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW);
    expect(missions[0].stack).toEqual(['Splunk', 'Qualys']);
    expect(missions[1].stack).toEqual(['Java', 'Spring Boot']);
  });

  it('extrait le TJM comme nombre', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW);
    expect(missions[0].tjm).toBe(550);
    expect(missions[1].tjm).toBe(650);
  });

  it('extrait la localisation depuis le 1er item info', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW);
    expect(missions[0].location).toBe('Paris');
    expect(missions[1].location).toBe('Lyon');
  });

  it('extrait la duree depuis le 2eme item info', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW);
    expect(missions[0].duration).toBe('24 mois');
    expect(missions[1].duration).toBe('6 mois');
  });

  it('client, remote et description sont null/vide', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW);
    expect(missions[0].client).toBeNull();
    expect(missions[0].remote).toBeNull();
    expect(missions[0].description).toBe('');
  });

  it('retourne un tableau vide pour du HTML vide', () => {
    expect(parseLeHibouHTML('', NOW)).toEqual([]);
  });

  it('retourne un tableau vide pour du HTML sans cartes', () => {
    expect(parseLeHibouHTML('<html><body><p>Aucun resultat</p></body></html>', NOW)).toEqual([]);
  });

  it('ignore les cartes sans titre', () => {
    const htmlSansTitre = `
    <html><body>
    <a class="mission-card" href="/annonce/xxx-yyy-zzz?source=search-engine">
      <header class="mission-card__header">
        <h1 class="mission-card__header__title"></h1>
      </header>
      <footer class="mission-card__footer">
        <div class="mission-card__footer__dailyPrice">500 \u20ac/jour</div>
      </footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(htmlSansTitre, NOW);
    expect(missions).toEqual([]);
  });

  it('detecte le remote depuis le texte de la carte', () => {
    const htmlRemote = `
    <html><body>
    <a class="mission-card" href="/annonce/rem-ote-123?source=search-engine">
      <header class="mission-card__header">
        <h1 class="mission-card__header__title">Dev React Full Remote</h1>
      </header>
      <section class="mission-card__informations">
        <div class="mission-card__informations__item"><span></span><span>Full remote</span></div>
        <div class="mission-card__informations__item"><span></span><span>6 mois</span></div>
        <div class="mission-card__informations__item"><span></span><span>ASAP</span></div>
      </section>
      <footer class="mission-card__footer">
        <div class="mission-card__footer__dailyPrice">700 \u20ac/jour</div>
      </footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(htmlRemote, NOW);
    expect(missions[0].remote).toBe('full');
  });

  it('retourne tjm null si le prix est absent', () => {
    const htmlSansPrix = `
    <html><body>
    <a class="mission-card" href="/annonce/xxx-yyy-zzz?source=search-engine">
      <header class="mission-card__header">
        <h1 class="mission-card__header__title">Mission Sans Prix</h1>
      </header>
      <section class="mission-card__informations">
        <div class="mission-card__informations__item"><span></span><span>Paris</span></div>
        <div class="mission-card__informations__item"><span></span><span>3 mois</span></div>
        <div class="mission-card__informations__item"><span></span><span>ASAP</span></div>
      </section>
      <footer class="mission-card__footer"></footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(htmlSansPrix, NOW);
    expect(missions).toHaveLength(1);
    expect(missions[0].tjm).toBeNull();
  });
});
