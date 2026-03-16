import type { Mission, RemoteType } from '../types/mission';
import { createMission } from './parser-utils';

const SOURCE = 'comet' as const;
const BASE_URL = 'https://app.comet.co';

export interface CometMission {
  id: number;
  title: string;
  status: string;
  durationInDays: number | null;
  startDate: string | null;
  prefWorkplace: string | null;
  experienceLevel: string | null;
  createdAt: string;
  address: { city: string | null } | null;
  skills: { name: string }[];
}

function mapRemote(prefWorkplace: string | null): RemoteType | null {
  switch (prefWorkplace) {
    case 'remote': return 'full';
    case 'hybrid':
    case 'partialRemote': return 'hybrid';
    case 'onSite': return 'onsite';
    default: return null;
  }
}

function formatDuration(days: number | null): string | null {
  if (days === null) return null;
  const months = Math.round(days / 30);
  return months > 0 ? `${months} mois` : `${days} jours`;
}

export function parseCometMissions(missions: CometMission[], now: Date): Mission[] {
  return missions.map((m) =>
    createMission({
      id: `comet-${m.id}`,
      title: m.title,
      client: null,
      description: '',
      stack: m.skills.map((s) => s.name),
      tjm: null,
      location: m.address?.city ?? null,
      remote: mapRemote(m.prefWorkplace),
      duration: formatDuration(m.durationInDays),
      url: `${BASE_URL}/freelancer/explore`,
      source: SOURCE,
      scrapedAt: now,
    }),
  );
}
