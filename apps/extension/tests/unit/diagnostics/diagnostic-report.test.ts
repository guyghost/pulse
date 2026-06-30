import { describe, expect, it } from 'vitest';
import {
  buildDiagnosticFilename,
  buildDiagnosticReport,
  serializeDiagnosticReport,
} from '../../../src/lib/core/diagnostics/diagnostic-report';
import { createInitialHealthSnapshot } from '../../../src/lib/core/types/health';

const EXPORTED_AT = new Date('2026-06-30T10:00:00.000Z');
const NOW = EXPORTED_AT.getTime();

describe('buildDiagnosticReport', () => {
  it('assembles a privacy-safe diagnostic payload', () => {
    const report = buildDiagnosticReport({
      exportedAt: EXPORTED_AT,
      extensionVersion: '0.2.2',
      errorSummary: { total: 1, byType: { connector: 1 }, last24h: 1 },
      errorLog: [
        {
          type: 'connector',
          message: 'Parser returned 0 missions',
          timestamp: NOW,
          connectorId: 'lehibou',
        },
      ],
      connectorHealth: [createInitialHealthSnapshot('lehibou', NOW)],
      environment: { userAgent: 'Chrome/138', chromeVersion: '138' },
    });

    expect(report.version).toBe('1');
    expect(report.extensionVersion).toBe('0.2.2');
    expect(report.errors.recent).toHaveLength(1);
    expect(report.connectors[0]?.connectorId).toBe('lehibou');
    expect(report.environment.chromeVersion).toBe('138');
  });
});

describe('serializeDiagnosticReport', () => {
  it('produces stable JSON', () => {
    const report = buildDiagnosticReport({
      exportedAt: EXPORTED_AT,
      extensionVersion: '0.2.2',
      errorSummary: { total: 0, byType: {}, last24h: 0 },
      errorLog: [],
      connectorHealth: [],
    });

    const json = serializeDiagnosticReport(report);
    expect(json).toContain('"version": "1"');
    expect(json.endsWith('\n')).toBe(true);
  });
});

describe('buildDiagnosticFilename', () => {
  it('uses the export date', () => {
    expect(buildDiagnosticFilename(EXPORTED_AT)).toBe('missionpulse-diagnostic-2026-06-30.json');
  });
});
