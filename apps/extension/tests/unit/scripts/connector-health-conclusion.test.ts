import { describe, expect, it, vi } from 'vitest';

import {
  parseConnectorHealthConclusionInput,
  runConnectorHealthConclusionActor,
} from '../../../scripts/connector-health/conclusion';

describe('connector-health conclusion actor boundary', () => {
  it('starts the actor and installs handlers before the lifecycle marker and event', () => {
    const order: string[] = [];
    const result = runConnectorHealthConclusionActor(
      {
        captureResult: 'success',
        captureTerminal: 'capture_passed',
        issueResult: 'skipped',
        issueTerminal: null,
      },
      {
        installHandlers: () => {
          order.push('handlers');
        },
        emitStartedMarker: () => {
          order.push('marker');
        },
        beforeSend: () => {
          order.push('send');
        },
      }
    );

    expect(order).toEqual(['handlers', 'marker', 'send']);
    expect(result).toEqual({ conclusionTerminal: 'passed', exitCode: 0 });
  });

  it('parses strict needs values and rejects unknown/malformed tuples', () => {
    expect(
      parseConnectorHealthConclusionInput({
        CAPTURE_RESULT: 'success',
        CAPTURE_TERMINAL: 'capture_failed',
        ISSUE_RESULT: 'success',
        ISSUE_TERMINAL: 'issue_settled',
      })
    ).toEqual({
      captureResult: 'success',
      captureTerminal: 'capture_failed',
      issueResult: 'success',
      issueTerminal: 'issue_settled',
    });
    expect(() =>
      parseConnectorHealthConclusionInput({
        CAPTURE_RESULT: 'unknown',
        CAPTURE_TERMINAL: '',
        ISSUE_RESULT: 'skipped',
        ISSUE_TERMINAL: '',
      })
    ).toThrow(/result/i);
    expect(() =>
      parseConnectorHealthConclusionInput({
        CAPTURE_RESULT: 'success',
        CAPTURE_TERMINAL: 'capture_passed',
        ISSUE_RESULT: 'skipped',
        ISSUE_TERMINAL: 'issue_failed',
      })
    ).not.toThrow();
  });

  it('fails closed after actor start when the selected event is rejected', () => {
    const marker = vi.fn();
    const result = runConnectorHealthConclusionActor(
      {
        captureResult: 'cancelled',
        captureTerminal: 'capture_passed',
        issueResult: 'success',
        issueTerminal: 'issue_settled',
      },
      { installHandlers: vi.fn(), emitStartedMarker: marker }
    );
    expect(marker).toHaveBeenCalledOnce();
    expect(result).toEqual({ conclusionTerminal: 'failed_unreported', exitCode: 1 });
  });
});
