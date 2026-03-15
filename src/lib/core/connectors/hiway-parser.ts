import type { MissionSource, Mission } from '../types/mission';
import { parseTJM, detectRemote, createMission } from './parser-utils';

const SOURCE: MissionSource = 'hiway';
const BASE_URL = 'https://hiway-missions.fr';

export function parseHiwayHTML(html: string, now: Date): Mission[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const missions: Mission[] = [];

  // Each mission card is a link containing a UUID in its href
  const links = doc.querySelectorAll('a[href*="/admin/freelance/mission/"]');

  links.forEach((link) => {
    const href = link.getAttribute('href') ?? '';
    const uuidMatch = href.match(/\/mission\/([0-9a-f-]{36})/i);
    const id = uuidMatch ? `hw-${uuidMatch[1]}` : '';
    if (!id) return;

    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    // Title from h3.font-semibold inside the card
    const titleEl = link.querySelector('h3.font-semibold') ?? link.querySelector('h3');
    const title = titleEl?.textContent?.trim() ?? '';
    if (!title) return;

    const fullText = link.textContent ?? '';

    // Company name
    const companyEl = link.querySelector('span.text-sm.font-medium.text-gray-600') ??
                      link.querySelector('span.font-medium');
    const client = companyEl?.textContent?.trim() ?? null;

    // TJM from text content
    const tjm = parseTJM(fullText);

    // Location — look for city-like text in small/span elements
    const locationEl = link.querySelector('.text-gray-500, .text-sm.text-gray-500');
    const location = locationEl?.textContent?.trim() ?? null;

    // Duration
    const durationMatch = fullText.match(/(\d+\s*(?:mois|jours?|semaines?))/i);
    const duration = durationMatch ? durationMatch[1].trim() : null;

    // Remote
    const remote = detectRemote(fullText.toLowerCase());

    // Stack tags
    const tagEls = link.querySelectorAll('.badge, .tag, span.rounded-full, span.bg-blue-100, span.bg-gray-100');
    const stack = Array.from(tagEls)
      .map(el => el.textContent?.trim() ?? '')
      .filter(s => s.length > 0 && s.length < 30);

    missions.push(createMission({
      id,
      title,
      client,
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
