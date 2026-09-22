/**
 * Presentation controller for the 1-click pitch copy affordance (DAO #211).
 *
 * Manages clipboard I/O and transient accessible feedback for quick pitches.
 * States: 'idle' | 'copying' | 'copied' | 'error'.
 * Disposes timers properly to avoid leaks.
 */

export type PitchCopyStatus = 'idle' | 'copying' | 'copied' | 'error';

export interface PitchCopyController {
  readonly status: PitchCopyStatus;
  /** Writes generated pitch to the clipboard. Resolves true on success, false on error. */
  copy(pitchText: string): Promise<boolean>;
  /** Cancels any active feedback timer (idempotent). */
  dispose(): void;
}

export const PITCH_COPY_FEEDBACK_MS = 2000;

export function createPitchCopyController(
  clipboard: { writeText(text: string): Promise<void> } = navigator.clipboard,
  delay: (handler: () => void, ms: number) => () => void = (handler, ms) => {
    const id = setTimeout(handler, ms);
    return () => clearTimeout(id);
  }
): PitchCopyController {
  let status = $state<PitchCopyStatus>('idle');
  let cancelFeedback: (() => void) | null = null;

  function clearFeedbackTimer(): void {
    cancelFeedback?.();
    cancelFeedback = null;
  }

  function scheduleFeedbackReset(): void {
    cancelFeedback = delay(() => {
      cancelFeedback = null;
      status = 'idle';
    }, PITCH_COPY_FEEDBACK_MS);
  }

  return {
    get status() {
      return status;
    },
    async copy(pitchText: string): Promise<boolean> {
      clearFeedbackTimer();
      status = 'copying';
      try {
        await clipboard.writeText(pitchText);
        status = 'copied';
        scheduleFeedbackReset();
        return true;
      } catch {
        status = 'error';
        scheduleFeedbackReset();
        return false;
      }
    },
    dispose() {
      clearFeedbackTimer();
    },
  };
}
