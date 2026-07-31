import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type HealthChildProcess } from '../../../scripts/connector-health/capture';
import {
  sha256Hex,
  validateConnectorHealthEvidenceBytes,
  type ConnectorHealthReportV1,
} from '../../../scripts/connector-health/contracts';
import { runConnectorHealthCapture } from '../../../scripts/connector-health/orchestrator';
import { CONNECTOR_HEALTH_REGISTRY } from '../../health/connector-registry';

class FakeChild extends EventEmitter implements HealthChildProcess {
  pid = 4242;
  stdout = new PassThrough();
  stderr = new PassThrough();
}

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

function passingReport(): ConnectorHealthReportV1 {
  return {
    schema: 'missionpulse.connector-health-report',
    version: 1,
    generatedAt: '2026-07-16T08:00:00.000Z',
    status: 'pass',
    connectors: [...CONNECTOR_HEALTH_REGISTRY]
      .sort(({ id: left }, { id: right }) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      .map(({ id, name }) => ({
        connectorId: id,
        name,
        status: 'pass',
        checks: [
          { id: 'unit-tests', status: 'pass', code: 'unit_tests_passed', detail: null },
          {
            id: 'regression-fixtures',
            status: 'pass',
            code: 'regression_fixtures_present',
            detail: '1',
          },
        ],
      })),
    regression: {
      id: 'parser-regression',
      status: 'pass',
      code: 'parser_regression_passed',
      detail: null,
    },
  };
}

describe('connector-health capture orchestrator', () => {
  it('persists and rereads one exact evidence file from one child invocation', async () => {
    const extensionRoot = await mkdtemp(join(tmpdir(), 'connector-health-orchestrator-'));
    roots.push(extensionRoot);
    const home = join(extensionRoot, 'home');
    const outputPath = join(
      extensionRoot,
      'output/connector-health/connector-health-evidence.v1.json'
    );
    const snapshotPath = join(
      extensionRoot,
      'output/connector-health/connector-health-capture.snapshot.json'
    );
    const child = new FakeChild();
    const spawnProcess = vi.fn(() => child);
    const signalProcess = vi.fn((pid: number, signal: NodeJS.Signals | 0) => {
      expect(pid).toBe(-4242);
      if (signal === 0) {
        const error = new Error('empty') as NodeJS.ErrnoException;
        error.code = 'ESRCH';
        throw error;
      }
      return true;
    });
    const capture = runConnectorHealthCapture({
      extensionRoot,
      nodeExecutable: process.execPath,
      home,
      outputPath,
      snapshotPath,
      capturedAt: '2026-07-16T08:00:01.000Z',
      source: {
        repository: 'guyghost/pulse',
        sourceCommit: 'a'.repeat(40),
        eventKind: 'schedule',
        ref: 'refs/heads/main',
        runId: '123',
        runAttempt: 1,
      },
      spawnProcess,
      signalProcess,
      timeoutMs: 1_000,
    });

    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(1));
    child.stdout.end(JSON.stringify(passingReport()));
    child.stderr.end();
    child.emit('close', 0, null);

    const result = await capture;
    const persisted = await readFile(outputPath);
    const persistedSnapshot = await readFile(snapshotPath);
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(result.disposition).toBe('passed');
    expect(result.failureFingerprint).toBeNull();
    expect(result.evidenceFileSha256).toBe(sha256Hex(persisted));
    expect(result.captureSnapshotSha256).toBe(sha256Hex(persistedSnapshot));
    expect(JSON.parse(persistedSnapshot.toString('utf8'))).toMatchObject({
      schema: 'missionpulse.connector-health-capture-snapshot',
      version: 1,
      snapshot: {
        status: 'active',
        value: 'evidence_validated',
        context: {
          evidence: {
            disposition: 'passed',
            failureFingerprint: null,
            evidenceFileSha256: result.evidenceFileSha256,
          },
        },
      },
    });
    expect(validateConnectorHealthEvidenceBytes(persisted)).toEqual(result.evidence);
  });
});
