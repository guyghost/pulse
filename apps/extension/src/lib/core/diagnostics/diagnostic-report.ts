import type { ConnectorHealthSnapshot } from '../types/health';

export interface DiagnosticErrorSummary {
  total: number;
  byType: Record<string, number>;
  last24h: number;
}

export interface DiagnosticErrorEntry {
  type: string;
  message: string;
  timestamp: number;
  connectorId?: string;
}

export interface DiagnosticConnectorStatus {
  connectorId: string;
  circuitState: ConnectorHealthSnapshot['circuitState'];
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
}

export interface DiagnosticEnvironment {
  userAgent?: string;
  chromeVersion?: string;
}

export interface DiagnosticReport {
  version: '1';
  exportedAt: string;
  extensionVersion: string;
  errors: {
    summary: DiagnosticErrorSummary;
    recent: DiagnosticErrorEntry[];
  };
  connectors: DiagnosticConnectorStatus[];
  environment: DiagnosticEnvironment;
}

export interface BuildDiagnosticReportInput {
  exportedAt: Date;
  extensionVersion: string;
  errorSummary: DiagnosticErrorSummary;
  errorLog: DiagnosticErrorEntry[];
  connectorHealth: readonly ConnectorHealthSnapshot[];
  environment?: DiagnosticEnvironment;
}

export function mapConnectorHealthToDiagnostic(
  snapshot: ConnectorHealthSnapshot
): DiagnosticConnectorStatus {
  return {
    connectorId: snapshot.connectorId,
    circuitState: snapshot.circuitState,
    consecutiveFailures: snapshot.consecutiveFailures,
    totalFailures: snapshot.totalFailures,
    totalSuccesses: snapshot.totalSuccesses,
    lastSuccessAt: snapshot.lastSuccessAt,
    lastFailureAt: snapshot.lastFailureAt,
  };
}

export function buildDiagnosticReport(input: BuildDiagnosticReportInput): DiagnosticReport {
  return {
    version: '1',
    exportedAt: input.exportedAt.toISOString(),
    extensionVersion: input.extensionVersion,
    errors: {
      summary: input.errorSummary,
      recent: input.errorLog.map((entry) => ({
        type: entry.type,
        message: entry.message,
        timestamp: entry.timestamp,
        ...(entry.connectorId ? { connectorId: entry.connectorId } : {}),
      })),
    },
    connectors: input.connectorHealth.map(mapConnectorHealthToDiagnostic),
    environment: input.environment ?? {},
  };
}

export function serializeDiagnosticReport(report: DiagnosticReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function buildDiagnosticFilename(exportedAt: Date): string {
  const dateKey = exportedAt.toISOString().split('T')[0] ?? 'export';
  return `missionpulse-diagnostic-${dateKey}.json`;
}
