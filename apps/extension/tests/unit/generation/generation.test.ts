import { describe, it, expect } from 'vitest';
import { buildPitchPrompt } from '../../../src/lib/core/generation/build-pitch-prompt';
import { buildCoverMessagePrompt } from '../../../src/lib/core/generation/build-cover-message';
import { buildCvSummaryPrompt } from '../../../src/lib/core/generation/build-cv-summary';
import {
  cleanGenerationOutput,
  isValidGeneration,
  createGeneratedAsset,
} from '../../../src/lib/core/generation/parse-generation-result';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import type { ScoreBreakdown } from '../../../src/lib/core/types/score';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'm1',
    title: 'Développeur Go Senior',
    client: 'BNP Paribas',
    description: 'Mission de développement backend en Go pour une plateforme de trading.',
    stack: ['Go', 'gRPC', 'PostgreSQL', 'Docker'],
    tjm: 650,
    location: 'Paris',
    remote: 'hybrid',
    duration: '12 mois',
    startDate: '2026-05-01',
    url: 'https://example.com/mission/1',
    source: 'free-work',
    scrapedAt: new Date(),
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

function makeProfile(): UserProfile {
  return {
    firstName: 'Alice',
    stack: ['Go', 'TypeScript', 'PostgreSQL', 'Docker', 'Kubernetes'],
    tjmMin: 600,
    tjmMax: 800,
    location: 'Paris',
    remote: 'hybrid',
    seniority: 'senior',
    jobTitle: 'Développeur Backend Senior',
    searchKeywords: [],
  };
}

const mockScoreBreakdown: ScoreBreakdown = {
  criteria: {
    stack: 75,
    location: 100,
    tjm: 90,
    remote: 100,
    seniorityBonus: 5,
    startDateBonus: 3,
  },
  deterministic: 95,
  semantic: 88,
  semanticReason: 'Excellent backend match',
  total: 92,
  grade: 'A',
};

describe('generation prompts', () => {
  describe('buildPitchPrompt', () => {
    it('includes mission title and profile stack', () => {
      const prompt = buildPitchPrompt(makeMission(), makeProfile(), null);
      expect(prompt).toContain('Développeur Go Senior');
      expect(prompt).toContain('Go');
      expect(prompt).toContain('TypeScript');
    });

    it('includes score breakdown when provided', () => {
      const prompt = buildPitchPrompt(makeMission(), makeProfile(), mockScoreBreakdown);
      expect(prompt).toContain('92/100');
      expect(prompt).toContain('grade A');
      expect(prompt).toContain('Stack: 75/100');
    });

    it('works without score breakdown', () => {
      const prompt = buildPitchPrompt(makeMission(), makeProfile(), null);
      expect(prompt).not.toContain('Score de match');
    });

    it('truncates long descriptions', () => {
      const longMission = makeMission({
        description: 'A'.repeat(1000),
      });
      const prompt = buildPitchPrompt(longMission, makeProfile(), null);
      // Description in prompt should be capped at 500 chars
      const descIndex = prompt.indexOf('Description:');
      const descEnd = prompt.indexOf('\n', descIndex + 13);
      const descLine = prompt.slice(descIndex + 13, descEnd === -1 ? undefined : descEnd);
      expect(descLine.length).toBeLessThanOrEqual(510); // 500 + '- Description: ' overhead
    });
  });

  describe('buildCoverMessagePrompt', () => {
    it('includes mission and profile info', () => {
      const prompt = buildCoverMessagePrompt(makeMission(), makeProfile());
      expect(prompt).toContain('Développeur Go Senior');
      expect(prompt).toContain('Alice');
      expect(prompt).toContain('Go');
    });

    it('asks for message format', () => {
      const prompt = buildCoverMessagePrompt(makeMission(), makeProfile());
      expect(prompt).toContain('message');
    });
  });

  describe('buildCvSummaryPrompt', () => {
    it('identifies matching and missing skills', () => {
      const prompt = buildCvSummaryPrompt(makeMission(), makeProfile());
      expect(prompt).toContain('Compétences matchantes');
      expect(prompt).toContain('Go');
      expect(prompt).toContain('PostgreSQL');
    });

    it('identifies missing skills', () => {
      const prompt = buildCvSummaryPrompt(makeMission(), makeProfile());
      // gRPC is in mission but not in profile
      expect(prompt).toContain('gRPC');
    });
  });
});

describe('parse-generation-result', () => {
  describe('cleanGenerationOutput', () => {
    it('strips markdown code fences', () => {
      const input = '```text\nHello world\n```';
      expect(cleanGenerationOutput(input)).toBe('Hello world');
    });

    it('strips surrounding quotes', () => {
      expect(cleanGenerationOutput('"Hello world"')).toBe('Hello world');
      expect(cleanGenerationOutput("'Hello world'")).toBe('Hello world');
    });

    it('strips meta-commentary lines', () => {
      const input = 'Voici le pitch:\n\nJe suis un développeur senior.';
      const result = cleanGenerationOutput(input);
      expect(result).not.toContain('Voici');
      expect(result).toContain('Je suis');
    });

    it('preserves normal content', () => {
      const input = "Je suis un développeur Go senior avec 8 ans d'expérience.";
      expect(cleanGenerationOutput(input)).toBe(input);
    });

    it('strips "here is" prefix lines', () => {
      const input = 'Here is your pitch:\n\nI am a senior Go developer.';
      const result = cleanGenerationOutput(input);
      expect(result).not.toContain('Here is');
    });
  });

  describe('isValidGeneration', () => {
    it('rejects too-short content', () => {
      expect(isValidGeneration('Hello')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidGeneration('')).toBe(false);
    });

    it('accepts reasonable content', () => {
      expect(
        isValidGeneration("Je suis un développeur senior avec 8 ans d'expérience en Go.")
      ).toBe(true);
    });

    it('rejects overly long content', () => {
      expect(isValidGeneration('A'.repeat(5001))).toBe(false);
    });
  });

  describe('createGeneratedAsset', () => {
    it('creates an asset with cleaned content', () => {
      const asset = createGeneratedAsset(
        'm1',
        'pitch',
        '```text\nI am a senior Go developer.\n```',
        'gen',
        1000,
        'gemini-nano'
      );

      expect(asset.id).toBe('gen-pitch-1000');
      expect(asset.missionId).toBe('m1');
      expect(asset.type).toBe('pitch');
      expect(asset.content).toBe('I am a senior Go developer.');
      expect(asset.createdAt).toBe(1000);
      expect(asset.modelUsed).toBe('gemini-nano');
    });

    it('generates unique IDs based on prefix and timestamp', () => {
      const a1 = createGeneratedAsset('m1', 'pitch', 'Content here', 'gen', 1000);
      const a2 = createGeneratedAsset('m1', 'cover-message', 'Content here', 'gen', 2000);

      expect(a1.id).not.toBe(a2.id);
    });
  });
});
