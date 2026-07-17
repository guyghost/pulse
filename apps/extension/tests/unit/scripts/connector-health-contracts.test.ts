import { describe, expect, it } from 'vitest';

import {
  MAX_STREAM_BYTES,
  buildConnectorHealthEvidence,
  canonicalizeJson,
  sha256Hex,
  validateConnectorHealthEvidenceBytes,
  type ConnectorHealthReportV1,
} from '../../../scripts/connector-health/contracts';
import { CONNECTOR_HEALTH_REGISTRY } from '../../health/connector-registry';

const CAPTURED_AT = '2026-07-16T08:00:00.000Z';

function validReport(): ConnectorHealthReportV1 {
  return {
    schema: 'missionpulse.connector-health-report',
    version: 1,
    generatedAt: CAPTURED_AT,
    status: 'pass',
    connectors: [...CONNECTOR_HEALTH_REGISTRY]
      .sort(({ id: left }, { id: right }) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      .map(({ id, name }) => ({
        connectorId: id,
        name,
        status: 'pass' as const,
        checks: [
          {
            id: 'unit-tests' as const,
            status: 'pass' as const,
            code: 'unit_tests_passed' as const,
            detail: null,
          },
          {
            id: 'regression-fixtures' as const,
            status: 'pass' as const,
            code: 'regression_fixtures_present' as const,
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

function source() {
  return {
    repository: 'guyghost/pulse',
    sourceCommit: 'a'.repeat(40),
    eventKind: 'schedule' as const,
    ref: 'refs/heads/main',
    runId: '123456789',
    runAttempt: 1,
  };
}

function child(stdout: Uint8Array, overrides: Record<string, unknown> = {}) {
  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdout: { prefix: stdout, truncated: false },
    stderr: { prefix: new Uint8Array(), truncated: false },
    ...overrides,
  };
}

describe('connector-health strict evidence contract', () => {
  it('writes exact JCS bytes with self, stream and report digests that revalidate', () => {
    const reportBytes = Buffer.from(JSON.stringify(validReport()), 'utf8');
    const built = buildConnectorHealthEvidence({
      capturedAt: CAPTURED_AT,
      source: source(),
      child: child(reportBytes),
    });

    expect(built.evidence.disposition).toBe('passed');
    expect(built.evidence.failureCodes).toEqual([]);
    expect(built.evidence.failureFingerprint).toBeNull();
    expect(built.evidence.report).toEqual(validReport());
    expect(built.evidence.reportObservation).toEqual({
      parseStatus: 'valid',
      reportBytes: reportBytes.byteLength,
      reportSha256: sha256Hex(reportBytes),
    });
    expect(built.evidence.child.stdoutSha256).toBe(sha256Hex(reportBytes));
    expect(built.evidence.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(built.bytes).toString('utf8')).toBe(canonicalizeJson(built.evidence));
    expect(validateConnectorHealthEvidenceBytes(built.bytes)).toEqual(built.evidence);
  });

  it('turns a duplicate JSON key into trusted failed evidence instead of throwing', () => {
    const report = JSON.stringify(validReport());
    const duplicate = Buffer.from(report.replace('"version":1', '"version":1,"version":1'));
    const built = buildConnectorHealthEvidence({
      capturedAt: CAPTURED_AT,
      source: source(),
      child: child(duplicate),
    });

    expect(built.evidence.report).toBeNull();
    expect(built.evidence.reportObservation).toEqual({
      parseStatus: 'duplicate_json_key',
      reportBytes: duplicate.byteLength,
      reportSha256: sha256Hex(duplicate),
    });
    expect(built.evidence.failureCodes).toContain('report_duplicate_json_key');
    expect(built.evidence.disposition).toBe('failed');
    expect(() => validateConnectorHealthEvidenceBytes(built.bytes)).not.toThrow();
  });

  it('hashes and counts only the retained prefix when stdout overflowed', () => {
    const prefix = Buffer.alloc(MAX_STREAM_BYTES, 0x61);
    const built = buildConnectorHealthEvidence({
      capturedAt: CAPTURED_AT,
      source: source(),
      child: child(prefix, {
        exitCode: null,
        signal: 'SIGKILL',
        stdout: { prefix, truncated: true },
      }),
    });

    expect(built.evidence.child.stdoutBytes).toBe(MAX_STREAM_BYTES);
    expect(built.evidence.child.stdoutSha256).toBe(sha256Hex(prefix));
    expect(built.evidence.reportObservation).toEqual({
      parseStatus: 'oversized',
      reportBytes: MAX_STREAM_BYTES,
      reportSha256: sha256Hex(prefix),
    });
    expect(built.evidence.failureCodes).toEqual(
      expect.arrayContaining(['child_signalled', 'stdout_overflow', 'report_oversized'])
    );
    expect(validateConnectorHealthEvidenceBytes(built.bytes).child.stdoutBytes).toBe(
      MAX_STREAM_BYTES
    );
  });

  it('rejects a recomputed envelope whose report byte equality is false', () => {
    const reportBytes = Buffer.from(JSON.stringify(validReport()), 'utf8');
    const built = buildConnectorHealthEvidence({
      capturedAt: CAPTURED_AT,
      source: source(),
      child: child(reportBytes),
    });
    const hostile = {
      ...built.evidence,
      reportObservation: {
        ...built.evidence.reportObservation,
        reportBytes: reportBytes.byteLength - 1,
      },
    };
    const withoutDigest = { ...hostile, evidenceSha256: undefined };
    delete withoutDigest.evidenceSha256;
    const evidenceSha256 = sha256Hex(Buffer.from(canonicalizeJson(withoutDigest)));
    const bytes = Buffer.from(canonicalizeJson({ ...hostile, evidenceSha256 }));

    expect(() => validateConnectorHealthEvidenceBytes(bytes)).toThrow(/reportBytes/i);
  });

  it('rejects a recomputed missing observation that contains nonempty stdout', () => {
    const built = buildConnectorHealthEvidence({
      capturedAt: CAPTURED_AT,
      source: source(),
      child: child(new Uint8Array(), { exitCode: 1 }),
    });
    const stdoutSha256 = sha256Hex(Buffer.from('x'));
    const hostile = {
      ...built.evidence,
      child: { ...built.evidence.child, stdoutBytes: 1, stdoutSha256 },
      reportObservation: {
        parseStatus: 'missing' as const,
        reportBytes: 1,
        reportSha256: stdoutSha256,
      },
    };
    const withoutDigest = { ...hostile, evidenceSha256: undefined };
    delete withoutDigest.evidenceSha256;
    const evidenceSha256 = sha256Hex(Buffer.from(canonicalizeJson(withoutDigest)));
    const bytes = Buffer.from(canonicalizeJson({ ...hostile, evidenceSha256 }));

    expect(() => validateConnectorHealthEvidenceBytes(bytes)).toThrow(/missing.*zero/i);
  });
});
