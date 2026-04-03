import type { Mission } from '$lib/core/types/mission';
import type { UserProfile } from '$lib/core/types/profile';
import type { TJMHistory, TJMRecord } from '$lib/core/types/tjm';

export const mockProfile: UserProfile = {
  firstName: 'Alice',
  stack: ['TypeScript', 'React', 'Node.js', 'Svelte'],
  tjmMin: 500,
  tjmMax: 750,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Développeur Fullstack',
  searchKeywords: [],
};

const stacks = [
  ['React', 'TypeScript', 'Node.js'],
  ['Vue.js', 'TypeScript', 'Python'],
  ['Angular', 'Java', 'Spring Boot'],
  ['Svelte', 'Go', 'PostgreSQL'],
  ['React Native', 'TypeScript', 'Firebase'],
  ['Next.js', 'TypeScript', 'Prisma'],
  ['Python', 'Django', 'PostgreSQL'],
  ['Rust', 'WebAssembly', 'TypeScript'],
];

const titles = [
  'Développeur React Senior',
  'Lead Dev Vue.js',
  'Architecte Java/Spring',
  'Développeur Fullstack Svelte/Go',
  'Développeur Mobile React Native',
  'Développeur Next.js',
  'Développeur Python/Django',
  'Développeur Rust embarqué',
  'Tech Lead Frontend',
  'DevOps / SRE Senior',
];

const clients = [
  'Société Générale',
  'BNP Paribas',
  'AXA',
  'Thales',
  'Capgemini',
  'Startup FinTech',
  'Scale-up SaaS',
  null,
];
const locations = ['Paris', 'Lyon', 'Nantes', 'Bordeaux', 'Remote', 'Toulouse'];
const remotes = ['full', 'hybrid', 'onsite', null] as const;
const durations = ['3 mois', '6 mois', '12 mois', '18 mois', null];

const seniorities: Array<'junior' | 'confirmed' | 'senior' | null> = [
  'junior',
  'confirmed',
  'senior',
  null,
];

export function generateMockMissions(count: number): Mission[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => ({
    id: `mock-${i}`,
    title: titles[i % titles.length],
    client: clients[i % clients.length],
    description: `Mission ${titles[i % titles.length]} pour un projet de transformation digitale. Stack moderne, équipe agile, CI/CD.`,
    stack: stacks[i % stacks.length],
    tjm: 400 + Math.floor(Math.random() * 400),
    location: locations[i % locations.length],
    remote: remotes[i % remotes.length],
    duration: durations[i % durations.length],
    startDate: null,
    url: `https://www.free-work.com/fr/tech-it/jobs/mock-${i}`,
    source: 'free-work' as const,
    scrapedAt: now,
    seniority: seniorities[i % seniorities.length],
    score: Math.floor(Math.random() * 100),
    semanticScore: null,
    semanticReason: null,
  }));
}

export const mockMissions: Mission[] = generateMockMissions(10);

export function generateMockTJMHistory(): TJMHistory {
  const stacks = ['react', 'typescript', 'node.js', 'python', 'vue.js', 'java'];
  const dates = ['2026-03-15', '2026-03-22', '2026-03-29', '2026-04-01'];
  const seniorityLevels: Array<'junior' | 'confirmed' | 'senior' | null> = [
    'junior',
    'confirmed',
    'senior',
    null,
  ];
  const records: TJMRecord[] = [];

  for (const stack of stacks) {
    const base = 400 + Math.floor(Math.random() * 300);
    for (let i = 0; i < dates.length; i++) {
      const drift = Math.floor((i - 1) * 15 * (Math.random() - 0.3));
      const avg = base + drift;
      records.push({
        stack,
        date: dates[i],
        min: avg - 80 - Math.floor(Math.random() * 40),
        max: avg + 80 + Math.floor(Math.random() * 40),
        average: avg,
        sampleCount: 3 + Math.floor(Math.random() * 8),
        seniority: seniorityLevels[Math.floor(Math.random() * seniorityLevels.length)],
      });
    }
  }

  return { records };
}
