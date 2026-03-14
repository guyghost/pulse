import type { MissionSource, Mission } from '../types/mission';
import { parseTJM, detectRemote, createMission } from './parser-utils';

const SOURCE: MissionSource = 'comet';
const BASE_URL = 'https://app.comet.co';

export function parseCometHTML(html: string, now: Date, idPrefix: string): Mission[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const missions: Mission[] = [];

  const cards = doc.querySelectorAll('.mission-card, [data-testid="mission-item"], .mission-item');

  cards.forEach((card, index) => {
    const titleEl = card.querySelector('.mission-card__title, h3 a, a[data-testid="mission-title"]');
    const title = titleEl?.textContent?.trim() ?? '';
    const linkEl = card.querySelector('.mission-card__link, a[href]');
    const href = linkEl?.getAttribute('href') ?? '';
    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    if (!title) return;

    const clientEl = card.querySelector('.mission-card__client, .client-name, [data-testid="client"]');
    const client = clientEl?.textContent?.trim() ?? null;

    const stackEls = card.querySelectorAll('.tag, .mission-card__tags .tag, [data-testid="tag"]');
    const stack = Array.from(stackEls).map(el => el.textContent?.trim() ?? '').filter(Boolean);

    const tjmEl = card.querySelector('.mission-card__tjm, .daily-rate, [data-testid="tjm"]');
    const tjm = parseTJM(tjmEl?.textContent?.trim() ?? '');

    const locationEl = card.querySelector('.mission-card__location, .location, [data-testid="location"]');
    const location = locationEl?.textContent?.trim() ?? null;

    const durationEl = card.querySelector('.mission-card__duration, .duration, [data-testid="duration"]');
    const duration = durationEl?.textContent?.trim() ?? null;

    const descEl = card.querySelector('.mission-card__desc, .description, p');
    const description = descEl?.textContent?.trim() ?? '';

    // Comet has a dedicated remote element; fall back to full-text detection
    const remoteEl = card.querySelector('.mission-card__remote, .remote, [data-testid="remote"]');
    const remoteText = remoteEl?.textContent?.toLowerCase() ?? '';
    const fullText = card.textContent?.toLowerCase() ?? '';
    const combinedText = remoteText + ' ' + fullText;
    const remote = detectRemote(combinedText);

    missions.push(createMission({
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
    }));
  });

  return missions;
}
