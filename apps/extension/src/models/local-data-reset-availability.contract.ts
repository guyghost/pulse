export type LocalDataResetRuntimeAvailability =
  | Readonly<{ status: 'available'; reason: null }>
  | Readonly<{ status: 'unavailable'; reason: string }>;

/**
 * Fail-closed projection while the model-owned Reset actor ports are not wired.
 * This is a runtime capability fact, not a transient UI preference.
 */
export const LOCAL_DATA_RESET_RUNTIME_AVAILABILITY: LocalDataResetRuntimeAvailability =
  Object.freeze({
    status: 'unavailable' as const,
    reason: 'Réinitialisation indisponible : coordination de sécurité en cours de finalisation.',
  });
