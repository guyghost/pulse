import type { Mission } from '$lib/core/types/mission';
import type { UserProfile } from '$lib/core/types/profile';
import type { TJMHistory, TJMRecord, TJMRegion } from '$lib/core/types/tjm';

export const mockProfile: UserProfile = {
  firstName: 'Alice',
  keywords: ['TypeScript', 'React', 'Node.js', 'Svelte'],
  tjmMin: 500,
  tjmMax: 750,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Développeur Fullstack',
  experiences: [
    {
      id: 'exp-mock-1',
      title: 'Lead Frontend',
      company: 'Fintech Scale-up',
      location: 'Paris',
      startDate: '2023-03',
      endDate: null,
      isCurrent: true,
      description:
        'Refonte de la plateforme client en Svelte 5, mise en place du design system et accompagnement d’une équipe de 4 développeurs.',
      skills: ['Svelte', 'TypeScript', 'Vite', 'TailwindCSS'],
      source: 'manual',
      sourceExternalId: null,
      positionIndex: 0,
      updatedAt: 1710000000000,
    },
    {
      id: 'exp-mock-2',
      title: 'Développeur Fullstack',
      company: 'Agence Web Lyon',
      location: 'Lyon',
      startDate: '2020-09',
      endDate: '2023-02',
      isCurrent: false,
      description:
        'Conception et développement de dashboards SaaS pour des clients B2B, API Node.js + React.',
      skills: ['React', 'Node.js', 'PostgreSQL', 'Docker'],
      source: 'linkedin',
      sourceExternalId: 'li-123',
      positionIndex: 1,
      updatedAt: 1710000000000,
    },
    {
      id: 'exp-mock-3',
      title: 'Développeur Frontend',
      company: 'Startup SaaS',
      location: 'Remote',
      startDate: '2018-01',
      endDate: '2020-08',
      isCurrent: false,
      description: 'Intégration d’une bibliothèque de composants et migration Angular vers React.',
      skills: ['Angular', 'React', 'TypeScript'],
      source: 'linkedin',
      sourceExternalId: 'li-456',
      positionIndex: 2,
      updatedAt: 1710000000000,
    },
  ],
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
    scoreBreakdown: null,
    score: Math.floor(Math.random() * 100),
    semanticScore: null,
    semanticReason: null,
    publishedAt: new Date(
      now.getTime() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000
    ).toISOString(),
  }));
}

export const mockMissions: Mission[] = generateMockMissions(10);

export function generateMockTJMHistory(): TJMHistory {
  const stackConfigs = [
    { stack: 'react', base: 520, trend: 18 },
    { stack: 'typescript', base: 540, trend: 14 },
    { stack: 'node.js', base: 500, trend: 10 },
    { stack: 'svelte', base: 560, trend: 20 },
    { stack: 'python', base: 510, trend: -6 },
    { stack: 'vue.js', base: 495, trend: 4 },
    { stack: 'java', base: 530, trend: 8 },
  ];
  const dates = ['2026-03-15', '2026-03-22', '2026-03-29', '2026-04-01'];
  const seniorityLevels: Array<{
    seniority: 'junior' | 'confirmed' | 'senior';
    offset: number;
  }> = [
    { seniority: 'junior', offset: -120 },
    { seniority: 'confirmed', offset: 0 },
    { seniority: 'senior', offset: 135 },
  ];
  const regions: TJMRegion[] = ['ile-de-france', 'lyon', 'remote', 'bordeaux', 'nantes', 'other'];
  const records: TJMRecord[] = [];

  for (const [stackIndex, config] of stackConfigs.entries()) {
    for (const [dateIndex, date] of dates.entries()) {
      for (const [levelIndex, level] of seniorityLevels.entries()) {
        const marketDrift = (dateIndex - 1) * config.trend;
        const average = config.base + level.offset + marketDrift + stackIndex * 4;
        records.push({
          stack: config.stack,
          date,
          min: average - 55 - levelIndex * 8,
          max: average + 65 + levelIndex * 10,
          average,
          sampleCount: 4 + dateIndex + levelIndex,
          seniority: level.seniority,
          region: regions[(stackIndex + dateIndex + levelIndex) % regions.length] ?? 'other',
        });
      }
    }
  }

  return { records };
}
