import type { Mission, MissionSource, RemoteType } from '../../src/lib/core/types/mission';

const SOURCES: MissionSource[] = ['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick'];

const STACKS = [
  ['React', 'TypeScript', 'Node.js'],
  ['Vue.js', 'TypeScript', 'Python'],
  ['Angular', 'Java', 'Spring Boot'],
  ['Svelte', 'Go', 'PostgreSQL'],
  ['React Native', 'TypeScript', 'Firebase'],
  ['Next.js', 'TypeScript', 'Prisma'],
  ['Python', 'Django', 'PostgreSQL'],
  ['Rust', 'WebAssembly', 'TypeScript'],
  ['PHP', 'Laravel', 'MySQL'],
  ['Ruby', 'Rails', 'Redis'],
  ['Kotlin', 'Spring Boot', 'PostgreSQL'],
  ['Swift', 'iOS', 'CoreData'],
  ['Flutter', 'Dart', 'Firebase'],
  ['AWS', 'Terraform', 'Kubernetes'],
  ['Azure', 'DevOps', 'Docker'],
  ['GCP', 'BigQuery', 'Airflow'],
  ['Machine Learning', 'Python', 'PyTorch'],
  ['Data Engineering', 'Spark', 'Scala'],
  ['Blockchain', 'Solidity', 'Web3.js'],
  ['Salesforce', 'Apex', 'Lightning'],
];

const TITLES = [
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
  'Développeur Angular Confirmé',
  'Ingénieur Data Python',
  'Développeur Blockchain',
  'Consultant Salesforce',
  'Développeur PHP Laravel',
  'Développeur Ruby on Rails',
  'Mobile Developer Flutter',
  'Développeur iOS Swift',
  'Développeur Android Kotlin',
  'Data Scientist Senior',
  'ML Engineer',
  'Cloud Architect AWS',
  'Ingénieur Cybersécurité',
  'Product Owner Technique',
  'Scrum Master / Coach Agile',
  'Développeur Fullstack JS',
  'Backend Engineer Node.js',
  'Développeur Go Microservices',
  'Site Reliability Engineer',
  'Platform Engineer',
  'QA Engineer Automation',
  'Développeur ETL / BI',
  'Ingénieur MLOps',
  'Développeur Web3',
  'CRM Technical Lead',
];

const CLIENTS = [
  'Société Générale',
  'BNP Paribas',
  'AXA',
  'Thales',
  'Capgemini',
  'Startup FinTech',
  'Scale-up SaaS',
  'Air France',
  'SNCF',
  'Orange',
  'EDF',
  'TotalEnergies',
  'LVMH',
  'Kering',
  'Sanofi',
  'Dassault Systèmes',
  'Oodrive',
  'Qonto',
  'Alan',
  'Doctolib',
  'BlaBlaCar',
  'ManoMano',
  'Mirakl',
  'Contentsquare',
  'Datadog',
  'Lydia',
  'Spendesk',
  'Klarna France',
  'Revolut',
  'Wise',
  'N26',
  null,
  null,
  null,
];

const LOCATIONS = ['Paris', 'Lyon', 'Nantes', 'Bordeaux', 'Toulouse', 'Marseille', 'Lille', 'Strasbourg', 'Remote'];

const REMOTES: (RemoteType | null)[] = ['full', 'hybrid', 'onsite', null];

const DURATIONS = ['3 mois', '6 mois', '9 mois', '12 mois', '18 mois', '24 mois', null];

const DESCRIPTIONS = [
  'Mission pour un projet de transformation digitale. Stack moderne, équipe agile, CI/CD.',
  'Développement d\'une plateforme SaaS B2B en forte croissance. Architecture microservices.',
  'Refonte complète de l\'application frontend. Migration vers React 18 et TypeScript.',
  'Projet greenfield : construction d\'une nouvelle API from scratch.',
  'Accompagnement technique sur un projet legacy. Modernisation progressive.',
  'Mise en place d\'une architecture data lake. ETL et analytics en temps réel.',
  'Développement mobile natif iOS/Android. Publication sur les stores.',
  'Projet cloud migration : lift-and-shift vers AWS puis refactorisation.',
  'Mission DevOps : mise en place de pipelines CI/CD et infrastructure as code.',
  'Audit et refactoring d\'une application critique. Optimisation des performances.',
  'Construction d\'une plateforme e-commerce headless. Next.js et CMS headless.',
  'Projet IA/ML : intégration de modèles de NLP dans un produit existant.',
  'Développement d\'une application web3 et smart contracts Solidity.',
  'Intégration Salesforce et développement de composants Lightning.',
];

/**
 * Génère une mission mock avec des données déterministes basées sur l'index
 */
export function generateMockMission(index: number, baseDate: Date = new Date()): Mission {
  const sourceIndex = index % SOURCES.length;
  const titleIndex = index % TITLES.length;
  const stackIndex = index % STACKS.length;
  const clientIndex = index % CLIENTS.length;
  const locationIndex = index % LOCATIONS.length;
  const remoteIndex = index % REMOTES.length;
  const durationIndex = index % DURATIONS.length;
  const descIndex = index % DESCRIPTIONS.length;

  // Variation du TJM entre 350 et 900
  const tjmBase = 350 + ((index * 137) % 550);
  const tjm = Math.round(tjmBase / 10) * 10; // Arrondi à la dizaine

  // Score entre 0 et 100 avec une distribution réaliste
  const score = Math.min(100, Math.max(0, 30 + ((index * 53) % 70)));

  // Date de scraping variant sur les 30 derniers jours
  const scrapedAt = new Date(baseDate.getTime() - (index % 30) * 24 * 60 * 60 * 1000);

  return {
    id: `mock-${index}-${SOURCES[sourceIndex]}`,
    title: TITLES[titleIndex],
    client: CLIENTS[clientIndex],
    description: DESCRIPTIONS[descIndex],
    stack: STACKS[stackIndex],
    tjm,
    location: LOCATIONS[locationIndex],
    remote: REMOTES[remoteIndex],
    duration: DURATIONS[durationIndex],
    url: `https://example.com/jobs/mock-${index}`,
    source: SOURCES[sourceIndex],
    scrapedAt,
    score,
    semanticScore: null,
    semanticReason: null,
  };
}

/**
 * Génère un dataset de missions de taille variable
 */
export function generateMockMissions(count: number, baseDate: Date = new Date()): Mission[] {
  return Array.from({ length: count }, (_, i) => generateMockMission(i, baseDate));
}

/**
 * Génère un dataset de 500 missions pour les tests de performance
 */
export function generateLargeDataset(): Mission[] {
  return generateMockMissions(500);
}

/**
 * Génère un dataset avec une répartition équilibrée par source
 */
export function generateBalancedDataset(missionsPerSource: number = 50): Mission[] {
  const missions: Mission[] = [];
  const baseDate = new Date();

  SOURCES.forEach((source, sourceIndex) => {
    for (let i = 0; i < missionsPerSource; i++) {
      const mission = generateMockMission(sourceIndex * 1000 + i, baseDate);
      mission.source = source;
      mission.id = `mock-${source}-${i}`;
      missions.push(mission);
    }
  });

  return missions;
}

/**
 * Génère des missions avec des erreurs de parsing simulées
 */
export function generateMalformedMissions(count: number = 5): Partial<Mission>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `malformed-${i}`,
    title: '', // Titre vide = erreur
    description: 'Description without proper structure',
    source: SOURCES[i % SOURCES.length],
    // Manque des champs obligatoires
  }));
}
