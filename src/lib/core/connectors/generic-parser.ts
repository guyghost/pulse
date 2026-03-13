import type { Mission, MissionSource, RemoteType } from '../types/mission';

export function parseGenericHTML(html: string, source: MissionSource, baseUrl: string, now: Date, idPrefix: string): Mission[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const missions: Mission[] = [];

  const cards = doc.querySelectorAll('.mission-card, .job-card, article, [data-mission], .search-result');

  cards.forEach((card, index) => {
    const titleEl = card.querySelector('h2 a, h3 a, .mission-title a, a.title');
    const title = titleEl?.textContent?.trim() ?? '';
    const href = titleEl?.getAttribute('href') ?? '';
    const url = href.startsWith('http') ? href : `${baseUrl}${href}`;

    if (!title) return;

    const clientEl = card.querySelector('.client, .company, .company-name');
    const client = clientEl?.textContent?.trim() ?? null;

    const stackEls = card.querySelectorAll('.tag, .skill, .badge, .technology');
    const stack = Array.from(stackEls).map(el => el.textContent?.trim() ?? '').filter(Boolean);

    const tjmEl = card.querySelector('.tjm, .rate, .daily-rate, .price');
    const tjmText = tjmEl?.textContent?.trim() ?? '';
    const tjmNormalized = tjmText.replace(/[\s\u00A0]/g, '');
    const tjmMatch = tjmNormalized.match(/(\d+)/);
    const tjm = tjmMatch ? parseInt(tjmMatch[1], 10) : null;

    const locationEl = card.querySelector('.location, .city, .place');
    const location = locationEl?.textContent?.trim() ?? null;

    const durationEl = card.querySelector('.duration, .period');
    const duration = durationEl?.textContent?.trim() ?? null;

    const descEl = card.querySelector('.description, p, .summary');
    const description = descEl?.textContent?.trim() ?? '';

    const fullText = card.textContent?.toLowerCase() ?? '';
    const remote: RemoteType | null = fullText.includes('full remote') || fullText.includes('télétravail complet')
      ? 'full'
      : fullText.includes('hybride') || fullText.includes('hybrid')
      ? 'hybrid'
      : fullText.includes('sur site') || fullText.includes('on-site') || fullText.includes('onsite')
      ? 'onsite'
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
      source,
      scrapedAt: now,
      score: null,
      semanticScore: null,
      semanticReason: null,
    });
  });

  return missions;
}
