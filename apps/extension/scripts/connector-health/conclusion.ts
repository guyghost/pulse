import { createActor } from 'xstate';

import {
  connectorHealthConclusionMachine,
  deriveConnectorHealthConclusionEvent,
  sendConnectorHealthEvent,
  type CaptureTerminal,
  type ConnectorHealthConclusionInput,
  type ConclusionTerminal,
  type IssueTerminal,
} from './workflow-machine';

type StrictResult = ConnectorHealthConclusionInput['captureResult'];

const results = new Set<StrictResult>(['success', 'failure', 'cancelled', 'skipped']);
const captureTerminals = new Set<CaptureTerminal>([
  'capture_passed',
  'capture_failed',
  'capture_infrastructure_failed',
]);
const issueTerminals = new Set<IssueTerminal>(['issue_settled', 'issue_failed']);

function strictResult(value: unknown, label: string): StrictResult {
  if (typeof value !== 'string' || !results.has(value as StrictResult)) {
    throw new Error(`${label} result is outside the strict GitHub needs result set.`);
  }
  return value as StrictResult;
}

function optionalTerminal<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  label: string
): T | null {
  if (value === '' || value === null) {
    return null;
  }
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    throw new Error(`${label} terminal is malformed.`);
  }
  return value as T;
}

export function parseConnectorHealthConclusionInput(
  environment: Readonly<Record<string, unknown>>
): ConnectorHealthConclusionInput {
  const expectedKeys = ['CAPTURE_RESULT', 'CAPTURE_TERMINAL', 'ISSUE_RESULT', 'ISSUE_TERMINAL'];
  const actualKeys = Object.keys(environment).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== [...expectedKeys].sort()[index])
  ) {
    throw new Error('Conclusion bootstrap inputs have unknown or missing keys.');
  }
  return {
    captureResult: strictResult(environment.CAPTURE_RESULT, 'Capture'),
    captureTerminal: optionalTerminal(environment.CAPTURE_TERMINAL, captureTerminals, 'Capture'),
    issueResult: strictResult(environment.ISSUE_RESULT, 'Issue'),
    issueTerminal: optionalTerminal(environment.ISSUE_TERMINAL, issueTerminals, 'Issue'),
  };
}

export function runConnectorHealthConclusionActor(
  input: ConnectorHealthConclusionInput,
  lifecycle: {
    installHandlers: () => void;
    emitStartedMarker: () => void;
    beforeSend?: () => void;
  }
): { conclusionTerminal: ConclusionTerminal; exitCode: 0 | 1 } {
  const actor = createActor(connectorHealthConclusionMachine, { input }).start();
  lifecycle.installHandlers();
  lifecycle.emitStartedMarker();
  try {
    lifecycle.beforeSend?.();
    const event = deriveConnectorHealthConclusionEvent(input);
    sendConnectorHealthEvent(actor, event);
  } catch {
    sendConnectorHealthEvent(actor, { type: 'PROTOCOL_REJECTED' });
  }
  const snapshot = actor.getSnapshot();
  if (snapshot.status !== 'done' || snapshot.output === undefined) {
    sendConnectorHealthEvent(actor, { type: 'PROTOCOL_REJECTED' });
  }
  const settled = actor.getSnapshot();
  if (settled.status !== 'done' || settled.output === undefined) {
    return { conclusionTerminal: 'failed_unreported', exitCode: 1 };
  }
  return settled.output;
}
