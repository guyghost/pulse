import type { Mission, RemoteType } from '../types/mission';
import { createMission, parseTJM } from './parser-utils';

const SOURCE = 'cherry-pick' as const;
const BASE_URL = 'https://app.cherry-pick.io';

interface CherryPickMission {
  id: number;
  name: string;
  slug: string;
  minimum_rate: number | null;
  maximum_rate: number | null;
  duration: string | null;
  city: string | null;
  displacement: string | null;
  company: { name: string } | null;
  skills: { name: string }[];
  description: string | null;
}

// Known API values: remote, partially_remote_3, no_remote
function mapRemote(displacement: string | null): RemoteType | null {
  if (!displacement) return null;
  switch (displacement) {
    case 'remote': return 'full';
    case 'no_remote': return 'onsite';
    default:
      if (displacement.startsWith('partially_remote')) return 'hybrid';
      return null;
  }
}

function pickTJM(min: number | null, max: number | null): number | null {
  if (min !== null && max !== null) return Math.round((min + max) / 2);
  return max ?? min ?? null;
}

/** Metadata keys found in CherryPick description fields (regex-safe). */
const METADATA_KEYS = [
  'Qualification faite par',
  'Nom du client',
  'Nom de l\'op(?:e|é)rationnel',
  'Type de besoin',
  'TJM',
  'Nombre de postes ouvert',
  'Localisation de la mission',
  'Processus de recrutement',
  'Lien vers la fiche de poste',
  'Date de d(?:e|é)marrage',
  'Dur(?:e|é)e de la mission',
];

interface DescriptionMeta {
  client: string | null;
  tjm: number | null;
  location: string | null;
  duration: string | null;
  cleanDescription: string;
}

/**
 * Build a single regex that matches "Key : Value" for all known metadata keys.
 * Value = everything up to the next known key or end of string.
 */
const META_REGEX = new RegExp(
  `(${METADATA_KEYS.join('|')})\\s*:\\s*(.*?)(?=(?:${METADATA_KEYS.join('|')})\\s*:|$)`,
  'gi',
);

/**
 * Parse structured key-value metadata from CherryPick description text.
 * Format: "Key1 : Value1 Key2 : Value2 ..." or newline-separated.
 */
export function parseDescriptionMeta(raw: string | null): DescriptionMeta {
  const result: DescriptionMeta = { client: null, tjm: null, location: null, duration: null, cleanDescription: '' };
  if (!raw) return result;

  const kvMap = new Map<string, string>();

  for (const match of raw.matchAll(META_REGEX)) {
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (value) kvMap.set(key, value);
  }

  result.client = kvMap.get('nom du client') ?? null;
  result.location = kvMap.get('localisation de la mission') ?? null;

  const tjmRaw = kvMap.get('tjm');
  if (tjmRaw) {
    const rangeMatch = tjmRaw.match(/(\d+)\s*[\/\-]\s*(\d+)/);
    if (rangeMatch) {
      result.tjm = pickTJM(parseInt(rangeMatch[1]), parseInt(rangeMatch[2]));
    } else {
      result.tjm = parseTJM(tjmRaw);
    }
  }

  result.duration = kvMap.get('dur\u00e9e de la mission') ?? kvMap.get('duree de la mission') ?? null;

  // Remove all matched metadata in one pass to avoid positional corruption
  result.cleanDescription = raw.replace(META_REGEX, ' ').replace(/\s{2,}/g, ' ').trim();
  return result;
}

/** Add "mois" suffix to bare numeric durations. */
function normalizeDuration(d: string | null): string | null {
  if (!d) return null;
  const trimmed = d.trim();
  if (/^\d+$/.test(trimmed)) return `${trimmed} mois`;
  return trimmed;
}

export function parseCherryPickMissions(missions: CherryPickMission[], now: Date): Mission[] {
  return missions.map((m) => {
    const meta = parseDescriptionMeta(m.description);
    const apiTjm = pickTJM(m.minimum_rate, m.maximum_rate);

    return createMission({
      id: `cp-${m.id}`,
      title: m.name,
      client: m.company?.name ?? meta.client,
      description: meta.cleanDescription,
      stack: m.skills.map((s) => s.name),
      tjm: apiTjm ?? meta.tjm,
      location: m.city ?? meta.location,
      remote: mapRemote(m.displacement),
      duration: normalizeDuration(m.duration ?? meta.duration),
      url: `${BASE_URL}/mission/${m.slug}`,
      source: SOURCE,
      scrapedAt: now,
    });
  });
}
