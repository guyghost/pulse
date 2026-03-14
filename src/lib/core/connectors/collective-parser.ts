import type { Mission } from '../types/mission';

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

function mapSkill(raw: string): string {
  return SKILL_MAP[raw] ?? raw.replace(/_/g, ' ');
}

function extractTjm(budgetBrief: string | null): number | null {
  if (!budgetBrief) return null;
  const match = budgetBrief.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function mapRemote(prefs: string[]): Mission['remote'] {
  if (prefs.includes('REMOTE')) return 'full';
  if (prefs.includes('HYBRID')) return 'hybrid';
  if (prefs.includes('ON_SITE')) return 'onsite';
  return null;
}

export function parseCollectiveProjects(projects: CollectiveProject[], now: Date): Mission[] {
  return projects.map((p) => ({
    id: `col-${p.id}`,
    title: p.name,
    client: p.company?.name ?? null,
    description: p.sumUp ?? '',
    stack: p.projectTypes.map(mapSkill),
    tjm: extractTjm(p.budgetBrief),
    location: p.location?.fullNameFrench ?? null,
    remote: mapRemote(p.workPreferences),
    duration: null,
    url: `https://www.collective.work/job/${p.slug}`,
    source: 'collective' as const,
    scrapedAt: now,
    score: null,
    semanticScore: null,
    semanticReason: null,
  }));
}

export function extractCollectiveProjects(html: string): CollectiveProject[] {
  const match = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];

  try {
    const data = JSON.parse(match[1]);
    const projects = data?.props?.pageProps?.projects;
    return Array.isArray(projects) ? projects : [];
  } catch {
    return [];
  }
}
