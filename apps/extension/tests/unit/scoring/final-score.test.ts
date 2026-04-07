import { describe, it, expect } from 'vitest';
import { computeFinalScore } from '$lib/core/scoring/final-score';

describe('computeFinalScore', () => {
  describe('null handling', () => {
    it('should return null when both scores are null', () => {
      const result = computeFinalScore(null, null);
      expect(result).toBeNull();
    });

    it('should return deterministic score when semantic is null', () => {
      const result = computeFinalScore(75, null);
      expect(result).toBe(75);
    });

    it('should return semantic score when deterministic is null', () => {
      const result = computeFinalScore(null, 80);
      expect(result).toBe(80);
    });
  });

  describe('default weighting (60/40)', () => {
    it('should compute weighted average with default semanticWeight (0.4)', () => {
      const result = computeFinalScore(80, 60);
      // 80 * 0.6 + 60 * 0.4 = 48 + 24 = 72
      expect(result).toBe(72);
    });

    it('should compute weighted average with equal scores', () => {
      const result = computeFinalScore(50, 50);
      // 50 * 0.6 + 50 * 0.4 = 30 + 20 = 50
      expect(result).toBe(50);
    });

    it('should compute weighted average with high semantic score', () => {
      const result = computeFinalScore(40, 90);
      // 40 * 0.6 + 90 * 0.4 = 24 + 36 = 60
      expect(result).toBe(60);
    });

    it('should compute weighted average with high deterministic score', () => {
      const result = computeFinalScore(90, 40);
      // 90 * 0.6 + 40 * 0.4 = 54 + 16 = 70
      expect(result).toBe(70);
    });
  });

  describe('custom semantic weight', () => {
    it('should use custom semanticWeight of 0.7 (70% semantic)', () => {
      const result = computeFinalScore(40, 90, 0.7);
      // 40 * 0.3 + 90 * 0.7 = 12 + 63 = 75
      expect(result).toBe(75);
    });

    it('should use custom semanticWeight of 0.2 (20% semantic)', () => {
      const result = computeFinalScore(80, 40, 0.2);
      // 80 * 0.8 + 40 * 0.2 = 64 + 8 = 72
      expect(result).toBe(72);
    });
  });

  describe('extreme weights', () => {
    it('should return 100% deterministic when semanticWeight is 0', () => {
      const result = computeFinalScore(75, 25, 0);
      // 75 * 1.0 + 25 * 0 = 75
      expect(result).toBe(75);
    });

    it('should return 100% semantic when semanticWeight is 1', () => {
      const result = computeFinalScore(25, 75, 1);
      // 25 * 0 + 75 * 1.0 = 75
      expect(result).toBe(75);
    });
  });

  describe('clamping - values > 100', () => {
    it('should clamp deterministic score > 100 when only deterministic provided', () => {
      const result = computeFinalScore(150, null);
      expect(result).toBe(100);
    });

    it('should clamp semantic score > 100 when only semantic provided', () => {
      const result = computeFinalScore(null, 150);
      expect(result).toBe(100);
    });

    it('should clamp weighted average when raw score > 100', () => {
      const result = computeFinalScore(150, 150);
      // Raw would be 150, but clamped to 100
      expect(result).toBe(100);
    });

    it('should clamp deterministic when weighted sum > 100', () => {
      const result = computeFinalScore(120, 90);
      // 120 * 0.6 + 90 * 0.4 = 72 + 36 = 108 → clamped to 100
      expect(result).toBe(100);
    });

    it('should clamp semantic when weighted sum > 100', () => {
      const result = computeFinalScore(90, 120);
      // 90 * 0.6 + 120 * 0.4 = 54 + 48 = 102 → clamped to 100
      expect(result).toBe(100);
    });
  });

  describe('clamping - values < 0', () => {
    it('should clamp deterministic score < 0 when only deterministic provided', () => {
      const result = computeFinalScore(-10, null);
      expect(result).toBe(0);
    });

    it('should clamp semantic score < 0 when only semantic provided', () => {
      const result = computeFinalScore(null, -10);
      expect(result).toBe(0);
    });

    it('should clamp weighted average when raw score < 0', () => {
      const result = computeFinalScore(-50, -50);
      // Raw would be -50, but clamped to 0
      expect(result).toBe(0);
    });

    it('should clamp when negative score pulls weighted average below 0', () => {
      const result = computeFinalScore(-50, 30);
      // -50 * 0.6 + 30 * 0.4 = -30 + 12 = -18 → clamped to 0
      expect(result).toBe(0);
    });
  });

  describe('boundary values', () => {
    it('should return 0 when both scores are 0', () => {
      const result = computeFinalScore(0, 0);
      expect(result).toBe(0);
    });

    it('should return 100 when both scores are 100', () => {
      const result = computeFinalScore(100, 100);
      expect(result).toBe(100);
    });

    it('should handle boundary deterministic (100) with low semantic', () => {
      const result = computeFinalScore(100, 0);
      // 100 * 0.6 + 0 * 0.4 = 60
      expect(result).toBe(60);
    });

    it('should handle low deterministic with boundary semantic (100)', () => {
      const result = computeFinalScore(0, 100);
      // 0 * 0.6 + 100 * 0.4 = 40
      expect(result).toBe(40);
    });
  });

  describe('decimal handling and rounding', () => {
    it('should round weighted average to nearest integer', () => {
      const result = computeFinalScore(67, 67);
      // 67 * 0.6 + 67 * 0.4 = 40.2 + 26.8 = 67.0 → rounded to 67
      expect(result).toBe(67);
    });

    it('should round up when decimal >= 0.5', () => {
      const result = computeFinalScore(67, 68);
      // 67 * 0.6 + 68 * 0.4 = 40.2 + 27.2 = 67.4 → rounded to 67
      expect(result).toBe(67);
    });

    it('should handle floating point precision correctly', () => {
      const result = computeFinalScore(33, 67);
      // 33 * 0.6 + 67 * 0.4 = 19.8 + 26.8 = 46.6 → rounded to 47
      expect(result).toBe(47);
    });
  });
});
