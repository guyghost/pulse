import { describe, expect, it } from 'vitest';
import { extractMatchingSkills, generateQuickPitch } from '../../../src/lib/core/pitch/quick-pitch';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { UserProfile } from '../../../src/lib/core/types/profile';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-test',
    title: 'Architecte Svelte & Node.js',
    client: 'Acme Cloud',
    description: 'Mission longue de refonte.',
    stack: ['Svelte', 'TypeScript', 'Node.js', 'PostgreSQL'],
    tjm: 700,
    location: 'Paris',
    remote: 'partial',
    duration: '6 mois',
    startDate: '2026-10-01',
    publishedAt: '2026-09-22T10:00:00.000Z',
    url: 'https://example.com/mission',
    source: 'free-work',
    scrapedAt: new Date('2026-09-22T11:00:00.000Z'),
    seniority: 'senior',
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    firstName: 'Alex',
    jobTitle: 'Développeur Fullstack',
    keywords: ['TypeScript', 'Svelte', 'React', 'Docker'],
    tjmMin: 650,
    tjmMax: null,
    location: 'Paris',
    remote: 'partial',
    seniority: 'senior',
    experiences: [],
    ...overrides,
  };
}

describe('extractMatchingSkills', () => {
  it('identifies exact and case-insensitive matching skills', () => {
    const matched = extractMatchingSkills(
      ['Svelte', 'TypeScript', 'Node.js'],
      ['typescript', 'svelte', 'Python']
    );
    expect(matched).toContain('Svelte');
    expect(matched).toContain('TypeScript');
    expect(matched).not.toContain('Node.js');
    expect(matched).not.toContain('Python');
  });

  it('handles partial skill substring matches', () => {
    const matched = extractMatchingSkills(['Vue 3', 'React.js'], ['React', 'Angular']);
    expect(matched).toContain('React.js');
    expect(matched).not.toContain('Vue 3');
  });

  it('does not cause false positives for short keywords like C, Go, or R', () => {
    const matched = extractMatchingSkills(
      ['React', 'Scala', 'Django', 'MongoDB', 'Rust'],
      ['C', 'Go', 'R']
    );
    expect(matched).toEqual([]);
  });

  it('matches compound tech tokens and runtime variants', () => {
    const matched = extractMatchingSkills(
      ['React / Next.js', 'Vue.js', 'Go / Gin', 'C / C++'],
      ['React', 'Vue', 'Go', 'C']
    );
    expect(matched).toContain('React / Next.js');
    expect(matched).toContain('Vue.js');
    expect(matched).toContain('Go / Gin');
    expect(matched).toContain('C / C++');
  });

  it('returns empty array when either argument is empty or undefined', () => {
    expect(extractMatchingSkills([], ['React'])).toEqual([]);
    expect(extractMatchingSkills(['React'], [])).toEqual([]);
    expect(extractMatchingSkills(undefined, ['React'])).toEqual([]);
  });
});

describe('generateQuickPitch', () => {
  it('generates a tailored pitch when profile and matching skills exist', () => {
    const mission = makeMission();
    const profile = makeProfile();
    const pitch = generateQuickPitch(mission, profile);

    expect(pitch).toContain('Bonjour');
    expect(pitch).toContain('Développeur Fullstack senior');
    expect(pitch).toContain('Architecte Svelte & Node.js');
    expect(pitch).toContain('Svelte');
    expect(pitch).toContain('TypeScript');
    expect(pitch).toContain('650 €/j');
    expect(pitch).toContain('enveloppe');
  });

  it('handles mission without user profile gracefully', () => {
    const mission = makeMission();
    const pitch = generateQuickPitch(mission, null);

    expect(pitch).toContain('Bonjour');
    expect(pitch).toContain('Architecte Svelte & Node.js');
    expect(pitch).toContain('profil freelance');
    expect(pitch).toContain('Svelte');
    expect(pitch).toContain('Disponible immédiatement');
  });

  it('formats TJM reference when profile TJM exceeds mission TJM', () => {
    const mission = makeMission({ tjm: 550 });
    const profile = makeProfile({ tjmMin: 650 });
    const pitch = generateQuickPitch(mission, profile);

    expect(pitch).toContain('Mon TJM de référence est de 650 €/j');
  });

  it('allows custom greeting and call to action', () => {
    const mission = makeMission();
    const profile = makeProfile();
    const pitch = generateQuickPitch(mission, profile, {
      greeting: 'Bonjour l’équipe',
      callToAction: 'Quand pouvons-nous caler 10 minutes d’échange ?',
    });

    expect(pitch).toContain('Bonjour l’équipe');
    expect(pitch).toContain('Quand pouvons-nous caler 10 minutes d’échange ?');
  });
});
