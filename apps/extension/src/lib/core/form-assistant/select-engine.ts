import type {
  AiAvailability,
  ConsentState,
  EnginePreference,
  EngineSelection,
  EntitlementState,
} from './types';

/**
 * Engine selector truth table (Machine B, `entitlement → generating`
 * transition).
 *
 * - `remote` is chosen ONLY if: remote preference + active entitlement +
 *   consent granted. None of the three can be implicit.
 * - `local` (Gemini Nano) requires `availability === 'available'`.
 *   `'after-download'` ⇒ local not ready.
 * - Otherwise `none` (no proposal possible).
 *
 * Invariant (the LLM does not decide): this function is pure and consults no
 * AI output. The decision is a deterministic truth table.
 *
 * Pure, deterministic, no I/O.
 */
export function selectFormAssistEngine(
  preference: EnginePreference,
  availability: AiAvailability,
  entitlement: EntitlementState,
  consent: ConsentState
): EngineSelection {
  const remoteUsable = entitlement === 'active' && consent === 'granted';

  if (preference === 'remote' && remoteUsable) {
    return { engine: 'remote' };
  }
  if (availability === 'available') {
    return { engine: 'local' };
  }
  return { engine: 'none', reason: 'unavailable' };
}
