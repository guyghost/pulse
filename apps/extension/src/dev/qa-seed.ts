/**
 * QA Seed — deterministic, production-scale dev dataset.
 *
 * DEV-ONLY. The whole module is consumed only from `src/dev/` and is excluded
 * from production builds (everything under `src/dev/` is behind `import.meta.env.DEV`).
 *
 * Design notes
 * ------------
 * - `buildQaSeed(now)` is PURE: no I/O, no `Date.now()`, no `Math.random()`,
 *   no async. Every value is derived from the injected `now`. Same `now` →
 *   byte-identical output (asserted in tests/unit/dev/qa-seed.test.ts).
 * - The mission generator mirrors the deterministic algorithm of
 *   `tests/fixtures/large-dataset.ts` (same SOURCES/STACKS/TITLES/CLIENTS/
 *   LOCATIONS/REMOTES/DURATIONS cycling and the same tjm/score formulas) so the
 *   base missions are byte-compatible with that fixture for matching indices.
 *   It is reproduced here — type-correct and emitting COMPLETE `Mission`
 *   objects — because importing the fixture into the strict `src/` program
 *   surfaces a latent type error in that fixture (see reports/qa/seed-data.md).
 *   Reuse is proven by a cross-check unit test against the fixture.
 * - `applyQaSeedToLocalStorage` is the Imperative-Shell writer (I/O) that
 *   writes the seed into the SAME `window.localStorage` keys the chrome stubs
 *   already read, plus DEV-only extensions for hidden/seen/trackings/health.
 */
import { buildScoreBreakdown } from '$lib/core/scoring/final-score';
import {
  DEFAULT_CONNECTED_ALERT_PREFERENCES,
  normalizeConnectedAlertPreferences,
} from '$lib/core/types/alert-preferences';
import { createInitialHealthSnapshot } from '$lib/core/types/health';

import type { ConnectedAlertPreferences } from '$lib/core/types/alert-preferences';
import type { SavedFeedView } from '$lib/core/types/feed-view';
import type { ConnectorHealthSnapshot } from '$lib/core/types/health';
import type { Mission, MissionSource, RemoteType } from '$lib/core/types/mission';
import type { SeniorityLevel, UserProfile } from '$lib/core/types/profile';
import type { DeterministicBreakdown } from '$lib/core/types/score';
import type {
  ApplicationStatus,
  MissionTracking,
  StatusTransition,
} from '$lib/core/types/tracking';

// ============================================================================
// Constants (mirrors tests/fixtures/large-dataset.ts verbatim for reuse)
// ============================================================================

const SOURCES: MissionSource[] = [
  'free-work',
  'lehibou',
  'hiway',
  'collective',
  'cherry-pick',
  'malt',
];

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

const LOCATIONS = [
  'Paris',
  'Lyon',
  'Nantes',
  'Bordeaux',
  'Toulouse',
  'Marseille',
  'Lille',
  'Strasbourg',
  'Remote',
];

const REMOTES: (RemoteType | null)[] = ['full', 'hybrid', 'onsite', null];

const DURATIONS = ['3 mois', '6 mois', '9 mois', '12 mois', '18 mois', '24 mois', null];

const DESCRIPTIONS = [
  'Mission pour un projet de transformation digitale. Stack moderne, équipe agile, CI/CD.',
  "Développement d'une plateforme SaaS B2B en forte croissance. Architecture microservices.",
  "Refonte complète de l'application frontend. Migration vers React 18 et TypeScript.",
  "Projet greenfield : construction d'une nouvelle API from scratch.",
  'Accompagnement technique sur un projet legacy. Modernisation progressive.',
  "Mise en place d'une architecture data lake. ETL et analytics en temps réel.",
  'Développement mobile natif iOS/Android. Publication sur les stores.',
  'Projet cloud migration : lift-and-shift vers AWS puis refactorisation.',
  'Mission DevOps : mise en place de pipelines CI/CD et infrastructure as code.',
  "Audit et refactoring d'une application critique. Optimisation des performances.",
  "Construction d'une plateforme e-commerce headless. Next.js et CMS headless.",
  'Projet IA/ML : intégration de modèles de NLP dans un produit existant.',
  "Développement d'une application web3 et smart contracts Solidity.",
  'Intégration Salesforce et développement de composants Lightning.',
];

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const TOTAL_MISSIONS = 500;

// ============================================================================
// LocalStorage keys (must match src/dev/chrome-stubs.ts exactly)
// ============================================================================

export const QA_LOCALSTORAGE_KEYS = {
  missions: '__missionpulse_dev_missions',
  favorites: '__missionpulse_dev_favorites',
  hidden: '__missionpulse_dev_hidden',
  seen: '__missionpulse_dev_seen',
  savedViews: '__missionpulse_dev_saved_views',
  alertPreferences: '__missionpulse_dev_alert_preferences',
  profile: '__missionpulse_dev_profile',
  trackings: '__missionpulse_dev_trackings',
  health: '__missionpulse_dev_health',
} as const;

// ============================================================================
// Seed type
// ============================================================================

export interface QaSeed {
  missions: Mission[];
  favorites: Record<string, number>;
  hidden: Record<string, number>;
  seen: string[];
  savedViews: SavedFeedView[];
  alertPreferences: ConnectedAlertPreferences;
  profile: UserProfile;
  profileIncomplete: UserProfile;
  trackings: MissionTracking[];
  healthSnapshots: ConnectorHealthSnapshot[];
}

// ============================================================================
// Pure helpers
// ============================================================================

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function buildDeterministicBreakdown(score: number): DeterministicBreakdown {
  return {
    stack: clampScore(score),
    location: clampScore(score - 8),
    tjm: clampScore(score - 4),
    remote: clampScore(score - 12),
    seniorityBonus: 0,
    startDateBonus: 0,
  };
}

/**
 * Builds a complete, deterministic mission for `index`.
 * Algorithm mirrors tests/fixtures/large-dataset.ts `generateMockMission`
 * (same cycling + tjm/score formulas) but emits a FULL Mission including
 * publishedAt, startDate, seniority and scoreBreakdown.
 */
function buildMission(index: number, baseDate: Date): Mission {
  const sourceIndex = index % SOURCES.length;
  const titleIndex = index % TITLES.length;
  const stackIndex = index % STACKS.length;
  const clientIndex = index % CLIENTS.length;
  const locationIndex = index % LOCATIONS.length;
  const remoteIndex = index % REMOTES.length;
  const durationIndex = index % DURATIONS.length;
  const descIndex = index % DESCRIPTIONS.length;

  // TJM between 350 and 900 (deterministic, matches fixture)
  const tjmBase = 350 + ((index * 137) % 550);
  const tjm = Math.round(tjmBase / 10) * 10;

  // Score 0-100 with realistic distribution (matches fixture)
  const score = clampScore(30 + ((index * 53) % 70));

  // scrapedAt spread over the last 30 days (matches fixture)
  const scrapedAt = new Date(baseDate.getTime() - (index % 30) * DAY_MS);

  // publishedAt: independent deterministic 30-day spread
  const publishedOffsetDays = (index * 7) % 30;
  const publishedAt = new Date(baseDate.getTime() - publishedOffsetDays * DAY_MS).toISOString();

  const breakdown = buildScoreBreakdown(score, buildDeterministicBreakdown(score));

  const seniorityLevels: SeniorityLevel[] = ['junior', 'confirmed', 'senior'];
  const seniority: SeniorityLevel | null = index % 4 === 3 ? null : seniorityLevels[index % 3];

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
    startDate: null,
    publishedAt,
    url: `https://example.com/jobs/mock-${index}`,
    source: SOURCES[sourceIndex],
    scrapedAt,
    seniority,
    scoreBreakdown: breakdown,
    score: breakdown.total,
    semanticScore: null,
    semanticReason: null,
  };
}

/**
 * Inject edge-case variants in place on the last reserved indices so the
 * dataset deterministically exposes: score 0, score 100, empty title,
 * null location and a duplicate id (exact copy of mission 0).
 */
function applyEdgeOverrides(missions: Mission[]): void {
  // score 0
  missions[495] = {
    ...missions[495],
    score: 0,
    scoreBreakdown: buildScoreBreakdown(0, buildDeterministicBreakdown(0)),
  };
  // score 100
  missions[496] = {
    ...missions[496],
    score: 100,
    scoreBreakdown: buildScoreBreakdown(100, buildDeterministicBreakdown(100)),
  };
  // empty title
  missions[497] = { ...missions[497], title: '' };
  // null location (LOCATIONS has no null entry, so force one explicitly)
  missions[498] = { ...missions[498], location: null };
  // duplicate id — exact copy of mission 0 (same id mock-0-free-work)
  missions[499] = { ...missions[0] };
}

function buildMissions(baseDate: Date): Mission[] {
  const missions: Mission[] = Array.from({ length: TOTAL_MISSIONS }, (_, i) =>
    buildMission(i, baseDate)
  );
  applyEdgeOverrides(missions);
  return missions;
}

function buildFavorites(missions: Mission[], baseDate: Date): Record<string, number> {
  const picks = [0, 5, 10, 42, 99, 150, 250];
  const favorites: Record<string, number> = {};
  picks.forEach((index, n) => {
    favorites[missions[index].id] = baseDate.getTime() - n * HOUR_MS;
  });
  return favorites;
}

function buildHidden(missions: Mission[], baseDate: Date): Record<string, number> {
  const picks = [3, 7];
  const hidden: Record<string, number> = {};
  picks.forEach((index, n) => {
    hidden[missions[index].id] = baseDate.getTime() - n * HOUR_MS;
  });
  return hidden;
}

function buildSeen(missions: Mission[]): string[] {
  // Mixed: roughly the first third seen, rest unseen — deterministic slice.
  return missions.slice(0, 160).map((m) => m.id);
}

function buildSavedViews(baseDate: Date): SavedFeedView[] {
  return [
    {
      id: 'qa-view-priority',
      name: 'Priorité TypeScript',
      filters: {
        searchQuery: 'typescript',
        selectedStacks: ['TypeScript'],
        selectedSource: null,
        selectedRemote: null,
        selectedSeniority: null,
        selectedScoreBucket: 'strong',
        decisionPreset: 'priority',
        showNewOnly: false,
        showFavoritesOnly: false,
        showHidden: false,
        sortBy: 'score',
      },
      createdAt: baseDate.getTime() - 5 * DAY_MS,
      updatedAt: baseDate.getTime() - 2 * DAY_MS,
    },
    {
      id: 'qa-view-remote',
      name: 'Remote TJM nego',
      filters: {
        searchQuery: '',
        selectedStacks: [],
        selectedSource: null,
        selectedRemote: 'full',
        selectedSeniority: null,
        selectedScoreBucket: null,
        decisionPreset: 'remote-compatible',
        showNewOnly: false,
        showFavoritesOnly: false,
        showHidden: false,
        sortBy: 'tjm',
      },
      createdAt: baseDate.getTime() - 3 * DAY_MS,
      updatedAt: baseDate.getTime() - DAY_MS,
    },
  ];
}

function buildAlertPreferences(baseDate: Date): ConnectedAlertPreferences {
  return normalizeConnectedAlertPreferences({
    ...DEFAULT_CONNECTED_ALERT_PREFERENCES,
    requiredStacks: ['TypeScript', 'React'],
    updatedAt: baseDate.toISOString(),
  });
}

function buildCompleteProfile(): UserProfile {
  return {
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
        id: 'exp-seed-1',
        title: 'Lead Frontend',
        company: 'Fintech Scale-up',
        location: 'Paris',
        startDate: '2023-03',
        endDate: null,
        isCurrent: true,
        description:
          'Refonte de la plateforme client en Svelte 5 et mise en place du design system.',
        skills: ['Svelte', 'TypeScript', 'Vite', 'TailwindCSS'],
        source: 'manual',
        sourceExternalId: null,
        positionIndex: 0,
        updatedAt: 1710000000000,
      },
      {
        id: 'exp-seed-2',
        title: 'Développeur Fullstack',
        company: 'Agence Web Lyon',
        location: 'Lyon',
        startDate: '2020-09',
        endDate: '2023-02',
        isCurrent: false,
        description: 'Dashboards SaaS pour des clients B2B, API Node.js + React.',
        skills: ['React', 'Node.js', 'PostgreSQL', 'Docker'],
        source: 'linkedin',
        sourceExternalId: 'li-123',
        positionIndex: 1,
        updatedAt: 1710000000000,
      },
    ],
  };
}

function buildIncompleteProfile(): UserProfile {
  return {
    firstName: '',
    keywords: [],
    tjmMin: 0,
    tjmMax: 0,
    location: '',
    remote: 'hybrid',
    seniority: 'senior',
    jobTitle: '',
    experiences: [],
  };
}

const STATUS_PATH: ApplicationStatus[] = [
  'detected',
  'selected',
  'application_prepared',
  'applied',
  'interview',
  'offer',
];

function pathToStatus(target: ApplicationStatus): ApplicationStatus[] {
  if (target === 'archived') {
    return ['detected', 'archived'];
  }
  if (target === 'accepted' || target === 'rejected') {
    return [...STATUS_PATH, target];
  }
  const idx = STATUS_PATH.indexOf(target);
  return STATUS_PATH.slice(0, idx + 1);
}

function buildHistory(target: ApplicationStatus, baseTime: number): StatusTransition[] {
  const path = pathToStatus(target);
  const transitions: StatusTransition[] = [];
  let prev: ApplicationStatus | null = null;
  path.forEach((status, i) => {
    transitions.push({
      from: prev,
      to: status,
      timestamp: baseTime + i * HOUR_MS,
      note: null,
    });
    prev = status;
  });
  return transitions;
}

const ALL_STATUSES: ApplicationStatus[] = [
  'detected',
  'selected',
  'application_prepared',
  'applied',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'archived',
];

/**
 * One tracking per application status, referencing real seed mission ids,
 * plus a single overdue relance (`application_prepared` with a past nextActionAt).
 */
function buildTrackings(missions: Mission[], baseDate: Date): MissionTracking[] {
  const nowMs = baseDate.getTime();
  return ALL_STATUSES.map((status, i) => {
    const missionId = missions[i].id;
    const baseTime = nowMs - (10 - i) * DAY_MS;
    const overdue = status === 'application_prepared';
    const nextActionAt: string | null = overdue
      ? new Date(nowMs - 2 * HOUR_MS).toISOString()
      : i % 2 === 0
        ? new Date(nowMs + (i + 1) * DAY_MS).toISOString()
        : null;

    return {
      missionId,
      currentStatus: status,
      history: buildHistory(status, baseTime),
      generatedAssetIds: status === 'application_prepared' ? ['qa-asset-1'] : [],
      userRating: status === 'offer' ? 5 : null,
      notes: overdue ? 'Relance en retard' : '',
      nextActionAt,
    };
  });
}

type HealthVariant = 'healthy' | 'degraded' | 'broken';

const HEALTH_BY_SOURCE: Record<MissionSource, HealthVariant> = {
  'free-work': 'healthy',
  lehibou: 'degraded',
  hiway: 'broken',
  collective: 'healthy',
  'cherry-pick': 'healthy',
  malt: 'healthy',
};

/**
 * Connector health snapshots covering all three derived statuses:
 * healthy (closed, 0 failures), degraded (half-open), broken (open).
 */
function buildHealthSnapshots(baseDate: Date): ConnectorHealthSnapshot[] {
  const now = baseDate.getTime();
  return SOURCES.map((source) => {
    const base = createInitialHealthSnapshot(source, now - 10 * 60_000);
    const variant = HEALTH_BY_SOURCE[source];

    if (variant === 'degraded') {
      return {
        ...base,
        circuitState: 'half-open',
        consecutiveFailures: 2,
        totalFailures: 2,
        totalSuccesses: 8,
        lastSuccessAt: now - 20 * 60_000,
        lastFailureAt: now - 5 * 60_000,
        recentLatenciesMs: [1200, 980, 1450],
      };
    }

    if (variant === 'broken') {
      return {
        ...base,
        circuitState: 'open',
        consecutiveFailures: 5,
        totalFailures: 5,
        totalSuccesses: 3,
        lastSuccessAt: now - 60 * 60_000,
        lastFailureAt: now - 60_000,
        recentLatenciesMs: [2000, 1800, 2400],
      };
    }

    return {
      ...base,
      totalSuccesses: 12,
      lastSuccessAt: now - 2 * 60_000,
      recentLatenciesMs: [420, 510, 460],
    };
  });
}

// ============================================================================
// Pure builder
// ============================================================================

/**
 * Build the full deterministic QA seed.
 *
 * Pure: no I/O, no `Date.now()`, no `Math.random()`. Same `now` ⇒ identical output.
 */
export function buildQaSeed(now: Date = new Date()): QaSeed {
  const missions = buildMissions(now);

  return {
    missions,
    favorites: buildFavorites(missions, now),
    hidden: buildHidden(missions, now),
    seen: buildSeen(missions),
    savedViews: buildSavedViews(now),
    alertPreferences: buildAlertPreferences(now),
    profile: buildCompleteProfile(),
    profileIncomplete: buildIncompleteProfile(),
    trackings: buildTrackings(missions, now),
    healthSnapshots: buildHealthSnapshots(now),
  };
}

// ============================================================================
// Imperative-shell writer (I/O) — DEV only
// ============================================================================

/**
 * Resolves the dev localStorage sink. Prefers `window.localStorage` (browser),
 * falls back to `globalThis.localStorage` (some jsdom/vitest setups expose it
 * only on globalThis).
 */
function resolveDevLocalStorage(): Storage | null {
  const w = (globalThis as { window?: { localStorage?: Storage } }).window;
  if (w?.localStorage) {
    return w.localStorage;
  }
  return (globalThis as { localStorage?: Storage }).localStorage ?? null;
}

/**
 * Writes the QA seed into the `window.localStorage` keys consumed by the chrome
 * stubs, then returns the in-memory seed. Reload the page so the stubs re-read.
 *
 * Pass `variant: 'incomplete'` to seed the incomplete profile (completeness banner).
 * The optional `sink` lets tests inject an in-memory Storage (defaults to the
 * resolved browser/global localStorage).
 */
export function applyQaSeedToLocalStorage(
  now: Date = new Date(),
  variant: 'complete' | 'incomplete' = 'complete',
  sink?: Storage
): QaSeed {
  const seed = buildQaSeed(now);
  const profile = variant === 'incomplete' ? seed.profileIncomplete : seed.profile;

  const storage = sink ?? resolveDevLocalStorage();
  if (!storage) {
    return seed;
  }

  const entries: Array<[string, unknown]> = [
    [QA_LOCALSTORAGE_KEYS.missions, seed.missions],
    [QA_LOCALSTORAGE_KEYS.favorites, seed.favorites],
    [QA_LOCALSTORAGE_KEYS.hidden, seed.hidden],
    [QA_LOCALSTORAGE_KEYS.seen, seed.seen],
    [QA_LOCALSTORAGE_KEYS.savedViews, seed.savedViews],
    [QA_LOCALSTORAGE_KEYS.alertPreferences, seed.alertPreferences],
    [QA_LOCALSTORAGE_KEYS.profile, profile],
    [QA_LOCALSTORAGE_KEYS.trackings, seed.trackings],
    [QA_LOCALSTORAGE_KEYS.health, seed.healthSnapshots],
  ];

  for (const [key, value] of entries) {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch {
      // Dev-only persistence must never break the app shell.
    }
  }

  return seed;
}
