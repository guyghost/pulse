export class LocalDataResetUnavailableError extends Error {
  readonly code = 'LOCAL_DATA_RESET_MODEL_PORTS_UNAVAILABLE' as const;

  constructor() {
    super(
      'La réinitialisation locale est indisponible tant que les ports d’effet du modèle ne sont pas installés.'
    );
    this.name = 'LocalDataResetUnavailableError';
  }
}

/**
 * Fail-closed production gate.
 *
 * The approved reset machine currently exports states and validated events,
 * but no executable command/port protocol. Performing the former clear/delete
 * sequence here would bypass its journal, epoch fence, handoff and completion
 * receipt. Until that protocol is executable, no destructive effect is
 * admitted and callers receive a truthful failure.
 */
export async function resetLocalData(): Promise<never> {
  throw new LocalDataResetUnavailableError();
}
