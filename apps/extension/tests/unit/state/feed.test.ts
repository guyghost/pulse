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
      makeMission({
        id: '2',
        title: 'Dev Java Spring',
        description: 'Mission Java pour projet backend',
        stack: ['Java', 'Spring'],
      }),
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

  it('searches missions by client, location, and source', () => {
    const store = createFeedStore();
    store.load();
    store.setMissions([
      makeMission({
        id: '1',
        title: 'Frontend platform',
        client: 'Airbus',
        location: 'Toulouse',
        source: 'free-work',
      }),
      makeMission({
        id: '2',
        title: 'Backend API',
        client: 'Doctolib',
        location: 'Paris',
        source: 'lehibou',
      }),
      makeMission({
        id: '3',
        title: 'Data pipeline',
        client: null,
        location: 'Lyon',
        source: 'collective',
      }),
    ]);

    store.search('airbus');
    expect(store.filteredMissions.map((m) => m.id)).toEqual(['1']);

    store.search('paris');
    expect(store.filteredMissions.map((m) => m.id)).toEqual(['2']);

    store.search('collective');
    expect(store.filteredMissions.map((m) => m.id)).toEqual(['3']);
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

  describe('precomputed search index', () => {
    it('reuses the index across successive searches on the same missions', () => {
      const store = createFeedStore();
      store.load();
      const missions = [
        makeMission({ id: '1', title: 'Dev Rust Backend' }),
        makeMission({ id: '2', title: 'Dev Go Backend' }),
        makeMission({ id: '3', title: 'Dev Python Data' }),
      ];
      store.setMissions(missions);

      // Several searches on the same missions: each must filter correctly,
      // which is only possible if the per-mission haystacks stay aligned
      // with the missions array across searches.
      store.search('backend');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['1', '2']);

      store.search('rust');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['1']);

      store.search('data');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['3']);

      store.search('dev');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['1', '2', '3']);
    });

    it('rebuilds the index when missions change', () => {
      const store = createFeedStore();
      store.load();
      store.setMissions([makeMission({ id: '1', title: 'Dev Rust' })]);
      store.search('rust');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['1']);

      // New missions with different content: the search query persists but
      // the index must reflect the new missions, not the stale ones.
      store.setMissions([
        makeMission({ id: '2', title: 'Dev Go', description: 'Mission Go pour infrastructure' }),
        makeMission({ id: '3', title: 'Dev Rust', description: 'Mission Rust critique' }),
      ]);
      expect(store.searchQuery).toBe('rust');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['3']);
    });

    it('matches multi-word queries spanning field boundaries (joined-haystack semantics)', () => {
      const store = createFeedStore();
      store.load();
      store.setMissions([
        makeMission({ id: '1', title: 'Dev React', client: 'Airbus' }),
        makeMission({
          id: '2',
          title: 'Dev Java',
          client: 'Bank',
          description: null,
          stack: ['Spring'],
        }),
      ]);

      // "react airbus" spans the title→client boundary — it only matches
      // because fields are joined with spaces into one haystack; per-field
      // matching would reject it.
      store.search('react airbus');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['1']);

      store.search('java bank');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['2']);
    });

    it('is case-insensitive for both query and mission fields', () => {
      const store = createFeedStore();
      store.load();
      store.setMissions([
        makeMission({ id: '1', title: 'développeur KOTLIN', client: 'BNP' }),
        makeMission({ id: '2', title: 'dev swift', client: 'Startup' }),
      ]);

      store.search('KOTLIN');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['1']);

      store.search('bnp');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['1']);

      store.search('DEV SWIFT');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['2']);
    });

    it('matches terms found only in the description', () => {
      const store = createFeedStore();
      store.load();
      store.setMissions([
        makeMission({
          id: '1',
          title: 'Dev Front',
          description: 'Refonte complète du design system',
        }),
        makeMission({ id: '2', title: 'Dev Back', description: 'API GraphQL haute charge' }),
      ]);

      store.search('design system');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['1']);

      store.search('graphql');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['2']);
    });

    it('treats whitespace-only queries as empty and trims surrounding whitespace', () => {
      const store = createFeedStore();
      store.load();
      store.setMissions([makeMission({ id: '1' }), makeMission({ id: '2' })]);

      store.search('   ');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['1', '2']);

      store.search('  dev react  ');
      expect(store.filteredMissions.map((m) => m.id)).toEqual(['1', '2']);
    });

    it('produces identical results to the previous per-keystroke normalization', () => {
      // Replicates the exact pre-index algorithm (haystack built inline per
      // mission) and asserts the store's indexed filtering matches it on a
      // representative query corpus, including odd and empty queries.
      const previousFilter = (missions: Mission[], searchQuery: string): Mission[] => {
        if (!searchQuery.trim()) {
          return missions;
        }

        const query = searchQuery.toLowerCase().trim();
        return missions.filter((m) => {
          const searchableText = [
            m.title,
            m.client,
            m.description,
            m.location,
            m.source,
            ...m.stack,
          ]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .join(' ')
            .toLowerCase();

          return searchableText.includes(query);
        });
      };

      const missions = [
        makeMission({ id: '1', title: 'Dev React Senior', client: 'Airbus' }),
        makeMission({
          id: '2',
          title: 'Data Engineer',
          client: 'Bank Corp',
          description: 'Pipeline de données temps réel',
          stack: ['Python', 'Spark'],
          location: 'Lyon',
          source: 'collective',
        }),
        makeMission({ id: '3', title: 'Dev Java', description: null, client: null }),
      ];

      const queries = [
        'REACT',
        'react',
        'airbus',
        'dev java',
        '  java  ',
        'java pour projet',
        'python spark',
        'lyon',
        'collective',
        'temps réel',
        'nonexistent',
        '',
      ];

      const store = createFeedStore();
      store.load();
      store.setMissions(missions);

      for (const query of queries) {
        store.search(query);
        expect({ query, ids: store.filteredMissions.map((m) => m.id) }).toEqual({
          query,
          ids: previousFilter(missions, query).map((m) => m.id),
        });
      }
    });
  });
});
