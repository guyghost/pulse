/**
 * Presentation controller for the "copy link" affordance (DAO #179).
 *
 * Extracted from MissionCard: clipboard I/O and the transient "copied"
 * feedback live here, not in the molecule. Timers are always cleaned up —
 * before each new copy and on dispose() (component unmount) — so a card
 * unmounting mid-feedback can never leave a pending timeout behind.
 *
 * `clipboard` and `delay` are injectable so tests run without global mocks.
 */

export type LinkCopyStatus = 'idle' | 'copied';

export interface LinkCopyController {
  readonly status: LinkCopyStatus;
  /** Writes `url` to the clipboard. Resolves `true` on success, `false` on rejection. */
  copy(url: string): Promise<boolean>;
  /** Cancels any pending feedback timer (idempotent). */
  dispose(): void;
}

/** How long the "copied" feedback stays visible. */
export const COPY_FEEDBACK_MS = 1500;

export function createLinkCopyController(
  clipboard: { writeText(text: string): Promise<void> } = navigator.clipboard,
  delay: (handler: () => void, ms: number) => () => void = (handler, ms) => {
    const id = setTimeout(handler, ms);
    return () => clearTimeout(id);
  }
): LinkCopyController {
  let status = $state<LinkCopyStatus>('idle');
  let cancelFeedback: (() => void) | null = null;

  function clearFeedbackTimer(): void {
    cancelFeedback?.();
    cancelFeedback = null;
  }

  return {
    get status() {
      return status;
    },
    copy(url: string): Promise<boolean> {
      // A rapid re-copy must not stack timers: the previous feedback is
      // cancelled first, the new one fully owns the state from here on.
      clearFeedbackTimer();
      return clipboard
        .writeText(url)
        .then(() => {
          status = 'copied';
          cancelFeedback = delay(() => {
            cancelFeedback = null;
            status = 'idle';
          }, COPY_FEEDBACK_MS);
          return true;
        })
        .catch(() => false);
    },
    dispose() {
      clearFeedbackTimer();
    },
  };
}
