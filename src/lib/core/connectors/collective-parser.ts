import type { Mission } from '../types/mission';
import { createMission } from './parser-utils';
import { validateNextData } from './validate-parser-output';

export interface CollectiveProject {
  id: string;
  slug: string;
  name: string;
  sumUp: string | null;
  description: string | null;
  budgetBrief: string | null;
  workPreferences: string[];
  isPermanentContract: boolean;
  idealStartDate: string | null;
  projectTypes: string[];
  publishedAt: string;
  company: { name: string; logoUrl: string | null } | null;
  location: { fullNameFrench: string; fullNameEnglish: string } | null;
}

const SKILL_MAP: Record<string, string> = {
  DOT_NET: '.NET',
  C_SHARP: 'C#',
  A_B_TESTING: 'A/B Testing',
};

export function mapSkill(raw: string): string {
  return SKILL_MAP[raw] ?? raw.replace(/_/g, ' ');
}

export function extractTjm(budgetBrief: string | null): number | null {
  if (!budgetBrief) return null;
  const match = budgetBrief.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

export function mapCollectiveRemote(prefs: string[]): Mission['remote'] {
  if (prefs.includes('REMOTE')) return 'full';
  if (prefs.includes('HYBRID')) return 'hybrid';
  if (prefs.includes('ON_SITE')) return 'onsite';
  return null;
}

export function parseCollectiveProjects(projects: CollectiveProject[], now: Date): Mission[] {
  return projects.map((p) => createMission({
    id: `col-${p.id}`,
    title: p.name,
    client: p.company?.name ?? null,
    description: p.sumUp ?? '',
    stack: p.projectTypes.map(mapSkill),
    tjm: extractTjm(p.budgetBrief),
    location: p.location?.fullNameFrench ?? null,
    remote: mapCollectiveRemote(p.workPreferences),
    duration: null,
    url: `https://www.collective.work/job/${p.slug}`,
    source: 'collective' as const,
    scrapedAt: now,
  }));
}

export function extractCollectiveProjects(html: string): CollectiveProject[] {
  // Use shared validator for __NEXT_DATA__ extraction
  const nextData = validateNextData(html);
  if (!nextData) {
    return [];
  }

  try {
    // Navigate the nested structure with null-safety
    const props = nextData.props as Record<string, unknown> | undefined;
    const pageProps = props?.pageProps as Record<string, unknown> | undefined;
    const dehydratedState = pageProps?.dehydratedState as Record<string, unknown> | undefined;
    const queries = dehydratedState?.queries as unknown[] | undefined;
    const firstQuery = queries?.[0] as Record<string, unknown> | undefined;
    const state = firstQuery?.state as Record<string, unknown> | undefined;
    const data = state?.data as Record<string, unknown> | undefined;
    const results = data?.results as Record<string, unknown> | undefined;
    const projects = results?.projects;

    if (!Array.isArray(projects)) {
      return [];
    }

    // Validate each project has required fields
    return projects.filter((p): p is CollectiveProject => {
      if (typeof p !== 'object' || p === null) return false;
      const proj = p as Record<string, unknown>;
      return typeof proj.id === 'string' && typeof proj.name === 'string';
    });
  } catch {
    return [];
  }
}
