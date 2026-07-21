import { describe, expect, it, vi } from 'vitest';

import { createCopilotBridgeHandler } from '../../../src/lib/shell/copilot/background-handler';
import type { CopilotCoordinator } from '../../../src/lib/shell/copilot/coordinator';

const requestId = '11111111-1111-4111-8111-111111111111';

describe('Copilot background handler', () => {
  it('turns an unexpected async rejection into one typed bridge response', async () => {
    const coordinator = {
      link: vi.fn().mockRejectedValue(new Error('unexpected')),
      syncEntitlement: vi.fn(),
      createJob: vi.fn(),
      getJob: vi.fn(),
      cancelJob: vi.fn(),
      reviewJob: vi.fn(),
      deleteDossier: vi.fn(),
    } as unknown as CopilotCoordinator;
    const sendResponse = vi.fn();
    const handled = createCopilotBridgeHandler(coordinator)(
      { type: 'COPILOT_LINK', payload: { requestId } },
      sendResponse
    );

    expect(handled).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1));
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'COPILOT_LINK_RESULT',
      payload: {
        requestId,
        outcome: 'error',
        subject: null,
        error: {
          code: 'REMOTE_FAILED',
          message: 'Le service Copilot est indisponible.',
          retryable: true,
        },
      },
    });
  });
});
