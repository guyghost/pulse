import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';

import {
  connectorHealthCaptureMachine,
  connectorHealthConclusionMachine,
  connectorHealthIssueMachine,
  provideConnectorHealthCaptureEffects,
  provideConnectorHealthIssueEffects,
  decodeConnectorHealthCaptureEvent,
  deriveConnectorHealthConclusionEvent,
  sendConnectorHealthEvent,
  type ConnectorHealthCaptureEvent,
  type ConnectorHealthConclusionInput,
} from '../../../scripts/connector-health/workflow-machine';

const sha = 'a'.repeat(64);

function waitForActor(
  actor: {
    getSnapshot: () => { status: string; value: unknown };
    subscribe: (listener: (snapshot: { status: string; value: unknown }) => void) => {
      unsubscribe: () => void;
    };
  },
  predicate: (snapshot: { status: string; value: unknown }) => boolean
): Promise<void> {
  if (predicate(actor.getSnapshot())) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const subscription = actor.subscribe((snapshot) => {
      if (predicate(snapshot)) {
        subscription.unsubscribe();
        resolve();
      }
    });
  });
}

function event(type: ConnectorHealthCaptureEvent['type']): ConnectorHealthCaptureEvent {
  if (type === 'EVIDENCE_PERSISTED' || type === 'EVIDENCE_ACCEPTED') {
    return {
      type,
      disposition: 'passed',
      failureFingerprint: null,
      evidenceFileSha256: sha,
    };
  }
  if (type === 'UPLOAD_CONFIRMED') {
    return {
      type,
      artifactId: '123',
      artifactArchiveSha256: sha,
    };
  }
  return { type } as ConnectorHealthCaptureEvent;
}

describe('connector-health executable XState authority', () => {
  it('declares invoked actors on every capture effect-owning state', () => {
    const states = connectorHealthCaptureMachine.config.states ?? {};
    for (const state of [
      'source_binding',
      'tooling_preparing',
      'check_running',
      'evidence_persisting',
      'capture_completed',
      'evidence_uploading',
    ]) {
      expect(states[state]?.invoke, state).toBeDefined();
    }
  });

  it('lets invoked actors drive capture after only trigger and upload admission', async () => {
    const calls: string[] = [];
    const identity = {
      disposition: 'passed' as const,
      failureFingerprint: null,
      evidenceFileSha256: sha,
    };
    const logic = provideConnectorHealthCaptureEffects({
      bindSource: vi.fn(async () => {
        calls.push('source');
      }),
      prepareToolchain: vi.fn(async () => {
        calls.push('toolchain');
      }),
      runHealthCheck: vi.fn(async () => {
        calls.push('health');
      }),
      persistEvidence: vi.fn(async () => {
        calls.push('persist');
        return identity;
      }),
      validateEvidence: vi.fn(async (observed) => {
        calls.push('validate');
        expect(observed).toEqual(identity);
        return observed;
      }),
      confirmArtifactUpload: vi.fn(async (observed) => {
        calls.push('upload');
        expect(observed).toEqual(identity);
        return { artifactId: '123', artifactArchiveSha256: sha };
      }),
    });
    const actor = createActor(logic).start();

    expect(sendConnectorHealthEvent(actor, { type: 'TRIGGER_ACCEPTED' })).toBe(true);
    await waitForActor(actor, (snapshot) => snapshot.value === 'evidence_validated');
    expect(calls).toEqual(['source', 'toolchain', 'health', 'persist', 'validate']);

    expect(sendConnectorHealthEvent(actor, { type: 'UPLOAD_START' })).toBe(true);
    await waitForActor(actor, (snapshot) => snapshot.status === 'done');

    expect(calls).toEqual(['source', 'toolchain', 'health', 'persist', 'validate', 'upload']);
    expect(actor.getSnapshot().output).toMatchObject({
      captureTerminal: 'capture_passed',
      evidenceFileSha256: sha,
      artifactId: '123',
    });
  });

  it('restores the evidence-validated XState snapshot without replaying prior effects', async () => {
    const identity = {
      disposition: 'failed' as const,
      failureFingerprint: sha,
      evidenceFileSha256: sha,
    };
    const priorEffect = vi.fn(async () => undefined);
    const firstLogic = provideConnectorHealthCaptureEffects({
      bindSource: priorEffect,
      prepareToolchain: priorEffect,
      runHealthCheck: priorEffect,
      persistEvidence: async () => identity,
      validateEvidence: async () => identity,
      confirmArtifactUpload: async () => {
        throw new Error('not reached before restore');
      },
    });
    const firstActor = createActor(firstLogic).start();
    expect(sendConnectorHealthEvent(firstActor, { type: 'TRIGGER_ACCEPTED' })).toBe(true);
    await waitForActor(firstActor, (snapshot) => snapshot.value === 'evidence_validated');
    const persistedSnapshot = firstActor.getPersistedSnapshot();
    firstActor.stop();

    const replayed = vi.fn(async () => {
      throw new Error('prior effect replayed');
    });
    const confirmArtifactUpload = vi.fn(async () => ({
      artifactId: '456',
      artifactArchiveSha256: sha,
    }));
    const restoredLogic = provideConnectorHealthCaptureEffects({
      bindSource: replayed,
      prepareToolchain: replayed,
      runHealthCheck: replayed,
      persistEvidence: async () => {
        throw new Error('persistence replayed');
      },
      validateEvidence: async () => {
        throw new Error('validation replayed');
      },
      confirmArtifactUpload,
    });
    const restoredActor = createActor(restoredLogic, { snapshot: persistedSnapshot }).start();

    expect(restoredActor.getSnapshot().value).toBe('evidence_validated');
    expect(sendConnectorHealthEvent(restoredActor, { type: 'UPLOAD_START' })).toBe(true);
    await waitForActor(restoredActor, (snapshot) => snapshot.status === 'done');

    expect(replayed).not.toHaveBeenCalled();
    expect(confirmArtifactUpload).toHaveBeenCalledTimes(1);
    expect(restoredActor.getSnapshot().output).toMatchObject({
      captureTerminal: 'capture_failed',
      issueAdmission: 'admitted',
      artifactId: '456',
    });
  });

  it('aborts an invoked health effect and discards its late completion on protocol rejection', async () => {
    let resolveHealth!: () => void;
    let observedSignal: AbortSignal | undefined;
    const persistEvidence = vi.fn(async () => ({
      disposition: 'passed' as const,
      failureFingerprint: null,
      evidenceFileSha256: sha,
    }));
    const logic = provideConnectorHealthCaptureEffects({
      bindSource: async () => undefined,
      prepareToolchain: async () => undefined,
      runHealthCheck: (signal) => {
        observedSignal = signal;
        return new Promise<void>((resolve) => {
          resolveHealth = resolve;
        });
      },
      persistEvidence,
      validateEvidence: async (identity) => identity,
      confirmArtifactUpload: async () => ({ artifactId: '123', artifactArchiveSha256: sha }),
    });
    const actor = createActor(logic).start();
    expect(sendConnectorHealthEvent(actor, { type: 'TRIGGER_ACCEPTED' })).toBe(true);
    await waitForActor(actor, (snapshot) => snapshot.value === 'check_running');

    expect(sendConnectorHealthEvent(actor, { type: 'PROTOCOL_REJECTED' })).toBe(true);
    expect(actor.getSnapshot()).toMatchObject({
      status: 'done',
      value: 'capture_infrastructure_failed',
    });
    expect(observedSignal?.aborted).toBe(true);

    resolveHealth();
    await Promise.resolve();
    expect(persistEvidence).not.toHaveBeenCalled();
  });

  it('owns the capture protocol and emits the exact passed terminal output', () => {
    const actor = createActor(connectorHealthCaptureMachine).start();
    for (const type of [
      'TRIGGER_ACCEPTED',
      'SOURCE_BOUND',
      'TOOLCHAIN_PREPARE',
      'TOOLCHAIN_READY',
      'CHECK_START',
      'CHECK_CLOSED',
      'CAPTURE_FINALIZE',
      'EVIDENCE_PERSISTED',
      'EVIDENCE_ACCEPTED',
      'UPLOAD_START',
      'UPLOAD_CONFIRMED',
      'PASS_CLASSIFIED',
    ] as const) {
      expect(sendConnectorHealthEvent(actor, event(type))).toBe(true);
    }

    expect(actor.getSnapshot()).toMatchObject({ status: 'done', value: 'capture_passed' });
    expect(actor.getSnapshot().output).toEqual({
      captureTerminal: 'capture_passed',
      issueAdmission: 'denied',
      disposition: 'passed',
      failureFingerprint: null,
      evidenceFileSha256: sha,
      artifactId: '123',
      artifactArchiveSha256: sha,
    });
  });

  it('rejects malformed and wrong-state events through PROTOCOL_REJECTED', () => {
    expect(
      decodeConnectorHealthCaptureEvent({ type: 'TRIGGER_ACCEPTED', unexpected: true })
    ).toBeNull();

    const malformed = createActor(connectorHealthCaptureMachine).start();
    expect(
      sendConnectorHealthEvent(malformed, { type: 'TRIGGER_ACCEPTED', unexpected: true })
    ).toBe(false);
    expect(malformed.getSnapshot()).toMatchObject({
      status: 'done',
      value: 'capture_infrastructure_failed',
    });

    const wrongState = createActor(connectorHealthCaptureMachine).start();
    expect(sendConnectorHealthEvent(wrongState, { type: 'CHECK_START' })).toBe(false);
    expect(wrongState.getSnapshot()).toMatchObject({
      status: 'done',
      value: 'capture_infrastructure_failed',
    });
  });

  it('owns issue admission and the duplicate/create settlement finals', () => {
    const actor = createActor(connectorHealthIssueMachine).start();
    for (const type of [
      'ISSUE_JOB_ADMITTED',
      'DOWNLOAD_START',
      'DOWNLOADED_EVIDENCE_VERIFIED',
      'LABEL_QUERY_START',
      'LABELS_VERIFIED',
      'DUPLICATE_QUERY_START',
      'QUERY_EXHAUSTED_WITH_MATCH',
      'ISSUE_SETTLED',
    ] as const) {
      expect(sendConnectorHealthEvent(actor, { type })).toBe(true);
    }
    expect(actor.getSnapshot()).toMatchObject({ status: 'done', value: 'issue_settled' });
    expect(actor.getSnapshot().output).toEqual({ issueTerminal: 'issue_settled' });
  });

  it('runs the issue controller as one invoked actor after admission', async () => {
    const reported: string[] = [];
    const logic = provideConnectorHealthIssueEffects({
      settle: async (report) => {
        for (const type of [
          'DOWNLOAD_START',
          'DOWNLOADED_EVIDENCE_VERIFIED',
          'LABEL_QUERY_START',
          'LABELS_VERIFIED',
          'DUPLICATE_QUERY_START',
          'QUERY_EXHAUSTED_WITH_MATCH',
          'ISSUE_SETTLED',
        ] as const) {
          reported.push(type);
          report({ type });
        }
      },
    });
    expect(logic.config.invoke).toBeDefined();
    const actor = createActor(logic).start();

    expect(sendConnectorHealthEvent(actor, { type: 'ISSUE_JOB_ADMITTED' })).toBe(true);
    await waitForActor(actor, (snapshot) => snapshot.status === 'done');

    expect(reported).toEqual([
      'DOWNLOAD_START',
      'DOWNLOADED_EVIDENCE_VERIFIED',
      'LABEL_QUERY_START',
      'LABELS_VERIFIED',
      'DUPLICATE_QUERY_START',
      'QUERY_EXHAUSTED_WITH_MATCH',
      'ISSUE_SETTLED',
    ]);
    expect(actor.getSnapshot().output).toEqual({ issueTerminal: 'issue_settled' });
  });

  it('aborts the invoked issue controller on protocol rejection', async () => {
    let observedSignal: AbortSignal | undefined;
    const logic = provideConnectorHealthIssueEffects({
      settle: async (report, signal) => {
        observedSignal = signal;
        report({ type: 'DOWNLOAD_START' });
        await new Promise<void>(() => undefined);
      },
    });
    const actor = createActor(logic).start();
    expect(sendConnectorHealthEvent(actor, { type: 'ISSUE_JOB_ADMITTED' })).toBe(true);
    await waitForActor(actor, (snapshot) => snapshot.value === 'evidence_downloading');

    expect(sendConnectorHealthEvent(actor, { type: 'PROTOCOL_REJECTED' })).toBe(true);
    expect(actor.getSnapshot()).toMatchObject({ status: 'done', value: 'issue_failed' });
    expect(observedSignal?.aborted).toBe(true);
  });

  it('has exactly three post-start conclusion finals and maps the full strict tuple', () => {
    const cases: Array<{
      input: ConnectorHealthConclusionInput;
      event: string;
      terminal: string;
      exitCode: 0 | 1;
    }> = [
      {
        input: {
          captureResult: 'success',
          captureTerminal: 'capture_passed',
          issueResult: 'skipped',
          issueTerminal: null,
        },
        event: 'CONCLUDE_PASS',
        terminal: 'passed',
        exitCode: 0,
      },
      {
        input: {
          captureResult: 'success',
          captureTerminal: 'capture_failed',
          issueResult: 'success',
          issueTerminal: 'issue_settled',
        },
        event: 'CONCLUDE_RECORDED_FAILURE',
        terminal: 'failed_recorded',
        exitCode: 1,
      },
      {
        input: {
          captureResult: 'failure',
          captureTerminal: null,
          issueResult: 'skipped',
          issueTerminal: null,
        },
        event: 'CONCLUDE_UNREPORTED_FAILURE',
        terminal: 'failed_unreported',
        exitCode: 1,
      },
    ];

    for (const testCase of cases) {
      const actor = createActor(connectorHealthConclusionMachine, {
        input: testCase.input,
      }).start();
      const conclusionEvent = deriveConnectorHealthConclusionEvent(testCase.input);
      expect(conclusionEvent.type).toBe(testCase.event);
      expect(sendConnectorHealthEvent(actor, conclusionEvent)).toBe(true);
      expect(actor.getSnapshot()).toMatchObject({ status: 'done', value: testCase.terminal });
      expect(actor.getSnapshot().output).toEqual({
        conclusionTerminal: testCase.terminal,
        exitCode: testCase.exitCode,
      });
    }

    expect(Object.keys(connectorHealthConclusionMachine.config.states ?? {}).sort()).toEqual([
      'conclusion_pending',
      'failed_recorded',
      'failed_unreported',
      'passed',
    ]);
  });
});
