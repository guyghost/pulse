import type { Mission, MissionSource, RemoteType } from '../types/mission';

const SOURCE: MissionSource = 'free-work';
const BASE_URL = 'https://www.free-work.com';

/** Shape of a job posting from the Free-Work Hydra/JSON-LD API */
export interface FreeWorkJobPosting {
  '@id': string;
  id: number;
  title: string;
  slug: string;
  description: string | null;
  candidateProfile: string | null;
  companyDescription: string | null;
  minDailySalary: number | null;
  maxDailySalary: number | null;
  minAnnualSalary: number | null;
  maxAnnualSalary: number | null;
  dailySalary: string | null;
  annualSalary: string | null;
  currency: string;
  duration: number | null;
  durationValue: number | null;
  durationPeriod: string | null;
  renewable: boolean;
  remoteMode: string | null;
  contracts: string[];
  location: {
    locality: string | null;
    adminLevel1: string | null;
    label: string | null;
    shortLabel: string | null;
  } | null;
  company: {
    name: string;
    slug: string;
  } | null;
  job: {
    name: string;
    slug: string;
  } | null;
  skills: { name: string; slug: string }[];
  publishedAt: string | null;
  startsAt: string | null;
}

export interface FreeWorkApiResponse {
  'hydra:totalItems': number;
  'hydra:member': FreeWorkJobPosting[];
}

function mapRemoteMode(mode: string | null): RemoteType | null {
  if (!mode) return null;
  switch (mode) {
    case 'full': return 'full';
    case 'partial': return 'hybrid';
    case 'none': return 'onsite';
    default: return null;
  }
}

function formatDuration(value: number | null, period: string | null): string | null {
  if (value == null || !period) return null;
  const label = period === 'month' ? 'mois' : period === 'year' ? 'an' : period;
  return `${value} ${label}`;
}

function buildJobUrl(slug: string, jobSlug: string | null): string {
  const category = jobSlug ?? 'autre';
  return `${BASE_URL}/fr/tech-it/${category}/job-mission/${slug}`;
}

export function parseFreeWorkAPI(data: FreeWorkApiResponse, now: Date): Mission[] {
  if (!data['hydra:member'] || !Array.isArray(data['hydra:member'])) return [];

  return data['hydra:member'].map((p): Mission => ({
      id: `fw-${p.id}`,
      title: p.title,
      client: p.company?.name ?? null,
      description: p.description ?? '',
      stack: (p.skills ?? []).map(s => s.name),
      tjm: p.minDailySalary ?? p.maxDailySalary ?? null,
      location: p.location?.label ?? p.location?.shortLabel ?? null,
      remote: mapRemoteMode(p.remoteMode),
      duration: formatDuration(p.durationValue, p.durationPeriod),
      url: buildJobUrl(p.slug, p.job?.slug ?? null),
      source: SOURCE,
      scrapedAt: now,
      score: null,
      semanticScore: null,
      semanticReason: null,
    }));
}
