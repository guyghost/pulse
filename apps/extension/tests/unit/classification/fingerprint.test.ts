import { describe, expect, it } from 'vitest';
import { buildMissionContentFingerprint, hashString } from '$lib/core/classification/fingerprint';
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

describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('hello world')).toBe(hashString('hello world'));
  });

  it('returns a fixed-width 8-character hex digest', () => {
    const digest = hashString('pulse');
    expect(digest).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces different digests for different inputs', () => {
    expect(hashString('frontend')).not.toBe(hashString('backend'));
  });

  it('is case-sensitive', () => {
    expect(hashString('React')).not.toBe(hashString('react'));
  });
});

describe('buildMissionContentFingerprint', () => {
  it('is stable for identical content', () => {
    expect(buildMissionContentFingerprint(makeMission())).toBe(
      buildMissionContentFingerprint(makeMission())
    );
  });

  it('changes when the description changes', () => {
    const updated = makeMission({ description: 'Description mise à jour.' });
    expect(buildMissionContentFingerprint(updated)).not.toBe(
      buildMissionContentFingerprint(makeMission())
    );
  });

  it('changes when the title changes', () => {
    const updated = makeMission({ title: 'Développeur Back-end Node' });
    expect(buildMissionContentFingerprint(updated)).not.toBe(
      buildMissionContentFingerprint(makeMission())
    );
  });

  it('ignores stack ordering', () => {
    const reordered = makeMission({ stack: ['TypeScript', 'React'] });
    expect(buildMissionContentFingerprint(reordered)).toBe(
      buildMissionContentFingerprint(makeMission())
    );
  });

  it('changes when the stack content changes', () => {
    const updated = makeMission({ stack: ['React', 'Vue'] });
    expect(buildMissionContentFingerprint(updated)).not.toBe(
      buildMissionContentFingerprint(makeMission())
    );
  });

  it('is case-insensitive and whitespace-normalized', () => {
    const variant = makeMission({
      title: '  développeur front-end react ',
      description: 'MISSION DE DÉVELOPPEMENT FRONT-END POUR UN CLIENT BANCAIRE.',
    });
    expect(buildMissionContentFingerprint(variant)).toBe(
      buildMissionContentFingerprint(makeMission())
    );
  });

  it('does not depend on fields outside the classified content', () => {
    const rescored = makeMission({ score: 87, tjm: 650, id: 'mission-2' });
    expect(buildMissionContentFingerprint(rescored)).toBe(
      buildMissionContentFingerprint(makeMission())
    );
  });
});
