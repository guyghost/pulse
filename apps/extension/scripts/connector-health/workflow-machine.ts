import { assign, fromCallback, sendTo, setup, type ActorRefFrom, type EventObject } from 'xstate';

export type CaptureTerminal = 'capture_passed' | 'capture_failed' | 'capture_infrastructure_failed';
export type IssueTerminal = 'issue_settled' | 'issue_failed';
export type ConclusionTerminal = 'passed' | 'failed_recorded' | 'failed_unreported';

type HealthDisposition = 'passed' | 'failed';

export interface EvidenceIdentity {
  disposition: HealthDisposition;
  failureFingerprint: string | null;
  evidenceFileSha256: string;
}

export interface ArtifactIdentity {
  artifactId: string;
  artifactArchiveSha256: string;
}

interface CaptureContext {
  evidence: EvidenceIdentity | null;
  artifact: ArtifactIdentity | null;
  terminal: CaptureTerminal | null;
}

export interface ConnectorHealthCaptureEffects {
  bindSource(signal: AbortSignal): Promise<void>;
  prepareToolchain(signal: AbortSignal): Promise<void>;
  runHealthCheck(signal: AbortSignal): Promise<void>;
  persistEvidence(signal: AbortSignal): Promise<EvidenceIdentity>;
  validateEvidence(
    identity: Readonly<EvidenceIdentity>,
    signal: AbortSignal
  ): Promise<EvidenceIdentity>;
  confirmArtifactUpload(
    identity: Readonly<EvidenceIdentity>,
    signal: AbortSignal
  ): Promise<ArtifactIdentity>;
}

export interface CaptureOutput {
  captureTerminal: CaptureTerminal;
  issueAdmission: 'admitted' | 'denied';
  disposition: HealthDisposition | null;
  failureFingerprint: string | null;
  evidenceFileSha256: string | null;
  artifactId: string | null;
  artifactArchiveSha256: string | null;
}

type SimpleCaptureEvent = {
  type:
    | 'TRIGGER_ACCEPTED'
    | 'SOURCE_BOUND'
    | 'TOOLCHAIN_PREPARE'
    | 'TOOLCHAIN_READY'
    | 'CHECK_START'
    | 'CHECK_CLOSED'
    | 'CHECK_INFRASTRUCTURE_FAILED'
    | 'CHECK_HEALTH_FAILED'
    | 'CAPTURE_FINALIZE'
    | 'UPLOAD_START'
    | 'PASS_CLASSIFIED'
    | 'FAILURE_CLASSIFIED'
    | 'SOURCE_REJECTED'
    | 'TOOLCHAIN_FAILED'
    | 'EVIDENCE_REJECTED'
    | 'UPLOAD_FAILED'
    | 'COOPERATIVE_CANCEL_REQUESTED'
    | 'PROTOCOL_REJECTED';
};

export type ConnectorHealthCaptureEvent =
  | SimpleCaptureEvent
  | ({ type: 'EVIDENCE_PERSISTED' | 'EVIDENCE_ACCEPTED' } & EvidenceIdentity)
  | ({ type: 'UPLOAD_CONFIRMED' } & ArtifactIdentity);

export type ConnectorHealthIssueEvent = {
  type:
    | 'ISSUE_JOB_ADMITTED'
    | 'DOWNLOAD_START'
    | 'DOWNLOADED_EVIDENCE_VERIFIED'
    | 'LABEL_QUERY_START'
    | 'LABELS_VERIFIED'
    | 'DUPLICATE_QUERY_START'
    | 'PAGE_WITHOUT_MATCH_AND_NEXT'
    | 'QUERY_EXHAUSTED_WITH_MATCH'
    | 'QUERY_EXHAUSTED_WITHOUT_MATCH'
    | 'ISSUE_SETTLED'
    | 'CREATE_REQUESTED'
    | 'CREATE_CONFIRMED'
    | 'CREATE_RESULT_AMBIGUOUS'
    | 'RECONCILIATION_RETRY'
    | 'RECONCILIATION_MATCH_FOUND'
    | 'RECONCILIATION_UNRESOLVED'
    | 'ADMISSION_REJECTED'
    | 'EVIDENCE_REJECTED'
    | 'READ_RETRY_ALLOWED'
    | 'READ_FAILED'
    | 'CREATE_REJECTED'
    | 'PERMISSION_DENIED'
    | 'COOPERATIVE_CANCEL_REQUESTED'
    | 'PROTOCOL_REJECTED';
};

export interface ConnectorHealthIssueEffects {
  settle(report: (event: ConnectorHealthIssueEvent) => void, signal: AbortSignal): Promise<void>;
}

export interface ConnectorHealthConclusionInput {
  captureResult: 'success' | 'failure' | 'cancelled' | 'skipped';
  captureTerminal: CaptureTerminal | null;
  issueResult: 'success' | 'failure' | 'cancelled' | 'skipped';
  issueTerminal: IssueTerminal | null;
}

export type ConnectorHealthConclusionEvent = {
  type:
    | 'CONCLUDE_PASS'
    | 'CONCLUDE_RECORDED_FAILURE'
    | 'CONCLUDE_UNREPORTED_FAILURE'
    | 'PROTOCOL_REJECTED';
};

interface ConclusionOutput {
  conclusionTerminal: ConclusionTerminal;
  exitCode: 0 | 1;
}

interface ConclusionContext extends ConnectorHealthConclusionInput {
  terminal: ConclusionTerminal | null;
}

const sha256Pattern = /^[0-9a-f]{64}$/;
const artifactIdPattern = /^[1-9]\d{0,31}$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

const captureSimpleTypes = new Set<SimpleCaptureEvent['type']>([
  'TRIGGER_ACCEPTED',
  'SOURCE_BOUND',
  'TOOLCHAIN_PREPARE',
  'TOOLCHAIN_READY',
  'CHECK_START',
  'CHECK_CLOSED',
  'CHECK_INFRASTRUCTURE_FAILED',
  'CHECK_HEALTH_FAILED',
  'CAPTURE_FINALIZE',
  'UPLOAD_START',
  'PASS_CLASSIFIED',
  'FAILURE_CLASSIFIED',
  'SOURCE_REJECTED',
  'TOOLCHAIN_FAILED',
  'EVIDENCE_REJECTED',
  'UPLOAD_FAILED',
  'COOPERATIVE_CANCEL_REQUESTED',
  'PROTOCOL_REJECTED',
]);

const issueTypes = new Set<ConnectorHealthIssueEvent['type']>([
  'ISSUE_JOB_ADMITTED',
  'DOWNLOAD_START',
  'DOWNLOADED_EVIDENCE_VERIFIED',
  'LABEL_QUERY_START',
  'LABELS_VERIFIED',
  'DUPLICATE_QUERY_START',
  'PAGE_WITHOUT_MATCH_AND_NEXT',
  'QUERY_EXHAUSTED_WITH_MATCH',
  'QUERY_EXHAUSTED_WITHOUT_MATCH',
  'ISSUE_SETTLED',
  'CREATE_REQUESTED',
  'CREATE_CONFIRMED',
  'CREATE_RESULT_AMBIGUOUS',
  'RECONCILIATION_RETRY',
  'RECONCILIATION_MATCH_FOUND',
  'RECONCILIATION_UNRESOLVED',
  'ADMISSION_REJECTED',
  'EVIDENCE_REJECTED',
  'READ_RETRY_ALLOWED',
  'READ_FAILED',
  'CREATE_REJECTED',
  'PERMISSION_DENIED',
  'COOPERATIVE_CANCEL_REQUESTED',
  'PROTOCOL_REJECTED',
]);

const conclusionTypes = new Set<ConnectorHealthConclusionEvent['type']>([
  'CONCLUDE_PASS',
  'CONCLUDE_RECORDED_FAILURE',
  'CONCLUDE_UNREPORTED_FAILURE',
  'PROTOCOL_REJECTED',
]);

export function decodeConnectorHealthCaptureEvent(
  value: unknown
): ConnectorHealthCaptureEvent | null {
  const candidate = record(value);
  if (candidate === null || typeof candidate.type !== 'string') {
    return null;
  }
  if (captureSimpleTypes.has(candidate.type as SimpleCaptureEvent['type'])) {
    return hasExactKeys(candidate, ['type']) ? (candidate as SimpleCaptureEvent) : null;
  }
  if (candidate.type === 'EVIDENCE_PERSISTED' || candidate.type === 'EVIDENCE_ACCEPTED') {
    if (
      !hasExactKeys(candidate, [
        'type',
        'disposition',
        'failureFingerprint',
        'evidenceFileSha256',
      ]) ||
      (candidate.disposition !== 'passed' && candidate.disposition !== 'failed') ||
      !sha256Pattern.test(String(candidate.evidenceFileSha256)) ||
      (candidate.disposition === 'passed'
        ? candidate.failureFingerprint !== null
        : !sha256Pattern.test(String(candidate.failureFingerprint)))
    ) {
      return null;
    }
    return candidate as unknown as ConnectorHealthCaptureEvent;
  }
  if (
    candidate.type === 'UPLOAD_CONFIRMED' &&
    hasExactKeys(candidate, ['type', 'artifactId', 'artifactArchiveSha256']) &&
    artifactIdPattern.test(String(candidate.artifactId)) &&
    sha256Pattern.test(String(candidate.artifactArchiveSha256))
  ) {
    return candidate as unknown as ConnectorHealthCaptureEvent;
  }
  return null;
}

export function decodeConnectorHealthIssueEvent(value: unknown): ConnectorHealthIssueEvent | null {
  const candidate = record(value);
  if (
    candidate === null ||
    typeof candidate.type !== 'string' ||
    !issueTypes.has(candidate.type as ConnectorHealthIssueEvent['type']) ||
    !hasExactKeys(candidate, ['type'])
  ) {
    return null;
  }
  return candidate as ConnectorHealthIssueEvent;
}

export function decodeConnectorHealthConclusionEvent(
  value: unknown
): ConnectorHealthConclusionEvent | null {
  const candidate = record(value);
  if (
    candidate === null ||
    typeof candidate.type !== 'string' ||
    !conclusionTypes.has(candidate.type as ConnectorHealthConclusionEvent['type']) ||
    !hasExactKeys(candidate, ['type'])
  ) {
    return null;
  }
  return candidate as ConnectorHealthConclusionEvent;
}

function dormantCaptureEffect<TInput>() {
  return fromCallback<EventObject, TInput>(() => undefined);
}

function invokedCaptureEffect<TInput, TOutput>(input: {
  run: (value: TInput, signal: AbortSignal) => Promise<TOutput>;
  success: (output: TOutput) => ConnectorHealthCaptureEvent;
  failure: ConnectorHealthCaptureEvent;
}) {
  return fromCallback<EventObject, TInput>(({ input: value, sendBack }) => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve()
      .then(() => input.run(value, controller.signal))
      .then(
        (output) => {
          if (!active) {
            return;
          }
          const event = input.success(output);
          sendBack(decodeConnectorHealthCaptureEvent(event) ?? { type: 'PROTOCOL_REJECTED' });
        },
        () => {
          if (active) {
            sendBack(input.failure);
          }
        }
      );
    return () => {
      active = false;
      controller.abort();
    };
  });
}

const dormantVoidCaptureEffect = dormantCaptureEffect<undefined>();
const dormantEvidenceCaptureEffect = dormantCaptureEffect<EvidenceIdentity>();

const captureSetup = setup({
  types: {
    context: {} as CaptureContext,
    events: {} as ConnectorHealthCaptureEvent,
    output: {} as CaptureOutput,
  },
  actors: {
    sourceBinding: dormantVoidCaptureEffect,
    toolchainAdmission: dormantVoidCaptureEffect,
    toolchainPreparation: dormantVoidCaptureEffect,
    healthCheckAdmission: dormantVoidCaptureEffect,
    healthCheck: dormantVoidCaptureEffect,
    evidencePersistenceAdmission: dormantVoidCaptureEffect,
    evidencePersistence: dormantVoidCaptureEffect,
    evidenceValidation: dormantEvidenceCaptureEffect,
    artifactUpload: dormantEvidenceCaptureEffect,
    resultClassification: dormantEvidenceCaptureEffect,
  },
  guards: {
    persistedEvidenceMatches: ({ context, event }) =>
      event.type === 'EVIDENCE_ACCEPTED' &&
      context.evidence !== null &&
      event.disposition === context.evidence.disposition &&
      event.failureFingerprint === context.evidence.failureFingerprint &&
      event.evidenceFileSha256 === context.evidence.evidenceFileSha256,
    dispositionPassed: ({ context }) => context.evidence?.disposition === 'passed',
    dispositionFailed: ({ context }) => context.evidence?.disposition === 'failed',
  },
  actions: {
    retainPersistedEvidence: assign(({ event }) =>
      event.type === 'EVIDENCE_PERSISTED'
        ? {
            evidence: {
              disposition: event.disposition,
              failureFingerprint: event.failureFingerprint,
              evidenceFileSha256: event.evidenceFileSha256,
            },
          }
        : {}
    ),
    retainArtifactIdentity: assign(({ event }) =>
      event.type === 'UPLOAD_CONFIRMED'
        ? {
            artifact: {
              artifactId: event.artifactId,
              artifactArchiveSha256: event.artifactArchiveSha256,
            },
          }
        : {}
    ),
    markCapturePassed: assign(() => ({ terminal: 'capture_passed' as const })),
    markCaptureFailed: assign(() => ({ terminal: 'capture_failed' as const })),
    markCaptureInfrastructureFailed: assign(() => ({
      terminal: 'capture_infrastructure_failed' as const,
    })),
  },
});

const captureFailure = {
  target: 'capture_infrastructure_failed',
  actions: 'markCaptureInfrastructureFailed',
} as const;
const captureCommonFailures = {
  PROTOCOL_REJECTED: captureFailure,
  COOPERATIVE_CANCEL_REQUESTED: captureFailure,
} as const;

export const connectorHealthCaptureMachine = captureSetup.createMachine({
  id: 'connector-health-capture',
  initial: 'idle',
  context: { evidence: null, artifact: null, terminal: null },
  output: ({ context }) => {
    const terminal = context.terminal ?? 'capture_infrastructure_failed';
    return {
      captureTerminal: terminal,
      issueAdmission: terminal === 'capture_failed' ? 'admitted' : 'denied',
      disposition: context.evidence?.disposition ?? null,
      failureFingerprint: context.evidence?.failureFingerprint ?? null,
      evidenceFileSha256: context.evidence?.evidenceFileSha256 ?? null,
      artifactId: context.artifact?.artifactId ?? null,
      artifactArchiveSha256: context.artifact?.artifactArchiveSha256 ?? null,
    };
  },
  states: {
    idle: { on: { TRIGGER_ACCEPTED: 'source_binding', ...captureCommonFailures } },
    source_binding: {
      invoke: { id: 'source-binding-effect', src: 'sourceBinding' },
      on: {
        SOURCE_BOUND: 'source_bound',
        SOURCE_REJECTED: captureFailure,
        ...captureCommonFailures,
      },
    },
    source_bound: {
      invoke: { id: 'toolchain-admission-effect', src: 'toolchainAdmission' },
      on: { TOOLCHAIN_PREPARE: 'tooling_preparing', ...captureCommonFailures },
    },
    tooling_preparing: {
      invoke: { id: 'toolchain-preparation-effect', src: 'toolchainPreparation' },
      on: {
        TOOLCHAIN_READY: 'tooling_ready',
        TOOLCHAIN_FAILED: captureFailure,
        ...captureCommonFailures,
      },
    },
    tooling_ready: {
      invoke: { id: 'health-check-admission-effect', src: 'healthCheckAdmission' },
      on: { CHECK_START: 'check_running', ...captureCommonFailures },
    },
    check_running: {
      invoke: { id: 'health-check-effect', src: 'healthCheck' },
      on: {
        CHECK_CLOSED: 'check_executed',
        CHECK_HEALTH_FAILED: 'check_executed',
        CHECK_INFRASTRUCTURE_FAILED: captureFailure,
        ...captureCommonFailures,
      },
    },
    check_executed: {
      invoke: {
        id: 'evidence-persistence-admission-effect',
        src: 'evidencePersistenceAdmission',
      },
      on: { CAPTURE_FINALIZE: 'evidence_persisting', ...captureCommonFailures },
    },
    evidence_persisting: {
      invoke: { id: 'evidence-persistence-effect', src: 'evidencePersistence' },
      on: {
        EVIDENCE_PERSISTED: {
          target: 'capture_completed',
          actions: 'retainPersistedEvidence',
        },
        EVIDENCE_REJECTED: captureFailure,
        ...captureCommonFailures,
      },
    },
    capture_completed: {
      invoke: {
        id: 'evidence-validation-effect',
        src: 'evidenceValidation',
        input: ({ context }) => context.evidence as EvidenceIdentity,
      },
      on: {
        EVIDENCE_ACCEPTED: {
          target: 'evidence_validated',
          guard: 'persistedEvidenceMatches',
        },
        EVIDENCE_REJECTED: captureFailure,
        ...captureCommonFailures,
      },
    },
    evidence_validated: { on: { UPLOAD_START: 'evidence_uploading', ...captureCommonFailures } },
    evidence_uploading: {
      invoke: {
        id: 'artifact-upload-effect',
        src: 'artifactUpload',
        input: ({ context }) => context.evidence as EvidenceIdentity,
      },
      on: {
        UPLOAD_CONFIRMED: {
          target: 'evidence_uploaded',
          actions: 'retainArtifactIdentity',
        },
        UPLOAD_FAILED: captureFailure,
        ...captureCommonFailures,
      },
    },
    evidence_uploaded: {
      invoke: {
        id: 'result-classification-effect',
        src: 'resultClassification',
        input: ({ context }) => context.evidence as EvidenceIdentity,
      },
      on: {
        PASS_CLASSIFIED: {
          target: 'capture_passed',
          guard: 'dispositionPassed',
          actions: 'markCapturePassed',
        },
        FAILURE_CLASSIFIED: {
          target: 'capture_failed',
          guard: 'dispositionFailed',
          actions: 'markCaptureFailed',
        },
        ...captureCommonFailures,
      },
    },
    capture_passed: { type: 'final' },
    capture_failed: { type: 'final' },
    capture_infrastructure_failed: { type: 'final' },
  },
});

function sameEvidenceIdentity(
  left: Readonly<EvidenceIdentity>,
  right: Readonly<EvidenceIdentity>
): boolean {
  return (
    left.disposition === right.disposition &&
    left.failureFingerprint === right.failureFingerprint &&
    left.evidenceFileSha256 === right.evidenceFileSha256
  );
}

export function provideConnectorHealthCaptureEffects(effects: ConnectorHealthCaptureEffects) {
  const automaticEvent = <T extends ConnectorHealthCaptureEvent['type']>(type: T) =>
    invokedCaptureEffect<undefined, void>({
      run: async () => undefined,
      success: () => ({ type }) as ConnectorHealthCaptureEvent,
      failure: { type: 'PROTOCOL_REJECTED' },
    });

  return connectorHealthCaptureMachine.provide({
    actors: {
      sourceBinding: invokedCaptureEffect({
        run: (_input: undefined, signal) => effects.bindSource(signal),
        success: () => ({ type: 'SOURCE_BOUND' }),
        failure: { type: 'SOURCE_REJECTED' },
      }),
      toolchainAdmission: automaticEvent('TOOLCHAIN_PREPARE'),
      toolchainPreparation: invokedCaptureEffect({
        run: (_input: undefined, signal) => effects.prepareToolchain(signal),
        success: () => ({ type: 'TOOLCHAIN_READY' }),
        failure: { type: 'TOOLCHAIN_FAILED' },
      }),
      healthCheckAdmission: automaticEvent('CHECK_START'),
      healthCheck: invokedCaptureEffect({
        run: (_input: undefined, signal) => effects.runHealthCheck(signal),
        success: () => ({ type: 'CHECK_CLOSED' }),
        failure: { type: 'CHECK_INFRASTRUCTURE_FAILED' },
      }),
      evidencePersistenceAdmission: automaticEvent('CAPTURE_FINALIZE'),
      evidencePersistence: invokedCaptureEffect({
        run: (_input: undefined, signal) => effects.persistEvidence(signal),
        success: (identity) => ({ type: 'EVIDENCE_PERSISTED', ...identity }),
        failure: { type: 'EVIDENCE_REJECTED' },
      }),
      evidenceValidation: invokedCaptureEffect({
        run: async (identity: EvidenceIdentity, signal) => {
          const validated = await effects.validateEvidence(identity, signal);
          if (!sameEvidenceIdentity(identity, validated)) {
            throw new Error('Validated evidence identity drifted from persisted evidence.');
          }
          return validated;
        },
        success: (identity) => ({ type: 'EVIDENCE_ACCEPTED', ...identity }),
        failure: { type: 'EVIDENCE_REJECTED' },
      }),
      artifactUpload: invokedCaptureEffect({
        run: (identity: EvidenceIdentity, signal) =>
          effects.confirmArtifactUpload(identity, signal),
        success: (artifact) => ({ type: 'UPLOAD_CONFIRMED', ...artifact }),
        failure: { type: 'UPLOAD_FAILED' },
      }),
      resultClassification: invokedCaptureEffect({
        run: async (identity: EvidenceIdentity) => identity,
        success: (identity) => ({
          type: identity.disposition === 'passed' ? 'PASS_CLASSIFIED' : 'FAILURE_CLASSIFIED',
        }),
        failure: { type: 'PROTOCOL_REJECTED' },
      }),
    },
  });
}

const issueFailure = { target: 'issue_failed', actions: 'markIssueFailed' } as const;
const issueCommonFailures = {
  PROTOCOL_REJECTED: issueFailure,
  COOPERATIVE_CANCEL_REQUESTED: issueFailure,
} as const;

type IssueControllerCommand = { type: 'START' };

const dormantIssueController = fromCallback<IssueControllerCommand, undefined>(() => undefined);

const issueSetup = setup({
  types: {
    context: {} as { terminal: IssueTerminal | null },
    events: {} as ConnectorHealthIssueEvent,
    output: {} as { issueTerminal: IssueTerminal },
  },
  actors: {
    issueController: dormantIssueController,
  },
  actions: {
    startIssueController: sendTo('issue-controller', { type: 'START' }),
    markIssueSettled: assign(() => ({ terminal: 'issue_settled' as const })),
    markIssueFailed: assign(() => ({ terminal: 'issue_failed' as const })),
  },
});

export const connectorHealthIssueMachine = issueSetup.createMachine({
  id: 'connector-health-issue',
  initial: 'issue_pending',
  context: { terminal: null },
  invoke: { id: 'issue-controller', src: 'issueController' },
  output: ({ context }) => ({ issueTerminal: context.terminal ?? 'issue_failed' }),
  states: {
    issue_pending: {
      on: {
        ISSUE_JOB_ADMITTED: { target: 'issue_admitted', actions: 'startIssueController' },
        ADMISSION_REJECTED: issueFailure,
        ...issueCommonFailures,
      },
    },
    issue_admitted: {
      on: {
        DOWNLOAD_START: 'evidence_downloading',
        ADMISSION_REJECTED: issueFailure,
        ...issueCommonFailures,
      },
    },
    evidence_downloading: {
      on: {
        DOWNLOADED_EVIDENCE_VERIFIED: 'evidence_reverified',
        EVIDENCE_REJECTED: issueFailure,
        ...issueCommonFailures,
      },
    },
    evidence_reverified: {
      on: { LABEL_QUERY_START: 'labels_verifying', ...issueCommonFailures },
    },
    labels_verifying: {
      on: {
        LABELS_VERIFIED: 'labels_verified',
        READ_RETRY_ALLOWED: 'labels_verifying',
        READ_FAILED: issueFailure,
        ...issueCommonFailures,
      },
    },
    labels_verified: {
      on: { DUPLICATE_QUERY_START: 'duplicate_querying', ...issueCommonFailures },
    },
    duplicate_querying: {
      on: {
        PAGE_WITHOUT_MATCH_AND_NEXT: 'duplicate_querying',
        QUERY_EXHAUSTED_WITH_MATCH: 'duplicate_found',
        QUERY_EXHAUSTED_WITHOUT_MATCH: 'duplicate_absent',
        READ_RETRY_ALLOWED: 'duplicate_querying',
        READ_FAILED: issueFailure,
        ...issueCommonFailures,
      },
    },
    duplicate_found: {
      on: {
        ISSUE_SETTLED: { target: 'issue_settled', actions: 'markIssueSettled' },
        ...issueCommonFailures,
      },
    },
    duplicate_absent: { on: { CREATE_REQUESTED: 'issue_creating', ...issueCommonFailures } },
    issue_creating: {
      on: {
        CREATE_CONFIRMED: 'issue_created',
        CREATE_RESULT_AMBIGUOUS: 'create_reconciling',
        CREATE_REJECTED: issueFailure,
        PERMISSION_DENIED: issueFailure,
        ...issueCommonFailures,
      },
    },
    create_reconciling: {
      on: {
        RECONCILIATION_RETRY: 'create_reconciling',
        RECONCILIATION_MATCH_FOUND: 'issue_created',
        RECONCILIATION_UNRESOLVED: issueFailure,
        PERMISSION_DENIED: issueFailure,
        ...issueCommonFailures,
      },
    },
    issue_created: {
      on: {
        ISSUE_SETTLED: { target: 'issue_settled', actions: 'markIssueSettled' },
        ...issueCommonFailures,
      },
    },
    issue_settled: { type: 'final' },
    issue_failed: { type: 'final' },
  },
});

export function provideConnectorHealthIssueEffects(effects: ConnectorHealthIssueEffects) {
  return connectorHealthIssueMachine.provide({
    actors: {
      issueController: fromCallback<IssueControllerCommand, undefined>(({ receive, sendBack }) => {
        const controller = new AbortController();
        let active = true;
        let started = false;
        receive((event) => {
          if (event.type !== 'START' || started || !active) {
            return;
          }
          started = true;
          const report = (reported: ConnectorHealthIssueEvent): void => {
            if (!active) {
              return;
            }
            sendBack(decodeConnectorHealthIssueEvent(reported) ?? { type: 'PROTOCOL_REJECTED' });
          };
          Promise.resolve()
            .then(() => effects.settle(report, controller.signal))
            .then(
              () => {
                if (active) {
                  sendBack({ type: 'PROTOCOL_REJECTED' });
                }
              },
              () => {
                if (active) {
                  sendBack({ type: 'PROTOCOL_REJECTED' });
                }
              }
            );
        });
        return () => {
          active = false;
          controller.abort();
        };
      }),
    },
  });
}

const conclusionSetup = setup({
  types: {
    context: {} as ConclusionContext,
    input: {} as ConnectorHealthConclusionInput,
    events: {} as ConnectorHealthConclusionEvent,
    output: {} as ConclusionOutput,
  },
  actions: {
    markPassed: assign(() => ({ terminal: 'passed' as const })),
    markFailedRecorded: assign(() => ({ terminal: 'failed_recorded' as const })),
    markFailedUnreported: assign(() => ({ terminal: 'failed_unreported' as const })),
  },
});

export const connectorHealthConclusionMachine = conclusionSetup.createMachine({
  id: 'connector-health-conclusion',
  initial: 'conclusion_pending',
  context: ({ input }) => ({ ...input, terminal: null }),
  output: ({ context }) => {
    const terminal = context.terminal ?? 'failed_unreported';
    return { conclusionTerminal: terminal, exitCode: terminal === 'passed' ? 0 : 1 };
  },
  states: {
    conclusion_pending: {
      on: {
        CONCLUDE_PASS: { target: 'passed', actions: 'markPassed' },
        CONCLUDE_RECORDED_FAILURE: {
          target: 'failed_recorded',
          actions: 'markFailedRecorded',
        },
        CONCLUDE_UNREPORTED_FAILURE: {
          target: 'failed_unreported',
          actions: 'markFailedUnreported',
        },
        PROTOCOL_REJECTED: { target: 'failed_unreported', actions: 'markFailedUnreported' },
      },
    },
    passed: { type: 'final' },
    failed_recorded: { type: 'final' },
    failed_unreported: { type: 'final' },
  },
});

export function deriveConnectorHealthConclusionEvent(
  input: ConnectorHealthConclusionInput
): ConnectorHealthConclusionEvent {
  if (
    input.captureResult === 'success' &&
    input.captureTerminal === 'capture_passed' &&
    input.issueResult === 'skipped' &&
    input.issueTerminal === null
  ) {
    return { type: 'CONCLUDE_PASS' };
  }
  if (
    input.captureResult === 'success' &&
    input.captureTerminal === 'capture_failed' &&
    input.issueResult === 'success' &&
    input.issueTerminal === 'issue_settled'
  ) {
    return { type: 'CONCLUDE_RECORDED_FAILURE' };
  }
  return { type: 'CONCLUDE_UNREPORTED_FAILURE' };
}

type ConnectorHealthActor =
  | ActorRefFrom<typeof connectorHealthCaptureMachine>
  | ActorRefFrom<typeof connectorHealthIssueMachine>
  | ActorRefFrom<typeof connectorHealthConclusionMachine>;

function decodeForActor(
  actorId: string | undefined,
  value: unknown
): ConnectorHealthCaptureEvent | ConnectorHealthIssueEvent | ConnectorHealthConclusionEvent | null {
  if (actorId?.includes('capture')) {
    return decodeConnectorHealthCaptureEvent(value);
  }
  if (actorId?.includes('issue')) {
    return decodeConnectorHealthIssueEvent(value);
  }
  if (actorId?.includes('conclusion')) {
    return decodeConnectorHealthConclusionEvent(value);
  }
  return null;
}

export function sendConnectorHealthEvent(actor: ConnectorHealthActor, value: unknown): boolean {
  const unsafeActor = actor as unknown as {
    id?: string;
    logic?: { id?: string; config?: { id?: string } };
    getSnapshot: () => { can: (event: { type: string }) => boolean; status: string };
    send: (event: { type: string }) => void;
  };
  const actorId = unsafeActor.logic?.id ?? unsafeActor.logic?.config?.id ?? unsafeActor.id;
  const decoded = decodeForActor(actorId, value);
  const snapshot = unsafeActor.getSnapshot();
  if (snapshot.status !== 'active') {
    return false;
  }
  if (decoded !== null && snapshot.can(decoded)) {
    unsafeActor.send(decoded);
    return true;
  }
  unsafeActor.send({ type: 'PROTOCOL_REJECTED' });
  return false;
}
