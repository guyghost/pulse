import 'fake-indexeddb/auto';

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Mission } from '../../../src/lib/core/types/mission';
import type { DbHandleRegistry } from '../../../src/lib/shell/storage/db-handle-registry';

const registryCapture = vi.hoisted(() => ({ current: null as DbHandleRegistry | null }));

vi.mock('../../../src/lib/shell/storage/db-handle-registry', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/lib/shell/storage/db-handle-registry')>();
  return {
    ...actual,
    createDbHandleRegistry: (
      dependencies: Parameters<typeof actual.createDbHandleRegistry>[0]
    ): DbHandleRegistry => {
      const registry = actual.createDbHandleRegistry(dependencies);
      registryCapture.current = registry;
      return registry;
    },
  };
});

import {
  MISSIONPULSE_DB_NAME,
  getMissionsBySource,
  getMissionsPaginated,
  getRecentMissions,
  purgeOldMissions,
  saveConnectorStatuses,
  saveMissions,
  upsertMissions,
  withStore,
} from '../../../src/lib/shell/storage/db';

const mission = (id: string): Mission => ({
  id,
  title: 'Mission Svelte',
  client: 'MissionPulse',
  description: 'Mission de test',
  stack: ['Svelte', 'TypeScript'],
  tjm: 700,
  location: 'Paris',
  remote: 'hybrid',
  duration: '6 mois',
  url: `https://example.test/${id}`,
  source: 'free-work',
  scrapedAt: new Date('2026-07-16T12:00:00.000Z'),
  score: 90,
  semanticScore: null,
  semanticReason: null,
});

async function deleteDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(MISSIONPULSE_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('A leaked DB handle blocked test cleanup.'));
  });
}

function expectNoOwnedHandles(): void {
  expect(registryCapture.current?.snapshot()).toMatchObject({
    reservationCount: 0,
    tombstoneCount: 0,
    handleCount: 0,
  });
}

beforeEach(async () => {
  await deleteDatabase();
  expectNoOwnedHandles();
});

describe('db.ts business handle ownership', () => {
  it('releases every business handle after each successful public operation', async () => {
    await getMissionsBySource('free-work');
    expectNoOwnedHandles();

    await getRecentMissions(30);
    expectNoOwnedHandles();

    await getMissionsPaginated({ page: 0, pageSize: 10 });
    expectNoOwnedHandles();

    await upsertMissions([mission('upserted')]);
    expectNoOwnedHandles();

    await saveMissions([mission('saved')]);
    expectNoOwnedHandles();

    await saveConnectorStatuses([]);
    expectNoOwnedHandles();

    await purgeOldMissions(30);
    expectNoOwnedHandles();
  });

  it('releases on synchronous setup failure and transaction abort', async () => {
    await expect(
      withStore('missions', 'readonly', () => {
        throw new Error('hostile synchronous setup');
      })
    ).rejects.toThrow('hostile synchronous setup');
    expectNoOwnedHandles();

    await withStore('missions', 'readwrite', (store) => store.add(mission('duplicate')));
    expectNoOwnedHandles();
    await expect(
      withStore('missions', 'readwrite', (store) => store.add(mission('duplicate')))
    ).rejects.toBeTruthy();
    expectNoOwnedHandles();

    const abortController = new AbortController();
    const abortedSave = saveMissions([mission('abort-requested')], abortController.signal);
    abortController.abort();
    await expect(abortedSave).rejects.toMatchObject({ name: 'AbortError' });
    expectNoOwnedHandles();
  });

  it('routes all raw business acquisitions through one finally owner', () => {
    const source = readFileSync('src/lib/shell/storage/db.ts', 'utf8');
    expect(source.match(/\bawait openDB\(\)/g) ?? []).toHaveLength(1);
    expect(source).toMatch(/async function withDbHandle<[^>]+>/);
    expect(source).toMatch(/finally\s*{\s*releaseDB\(db\);\s*}/);
  });
});
