import { describe, expect, it } from 'vitest';
import { parseClassification } from '$lib/core/classification/parse-evaluation';
import { MISSION_CATEGORIES } from '$lib/core/types/mission-classification';

const NOW = 1_758_201_600_000; // 2026-09-18T12:00:00Z

const confidentAnswers = {
  category: {
    type: 'choice',
    choice: 'frontend',
    probabilities: { frontend: 0.92, backend: 0.05, other: 0.03 },
  },
  remoteCompatible: { type: 'boolean', probability: 0.95 },
};

describe('parseClassification', () => {
  it('parses valid confident answers into a classification', () => {
    const classification = parseClassification(confidentAnswers, {
      confidenceThreshold: 0.7,
      now: NOW,
    });

    expect(classification).not.toBeNull();
    expect(classification).toEqual({
      category: 'frontend',
      remoteCompatible: true,
      confidence: 0.92, // min(category distribution, boolean P(true))
      classifiedAt: NOW,
    });
  });

  it('marks remoteCompatible false when P(true) is below 0.5', () => {
    const classification = parseClassification(
      {
        category: { type: 'choice', choice: 'devops', probabilities: { devops: 0.9 } },
        remoteCompatible: { type: 'boolean', probability: 0.2 },
      },
      { confidenceThreshold: 0.7, now: NOW }
    );

    expect(classification).toMatchObject({ category: 'devops', remoteCompatible: false });
  });

  it('computes confidence as the minimum across questions', () => {
    const classification = parseClassification(
      {
        category: { type: 'choice', choice: 'backend', probabilities: { backend: 0.75 } },
        remoteCompatible: { type: 'boolean', probability: 0.83 },
      },
      { confidenceThreshold: 0.7, now: NOW }
    );

    expect(classification?.confidence).toBe(0.75);
  });

  it('accepts a choice answer without distribution (falls back to boolean probability)', () => {
    const classification = parseClassification(
      {
        category: { type: 'choice', choice: 'mobile' },
        remoteCompatible: { type: 'boolean', probability: 0.8 },
      },
      { confidenceThreshold: 0.7, now: NOW }
    );

    expect(classification?.category).toBe('mobile');
    expect(classification?.confidence).toBe(0.8);
  });

  it('rejects answers below the confidence threshold', () => {
    const classification = parseClassification(
      {
        category: { type: 'choice', choice: 'frontend', probabilities: { frontend: 0.6 } },
        remoteCompatible: { type: 'boolean', probability: 0.9 },
      },
      { confidenceThreshold: 0.7, now: NOW }
    );

    expect(classification).toBeNull();
  });

  it('rejects every well-formed answer type outside the category list', () => {
    for (const choice of ['lead-dev', 'cto', '', 'FRONTEND']) {
      const classification = parseClassification(
        {
          category: { type: 'choice', choice, probabilities: { [choice]: 1 } },
          remoteCompatible: { type: 'boolean', probability: 0.9 },
        },
        { confidenceThreshold: 0.7, now: NOW }
      );
      expect(classification).toBeNull();
    }
    // Sanity: every declared category is accepted.
    for (const choice of MISSION_CATEGORIES) {
      const classification = parseClassification(
        {
          category: { type: 'choice', choice, probabilities: { [choice]: 1 } },
          remoteCompatible: { type: 'boolean', probability: 0.9 },
        },
        { confidenceThreshold: 0.7, now: NOW }
      );
      expect(classification?.category).toBe(choice);
    }
  });

  it('rejects malformed answers', () => {
    const malformed: unknown[] = [
      null,
      undefined,
      'not-an-object',
      {},
      { category: null, remoteCompatible: { type: 'boolean', probability: 0.9 } },
      {
        category: { type: 'score', score: 1 },
        remoteCompatible: { type: 'boolean', probability: 0.9 },
      },
      { category: { type: 'choice', choice: 'frontend' }, remoteCompatible: null },
      {
        category: { type: 'choice', choice: 'frontend' },
        remoteCompatible: { type: 'choice', choice: 'frontend' },
      },
      {
        category: { type: 'choice', choice: 'frontend' },
        remoteCompatible: { type: 'boolean', probability: 1.5 },
      },
      {
        category: { type: 'choice', choice: 'frontend' },
        remoteCompatible: { type: 'boolean', probability: Number.NaN },
      },
      // Malformed probabilities map falls back gracefully but unknown choice still rejects.
      {
        category: { type: 'choice', choice: 'unknown-cat', probabilities: 'oops' },
        remoteCompatible: { type: 'boolean', probability: 0.9 },
      },
    ];

    for (const answers of malformed) {
      expect(parseClassification(answers, { confidenceThreshold: 0.7, now: NOW })).toBeNull();
    }
  });

  it('accepts a zero threshold when probabilities are present', () => {
    const classification = parseClassification(
      {
        category: { type: 'choice', choice: 'data' },
        remoteCompatible: { type: 'boolean', probability: 0.1 },
      },
      { confidenceThreshold: 0, now: NOW }
    );

    expect(classification).toMatchObject({ category: 'data', remoteCompatible: false });
  });
});
