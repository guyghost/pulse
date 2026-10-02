import type { PersistedConnectorStatus } from '../types/connector-status';
import type { ConnectorHealthSnapshot } from '../types/health';

export type SettingsSourceVerification = 'ready' | 'session-missing' | 'unavailable' | 'checking';
export type SettingsSourceState =
  'disabled' | 'verified' | 'reconnect' | 'error' | 'unknown' | 'checking';

export function deriveSettingsSourceStatus(input: {
  enabled: boolean;
  verification?: SettingsSourceVerification;
  status?: PersistedConnectorStatus;
  health?: ConnectorHealthSnapshot;
}): {
  state: SettingsSourceState;
  label: string;
  detail: string | null;
  lastSuccessAt: number | null;
} {
  const { enabled, verification, status, health } = input;
  const successes = [status?.lastSuccessAt, health?.lastSuccessAt].filter(
    (value): value is number => typeof value === 'number' && value > 0
  );
  const lastSuccessAt = successes.length ? Math.max(...successes) : null;
  let state: SettingsSourceState = 'unknown';
  let label = 'Vérification inconnue';
  let detail: string | null = null;
  if (!enabled) {
    state = 'disabled';
    label = 'Désactivée';
  } else if (verification === 'checking') {
    state = 'checking';
    label = 'Vérification en cours…';
  } else if (verification === 'session-missing') {
    state = 'reconnect';
    label = 'Session à reconnecter';
    detail = 'Connectez-vous sur la plateforme, puis revérifiez ici.';
  } else if (verification === 'unavailable') {
    state = 'error';
    label = 'Erreur de vérification';
    detail = 'Impossible de vérifier la session. Ouvrez la plateforme puis réessayez.';
  } else if (status?.lastState === 'error' || health?.circuitState === 'open') {
    state = 'error';
    label = 'Erreur de collecte';
    detail =
      typeof status?.error?.message === 'string'
        ? status.error.message
        : 'La dernière collecte a échoué. Vérifiez la plateforme avant de relancer un scan.';
  } else if (verification === 'ready') {
    state = 'verified';
    label = 'Connexion vérifiée';
  }
  return { state, label, detail, lastSuccessAt };
}
