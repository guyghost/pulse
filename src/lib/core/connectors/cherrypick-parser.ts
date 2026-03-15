import type { Mission, RemoteType } from '../types/mission';
import { createMission } from './parser-utils';

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

export function parseCherryPickMissions(missions: CherryPickMission[], now: Date): Mission[] {
  return missions.map((m) =>
    createMission({
      id: `cp-${m.id}`,
      title: m.name,
      client: m.company?.name ?? null,
      description: m.description ?? '',
      stack: m.skills.map((s) => s.name),
      tjm: pickTJM(m.minimum_rate, m.maximum_rate),
      location: m.city ?? null,
      remote: mapRemote(m.displacement),
      duration: m.duration ?? null,
      url: `${BASE_URL}/mission/${m.slug}`,
      source: SOURCE,
      scrapedAt: now,
    }),
  );
}
