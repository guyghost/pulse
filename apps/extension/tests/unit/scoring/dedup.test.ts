import { describe, it, expect } from 'vitest';
import {
  deduplicateMissions,
  deduplicateMissionsDetailed,
} from '../../../src/lib/core/scoring/dedup';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { MissionSource } from '../../../src/lib/core/types/mission';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'test-1',
    title: 'Test Mission',
    client: null,
    description: '',
    stack: [],
    tjm: null,
    location: null,
    remote: null,
    duration: null,
    startDate: null,
    publishedAt: null,
    url: 'https://example.com',
    source: 'free-work' as MissionSource,
    scrapedAt: new Date(),
    seniority: null,
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

describe('deduplicateMissions', () => {
  it('returns empty array for empty input', () => {
    const result = deduplicateMissions([]);
    expect(result).toEqual([]);
  });

  it('returns single mission as-is', () => {
    const mission = makeMission({ id: '1', title: 'Dev React' });
    const result = deduplicateMissions([mission]);
    expect(result).toEqual([mission]);
  });

  it('keeps all missions when no duplicates exist', () => {
    const missions = [
      makeMission({ id: '1', title: 'Dev React', stack: ['React', 'TypeScript'] }),
      makeMission({ id: '2', title: 'Dev Angular', stack: ['Angular', 'TypeScript'] }),
      makeMission({ id: '3', title: 'Dev Python', stack: ['Python', 'Django'] }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(3);
  });

  it('keeps exact duplicate with more info (higher TJM)', () => {
    const missions = [
      makeMission({
        id: '1',
        title: 'Dev React Senior',
        stack: ['React', 'TypeScript'],
        tjm: 500,
        description: 'Short',
      }),
      makeMission({
        id: '2',
        title: 'Dev React Senior',
        stack: ['React', 'TypeScript'],
        tjm: 600,
        description: 'Long description with more details',
      }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
    expect(result[0].tjm).toBe(600);
  });

  it('reports duplicate relations against the retained canonical mission', () => {
    const result = deduplicateMissionsDetailed([
      makeMission({
        id: 'source-1',
        title: 'Dev React Senior',
        stack: ['React', 'TypeScript'],
        tjm: 500,
        description: 'Short',
      }),
      makeMission({
        id: 'source-2',
        title: 'Dev React Senior',
        stack: ['React', 'TypeScript'],
        tjm: 650,
        description: 'Longer description',
      }),
    ]);

    expect(result.missions.map((mission) => mission.id)).toEqual(['source-2']);
    expect(result.duplicateRelations).toEqual([
      {
        canonicalMissionId: 'source-2',
        duplicateMissionId: 'source-1',
        confidence: 1,
        reason: 'same_structured_signature',
      },
    ]);
  });

  it('deduplicates near-duplicate titles', () => {
    const missions = [
      makeMission({ id: '1', title: 'Dev React Senior', stack: ['React'] }),
      makeMission({ id: '2', title: 'Dev React Senior H/F', stack: ['React'] }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('does NOT deduplicate different missions with shared words', () => {
    const missions = [
      makeMission({ id: '1', title: 'Dev React', stack: ['React', 'TypeScript'] }),
      makeMission({ id: '2', title: 'Dev Angular', stack: ['Angular', 'TypeScript'] }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(2);
  });

  it('catches more duplicates with lower threshold', () => {
    const missions = [
      makeMission({ id: '1', title: 'Dev React Fullstack Paris', stack: ['React', 'Node.js'] }),
      makeMission({ id: '2', title: 'Dev React Paris', stack: ['React'] }),
    ];
    const resultHigh = deduplicateMissions(missions, 0.8);
    expect(resultHigh).toHaveLength(2);

    const resultLow = deduplicateMissions(missions, 0.4);
    expect(resultLow).toHaveLength(1);
  });

  it('prefers mission with TJM when deduplicating', () => {
    const missions = [
      makeMission({
        id: '1',
        title: 'Dev React',
        stack: ['React'],
        tjm: null,
        description: 'Description A',
      }),
      makeMission({
        id: '2',
        title: 'Dev React',
        stack: ['React'],
        tjm: 500,
        description: 'Description B',
      }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
    expect(result[0].tjm).toBe(500);
  });

  it('prefers mission with longer description when TJM is same', () => {
    const missions = [
      makeMission({
        id: '1',
        title: 'Dev React',
        stack: ['React'],
        tjm: 500,
        description: 'Short',
      }),
      makeMission({
        id: '2',
        title: 'Dev React',
        stack: ['React'],
        tjm: 500,
        description: 'Longer description with more details',
      }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
    expect(result[0].description).toBe('Longer description with more details');
  });

  it('preserves order of first encountered mission', () => {
    const missions = [
      makeMission({ id: '1', title: 'Dev React Senior', stack: ['React'] }),
      makeMission({ id: '2', title: 'Dev Angular Senior', stack: ['Angular'] }),
      makeMission({ id: '3', title: 'Dev Vue Senior', stack: ['Vue'] }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('1');
    expect(result[1].id).toBe('2');
    expect(result[2].id).toBe('3');
  });

  it('keeps same-title missions when client metadata disagrees', () => {
    const missions = [
      makeMission({ id: '1', title: 'Developpeur React Senior', client: 'Acme', stack: [] }),
      makeMission({ id: '2', title: 'Developpeur React Senior', client: 'Globex', stack: [] }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(2);
  });

  it('prefers direct Cherry Pick mission over Free-Work reseller duplicate', () => {
    const result = deduplicateMissionsDetailed([
      makeMission({
        id: 'fw-1',
        title: 'Product Owner Salesforce',
        client: 'CherryPick',
        stack: ['Salesforce', 'Agile'],
        tjm: 720,
        location: 'Paris, Ile-de-France',
        remote: 'hybrid',
        description:
          'Mission detaillee publiee par un intermediaire avec contexte projet et contraintes.',
        url: 'https://www.free-work.com/fr/tech-it/product-owner/job-mission/product-owner-salesforce',
        source: 'free-work',
      }),
      makeMission({
        id: 'cp-1',
        title: 'Product Owner Salesforce H/F',
        client: 'Banque Alpha',
        stack: ['Salesforce', 'Agile'],
        tjm: 700,
        location: 'Paris',
        remote: 'hybrid',
        description: 'Mission Salesforce',
        url: 'https://app.cherry-pick.io/ext/missions/product-owner-salesforce-42',
        source: 'cherry-pick',
      }),
    ]);

    expect(result.missions).toHaveLength(1);
    expect(result.missions[0]).toMatchObject({
      id: 'cp-1',
      source: 'cherry-pick',
      url: 'https://app.cherry-pick.io/ext/missions/product-owner-salesforce-42',
    });
    expect(result.duplicateRelations[0]).toMatchObject({
      canonicalMissionId: 'cp-1',
      duplicateMissionId: 'fw-1',
      reason: 'same_title_stack_proxy_client',
    });
    expect(result.duplicateRelations[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('deduplicates a Cherry Pick mission republished on Free-Work with language in the title', () => {
    const result = deduplicateMissionsDetailed([
      makeMission({
        id: 'fw-tech-lead-bff',
        title: 'Tech Lead BFF (Java)',
        client: 'Cherry Pick',
        stack: ['Java', 'Spring'],
        tjm: 630,
        location: null,
        remote: 'hybrid',
        description:
          'Description du Poste : Nous recherchons une/un Tech Lead experimente specialise dans la gestion de solutions applicatives.',
        url: 'https://www.free-work.com/fr/tech-it/tech-lead/job-mission/tech-lead-bff-java',
        source: 'free-work',
      }),
      makeMission({
        id: 'cp-tech-lead-bff',
        title: 'Tech Lead BFF (H/F)',
        client: 'Cherry Pick',
        stack: ['Java', 'Spring Boot', 'Postman', 'Kubernetes'],
        tjm: null,
        location: null,
        remote: 'hybrid',
        description:
          'Contexte de la mission Au sein de la DSI Mode et plus particulierement du domaine IT Digital.',
        url: 'https://app.cherry-pick.io/ext/missions/tech-lead-bff-123',
        source: 'cherry-pick',
      }),
    ]);

    expect(result.missions).toHaveLength(1);
    expect(result.missions[0]).toMatchObject({
      id: 'cp-tech-lead-bff',
      source: 'cherry-pick',
    });
    expect(result.duplicateRelations).toEqual([
      expect.objectContaining({
        canonicalMissionId: 'cp-tech-lead-bff',
        duplicateMissionId: 'fw-tech-lead-bff',
        reason: 'same_title_stack_proxy_client',
      }),
    ]);
    expect(result.duplicateRelations[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('keeps same title and stack when real locations are incompatible', () => {
    const missions = [
      makeMission({
        id: '1',
        title: 'Developpeur React Senior',
        stack: ['React', 'TypeScript'],
        location: 'Paris',
      }),
      makeMission({
        id: '2',
        title: 'Developpeur React Senior',
        stack: ['React', 'TypeScript'],
        location: 'Lyon',
      }),
    ];

    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(2);
  });

  it('handles complex duplicate scenarios', () => {
    const missions = [
      makeMission({
        id: '1',
        title: 'Dev React Senior',
        stack: ['React', 'TypeScript'],
        tjm: 500,
        description: 'Short desc',
      }),
      makeMission({ id: '2', title: 'Dev Angular', stack: ['Angular', 'TypeScript'], tjm: 450 }),
      makeMission({
        id: '3',
        title: 'Dev React Senior H/F',
        stack: ['React', 'TypeScript'],
        tjm: 600,
        description: 'Complete description with details',
      }),
      makeMission({ id: '4', title: 'Dev React Junior', stack: ['React'] }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(3);
    expect(result.find((m) => m.id === '1')).toBeUndefined(); // Replaced by id=3
    expect(result.find((m) => m.id === '3')).toBeDefined(); // Kept (has more info)
    expect(result.find((m) => m.id === '2')).toBeDefined(); // Different mission
    expect(result.find((m) => m.id === '4')).toBeDefined(); // Different mission
  });

  it('rewrites duplicate relations when the canonical mission is replaced in a chain', () => {
    // Three structurally-identical missions of increasing quality. Each
    // incoming mission beats the current canonical, so the relation that
    // pointed at the previous canonical must be re-pointed at the new one.
    // This exercises the O(1) relation re-canonicalization path.
    const result = deduplicateMissionsDetailed([
      makeMission({
        id: 'low',
        title: 'Dev React Senior',
        stack: ['React', 'TypeScript'],
        source: 'free-work',
        tjm: null,
        description: '',
      }),
      makeMission({
        id: 'mid',
        title: 'Dev React Senior',
        stack: ['React', 'TypeScript'],
        source: 'free-work',
        tjm: 500,
        description: 'Short description here',
      }),
      makeMission({
        id: 'high',
        title: 'Dev React Senior',
        stack: ['React', 'TypeScript'],
        source: 'cherry-pick',
        tjm: 700,
        description: 'Longer detailed description with more context about the mission',
      }),
    ]);

    expect(result.missions.map((mission) => mission.id)).toEqual(['high']);
    expect(result.duplicateRelations).toEqual([
      {
        canonicalMissionId: 'high',
        duplicateMissionId: 'low',
        confidence: 1,
        reason: 'same_structured_signature',
      },
      {
        canonicalMissionId: 'high',
        duplicateMissionId: 'mid',
        confidence: 1,
        reason: 'same_structured_signature',
      },
    ]);
  });

  describe('regression: undefined safety', () => {
    it('should not crash when mission has undefined title (cast via as any)', () => {
      const mission = makeMission({ title: undefined } as any);
      // This test passes if it doesn't throw
      expect(() => deduplicateMissions([mission])).not.toThrow();
    });

    it('should not crash when mission has undefined entries in stack', () => {
      const mission = makeMission({
        stack: ['React', undefined, 'TypeScript', undefined] as any,
      });
      expect(() => deduplicateMissions([mission])).not.toThrow();
    });

    it('should not crash when mission has undefined description', () => {
      const mission = makeMission({ description: undefined } as any);
      expect(() => deduplicateMissions([mission])).not.toThrow();
    });

    it('should handle gracefully mission with all fields being minimal/empty', () => {
      const mission = makeMission({
        title: '',
        description: '',
        stack: [],
      });
      const result = deduplicateMissions([mission]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mission);
    });
  });
});
