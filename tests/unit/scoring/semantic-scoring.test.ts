import { describe, it, expect } from 'vitest';
import { buildScoringPrompt, parseSemanticResult } from '../../../src/lib/core/scoring/semantic-scoring';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { UserProfile } from '../../../src/lib/core/types/profile';

const profile: UserProfile = {
  firstName: 'Guy',
  stack: ['TypeScript', 'React', 'Node.js'],
  tjmMin: 500,
  tjmMax: 700,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Developpeur Fullstack',
  searchKeywords: [],
};

const mission: Mission = {
  id: '1',
  title: 'Dev React/TypeScript',
  client: null,
  description: 'Mission React avec TypeScript',
  stack: ['React', 'TypeScript'],
  tjm: 600,
  location: 'Paris',
  remote: 'hybrid',
  duration: '6 mois',
  url: 'https://example.com',
  source: 'free-work',
  scrapedAt: new Date(),
  score: null,
  semanticScore: null,
  semanticReason: null,
};

describe('buildScoringPrompt', () => {
  it('includes mission title and profile stack', () => {
    const prompt = buildScoringPrompt(mission, profile);
    expect(prompt).toContain('Dev React/TypeScript');
    expect(prompt).toContain('TypeScript');
    expect(prompt).toContain('React');
    expect(prompt).toContain('Node.js');
  });
});

describe('parseSemanticResult', () => {
  it('parses valid JSON response', () => {
    const result = parseSemanticResult('{"score": 85, "reason": "Stack alignee"}');
    expect(result).toEqual({ score: 85, reason: 'Stack alignee' });
  });

  it('extracts JSON from surrounding text', () => {
    const result = parseSemanticResult('Here is the result: {"score": 70, "reason": "Bon match"} done.');
    expect(result).toEqual({ score: 70, reason: 'Bon match' });
  });

  it('returns null for invalid response', () => {
    expect(parseSemanticResult('no json here')).toBeNull();
  });

  it('clamps score to 0-100', () => {
    const result = parseSemanticResult('{"score": 150, "reason": "overflow"}');
    expect(result?.score).toBe(100);
  });

  it('handles markdown-wrapped JSON', () => {
    const result = parseSemanticResult('```json\n{"score": 85, "reason": "Good match"}\n```');
    expect(result).toEqual({ score: 85, reason: 'Good match' });
  });

  it('handles `}` inside the reason string', () => {
    const result = parseSemanticResult('{"score": 70, "reason": "Stack matches {React, Node}"}');
    expect(result).toEqual({ score: 70, reason: 'Stack matches {React, Node}' });
  });

  it('handles nested whitespace and newlines', () => {
    const result = parseSemanticResult('{\n  "score": 60,\n  "reason": "ok"\n}');
    expect(result).toEqual({ score: 60, reason: 'ok' });
  });

  it('handles score as string', () => {
    const result = parseSemanticResult('{"score": "85", "reason": "match"}');
    expect(result).toEqual({ score: 85, reason: 'match' });
  });

  it('handles extra JSON fields', () => {
    const result = parseSemanticResult('{"score": 80, "reason": "ok", "confidence": 0.9}');
    expect(result).toEqual({ score: 80, reason: 'ok' });
  });
});
