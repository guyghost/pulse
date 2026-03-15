import type { MissionSource, Mission } from '../types/mission';
import { parseTJM, detectRemote, createMission } from './parser-utils';

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

    // Extract stable ID from href slug, fallback to index
    const slugMatch = href.match(/\/project\/([^/?]+)/);
    const id = slugMatch ? `malt-${slugMatch[1]}` : `${idPrefix}-${index}`;

    if (!title) return;

    const clientEl = card.querySelector('.listing-card__company, .company-name, [data-testid="company"]');
    const client = clientEl?.textContent?.trim() ?? null;

    const stackEls = card.querySelectorAll('.skill-badge, .listing-card__skills .tag, [data-testid="skill"]');
    const stack = Array.from(stackEls).map(el => el.textContent?.trim() ?? '').filter(Boolean);

    const tjmEl = card.querySelector('.listing-card__rate, .daily-rate, [data-testid="rate"]');
    const tjm = parseTJM(tjmEl?.textContent?.trim() ?? '');

    const locationEl = card.querySelector('.listing-card__location, .location, [data-testid="location"]');
    const location = locationEl?.textContent?.trim() ?? null;

    const durationEl = card.querySelector('.listing-card__duration, .duration, [data-testid="duration"]');
    const duration = durationEl?.textContent?.trim() ?? null;

    const descEl = card.querySelector('.listing-card__description, .description, p');
    const description = descEl?.textContent?.trim() ?? '';

    const fullText = card.textContent?.toLowerCase() ?? '';
    const remote = detectRemote(fullText);

    missions.push(createMission({
      id,
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
    }));
  });

  return missions;
}
