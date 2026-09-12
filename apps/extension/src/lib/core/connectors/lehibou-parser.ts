import type { MissionSource, Mission } from '../types/mission';
import { parseTJM, detectRemote, createMission } from './parser-utils';

const SOURCE: MissionSource = 'lehibou';
const BASE_URL = 'https://www.lehibou.com';

/**
 * Selects the first element matching a selector fallback chain.
 * Tries each selector in order and returns the first match found.
 */
function queryFallback(root: Element, selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el) {
      return el;
    }
  }
  return null;
}

/**
 * Extracts location and duration from the card's information items.
 * Strategy: structural items (div containing spans) with BEM class fallback.
 */
function extractInfoItems(card: Element): { location: string | null; duration: string | null } {
  // Strategy 1: structural selectors — section > div containing spans
  const section = queryFallback(card, ['section', '[class*="informations"]']);
  if (section) {
    const items = section.querySelectorAll('div');
    const locationEl = items[0]?.querySelector('span:last-child');
    const durationEl = items[1]?.querySelector('span:last-child');
    const location = locationEl?.textContent?.trim() || null;
    const duration = durationEl?.textContent?.trim() || null;
    if (location || duration) {
      return { location, duration };
    }
  }

  // Strategy 2: fallback on BEM classes (legacy structure)
  const infoItems = card.querySelectorAll('[class*="informations__item"]');
  const locationEl = infoItems[0]?.querySelector('span:last-child');
  const durationEl = infoItems[1]?.querySelector('span:last-child');
  return {
    location: locationEl?.textContent?.trim() || null,
    duration: durationEl?.textContent?.trim() || null,
  };
}

/**
 * Extracts tech stack tags from the mission card.
 * Strategy: spans inside tag divs, with BEM class fallback.
 */
function extractStack(card: Element): string[] {
  // Strategy 1: spans in .tag divs (structure independent of the BEM skills block)
  const tagDivs = card.querySelectorAll('div.tag span');
  if (tagDivs.length > 0) {
    return Array.from(tagDivs)
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean);
  }

  // Strategy 2: fallback on BEM classes
  const skillEls = card.querySelectorAll('[class*="skills--title"]');
  if (skillEls.length > 0) {
    return Array.from(skillEls)
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean);
  }

  // Strategy 3: skills section — all short leaf spans
  const skillSection = queryFallback(card, ['[class*="skills"]']);
  if (skillSection) {
    return Array.from(skillSection.querySelectorAll('span'))
      .filter((span) => !span.querySelector('span'))
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean);
  }

  return [];
}

export function parseLeHibouHTML(html: string, now: Date): Mission[] {
  if (!html.trim()) {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const missions: Mission[] = [];

  // Card selection by structural link pattern (href containing /annonce/)
  const cards = doc.querySelectorAll('a[href*="/annonce/"]');

  cards.forEach((card) => {
    // Title: semantic heading with fallback chain
    const titleEl = queryFallback(card, [
      'h1', // Main heading (current structure)
      'h2', // Fallback if restructured
      'h3', // Tertiary heading fallback
      '[role="heading"]', // ARIA heading
      'header *:first-child', // Premier enfant du header
    ]);
    const title = titleEl?.textContent?.trim() ?? '';
    if (!title) {
      return;
    }

    // Extract UUID from href (/annonce/{uuid}?source=...)
    const href = card.getAttribute('href') ?? '';
    const uuidMatch = href.match(/\/annonce\/([^?]+)/);
    const uuid = uuidMatch ? uuidMatch[1] : '';
    if (!uuid) {
      return;
    }
    const id = `lh-${uuid}`;
    const url = `${BASE_URL}/annonce/${uuid}`;

    // Location and duration: structural extraction with fallback
    const { location, duration } = extractInfoItems(card);

    // Stack: extraction from tags with fallback chain
    const stack = extractStack(card);

    // Remote: detection from raw text (markup-agnostic)
    const fullText = card.textContent?.toLowerCase() ?? '';
    const remote = detectRemote(fullText);

    // TJM: extraction from raw text (markup-agnostic)
    const tjmEl = queryFallback(card, [
      'footer div', // First footer div (current structure)
      '[class*="dailyPrice"]', // BEM class fallback
      '[class*="price"]', // Generic class fallback
    ]);
    const tjm = parseTJM(tjmEl?.textContent?.trim() ?? '');

    missions.push(
      createMission({
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
      })
    );
  });

  return missions;
}
