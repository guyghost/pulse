import type { Mission, MissionSource } from '../types/mission';

const SOURCE: MissionSource = 'lehibou';
const BASE_URL = 'https://www.lehibou.com';

export function parseLeHibouHTML(html: string, now: Date, _idPrefix: string): Mission[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const missions: Mission[] = [];

  const cards = doc.querySelectorAll('a.mission-card');

  cards.forEach((card) => {
    const titleEl = card.querySelector('.mission-card__header__title');
    const title = titleEl?.textContent?.trim() ?? '';
    if (!title) return;

    // Extraire le UUID depuis le href (/annonce/{uuid}?source=...)
    const href = card.getAttribute('href') ?? '';
    const uuidMatch = href.match(/\/annonce\/([^?]+)/);
    const uuid = uuidMatch ? uuidMatch[1] : '';
    const id = `lh-${uuid}`;
    const url = `${BASE_URL}/annonce/${uuid}`;

    // Localisation et duree depuis les items d'informations
    const infoItems = card.querySelectorAll('.mission-card__informations__item');
    const locationEl = infoItems[0]?.querySelector('span:last-child');
    const location = locationEl?.textContent?.trim() || null;
    const durationEl = infoItems[1]?.querySelector('span:last-child');
    const duration = durationEl?.textContent?.trim() || null;

    // Stack depuis les tags de competences
    const skillEls = card.querySelectorAll('.mission-card__skills--title');
    const stack = Array.from(skillEls)
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean);

    // TJM depuis le footer
    const tjmEl = card.querySelector('.mission-card__footer__dailyPrice');
    const tjmText = tjmEl?.textContent?.trim() ?? '';
    const tjmNormalized = tjmText.replace(/[\s\u00A0]/g, '');
    const tjmMatch = tjmNormalized.match(/(\d+)/);
    const tjm = tjmMatch ? parseInt(tjmMatch[1], 10) : null;

    missions.push({
      id,
      title,
      client: null,
      description: '',
      stack,
      tjm,
      location,
      remote: null,
      duration,
      url,
      source: SOURCE,
      scrapedAt: now,
      score: null,
      semanticScore: null,
      semanticReason: null,
    });
  });

  return missions;
}
