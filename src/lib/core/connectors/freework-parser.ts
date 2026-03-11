import type { Mission, MissionSource } from '../types/mission';

const SOURCE: MissionSource = 'free-work';
const BASE_URL = 'https://www.free-work.com';

export function parseFreeWorkHTML(html: string, now: Date, idPrefix: string): Mission[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const missions: Mission[] = [];

  const cards = doc.querySelectorAll('[data-cy="job-card"], .job-card, article.mission, .search-result-item');

  cards.forEach((card, index) => {
    const titleEl = card.querySelector('h2 a, h3 a, .job-title a, a[data-cy="job-title"]');
    const title = titleEl?.textContent?.trim() ?? '';
    const href = titleEl?.getAttribute('href') ?? '';
    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    if (!title) return;

    const clientEl = card.querySelector('.company-name, [data-cy="company-name"], .client');
    const client = clientEl?.textContent?.trim() ?? null;

    const stackEls = card.querySelectorAll('.tag, .skill-tag, [data-cy="skill-tag"], .badge');
    const stack = Array.from(stackEls).map(el => el.textContent?.trim() ?? '').filter(Boolean);

    const tjmEl = card.querySelector('.tjm, .daily-rate, [data-cy="daily-rate"]');
    const tjmText = tjmEl?.textContent?.trim() ?? '';
    const tjmMatch = tjmText.match(/(\d+)/);
    const tjm = tjmMatch ? parseInt(tjmMatch[1], 10) : null;

    const locationEl = card.querySelector('.location, [data-cy="location"], .city');
    const location = locationEl?.textContent?.trim() ?? null;

    const durationEl = card.querySelector('.duration, [data-cy="duration"]');
    const duration = durationEl?.textContent?.trim() ?? null;

    const descEl = card.querySelector('.description, .job-description, p');
    const description = descEl?.textContent?.trim() ?? '';

    const fullText = card.textContent?.toLowerCase() ?? '';
    const remote = fullText.includes('full remote') || fullText.includes('télétravail complet')
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
    });
  });

  return missions;
}
