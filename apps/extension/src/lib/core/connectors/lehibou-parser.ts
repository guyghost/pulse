import type { MissionSource, Mission } from '../types/mission';
import { parseTJM, detectRemote, createMission } from './parser-utils';

const SOURCE: MissionSource = 'lehibou';
const BASE_URL = 'https://www.lehibou.com';

/**
 * Sélectionne le premier élément correspondant à une chaîne de sélecteurs (fallback chain).
 * Essaie chaque sélecteur dans l'ordre et retourne le premier résultat trouvé.
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
 * Extrait la localisation et la durée depuis les items d'information de la carte.
 * Stratégie : items structurels (div contenant des spans) avec fallback sur les classes BEM.
 */
function extractInfoItems(card: Element): { location: string | null; duration: string | null } {
  // Stratégie 1 : sélecteurs structurels — section > div contenant des spans
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

  // Stratégie 2 : fallback sur les classes BEM (ancienne structure)
  const infoItems = card.querySelectorAll('[class*="informations__item"]');
  const locationEl = infoItems[0]?.querySelector('span:last-child');
  const durationEl = infoItems[1]?.querySelector('span:last-child');
  return {
    location: locationEl?.textContent?.trim() || null,
    duration: durationEl?.textContent?.trim() || null,
  };
}

/**
 * Extrait les tags de stack technique depuis la carte mission.
 * Stratégie : spans à l'intérieur de divs de type tag, avec fallback sur les classes BEM.
 */
function extractStack(card: Element): string[] {
  // Stratégie 1 : spans dans des divs .tag (structure indépendante du BEM skills)
  const tagDivs = card.querySelectorAll('div.tag span');
  if (tagDivs.length > 0) {
    return Array.from(tagDivs)
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean);
  }

  // Stratégie 2 : fallback sur les classes BEM
  const skillEls = card.querySelectorAll('[class*="skills--title"]');
  if (skillEls.length > 0) {
    return Array.from(skillEls)
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean);
  }

  // Stratégie 3 : section de skills — tous les spans feuilles courts
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

  // Sélection des cartes par pattern de lien structurel (href contenant /annonce/)
  const cards = doc.querySelectorAll('a[href*="/annonce/"]');

  cards.forEach((card) => {
    // Titre : heading sémantique avec fallback chain
    const titleEl = queryFallback(card, [
      'h1', // Heading principal (structure actuelle)
      'h2', // Fallback si restructuré
      'h3', // Fallback heading tertiaire
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

    // Localisation et durée : extraction structurelle avec fallback
    const { location, duration } = extractInfoItems(card);

    // Stack : extraction depuis les tags avec fallback chain
    const stack = extractStack(card);

    // Remote : détection depuis le texte brut (insensible au markup)
    const fullText = card.textContent?.toLowerCase() ?? '';
    const remote = detectRemote(fullText);

    // TJM : extraction depuis le texte brut (insensible au markup)
    const tjmEl = queryFallback(card, [
      'footer div', // Premier div du footer (structure actuelle)
      '[class*="dailyPrice"]', // Fallback classe BEM
      '[class*="price"]', // Fallback classe générique
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
