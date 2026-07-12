import type { DeepLinkIntent } from '../../core/deep-link/deep-link-intent';

export type ScanState = 'idle' | 'scanning' | 'error';

export async function getScanState(): Promise<ScanState> {
  const result = await chrome.storage.session.get(['scanState']);
  return (result.scanState as ScanState) ?? 'idle';
}

export async function setScanState(state: ScanState): Promise<void> {
  await chrome.storage.session.set({ scanState: state });
}

export async function getNewMissionCount(): Promise<number> {
  const result = await chrome.storage.session.get(['newMissionCount']);
  return (result.newMissionCount as number) ?? 0;
}

export async function setNewMissionCount(count: number): Promise<void> {
  await chrome.storage.session.set({ newMissionCount: count });
}

export async function resetNewMissionCount(): Promise<void> {
  await chrome.storage.session.set({ newMissionCount: 0 });
}

// ---------------------------------------------------------------------------
// Deep-link focus intent (notification → panel)
// Stored in session storage: single-consume, cleared on browser session end.
// See src/models/notification-deep-link.model.md.
// ---------------------------------------------------------------------------

const DEEP_LINK_INTENT_KEY = 'deepLinkIntent';

/** Write a focus intent (overwrites any pending one — invariant I4). */
export async function setDeepLinkIntent(intent: DeepLinkIntent): Promise<void> {
  await chrome.storage.session.set({ [DEEP_LINK_INTENT_KEY]: intent });
}

/** Read the current intent without removing it. */
export async function getDeepLinkIntent(): Promise<DeepLinkIntent | null> {
  const result = await chrome.storage.session.get(DEEP_LINK_INTENT_KEY);
  return (result[DEEP_LINK_INTENT_KEY] as DeepLinkIntent | undefined) ?? null;
}

// In-process serialization of the read-then-clear consume (invariant I1).
// `chrome.storage.session` has no atomic read-and-remove, so two concurrent
// CONSUME messages (e.g. panel opened in two windows) could both observe the
// same pending intent before either remove runs. This promise chain forces
// consumes to execute strictly one after another within this service worker.
let consumeChain: Promise<void> = Promise.resolve();

/**
 * Atomically read and clear the intent (invariant I1: single consume).
 * Returns the consumed intent, or null if none was pending. Serialized within
 * the service worker so only the first concurrent caller wins.
 */
export function consumeDeepLinkIntent(): Promise<DeepLinkIntent | null> {
  const run = consumeChain.then(async () => {
    const intent = await getDeepLinkIntent();
    if (intent) {
      await chrome.storage.session.remove(DEEP_LINK_INTENT_KEY);
    }
    return intent;
  });
  // Keep the chain alive even if this run rejects, so one failure can't stall
  // subsequent consumes forever.
  consumeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function clearDeepLinkIntent(): Promise<void> {
  await chrome.storage.session.remove(DEEP_LINK_INTENT_KEY);
}
