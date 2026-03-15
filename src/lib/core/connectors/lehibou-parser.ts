import type { MissionSource, Mission } from '../types/mission';
import { parseTJM, detectRemote, createMission } from './parser-utils';

const SOURCE: MissionSource = 'lehibou';
const BASE_URL = 'https://www.lehibou.com';

export function parseLeHibouHTML(html: string, now: Date): Mission[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const missions: Mission[] = [];

  const cards = doc.querySelectorAll('a.mission-card');

  cards.forEach((card) => {
    const titleEl = card.querySelector('.mission-card__header__title');
    const title = titleEl?.textContent?.trim() ?? '';
    if (!title) return;

    // Extract UUID from href (/annonce/{uuid}?source=...)
    const href = card.getAttribute('href') ?? '';
    const uuidMatch = href.match(/\/annonce\/([^?]+)/);
    const uuid = uuidMatch ? uuidMatch[1] : '';
    const id = `lh-${uuid}`;
    const url = `${BASE_URL}/annonce/${uuid}`;

    // Location and duration from info items
    const infoItems = card.querySelectorAll('.mission-card__informations__item');
    const locationEl = infoItems[0]?.querySelector('span:last-child');
    const location = locationEl?.textContent?.trim() || null;
    const durationEl = infoItems[1]?.querySelector('span:last-child');
    const duration = durationEl?.textContent?.trim() || null;

    // Stack from skill tags
    const skillEls = card.querySelectorAll('.mission-card__skills--title');
    const stack = Array.from(skillEls)
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean);

    // Detect remote from card text
    const fullText = card.textContent?.toLowerCase() ?? '';
    const remote = detectRemote(fullText);

    // TJM from footer
    const tjmEl = card.querySelector('.mission-card__footer__dailyPrice');
    const tjm = parseTJM(tjmEl?.textContent?.trim() ?? '');

    missions.push(createMission({
      id,
      title,
      client: null,
      description: '',
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
