import 'fake-indexeddb/auto';

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createDbHandleRegistry,
  type DbHandleRegistry,
} from '../../../src/lib/shell/storage/db-handle-registry';
import { createDbOpener } from '../../../src/lib/shell/storage/db-opener';
import {
  createDatasetEpochAuthority,
  type ResetAuthorityTokenV1,
} from '../../../src/lib/shell/storage/dataset-epoch-authority';

const uuid = (suffix: number): string =>
  `50000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

interface FakeDatabase {
  db: IDBDatabase;
  closeCalls(): number;
}

function fakeDatabase(version = 5): FakeDatabase {
  let closes = 0;
  const db = {
    version,
    onversionchange: null,
    close() {
      closes += 1;
    },
  } as unknown as IDBDatabase;
  return { db, closeCalls: () => closes };
}

interface ControlledOpenRequest {
  request: IDBOpenDBRequest;
  block(): void;
  succeed(db: IDBDatabase): void;
  fail(error: DOMException): void;
}

function controlledOpenRequest(): ControlledOpenRequest {
  let result: IDBDatabase | undefined;
  let error: DOMException | null = null;
  const request = {
    get result() {
      if (result === undefined) {
        throw new DOMException('The request has not finished.', 'InvalidStateError');
      }
      return result;
    },
    get error() {
      return error;
    },
    transaction: null,
    onupgradeneeded: null,
    onsuccess: null,
    onerror: null,
    onblocked: null,
  } as unknown as IDBOpenDBRequest;
  return {
    request,
    block: () => request.onblocked?.({} as Event),
    succeed: (db) => {
      result = db;
      request.onsuccess?.({} as Event);
    },
    fail: (nextError) => {
      error = nextError;
      request.onerror?.({} as Event);
    },
  };
}

async function resetToken(resetOperationId: string): Promise<ResetAuthorityTokenV1> {
  const authority = createDatasetEpochAuthority({
    workerEpoch: uuid(900),
    allocateLeaseId: () => uuid(901),
  });
  return authority.acquireResetFence({
    version: 1,
    resetOperationId,
    previousDataEpoch: null,
    nextDataEpoch: uuid(902),
  });
}

function instrumentRegistry(registry: DbHandleRegistry, events: string[]): DbHandleRegistry {
  return {
    reserveOpen(owner) {
      events.push(`reserve:${owner.kind}`);
      return registry.reserveOpen(owner);
    },
    register(permit, db) {
      events.push('register');
      return registry.register(permit, db);
    },
    invalidateOpenForTimeout: (permit) => registry.invalidateOpenForTimeout(permit),
    settleOpenFailure: (permit) => registry.settleOpenFailure(permit),
    release: (db) => registry.release(db),
    enterResetFence: (token) => registry.enterResetFence(token),
    snapshot: () => registry.snapshot(),
  };
}

function storageTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return storageTypeScriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('DB handle ownership adapter', () => {
  it('reserves before indexedDB.open and registers before resolving', async () => {
    const events: string[] = [];
    const request = controlledOpenRequest();
    const registry = createDbHandleRegistry({ getActiveResetToken: () => null });
    const opener = createDbOpener({
      registry: instrumentRegistry(registry, events),
      databaseName: 'missionpulse',
      targetVersion: 5,
      allocateOwnerId: () => uuid(1),
      openRequest: (_name, version) => {
        events.push(`open:${String(version)}`);
        return request.request;
      },
      scheduleBlockedTimeout: (effect, delayMs) => setTimeout(effect, delayMs),
      cancelBlockedTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      blockedTimeoutMs: 750,
      applyStructuralUpgrade: vi.fn(),
    });

    const opening = opener.openBusiness().then((db) => {
      events.push('resolved');
      return db;
    });
    expect(events).toEqual(['reserve:business', 'open:5']);

    const database = fakeDatabase();
    request.succeed(database.db);
    await expect(opening).resolves.toBe(database.db);

    expect(events).toEqual(['reserve:business', 'open:5', 'register', 'resolved']);
    expect(registry.snapshot()).toMatchObject({
      reservationCount: 0,
      handleCount: 1,
      handles: [{ owner: { kind: 'business', operationId: uuid(1) } }],
    });
    opener.release(database.db);
    expect(database.closeCalls()).toBe(1);
  });

  it('gives concurrent target-version callers independently owned handles', async () => {
    const requests = [controlledOpenRequest(), controlledOpenRequest()];
    let allocations = 0;
    let openCalls = 0;
    const registry = createDbHandleRegistry({ getActiveResetToken: () => null });
    const opener = createDbOpener({
      registry,
      databaseName: 'missionpulse',
      targetVersion: 5,
      allocateOwnerId: () => uuid(10 + ++allocations),
      openRequest: () => requests[openCalls++]!.request,
      scheduleBlockedTimeout: (effect, delayMs) => setTimeout(effect, delayMs),
      cancelBlockedTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      blockedTimeoutMs: 750,
      applyStructuralUpgrade: vi.fn(),
    });

    const first = opener.openBusiness();
    const second = opener.openBusiness();

    expect(second).not.toBe(first);
    expect(allocations).toBe(2);
    expect(openCalls).toBe(2);
    expect(registry.snapshot()).toMatchObject({ reservationCount: 2, handleCount: 0 });

    const firstDatabase = fakeDatabase();
    const secondDatabase = fakeDatabase();
    requests[0]!.succeed(firstDatabase.db);
    requests[1]!.succeed(secondDatabase.db);
    await expect(Promise.all([first, second])).resolves.toEqual([
      firstDatabase.db,
      secondDatabase.db,
    ]);

    opener.release(firstDatabase.db);
    expect(firstDatabase.closeCalls()).toBe(1);
    expect(secondDatabase.closeCalls()).toBe(0);
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 1 });

    opener.release(secondDatabase.db);
    expect(secondDatabase.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 0 });
  });

  it('drains two real opener reservations across a reset fence with late success and failure', async () => {
    const requests = [controlledOpenRequest(), controlledOpenRequest()];
    const token = await resetToken(uuid(903));
    let activeToken: ResetAuthorityTokenV1 | null = null;
    let openCalls = 0;
    let allocations = 0;
    const registry = createDbHandleRegistry({ getActiveResetToken: () => activeToken });
    const opener = createDbOpener({
      registry,
      databaseName: 'missionpulse',
      targetVersion: 5,
      allocateOwnerId: () => uuid(910 + ++allocations),
      openRequest: () => requests[openCalls++]!.request,
      scheduleBlockedTimeout: (effect, delayMs) => setTimeout(effect, delayMs),
      cancelBlockedTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      blockedTimeoutMs: 750,
      applyStructuralUpgrade: vi.fn(),
    });

    const first = opener.openBusiness();
    const second = opener.openBusiness();
    const firstRejected = expect(first).rejects.toMatchObject({
      code: 'OPEN_RESERVATION_INVALIDATED',
    });
    const nativeFailure = new DOMException('Late native failure.', 'UnknownError');
    const secondRejected = expect(second).rejects.toBe(nativeFailure);
    expect(registry.snapshot()).toMatchObject({ reservationCount: 2, tombstoneCount: 0 });

    activeToken = token;
    expect(() => registry.enterResetFence(token)).toThrowError(
      expect.objectContaining({ code: 'REGISTRY_NOT_QUIESCENT' })
    );
    expect(registry.snapshot()).toMatchObject({
      reservationCount: 0,
      tombstoneCount: 2,
      handleCount: 0,
    });

    const lateDatabase = fakeDatabase();
    requests[0]!.succeed(lateDatabase.db);
    await firstRejected;
    expect(lateDatabase.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({ tombstoneCount: 1, handleCount: 0 });

    requests[1]!.fail(nativeFailure);
    await secondRejected;
    expect(registry.snapshot()).toMatchObject({
      reservationCount: 0,
      tombstoneCount: 0,
      handleCount: 0,
    });
    expect(registry.enterResetFence(token)).toMatchObject({
      status: 'handles_closed',
      reservationCount: 0,
      tombstoneCount: 0,
      handleCount: 0,
    });
  });

  it('never lends one startup handle to a concurrent business owner', async () => {
    const requests = [controlledOpenRequest(), controlledOpenRequest()];
    let allocations = 0;
    let openCalls = 0;
    const registry = createDbHandleRegistry({ getActiveResetToken: () => null });
    const opener = createDbOpener({
      registry,
      databaseName: 'missionpulse',
      targetVersion: 5,
      allocateOwnerId: () => uuid(15 + ++allocations),
      openRequest: () => requests[openCalls++]!.request,
      scheduleBlockedTimeout: (effect, delayMs) => setTimeout(effect, delayMs),
      cancelBlockedTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      blockedTimeoutMs: 750,
      applyStructuralUpgrade: vi.fn(),
    });

    const startup = opener.openStartup();
    const business = opener.openBusiness();
    expect({ allocations, openCalls }).toEqual({ allocations: 2, openCalls: 2 });

    const startupDatabase = fakeDatabase();
    const businessDatabase = fakeDatabase();
    requests[0]!.succeed(startupDatabase.db);
    requests[1]!.succeed(businessDatabase.db);
    await expect(startup).resolves.toBe(startupDatabase.db);
    await expect(business).resolves.toBe(businessDatabase.db);

    opener.release(businessDatabase.db);
    expect(businessDatabase.closeCalls()).toBe(1);
    expect(startupDatabase.closeCalls()).toBe(0);

    opener.release(startupDatabase.db);
    expect(startupDatabase.closeCalls()).toBe(1);
  });

  it('times out one blocked open without creating an automatic retry', async () => {
    vi.useFakeTimers();
    try {
      const request = controlledOpenRequest();
      let allocations = 0;
      let openCalls = 0;
      const registry = createDbHandleRegistry({ getActiveResetToken: () => null });
      const opener = createDbOpener({
        registry,
        databaseName: 'missionpulse',
        targetVersion: 5,
        allocateOwnerId: () => uuid(20 + ++allocations),
        openRequest: () => {
          openCalls += 1;
          return request.request;
        },
        scheduleBlockedTimeout: (effect, delayMs) => setTimeout(effect, delayMs),
        cancelBlockedTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
        blockedTimeoutMs: 750,
        applyStructuralUpgrade: vi.fn(),
      });
      let outcome: unknown = 'pending';
      void opener.openBusiness().then(
        () => {
          outcome = 'resolved';
        },
        (error: unknown) => {
          outcome = error;
        }
      );

      request.block();
      await vi.advanceTimersByTimeAsync(750);

      expect(outcome).toBeInstanceOf(Error);
      expect(outcome).toMatchObject({ message: 'IndexedDB open blocked after 750ms.' });
      expect({ allocations, openCalls }).toEqual({ allocations: 1, openCalls: 1 });
      expect(registry.snapshot()).toMatchObject({
        reservationCount: 0,
        tombstoneCount: 1,
        handleCount: 0,
      });
      await vi.runAllTimersAsync();
      expect(openCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes a late success after timeout without delivering or registering it', async () => {
    vi.useFakeTimers();
    try {
      const request = controlledOpenRequest();
      const registry = createDbHandleRegistry({ getActiveResetToken: () => null });
      const opener = createDbOpener({
        registry,
        databaseName: 'missionpulse',
        targetVersion: 5,
        allocateOwnerId: () => uuid(30),
        openRequest: () => request.request,
        scheduleBlockedTimeout: (effect, delayMs) => setTimeout(effect, delayMs),
        cancelBlockedTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
        blockedTimeoutMs: 750,
        applyStructuralUpgrade: vi.fn(),
      });

      const opening = opener.openBusiness();
      const rejectedOpening = expect(opening).rejects.toThrow(
        'IndexedDB open blocked after 750ms.'
      );
      request.block();
      await vi.advanceTimersByTimeAsync(750);
      await rejectedOpening;

      const lateDatabase = fakeDatabase();
      request.succeed(lateDatabase.db);

      expect(lateDatabase.closeCalls()).toBe(1);
      expect(registry.snapshot()).toMatchObject({
        reservationCount: 0,
        tombstoneCount: 0,
        handleCount: 0,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses a fresh permit and request only after an explicit call following timeout', async () => {
    vi.useFakeTimers();
    try {
      const requests = [controlledOpenRequest(), controlledOpenRequest()];
      let allocations = 0;
      let openCalls = 0;
      const registry = createDbHandleRegistry({ getActiveResetToken: () => null });
      const opener = createDbOpener({
        registry,
        databaseName: 'missionpulse',
        targetVersion: 5,
        allocateOwnerId: () => uuid(40 + ++allocations),
        openRequest: () => requests[openCalls++]!.request,
        scheduleBlockedTimeout: (effect, delayMs) => setTimeout(effect, delayMs),
        cancelBlockedTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
        blockedTimeoutMs: 750,
        applyStructuralUpgrade: vi.fn(),
      });

      const first = opener.openBusiness();
      const rejectedFirst = expect(first).rejects.toThrow('IndexedDB open blocked after 750ms.');
      requests[0]!.block();
      await vi.advanceTimersByTimeAsync(750);
      await rejectedFirst;

      const second = opener.openBusiness();
      expect({ allocations, openCalls }).toEqual({ allocations: 2, openCalls: 2 });
      expect(registry.snapshot()).toMatchObject({ reservationCount: 1, tombstoneCount: 1 });

      requests[0]!.fail(new DOMException('Old request failed.', 'UnknownError'));
      expect(registry.snapshot()).toMatchObject({ reservationCount: 1, tombstoneCount: 0 });

      const database = fakeDatabase();
      requests[1]!.succeed(database.db);
      await expect(second).resolves.toBe(database.db);
      opener.release(database.db);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks the unversioned fallback probe as startup and releases its handle', async () => {
    const events: string[] = [];
    const request = controlledOpenRequest();
    const registry = createDbHandleRegistry({ getActiveResetToken: () => null });
    const opener = createDbOpener({
      registry: instrumentRegistry(registry, events),
      databaseName: 'missionpulse',
      targetVersion: 5,
      allocateOwnerId: () => uuid(50),
      openRequest: (_name, version) => {
        events.push(`open:${String(version)}`);
        return request.request;
      },
      scheduleBlockedTimeout: (effect, delayMs) => setTimeout(effect, delayMs),
      cancelBlockedTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      blockedTimeoutMs: 750,
      applyStructuralUpgrade: vi.fn(),
    });

    const probing = opener.probeStoredVersion();
    expect(events).toEqual(['reserve:startup', 'open:undefined']);

    const database = fakeDatabase(4);
    request.succeed(database.db);

    await expect(probing).resolves.toBe(4);
    expect(events).toEqual(['reserve:startup', 'open:undefined', 'register']);
    expect(database.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({
      reservationCount: 0,
      tombstoneCount: 0,
      handleCount: 0,
    });
  });

  it('propagates a native probe failure until a fresh explicit probe succeeds', async () => {
    const requests = [controlledOpenRequest(), controlledOpenRequest()];
    let allocations = 0;
    let openCalls = 0;
    const registry = createDbHandleRegistry({ getActiveResetToken: () => null });
    const opener = createDbOpener({
      registry,
      databaseName: 'missionpulse',
      targetVersion: 5,
      allocateOwnerId: () => uuid(60 + ++allocations),
      openRequest: () => requests[openCalls++]!.request,
      scheduleBlockedTimeout: (effect, delayMs) => setTimeout(effect, delayMs),
      cancelBlockedTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      blockedTimeoutMs: 750,
      applyStructuralUpgrade: vi.fn(),
    });

    const first = opener.probeStoredVersion();
    const nativeError = new DOMException('Probe failed.', 'UnknownError');
    requests[0]!.fail(nativeError);

    await expect(first).rejects.toBe(nativeError);
    expect({ allocations, openCalls }).toEqual({ allocations: 1, openCalls: 1 });
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, tombstoneCount: 0 });

    const second = opener.probeStoredVersion();
    expect({ allocations, openCalls }).toEqual({ allocations: 2, openCalls: 2 });
    const database = fakeDatabase(3);
    requests[1]!.succeed(database.db);

    await expect(second).resolves.toBe(3);
    expect(database.closeCalls()).toBe(1);
  });

  it('removes the registered handle on a real fake-indexeddb versionchange', async () => {
    const databaseName = `missionpulse-versionchange-${uuid(70)}`;
    const registry = createDbHandleRegistry({ getActiveResetToken: () => null });
    const opener = createDbOpener({
      registry,
      databaseName,
      targetVersion: 5,
      allocateOwnerId: () => uuid(70),
      openRequest: (name, version) =>
        version === undefined ? indexedDB.open(name) : indexedDB.open(name, version),
      scheduleBlockedTimeout: (effect, delayMs) => setTimeout(effect, delayMs),
      cancelBlockedTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      blockedTimeoutMs: 750,
      applyStructuralUpgrade: vi.fn(),
    });

    await opener.openBusiness();
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 1 });

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 6);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 0 });
    upgraded.close();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onerror = () => resolve();
      request.onsuccess = () => resolve();
    });
  });

  it('exports releaseDB as the production handle close path', () => {
    const source = readFileSync('src/lib/shell/storage/db.ts', 'utf8');
    expect(source).toMatch(/export function releaseDB\s*\(/);
  });

  it('forbids direct IDB handle close calls outside the registry', () => {
    const storageRoot = 'src/lib/shell/storage';
    const violations = storageTypeScriptFiles(storageRoot)
      .filter((file) => !file.endsWith('db-handle-registry.ts'))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            /\.\s*close\s*\(/.test(line)
              ? [`${relative(storageRoot, file)}:${String(index + 1)}:${line.trim()}`]
              : []
          )
      );

    expect(violations).toEqual([]);
  });
});
