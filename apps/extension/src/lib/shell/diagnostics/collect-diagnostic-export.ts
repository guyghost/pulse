import {
  buildDiagnosticReport,
  type DiagnosticReport,
} from '$lib/core/diagnostics/diagnostic-report';
import { getConnectorIds } from '$lib/shell/connectors';
import { getErrorLog, getErrorSummary } from '$lib/shell/errors/error-analytics';
import { getAllHealthSnapshots } from '$lib/shell/storage/connector-health';

const EXTENSION_VERSION = '0.2.2';

function readChromeVersion(userAgent: string): string | undefined {
  const match = userAgent.match(/Chrome\/(\d+)/);
  return match?.[1];
}

export async function collectDiagnosticExport(exportedAt: Date): Promise<DiagnosticReport> {
  const [errorLog, healthMap] = await Promise.all([
    getErrorLog(),
    getAllHealthSnapshots(getConnectorIds(), exportedAt.getTime()),
  ]);
  const connectorHealth = [...healthMap.values()];

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;

  return buildDiagnosticReport({
    exportedAt,
    extensionVersion: EXTENSION_VERSION,
    errorSummary: getErrorSummary(),
    errorLog,
    connectorHealth,
    environment: {
      userAgent,
      chromeVersion: userAgent ? readChromeVersion(userAgent) : undefined,
    },
  });
}
