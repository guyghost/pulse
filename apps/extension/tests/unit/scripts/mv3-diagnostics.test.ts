import { describe, expect, it } from 'vitest';

import {
  assertNoRuntimeDiagnostics,
  createRuntimeDiagnostics,
  recordConsoleDiagnostic,
  recordPageError,
  recordWorkerException,
  snapshotRuntimeDiagnostics,
} from '../../mv3/diagnostics';

describe('packaged MV3 runtime diagnostic policy', () => {
  it('blocks uncaught page errors and page console errors', () => {
    const diagnostics = createRuntimeDiagnostics();
    recordPageError(diagnostics, 'page exploded');
    recordConsoleDiagnostic(diagnostics, 'page', 'error', 'console exploded');

    expect(() => assertNoRuntimeDiagnostics(diagnostics)).toThrowError(
      /page exploded[\s\S]*console exploded/
    );
  });

  it('blocks product failure warnings but ignores an informational warning', () => {
    const diagnostics = createRuntimeDiagnostics();
    recordConsoleDiagnostic(
      diagnostics,
      'service_worker',
      'warning',
      '[MissionPulse] Cold-start migration guard failed: corrupt journal'
    );
    recordConsoleDiagnostic(
      diagnostics,
      'service_worker',
      'warning',
      'optional feature unavailable'
    );
    recordConsoleDiagnostic(
      diagnostics,
      'page',
      'warning',
      'Unable to create a text session because the service is not running.'
    );

    expect(diagnostics.serviceWorkerConsoleFailures).toEqual([
      '[MissionPulse] Cold-start migration guard failed: corrupt journal',
    ]);
    expect(diagnostics.pageConsoleFailures).toEqual([]);
    expect(() => assertNoRuntimeDiagnostics(diagnostics)).toThrowError(/migration guard failed/);
  });

  it('blocks worker exceptions and unhandled promise rejections', () => {
    const diagnostics = createRuntimeDiagnostics();
    recordWorkerException(diagnostics, 'Uncaught Error: bootstrap failed');
    recordWorkerException(diagnostics, 'Uncaught (in promise) Error: settings rejected');

    expect(() => assertNoRuntimeDiagnostics(diagnostics)).toThrowError(
      /bootstrap failed[\s\S]*settings rejected/
    );
  });

  it('accepts a clean diagnostic record', () => {
    const diagnostics = createRuntimeDiagnostics();
    recordConsoleDiagnostic(diagnostics, 'service_worker', 'log', 'worker started');

    expect(() => assertNoRuntimeDiagnostics(diagnostics)).not.toThrow();
  });

  it('exposes a frozen snapshot that cannot mutate the fixture-owned record', () => {
    const diagnostics = createRuntimeDiagnostics();
    recordPageError(diagnostics, 'first');

    const snapshot = snapshotRuntimeDiagnostics(diagnostics);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.pageErrors)).toBe(true);
    expect(() => (snapshot.pageErrors as string[]).push('opt-out')).toThrow();

    recordPageError(diagnostics, 'second');
    expect(snapshot.pageErrors).toEqual(['first']);
    expect(snapshotRuntimeDiagnostics(diagnostics).pageErrors).toEqual(['first', 'second']);
  });
});
