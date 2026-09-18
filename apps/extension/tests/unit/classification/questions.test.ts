import { describe, expect, it } from 'vitest';
import {
  buildClassificationQuestions,
  buildClassificationState,
} from '$lib/core/classification/questions';
import { MISSION_CATEGORIES } from '$lib/core/types/mission-classification';
import type { Mission } from '$lib/core/types/mission';

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'mission-1',
  title: 'Développeur Front-end React',
  client: null,
  description: 'Mission de développement front-end pour un client bancaire.',
  stack: ['React', 'TypeScript'],
  tjm: null,
  location: null,
  remote: null,
  duration: null,
  startDate: null,
  publishedAt: null,
  url: 'https://example.com/mission',
  source: 'free-work',
  scrapedAt: new Date('2026-09-18T12:00:00.000Z'),
  seniority: null,
  scoreBreakdown: null,
  score: null,
  semanticScore: null,
  semanticReason: null,
  ...overrides,
});

describe('buildClassificationQuestions', () => {
  it('declares exactly the category (choice) and remoteCompatible (boolean) questions', () => {
    const questions = buildClassificationQuestions();
    expect(Object.keys(questions).sort()).toEqual(['category', 'remoteCompatible']);
    expect(questions.category.type).toBe('choice');
    expect(questions.remoteCompatible.type).toBe('boolean');
  });

  it('exposes one choice per mission category', () => {
    const questions = buildClassificationQuestions();
    expect(Object.keys(questions.category.criteria).sort()).toEqual([...MISSION_CATEGORIES].sort());
  });

  it('gives a non-empty description to every choice', () => {
    const questions = buildClassificationQuestions();
    for (const description of Object.values(questions.category.criteria)) {
      expect(description.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('buildClassificationState', () => {
  it('projects the mission fields the model needs', () => {
    const mission = makeMission({ stack: ['React'], remote: 'hybrid' });
    const state = buildClassificationState(mission);
    expect(state.title).toBe('Développeur Front-end React');
    expect(state.stack).toEqual(['React']);
    expect(state.remote).toBe('hybrid');
    expect(state.description).toContain('front-end');
  });

  it('truncates long descriptions with an ellipsis', () => {
    const mission = makeMission({ description: 'a'.repeat(3000) });
    const state = buildClassificationState(mission);
    expect(state.description.length).toBeLessThanOrEqual(1501); // 1500 + ellipsis
    expect(state.description.endsWith('…')).toBe(true);
  });

  it('truncates long titles and keeps short ones untouched', () => {
    const long = makeMission({ title: 'b'.repeat(250) });
    expect(buildClassificationState(long).title.length).toBeLessThanOrEqual(201);
    expect(buildClassificationState(long).title.endsWith('…')).toBe(true);

    const short = makeMission({ title: 'Dev React' });
    expect(buildClassificationState(short).title).toBe('Dev React');
  });

  it('keeps a null remote policy as null', () => {
    const state = buildClassificationState(makeMission({ remote: null }));
    expect(state.remote).toBeNull();
  });
});
