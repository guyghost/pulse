export interface RuntimeDiagnostics {
  readonly pageErrors: string[];
  readonly pageConsoleFailures: string[];
  readonly serviceWorkerConsoleFailures: string[];
  readonly serviceWorkerExceptions: string[];
}

export interface RuntimeDiagnosticsSnapshot {
  readonly pageErrors: readonly string[];
  readonly pageConsoleFailures: readonly string[];
  readonly serviceWorkerConsoleFailures: readonly string[];
  readonly serviceWorkerExceptions: readonly string[];
}

export type DiagnosticScope = 'page' | 'service_worker';

const FAILURE_WARNING =
  /\b(error|exception|failed|failure|fatal|invalid|corrupt|blocked|rejected|reject|unexpected|unable|impossible|échec)\b/i;
const NON_BLOCKING_OPTIONAL_WARNINGS = [
  /^Unable to create a text session because the service is not running\.(?: \(|$)/i,
] as const;

function pushUnique(target: string[], message: string): void {
  if (!target.includes(message)) {
    target.push(message);
  }
}

export function createRuntimeDiagnostics(): RuntimeDiagnostics {
  return {
    pageErrors: [],
    pageConsoleFailures: [],
    serviceWorkerConsoleFailures: [],
    serviceWorkerExceptions: [],
  };
}

export function snapshotRuntimeDiagnostics(
  diagnostics: RuntimeDiagnostics
): RuntimeDiagnosticsSnapshot {
  return Object.freeze({
    pageErrors: Object.freeze([...diagnostics.pageErrors]),
    pageConsoleFailures: Object.freeze([...diagnostics.pageConsoleFailures]),
    serviceWorkerConsoleFailures: Object.freeze([...diagnostics.serviceWorkerConsoleFailures]),
    serviceWorkerExceptions: Object.freeze([...diagnostics.serviceWorkerExceptions]),
  });
}

export function recordPageError(diagnostics: RuntimeDiagnostics, message: string): void {
  pushUnique(diagnostics.pageErrors, message);
}

export function recordConsoleDiagnostic(
  diagnostics: RuntimeDiagnostics,
  scope: DiagnosticScope,
  level: string,
  message: string
): void {
  const normalizedLevel = level.toLowerCase();
  const isKnownOptionalWarning = NON_BLOCKING_OPTIONAL_WARNINGS.some((pattern) =>
    pattern.test(message)
  );
  const blocking =
    normalizedLevel === 'error' ||
    ((normalizedLevel === 'warning' || normalizedLevel === 'warn') &&
      !isKnownOptionalWarning &&
      FAILURE_WARNING.test(message));
  if (!blocking) {
    return;
  }
  pushUnique(
    scope === 'page' ? diagnostics.pageConsoleFailures : diagnostics.serviceWorkerConsoleFailures,
    message
  );
}

export function recordWorkerException(diagnostics: RuntimeDiagnostics, message: string): void {
  pushUnique(diagnostics.serviceWorkerExceptions, message);
}

export function assertNoRuntimeDiagnostics(diagnostics: RuntimeDiagnosticsSnapshot): void {
  const failures = [
    ...diagnostics.pageErrors.map((message) => `pageerror: ${message}`),
    ...diagnostics.pageConsoleFailures.map((message) => `page console: ${message}`),
    ...diagnostics.serviceWorkerConsoleFailures.map(
      (message) => `service worker console: ${message}`
    ),
    ...diagnostics.serviceWorkerExceptions.map((message) => `service worker exception: ${message}`),
  ];
  if (failures.length > 0) {
    throw new Error(`Packaged MV3 runtime diagnostics failed:\n${failures.join('\n')}`);
  }
}
