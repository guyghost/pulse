import type {
  AiAvailability,
  ConsentState,
  EnginePreference,
  EngineSelection,
  EntitlementState,
} from './types';

/**
 * Table de vérité du sélecteur de moteur (Machine B, transition
 * `entitlement → generating`).
 *
 * - `remote` n'est choisi QUE si : préférence remote + entitlement actif +
 *   consentement accordé. Aucun de ces trois ne peut être implicite.
 * - `local` (Gemini Nano) exige `availability === 'available'`.
 *   `'after-download'` ⇒ local non prêt.
 * - Sinon `none` (aucune proposition possible).
 *
 * Invariant (LLM ne décide pas) : cette fonction est pure et ne consulte
 * aucune sortie d'IA. La décision est une table de vérité déterministe.
 *
 * Pur, déterministe, sans I/O.
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
