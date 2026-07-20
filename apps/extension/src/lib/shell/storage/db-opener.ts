import type { DbHandleRegistry, DbOpenOwner } from './db-handle-registry';

export interface DbOpenerDependencies {
  readonly registry: DbHandleRegistry;
  readonly databaseName: string;
  readonly targetVersion: number;
  readonly allocateOwnerId: () => string;
  readonly openRequest: (name: string, version?: number) => IDBOpenDBRequest;
  readonly scheduleBlockedTimeout: (effect: () => void, delayMs: number) => unknown;
  readonly cancelBlockedTimeout: (timer: unknown) => void;
  readonly blockedTimeoutMs: number;
  readonly applyStructuralUpgrade: (
    request: IDBOpenDBRequest,
    event: IDBVersionChangeEvent
  ) => void;
}

export interface DbOpener {
  openBusiness(): Promise<IDBDatabase>;
  openStartup(): Promise<IDBDatabase>;
  probeStoredVersion(): Promise<number>;
  release(db: IDBDatabase): void;
}

export function createDbOpener(deps: DbOpenerDependencies): DbOpener {
  let inFlightProbe: Promise<number> | null = null;

  function open(kind: 'business' | 'startup', version?: number): Promise<IDBDatabase> {
    const ownerId = deps.allocateOwnerId();
    const owner: DbOpenOwner =
      kind === 'business'
        ? { kind: 'business', operationId: ownerId }
        : { kind: 'startup', attemptId: ownerId };
    const permit = deps.registry.reserveOpen(owner);
    let request: IDBOpenDBRequest;
    try {
      request = deps.openRequest(deps.databaseName, version);
    } catch (error) {
      deps.registry.settleOpenFailure(permit);
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      let callerSettled = false;
      let blockedTimeoutScheduled = false;
      let blockedTimeout: unknown;
      const cancelBlockedTimeout = (): void => {
        if (!blockedTimeoutScheduled) {
          return;
        }
        blockedTimeoutScheduled = false;
        deps.cancelBlockedTimeout(blockedTimeout);
      };
      request.onupgradeneeded = (event) => {
        if (version !== undefined) {
          deps.applyStructuralUpgrade(request, event);
        }
      };
      request.onsuccess = () => {
        cancelBlockedTimeout();
        try {
          const registered = deps.registry.register(permit, request.result);
          if (callerSettled) {
            deps.registry.release(registered.db);
            return;
          }
          callerSettled = true;
          resolve(registered.db);
        } catch (error) {
          if (!callerSettled) {
            callerSettled = true;
            reject(error);
          }
        }
      };
      request.onerror = () => {
        cancelBlockedTimeout();
        deps.registry.settleOpenFailure(permit);
        if (callerSettled) {
          return;
        }
        callerSettled = true;
        reject(request.error ?? new Error('IndexedDB open failed.'));
      };
      request.onblocked = () => {
        if (callerSettled || blockedTimeoutScheduled) {
          return;
        }
        blockedTimeoutScheduled = true;
        blockedTimeout = deps.scheduleBlockedTimeout(() => {
          blockedTimeoutScheduled = false;
          if (callerSettled) {
            return;
          }
          callerSettled = true;
          deps.registry.invalidateOpenForTimeout(permit);
          reject(new Error(`IndexedDB open blocked after ${deps.blockedTimeoutMs}ms.`));
        }, deps.blockedTimeoutMs);
      };
    });
  }

  function openTarget(kind: 'business' | 'startup'): Promise<IDBDatabase> {
    return open(kind, deps.targetVersion);
  }

  function probeStoredVersion(): Promise<number> {
    if (inFlightProbe !== null) {
      return inFlightProbe;
    }
    const guarded = open('startup')
      .then((db) => {
        const version = db.version;
        deps.registry.release(db);
        return version;
      })
      .finally(() => {
        if (inFlightProbe === guarded) {
          inFlightProbe = null;
        }
      });
    inFlightProbe = guarded;
    return guarded;
  }

  return Object.freeze({
    openBusiness: () => openTarget('business'),
    openStartup: () => openTarget('startup'),
    probeStoredVersion,
    release: (db: IDBDatabase) => deps.registry.release(db),
  });
}
