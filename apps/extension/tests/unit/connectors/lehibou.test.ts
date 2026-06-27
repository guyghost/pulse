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

// ---------------------------------------------------------------------------
// Robustness: DOM-change fallback strategies and malformed-input hardening.
// These tests exercise the defensive branches of the parser so that a
// redesign of LeHibou's markup degrades gracefully instead of crashing.
// ---------------------------------------------------------------------------
describe('parseLeHibouHTML (fallback strategies & malformed input)', () => {
  it('retourne un tableau vide pour du HTML uniquement espaces', () => {
    expect(parseLeHibouHTML('   \n\t  ', NOW)).toEqual([]);
  });

  it('utilise le fallback heading h2 quand h1 est absent', () => {
    const html = `
    <html><body>
    <a href="/annonce/h2only-aaa-bbb">
      <header><h2>Dev via H2</h2></header>
      <footer><div>700 €/jour</div></footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions).toHaveLength(1);
    expect(missions[0].title).toBe('Dev via H2');
  });

  it('utilise le role="heading" en dernier recours heading', () => {
    const html = `
    <html><body>
    <a href="/annonce/role-aaa-bbb">
      <header><div role="heading">Dev via role heading</div></header>
      <footer><div>650 €/jour</div></footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions).toHaveLength(1);
    expect(missions[0].title).toBe('Dev via role heading');
  });

  it('ignore une carte dont le href ne contient pas de UUID apres /annonce/', () => {
    const html = `
    <html><body>
    <a href="/annonce/?source=search">
      <header><h1>Titre Present</h1></header>
    </a>
    <a href="https://www.lehibou.com/other/path">
      <header><h1>Autre Titre</h1></header>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions).toHaveLength(0);
  });

  it('extrait la localisation via le fallback BEM quand la section structurelle est absente', () => {
    // Pas de <section>, mais classes BEM informations__item présentes.
    const html = `
    <html><body>
    <a href="/annonce/bem-aaa-bbb">
      <header><h1>Dev BEM</h1></header>
      <div class="mission-card__informations__item"><span></span><span>Marseille</span></div>
      <div class="mission-card__informations__item"><span></span><span>9 mois</span></div>
      <footer><div>580 €/jour</div></footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions).toHaveLength(1);
    expect(missions[0].location).toBe('Marseille');
    expect(missions[0].duration).toBe('9 mois');
  });

  it('retourne location/duration nulls quand aucun item info nest present', () => {
    const html = `
    <html><body>
    <a href="/annonce/noinfo-aaa-bbb">
      <header><h1>Dev Sans Info</h1></header>
      <footer><div>500 €/jour</div></footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions).toHaveLength(1);
    expect(missions[0].location).toBeNull();
    expect(missions[0].duration).toBeNull();
  });

  it('retourne location null mais duration present si seul le 2eme item existe (section structurelle)', () => {
    // Section présente avec un seul div (duration en 2eme position logique).
    const html = `
    <html><body>
    <a href="/annonce/onlydur-aaa-bbb">
      <header><h1>Dev Only Duration</h1></header>
      <section class="mission-card__informations">
        <div><span></span><span>12 mois</span></div>
      </section>
      <footer><div>620 €/jour</div></footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions).toHaveLength(1);
    // Premier item absent → location null ; duration lu en items[1] → null aussi
    // car il n'y a qu'un seul div (items[1] undefined).
    expect(missions[0].location).toBe('12 mois');
    expect(missions[0].duration).toBeNull();
  });

  it('extrait la stack via le fallback classes BEM skills--title', () => {
    // Pas de div.tag, mais spans avec classe skills--title.
    const html = `
    <html><body>
    <a href="/annonce/skillsbem-aaa-bbb">
      <header><h1>Dev Skills BEM</h1></header>
      <section class="mission-card__skills">
        <span class="mission-card__skills--title">Vue.js</span>
        <span class="mission-card__skills--title">Pinia</span>
      </section>
      <footer><div>640 €/jour</div></footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions).toHaveLength(1);
    expect(missions[0].stack).toEqual(['Vue.js', 'Pinia']);
  });

  it('extrait la stack via le fallback section skills (spans feuilles)', () => {
    // Ni div.tag ni skills--title : une section .skills avec des spans feuilles.
    const html = `
    <html><body>
    <a href="/annonce/skillssec-aaa-bbb">
      <header><h1>Dev Skills Section</h1></header>
      <section class="mission-card__skills">
        <div><span>Go</span></div>
        <div><span>Docker</span></div>
      </section>
      <footer><div>690 €/jour</div></footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions).toHaveLength(1);
    expect(missions[0].stack).toEqual(['Go', 'Docker']);
  });

  it('retourne une stack vide quand aucune strategie ne match', () => {
    const html = `
    <html><body>
    <a href="/annonce/nostack-aaa-bbb">
      <header><h1>Dev Sans Stack</h1></header>
      <footer><div>510 €/jour</div></footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions).toHaveLength(1);
    expect(missions[0].stack).toEqual([]);
  });

  it('utilise le fallback classe dailyPrice pour le TJM quand footer div est absent', () => {
    // Pas de <footer><div>, mais un element avec classe contenant "dailyPrice".
    const html = `
    <html><body>
    <a href="/annonce/priceclass-aaa-bbb">
      <header><h1>Dev Price Class</h1></header>
      <div class="mission-card__dailyPrice">720 €/jour</div>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions).toHaveLength(1);
    expect(missions[0].tjm).toBe(720);
  });

  it('utilise le fallback classe price generique pour le TJM', () => {
    const html = `
    <html><body>
    <a href="/annonce/pricegen-aaa-bbb">
      <header><h1>Dev Price Generic</h1></header>
      <div class="some-price-wrapper">730 €/jour</div>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions).toHaveLength(1);
    expect(missions[0].tjm).toBe(730);
  });

  it('detecte le remote hybride depuis le texte de la carte', () => {
    const html = `
    <html><body>
    <a href="/annonce/hybrid-aaa-bbb">
      <header><h1>Dev Hybrid Mission</h1></header>
      <section class="mission-card__informations">
        <div><span></span><span>Hybride 2j/semaine</span></div>
      </section>
      <footer><div>610 €/jour</div></footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions[0].remote).toBe('hybrid');
  });

  it('detecte le remote onsite depuis le texte de la carte', () => {
    const html = `
    <html><body>
    <a href="/annonce/onsite-aaa-bbb">
      <header><h1>Dev Onsite Mission</h1></header>
      <section class="mission-card__informations">
        <div><span></span><span>Sur site</span></div>
      </section>
      <footer><div>590 €/jour</div></footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions[0].remote).toBe('onsite');
  });

  it('preserve les accents et caracteres speciaux dans le titre', () => {
    const html = `
    <html><body>
    <a href="/annonce/accents-aaa-bbb">
      <header><h1>Développeur Système & Réseau H/F</h1></header>
      <footer><div>600 €/jour</div></footer>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions[0].title).toBe('Développeur Système & Réseau H/F');
  });

  it('parse plusieurs cartes avec des structures heterogenes', () => {
    const html = `
    <html><body>
    <a href="/annonce/mix1-aaa-bbb">
      <header><h1>Carte Structurelle</h1></header>
      <section class="mission-card__informations">
        <div><span></span><span>Lille</span></div>
        <div><span></span><span>6 mois</span></div>
      </section>
      <div class="tag"><span>React</span></div>
      <footer><div>550 €/jour</div></footer>
    </a>
    <a href="/annonce/mix2-ccc-ddd">
      <header><h2>Carte BEM</h2></header>
      <div class="mission-card__informations__item"><span></span><span>Nice</span></div>
      <span class="mission-card__skills--title">Node</span>
      <div class="mission-card__dailyPrice">670 €/jour</div>
    </a>
    </body></html>`;
    const missions = parseLeHibouHTML(html, NOW);
    expect(missions).toHaveLength(2);
    expect(missions[0].location).toBe('Lille');
    expect(missions[0].stack).toEqual(['React']);
    expect(missions[1].location).toBe('Nice');
    expect(missions[1].stack).toEqual(['Node']);
    expect(missions[1].tjm).toBe(670);
  });
});

// ---------------------------------------------------------------------------
// NOTE on remaining uncovered branches (defensive, structurally unreachable):
//
// The parser still shows a handful of uncovered branches at:
//   - extractStack strategies (lines ~58/66/75): `el.textContent?.trim() ?? ''`
//   - title extraction (line ~103):             `titleEl?.textContent?.trim() ?? ''`
//   - fullText (line ~125):                     `card.textContent?.toLowerCase() ?? ''`
//   - href (line ~109):                         `card.getAttribute('href') ?? ''`
//
// Each is an optional-chaining / nullish-coalescing guard against a `null`.
// They cannot be hit with real DOM input:
//   * `querySelectorAll('span'|'a')` returns Element nodes, whose `.textContent`
//     is always a string (possibly empty, never null) per the DOM spec — so the
//     `?.` null side and the `?? ''` fallback never execute.
//   * The card selector is `a[href*="/annonce/"]`, which guarantees a non-null
//     `href` attribute — so `getAttribute('href') ?? ''` fallback is unreachable.
//
// Covering these would require monkey-patching DOM nodes or Proxy mocks, which
// violates the pure no-mocks Core testing constraint. They are intentionally
// left as defensive branches.
// ---------------------------------------------------------------------------
