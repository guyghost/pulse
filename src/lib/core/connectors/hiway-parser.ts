import type { Mission } from '../types/mission';
import { parseTJM, detectRemote, createMission } from './parser-utils';

const SOURCE = 'hiway' as const;
const BASE_URL = 'https://hiway-missions.fr';

/**
 * Sélectionne le premier élément correspondant à une chaîne de sélecteurs (fallback chain).
 * Essaie chaque sélecteur dans l'ordre et retourne le premier résultat trouvé.
 */
function queryFallback(root: Element, selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Extrait le client (entreprise) depuis la carte mission.
 * Stratégie : premier <span> qui n'est pas un tag de stack (court, sans lien avec la techno).
 */
function extractClient(card: Element, titleEl: Element | null): string | null {
  // Fallback chain : span sémantique > premier span après le titre
  const spans = Array.from(card.querySelectorAll('span'));
  // Exclure les spans qui ressemblent à des tags (rounded-full, très courts, etc.)
  const candidateSpans = spans.filter(span => {
    const text = span.textContent?.trim() ?? '';
    // Ignorer les spans vides ou trop courts (tags de stack)
    if (text.length < 2 || text.length > 80) return false;
    // Ignorer les spans qui contiennent d'autres spans (wrappers)
    if (span.querySelector('span')) return false;
    return true;
  });

  // Le premier span candidat après le titre est généralement le client
  if (candidateSpans.length > 0) return candidateSpans[0].textContent?.trim() ?? null;
  return null;
}

/**
 * Extrait la localisation depuis la carte mission.
 * Stratégie : deuxième span candidat (après le client), ou texte contenant une ville connue.
 */
function extractLocation(card: Element): string | null {
  const spans = Array.from(card.querySelectorAll('span'));
  const candidateSpans = spans.filter(span => {
    const text = span.textContent?.trim() ?? '';
    if (text.length < 2 || text.length > 80) return false;
    if (span.querySelector('span')) return false;
    return true;
  });

  // Le deuxième span candidat est généralement la localisation
  if (candidateSpans.length >= 2) return candidateSpans[1].textContent?.trim() ?? null;
  return null;
}

/**
 * Extrait les tags de stack technique depuis la carte mission.
 * Stratégie : spans courts (< 30 chars) qui ne sont ni le client ni la localisation,
 * typiquement des badges/tags positionnés après les métadonnées principales.
 */
function extractStack(card: Element): string[] {
  const spans = Array.from(card.querySelectorAll('span'));
  const candidateSpans = spans.filter(span => {
    const text = span.textContent?.trim() ?? '';
    // Tags de stack : courts, sans enfants span
    if (text.length === 0 || text.length >= 30) return false;
    if (span.querySelector('span')) return false;
    return true;
  });

  // Les 2 premiers spans candidats sont client + location, le reste = stack tags
  return candidateSpans.slice(2)
    .map(el => el.textContent?.trim() ?? '')
    .filter(s => s.length > 0);
}

export function parseHiwayHTML(html: string, now: Date): Mission[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const missions: Mission[] = [];

  // Sélection des cartes par pattern de lien structurel (UUID dans le href)
  const links = doc.querySelectorAll('a[href*="/admin/freelance/mission/"]');

  links.forEach((link) => {
    const href = link.getAttribute('href') ?? '';
    const uuidMatch = href.match(/\/mission\/([0-9a-f-]{36})/i);
    const id = uuidMatch ? `hw-${uuidMatch[1]}` : '';
    if (!id) return;

    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    // Titre : sélecteurs sémantiques avec fallback
    const titleEl = queryFallback(link, [
      'h3',           // Balise sémantique (heading)
      'h2',           // Fallback si restructuré
      '[role="heading"]',
    ]);
    const title = titleEl?.textContent?.trim() ?? '';
    if (!title) return;

    const fullText = link.textContent ?? '';

    // Client (entreprise) : extraction positionnelle
    const client = extractClient(link, titleEl);

    // TJM : extraction depuis le texte brut (insensible au markup)
    const tjm = parseTJM(fullText);

    // Localisation : extraction positionnelle
    const location = extractLocation(link);

    // Durée : regex sur le texte brut
    const durationMatch = fullText.match(/(\d+\s*(?:mois|jours?|semaines?))/i);
    const duration = durationMatch ? durationMatch[1].trim() : null;

    // Remote : détection depuis le texte brut
    const remote = detectRemote(fullText);

    // Stack tags : spans restants après client et location
    const stack = extractStack(link);

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
