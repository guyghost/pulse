import { createFeedStore } from '../../../src/lib/state/feed.svelte';
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

describe('feed store', () => {
  it('starts in empty state', () => {
    const store = createFeedStore();
    expect(store.state).toBe('empty');
  });

  it('transitions empty → loading → loaded', () => {
    const store = createFeedStore();
    store.load();
    expect(store.state).toBe('loading');

    const missions = [makeMission(), makeMission({ id: 'test-2', title: 'Dev Vue' })];
    store.setMissions(missions);
    expect(store.state).toBe('loaded');
    expect(store.missions).toHaveLength(2);
    expect(store.filteredMissions).toHaveLength(2);
  });

  it('transitions loading → error on setError', () => {
    const store = createFeedStore();
    store.load();
    store.setError('Network error');
    expect(store.state).toBe('error');
    expect(store.error).toBe('Network error');
  });

  it('searches missions by title', () => {
    const store = createFeedStore();
    store.load();
    store.setMissions([
      makeMission({ id: '1', title: 'Dev React Senior' }),
      makeMission({ id: '2', title: 'Dev Java Spring', description: 'Mission Java pour projet backend', stack: ['Java', 'Spring'] }),
      makeMission({ id: '3', title: 'Lead React Native' }),
    ]);

    store.search('React');
    expect(store.state).toBe('loaded');
    expect(store.filteredMissions).toHaveLength(2);
    expect(store.searchQuery).toBe('React');
  });

  it('searches missions by stack', () => {
    const store = createFeedStore();
    store.load();
    store.setMissions([
      makeMission({ id: '1', stack: ['React', 'TypeScript'] }),
      makeMission({ id: '2', stack: ['Java', 'Spring'] }),
    ]);

    store.search('java');
    expect(store.filteredMissions).toHaveLength(1);
  });

  it('clears search and restores all missions', () => {
    const store = createFeedStore();
    store.load();
    const missions = [makeMission({ id: '1' }), makeMission({ id: '2' })];
    store.setMissions(missions);
    store.search('nonexistent');
    expect(store.filteredMissions).toHaveLength(0);

    store.clearSearch();
    expect(store.state).toBe('loaded');
    expect(store.filteredMissions).toHaveLength(2);
    expect(store.searchQuery).toBe('');
  });

  it('can reload from loaded state', () => {
    const store = createFeedStore();
    store.load();
    store.setMissions([makeMission()]);
    expect(store.state).toBe('loaded');

    store.load();
    expect(store.state).toBe('loading');
  });

  it('can reload from error state', () => {
    const store = createFeedStore();
    store.load();
    store.setError('fail');
    expect(store.state).toBe('error');

    store.load();
    expect(store.state).toBe('loading');
  });

  describe('regression: undefined safety', () => {
    it('should not crash when searching missions where one mission has undefined in stack array', () => {
      const store = createFeedStore();
      store.load();

      // Mission with undefined in stack (simulating runtime pollution)
      const missions = [
        makeMission({ id: '1', title: 'Dev React Senior', stack: ['React', 'TypeScript'] }),
        makeMission({ id: '2', title: 'Dev Vue', stack: ['Vue', undefined, 'TypeScript'] as any }),
        makeMission({ id: '3', title: 'Dev Java', stack: ['Java', 'Spring'] }),
      ];

      store.setMissions(missions);

      // This test passes if search doesn't throw
      expect(() => store.search('React')).not.toThrow();
      expect(store.state).toBe('loaded');
    });

    it('should not crash when searching missions where one mission has nullish description', () => {
      const store = createFeedStore();
      store.load();

      // Mission with null/undefined description
      const missions = [
        makeMission({ id: '1', title: 'Dev React', description: 'Mission React' }),
        makeMission({ id: '2', title: 'Dev Vue', description: null as any }),
        makeMission({ id: '3', title: 'Dev Java', description: undefined as any }),
      ];

      store.setMissions(missions);

      expect(() => store.search('React')).not.toThrow();
      expect(store.state).toBe('loaded');
    });
  });
});
