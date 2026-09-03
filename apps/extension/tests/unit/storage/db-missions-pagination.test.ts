import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import type { Mission } from '../../../src/lib/core/types/mission';

const { getMissionsPaginated, MISSIONPULSE_DB_NAME } =
  await import('../../../src/lib/shell/storage/db');
const { saveMissions } = await import('../../../src/lib/shell/storage/db');

async function clearMissionsStore(): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(MISSIONPULSE_DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('missions', 'readwrite');
    tx.objectStore('missions').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Lead Svelte',
    client: 'ScaleOps',
    description: 'Mission Svelte 5',
    stack: ['Svelte', 'TypeScript'],
    tjm: 750,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    startDate: null,
    publishedAt: null,
    url: 'https://example.com/mission-1',
    source: 'free-work',
    scrapedAt: new Date('2026-05-22T08:00:00.000Z'),
    seniority: 'senior',
    scoreBreakdown: null,
    score: 91,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

/** Seed missions whose ids encode their date rank (newest = rank 0). */
async function seedRankedMissions(count: number): Promise<Mission[]> {
  const missions = Array.from({ length: count }, (_, rank) =>
    makeMission({
      id: `mission-${String(rank).padStart(3, '0')}`,
      title: `Mission rank ${rank}`,
      scrapedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, count - rank)),
    })
  );
  await saveMissions(missions);
  return missions;
}

describe('getMissionsPaginated — cursor path (sortBy date, no filter)', () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase(MISSIONPULSE_DB_NAME);
  });

  afterEach(async () => {
    await indexedDB.deleteDatabase(MISSIONPULSE_DB_NAME);
  });

  it('streams pages identical to the in-memory path (order, total, hasMore)', async () => {
    await seedRankedMissions(57);

    // Reference: in-memory-equivalent full read through the same public API
    const full = await getMissionsPaginated({ page: 0, pageSize: 1000, sortBy: 'score' });

    const pages: Mission[][] = [];
    let page = 0;
    let hasMore = true;
    let total = -1;
    while (hasMore) {
      const result = await getMissionsPaginated({ page, pageSize: 20, sortBy: 'date' });
      pages.push(result.missions);
      hasMore = result.hasMore;
      total = result.total;
      page++;
    }

    expect(total).toBe(57);
    expect(page).toBe(3); // 20 + 20 + 17
    const flattened = pages.flat();
    expect(flattened).toHaveLength(57);
    // Same catalogue as a full read, same newest-first date order
    expect(flattened.map((m) => m.id)).toEqual(full.missions.map((m) => m.id));
    // Descending scrapedAt across page boundaries
    for (let i = 1; i < flattened.length; i++) {
      expect(flattened[i - 1].scrapedAt.getTime()).toBeGreaterThanOrEqual(
        flattened[i].scrapedAt.getTime()
      );
    }
  });

  it('returns an exact remainder on the last page (hasMore false)', async () => {
    await seedRankedMissions(45);

    const last = await getMissionsPaginated({ page: 2, pageSize: 20, sortBy: 'date' });
    expect(last.missions).toHaveLength(5);
    expect(last.hasMore).toBe(false);
    expect(last.total).toBe(45);
  });

  it('reports hasMore true only while valid missions remain past the window', async () => {
    await seedRankedMissions(40);

    const first = await getMissionsPaginated({ page: 0, pageSize: 40, sortBy: 'date' });
    expect(first.missions).toHaveLength(40);
    expect(first.hasMore).toBe(false);

    const beyond = await getMissionsPaginated({ page: 5, pageSize: 20, sortBy: 'date' });
    expect(beyond.missions).toHaveLength(0);
    expect(beyond.hasMore).toBe(false);
  });

  it('returns an empty page for an empty store', async () => {
    const result = await getMissionsPaginated({ page: 0, pageSize: 20, sortBy: 'date' });
    expect(result.missions).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it('never serves an invalid record, and keeps valid pages dense', async () => {
    await seedRankedMissions(30);
    // Corrupt one record directly: missing title breaks the Mission schema
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(MISSIONPULSE_DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('missions', 'readwrite');
      const store = tx.objectStore('missions');
      const corrupt = makeMission({
        id: 'mission-015',
        title: undefined as unknown as string,
      });
      store.put(corrupt);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    // Page covering the corrupted rank stays dense: the cursor fills the
    // page with the next valid records and never serves the invalid one
    const result = await getMissionsPaginated({ page: 0, pageSize: 20, sortBy: 'date' });
    expect(result.missions).toHaveLength(20);
    expect(result.missions.some((m) => m.id === 'mission-015')).toBe(false);
    expect(result.hasMore).toBe(true);

    // The full paged catalogue holds exactly the 29 valid missions
    const all: string[] = [];
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const result = await getMissionsPaginated({ page, pageSize: 10, sortBy: 'date' });
      all.push(...result.missions.map((m) => m.id));
      hasMore = result.hasMore;
      page++;
    }
    expect(all).toHaveLength(29);
    expect(all).not.toContain('mission-015');
  });

  it('keeps the in-memory path for score sort (no behavior change)', async () => {
    const missions = await seedRankedMissions(10);
    const byScore = await getMissionsPaginated({ page: 0, pageSize: 5, sortBy: 'score' });
    expect(byScore.missions).toHaveLength(5);
    expect(byScore.total).toBe(10);
    expect(byScore.hasMore).toBe(true);
    // All missions accounted for across pages
    const second = await getMissionsPaginated({ page: 1, pageSize: 5, sortBy: 'score' });
    expect([...byScore.missions, ...second.missions].map((m) => m.id).sort()).toEqual(
      missions.map((m) => m.id).sort()
    );
  });
});

describe('missions store reset (test helper)', () => {
  it('empties the missions store', async () => {
    await seedRankedMissions(5);
    await clearMissionsStore();
    const result = await getMissionsPaginated({ page: 0, pageSize: 10, sortBy: 'date' });
    expect(result.total).toBe(0);
  });
});
