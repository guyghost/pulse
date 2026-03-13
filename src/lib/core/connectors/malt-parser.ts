import type { Mission, MissionSource } from '../types/mission';

const SOURCE: MissionSource = 'malt';
const BASE_URL = 'https://www.malt.fr';

export function parseMaltHTML(html: string, now: Date, idPrefix: string): Mission[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const missions: Mission[] = [];

  const cards = doc.querySelectorAll('.listing-card, [data-testid="freelance-listing"], .freelance-listing');

  cards.forEach((card, index) => {
    const titleEl = card.querySelector('.listing-card__title a, h3 a, a[data-testid="listing-title"]');
    const title = titleEl?.textContent?.trim() ?? '';
    const href = titleEl?.getAttribute('href') ?? '';
    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    if (!title) return;

    const clientEl = card.querySelector('.listing-card__company, .company-name, [data-testid="company"]');
    const client = clientEl?.textContent?.trim() ?? null;

    const stackEls = card.querySelectorAll('.skill-badge, .listing-card__skills .tag, [data-testid="skill"]');
    const stack = Array.from(stackEls).map(el => el.textContent?.trim() ?? '').filter(Boolean);

    const tjmEl = card.querySelector('.listing-card__rate, .daily-rate, [data-testid="rate"]');
    const tjmText = tjmEl?.textContent?.trim() ?? '';
    const tjmNormalized = tjmText.replace(/[\s\u00A0]/g, '');
    const tjmMatch = tjmNormalized.match(/(\d+)/);
    const tjm = tjmMatch ? parseInt(tjmMatch[1], 10) : null;

    const locationEl = card.querySelector('.listing-card__location, .location, [data-testid="location"]');
    const location = locationEl?.textContent?.trim() ?? null;

    const durationEl = card.querySelector('.listing-card__duration, .duration, [data-testid="duration"]');
    const duration = durationEl?.textContent?.trim() ?? null;

    const descEl = card.querySelector('.listing-card__description, .description, p');
    const description = descEl?.textContent?.trim() ?? '';

    const fullText = card.textContent?.toLowerCase() ?? '';
    const remote = fullText.includes('full remote') || fullText.includes('teletravail complet') || fullText.includes('télétravail complet')
      ? 'full' as const
      : fullText.includes('hybride') || fullText.includes('hybrid')
      ? 'hybrid' as const
      : fullText.includes('sur site') || fullText.includes('on-site') || fullText.includes('onsite')
      ? 'onsite' as const
      : null;

    missions.push({
      id: `${idPrefix}-${index}`,
      title,
      client,
      description,
      stack,
      tjm,
      location,
      remote,
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
