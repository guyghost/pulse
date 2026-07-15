import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppError, Result } from '../../../src/lib/core/errors';
import { withResultRetry } from '../../../src/lib/shell/utils/retry-strategy';

describe('withResultRetry cancellation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts a pending backoff, clears its timer, and never retries', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const retryableError: AppError = {
      type: 'network',
      message: 'temporary network failure',
      retryable: true,
      recoverable: true,
      timestamp: 1,
    };
    const attempt = vi.fn<() => Promise<Result<string, AppError>>>().mockResolvedValue({
      ok: false,
      error: retryableError,
    });

    const resultPromise = withResultRetry(
      attempt,
      { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 1_000 },
      controller.signal
    );
    await Promise.resolve();
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    controller.abort();

    await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
    await vi.runAllTimersAsync();
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
