import { z } from 'zod';

import type { SettingsReleaseSnapshot } from './settings-release.contract';
import type { ScanAdmissionResult, SettingsReleaseScanPort } from './settings-release.coordinator';

export const SETTINGS_RELEASE_SCAN_LEDGER_KEY = 'missionpulse_scan_admission_release_v1';

interface ScanStartPort {
  start(
    operationId: `missionpulse-scan:${string}:${number}`,
    snapshot: SettingsReleaseSnapshot
  ): Promise<
    | { status: 'accepted' }
    | {
        status: 'busy';
        activeOperationId: string;
      }
  >;
}

interface FinalPermissionPort {
  containsForSnapshot(snapshot: SettingsReleaseSnapshot): Promise<unknown>;
}

interface ScanLedgerStoragePort {
  get(): Promise<unknown>;
  set(value: unknown): Promise<void>;
}

export interface SettingsReleaseScanLedgerPorts {
  storage: ScanLedgerStoragePort;
  permission: FinalPermissionPort;
  scan: ScanStartPort;
}

const ResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('accepted'),
      operationId: z.string().min(1).max(220),
    })
    .strict(),
  z
    .object({
      status: z.literal('skipped'),
      reason: z.enum(['permission_missing', 'already_running']),
    })
    .strict(),
]);

const RowSchema = z
  .object({
    identity: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    token: z.string().min(1).max(180),
    snapshotDigest: z.string().regex(/^[0-9a-f]{64}$/),
    result: ResultSchema.nullable(),
  })
  .strict();

const InstallSchema = z
  .object({
    retiredThrough: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    rows: z.array(RowSchema).max(2),
  })
  .strict();

const LedgerSchema = z
  .object({
    version: z.literal(1),
    installs: z.record(z.string(), InstallSchema),
  })
  .strict();

type Ledger = z.infer<typeof LedgerSchema>;
type Install = z.infer<typeof InstallSchema>;
type Row = z.infer<typeof RowSchema>;

function emptyLedger(): Ledger {
  return { version: 1, installs: {} };
}

// Ledgers are immutable once built: every update copies the spine (installs
// record → install entry → rows array) and shares untouched entries and rows
// by reference, so snapshots handed to `store` never observe later updates.
// This copy-on-write discipline replaces full-ledger structuredClone snapshots.
function replaceInstall(ledger: Ledger, installId: string, install: Install): Ledger {
  return { version: ledger.version, installs: { ...ledger.installs, [installId]: install } };
}

function installIdFromToken(token: string, identity: number): string | null {
  const match = /^settings-release:([0-9a-f-]{36}):(\d+):scan$/.exec(token);
  if (!match || Number(match[2]) !== identity) {
    return null;
  }
  return match[1];
}

function sameLedger(left: Ledger, right: Ledger): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createSettingsReleaseScanLedgerPort(
  ports: SettingsReleaseScanLedgerPorts
): SettingsReleaseScanPort {
  async function load(): Promise<Ledger> {
    const raw = await ports.storage.get();
    if (raw === undefined || raw === null) {
      return emptyLedger();
    }
    const parsed = LedgerSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error('scan ledger invalid');
    }
    // safeParse rebuilds a fresh object graph (only immutable primitives are
    // shared with `raw`), so the caller owns the returned ledger exclusively.
    return parsed.data;
  }

  async function store(expected: Ledger, intended: Ledger): Promise<void> {
    try {
      await ports.storage.set(intended);
    } catch {
      // Full read-back below is the only authority.
    }
    const read = await load();
    if (sameLedger(read, intended)) {
      return;
    }
    if (sameLedger(read, expected)) {
      throw new Error('scan ledger write rejected');
    }
    throw new Error('scan ledger write ambiguous');
  }

  async function compact(
    ledger: Ledger,
    installId: string,
    scanAckThrough: number
  ): Promise<Ledger> {
    const current = ledger.installs[installId] ?? { retiredThrough: 0, rows: [] };
    if (scanAckThrough < current.retiredThrough) {
      throw new Error('scan watermark regressed');
    }
    const next = replaceInstall(ledger, installId, {
      retiredThrough: scanAckThrough,
      rows: current.rows.filter((row) => row.identity > scanAckThrough),
    });
    if (!sameLedger(next, ledger)) {
      await store(ledger, next);
    }
    return next;
  }

  return {
    async tryAdmit(input) {
      const installId = installIdFromToken(input.token, input.identity);
      if (!installId) {
        throw new Error('scan token invalid');
      }
      const ledger = await compact(await load(), installId, input.scanAckThrough);
      const install = ledger.installs[installId];
      if (!install) {
        throw new Error('scan install ledger missing');
      }
      if (input.identity <= install.retiredThrough) {
        return { status: 'retired' };
      }

      const rowsByIdentity = new Map<number, Row>(
        install.rows.map((candidate) => [candidate.identity, candidate] as const)
      );
      let row = rowsByIdentity.get(input.identity);
      let rows = install.rows;
      let current = ledger;
      if (row) {
        if (row.token !== input.token || row.snapshotDigest !== input.snapshotDigest) {
          throw new Error('scan identity mismatch');
        }
        if (row.result) {
          return structuredClone(row.result);
        }
      } else {
        if (install.rows.length >= 2) {
          throw new Error('scan ledger capacity exhausted');
        }
        const reserved: Row = {
          identity: input.identity,
          token: input.token,
          snapshotDigest: input.snapshotDigest,
          result: null,
        };
        rows = [...install.rows, reserved].sort((left, right) => left.identity - right.identity);
        const reservedLedger = replaceInstall(ledger, installId, {
          retiredThrough: install.retiredThrough,
          rows,
        });
        await store(ledger, reservedLedger);
        rowsByIdentity.set(input.identity, reserved);
        row = rowsByIdentity.get(input.identity);
        if (!row) {
          throw new Error('scan row reservation disappeared');
        }
        current = reservedLedger;
      }

      const permission = await ports.permission.containsForSnapshot(input.snapshot);
      let result: ScanAdmissionResult;
      if (permission === false) {
        result = { status: 'skipped', reason: 'permission_missing' };
      } else if (permission !== true) {
        throw new Error('scan permission proof unknown');
      } else {
        const operationId = `missionpulse-scan:${installId}:${input.identity}` as const;
        const start = await ports.scan.start(operationId, input.snapshot);
        result =
          start.status === 'accepted' || start.activeOperationId === operationId
            ? { status: 'accepted', operationId }
            : { status: 'skipped', reason: 'already_running' };
      }

      const target = rowsByIdentity.get(input.identity);
      if (!target) {
        throw new Error('scan row disappeared');
      }
      const committed: Row = { ...target, result: structuredClone(result) };
      const committedRows = rows.map((candidate) => (candidate === target ? committed : candidate));
      await store(
        current,
        replaceInstall(current, installId, {
          retiredThrough: install.retiredThrough,
          rows: committedRows,
        })
      );
      return result;
    },

    async query(input) {
      const installId = installIdFromToken(input.token, input.identity);
      if (!installId) {
        throw new Error('scan token invalid');
      }
      const ledger = await compact(await load(), installId, input.scanAckThrough);
      const install = ledger.installs[installId];
      if (!install) {
        throw new Error('scan install ledger missing');
      }
      if (input.identity <= install.retiredThrough) {
        return { status: 'retired' };
      }
      const row = install.rows.find((candidate) => candidate.identity === input.identity);
      if (!row) {
        return { status: 'not_found' };
      }
      if (row.token !== input.token || row.snapshotDigest !== input.snapshotDigest) {
        throw new Error('scan identity mismatch');
      }
      return row.result ? structuredClone(row.result) : { status: 'not_found' };
    },
  };
}

export function createChromeScanLedgerStorage(): ScanLedgerStoragePort {
  return {
    async get() {
      const raw = await chrome.storage.local.get(SETTINGS_RELEASE_SCAN_LEDGER_KEY);
      return raw[SETTINGS_RELEASE_SCAN_LEDGER_KEY];
    },
    async set(value) {
      await chrome.storage.local.set({ [SETTINGS_RELEASE_SCAN_LEDGER_KEY]: value });
    },
  };
}
