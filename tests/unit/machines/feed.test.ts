import { createActor } from 'xstate';
import { feedMachine } from '../../../src/machines/feed.machine';
import type { Mission } from '../../../src/lib/core/types/mission';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'test-1',
    title: 'Dev React Senior',
    client: 'Acme',
    description: 'Mission React pour projet e-commerce',
    stack: ['React', 'TypeScript'],
    tjm: 600,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    url: 'https://example.com/1',
    source: 'free-work',
    scrapedAt: new Date('2026-01-01'),
    score: 75,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

describe('feed machine', () => {
  it('starts in empty state', () => {
    const actor = createActor(feedMachine).start();
    expect(actor.getSnapshot().value).toBe('empty');
    actor.stop();
  });

  it('transitions empty → loading → loaded', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    expect(actor.getSnapshot().value).toBe('loading');

    const missions = [makeMission(), makeMission({ id: 'test-2', title: 'Dev Vue' })];
    actor.send({ type: 'MISSIONS_LOADED', missions });
    expect(actor.getSnapshot().value).toBe('loaded');
    expect(actor.getSnapshot().context.missions).toHaveLength(2);
    expect(actor.getSnapshot().context.filteredMissions).toHaveLength(2);
    actor.stop();
  });

  it('transitions loading → error on LOAD_ERROR', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    actor.send({ type: 'LOAD_ERROR', error: 'Network error' });
    expect(actor.getSnapshot().value).toBe('error');
    expect(actor.getSnapshot().context.error).toBe('Network error');
    actor.stop();
  });

  it('searches missions by title', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    actor.send({
      type: 'MISSIONS_LOADED',
      missions: [
        makeMission({ id: '1', title: 'Dev React Senior' }),
        makeMission({ id: '2', title: 'Dev Java Spring', description: 'Mission Java pour projet backend', stack: ['Java', 'Spring'] }),
        makeMission({ id: '3', title: 'Lead React Native' }),
      ],
    });

    actor.send({ type: 'SEARCH', query: 'React' });
    expect(actor.getSnapshot().value).toBe('loaded');
    expect(actor.getSnapshot().context.filteredMissions).toHaveLength(2);
    expect(actor.getSnapshot().context.searchQuery).toBe('React');
    actor.stop();
  });

  it('searches missions by stack', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    actor.send({
      type: 'MISSIONS_LOADED',
      missions: [
        makeMission({ id: '1', stack: ['React', 'TypeScript'] }),
        makeMission({ id: '2', stack: ['Java', 'Spring'] }),
      ],
    });

    actor.send({ type: 'SEARCH', query: 'java' });
    expect(actor.getSnapshot().context.filteredMissions).toHaveLength(1);
    actor.stop();
  });

  it('clears search and restores all missions', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    const missions = [makeMission({ id: '1' }), makeMission({ id: '2' })];
    actor.send({ type: 'MISSIONS_LOADED', missions });
    actor.send({ type: 'SEARCH', query: 'nonexistent' });
    expect(actor.getSnapshot().context.filteredMissions).toHaveLength(0);

    actor.send({ type: 'CLEAR_SEARCH' });
    expect(actor.getSnapshot().value).toBe('loaded');
    expect(actor.getSnapshot().context.filteredMissions).toHaveLength(2);
    expect(actor.getSnapshot().context.searchQuery).toBe('');
    actor.stop();
  });

  it('can reload from loaded state', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    actor.send({ type: 'MISSIONS_LOADED', missions: [makeMission()] });
    expect(actor.getSnapshot().value).toBe('loaded');

    actor.send({ type: 'LOAD' });
    expect(actor.getSnapshot().value).toBe('loading');
    actor.stop();
  });

  it('can reload from error state', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    actor.send({ type: 'LOAD_ERROR', error: 'fail' });
    expect(actor.getSnapshot().value).toBe('error');

    actor.send({ type: 'LOAD' });
    expect(actor.getSnapshot().value).toBe('loading');
    actor.stop();
  });

  describe('regression: undefined safety', () => {
    it('should not crash when searching missions where one mission has undefined in stack array', () => {
      const actor = createActor(feedMachine).start();
      actor.send({ type: 'LOAD' });

      // Mission with undefined in stack (simulating runtime pollution)
      const missions = [
        makeMission({ id: '1', title: 'Dev React Senior', stack: ['React', 'TypeScript'] }),
        makeMission({ id: '2', title: 'Dev Vue', stack: ['Vue', undefined, 'TypeScript'] as any }),
        makeMission({ id: '3', title: 'Dev Java', stack: ['Java', 'Spring'] }),
      ];

      actor.send({ type: 'MISSIONS_LOADED', missions });

      // This test passes if search doesn't throw
      expect(() => actor.send({ type: 'SEARCH', query: 'React' })).not.toThrow();
      expect(actor.getSnapshot().value).toBe('loaded');
      actor.stop();
    });

    it('should not crash when searching missions where one mission has nullish description', () => {
      const actor = createActor(feedMachine).start();
      actor.send({ type: 'LOAD' });

      // Mission with null/undefined description
      const missions = [
        makeMission({ id: '1', title: 'Dev React', description: 'Mission React' }),
        makeMission({ id: '2', title: 'Dev Vue', description: null as any }),
        makeMission({ id: '3', title: 'Dev Java', description: undefined as any }),
      ];

      actor.send({ type: 'MISSIONS_LOADED', missions });

      expect(() => actor.send({ type: 'SEARCH', query: 'React' })).not.toThrow();
      expect(actor.getSnapshot().value).toBe('loaded');
      actor.stop();
    });
  });
});
