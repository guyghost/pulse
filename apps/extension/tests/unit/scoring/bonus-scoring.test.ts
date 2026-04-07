import { describe, it, expect } from 'vitest';
import { scoreSeniorityBonus, scoreStartDateBonus } from '../../../src/lib/core/scoring/bonus-scoring';

describe('scoreSeniorityBonus', () => {
  it('returns 5 for exact match', () => {
    expect(scoreSeniorityBonus('senior', 'senior')).toBe(5);
    expect(scoreSeniorityBonus('junior', 'junior')).toBe(5);
    expect(scoreSeniorityBonus('confirmed', 'confirmed')).toBe(5);
  });

  it('returns 2 for adjacent match', () => {
    expect(scoreSeniorityBonus('confirmed', 'senior')).toBe(2);
    expect(scoreSeniorityBonus('senior', 'confirmed')).toBe(2);
    expect(scoreSeniorityBonus('junior', 'confirmed')).toBe(2);
    expect(scoreSeniorityBonus('confirmed', 'junior')).toBe(2);
  });

  it('returns 0 for 2-level mismatch', () => {
    expect(scoreSeniorityBonus('junior', 'senior')).toBe(0);
    expect(scoreSeniorityBonus('senior', 'junior')).toBe(0);
  });

  it('returns 2 for null mission seniority (neutral)', () => {
    expect(scoreSeniorityBonus(null, 'senior')).toBe(2);
    expect(scoreSeniorityBonus(null, 'junior')).toBe(2);
  });
});

describe('scoreStartDateBonus', () => {
  const now = new Date('2026-04-07');

  it('returns 5 for mission starting within 7 days', () => {
    expect(scoreStartDateBonus('2026-04-10', now)).toBe(5);
    expect(scoreStartDateBonus('2026-04-14', now)).toBe(5);
  });

  it('returns 4 for mission starting within 14 days', () => {
    expect(scoreStartDateBonus('2026-04-20', now)).toBe(4);
  });

  it('returns 3 for mission starting within 30 days', () => {
    expect(scoreStartDateBonus('2026-05-01', now)).toBe(3);
  });

  it('returns 1 for mission starting within 60 days', () => {
    expect(scoreStartDateBonus('2026-05-20', now)).toBe(1);
  });

  it('returns 0 for mission starting in >60 days', () => {
    expect(scoreStartDateBonus('2026-07-01', now)).toBe(0);
  });

  it('returns 0 for past dates', () => {
    expect(scoreStartDateBonus('2026-03-01', now)).toBe(0);
  });

  it('returns 0 for null startDate', () => {
    expect(scoreStartDateBonus(null, now)).toBe(0);
  });

  it('returns 0 for invalid date string', () => {
    expect(scoreStartDateBonus('not-a-date', now)).toBe(0);
  });
});
