import { describe, expect, it, vi } from 'vitest';
import {
  createPitchCopyController,
  PITCH_COPY_FEEDBACK_MS,
} from '../../../src/lib/state/pitch-copy.svelte';

describe('PitchCopyController', () => {
  it('starts in idle state', () => {
    const controller = createPitchCopyController({
      writeText: () => Promise.resolve(),
    });
    expect(controller.status).toBe('idle');
  });

  it('transitions to copied and resets after delay', async () => {
    let timerCallback: (() => void) | null = null;
    const fakeDelay = (handler: () => void, ms: number) => {
      timerCallback = handler;
      expect(ms).toBe(PITCH_COPY_FEEDBACK_MS);
      return () => {
        timerCallback = null;
      };
    };

    const controller = createPitchCopyController({ writeText: () => Promise.resolve() }, fakeDelay);

    const result = await controller.copy('Mon accroche');
    expect(result).toBe(true);
    expect(controller.status).toBe('copied');

    // Trigger timer
    expect(timerCallback).not.toBeNull();
    timerCallback!();
    expect(controller.status).toBe('idle');
  });

  it('transitions to error when clipboard throws and resets', async () => {
    let timerCallback: (() => void) | null = null;
    const fakeDelay = (handler: () => void) => {
      timerCallback = handler;
      return () => {
        timerCallback = null;
      };
    };

    const controller = createPitchCopyController(
      { writeText: () => Promise.reject(new Error('Permission denied')) },
      fakeDelay
    );

    const result = await controller.copy('Mon accroche');
    expect(result).toBe(false);
    expect(controller.status).toBe('error');

    timerCallback!();
    expect(controller.status).toBe('idle');
  });

  it('disposes active timers cleanly', async () => {
    let cancelled = false;
    const fakeDelay = () => {
      return () => {
        cancelled = true;
      };
    };

    const controller = createPitchCopyController({ writeText: () => Promise.resolve() }, fakeDelay);

    await controller.copy('Mon accroche');
    controller.dispose();
    expect(cancelled).toBe(true);
  });
});
