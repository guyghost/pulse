export const EVE_FEATURE_FLAG_ENV = 'MISSIONPULSE_EVE_ENABLED';
export const EVE_BASE_URL_ENV = 'MISSIONPULSE_EVE_BASE_URL';
export const EVE_TIMEOUT_MS_ENV = 'MISSIONPULSE_EVE_TIMEOUT_MS';
export const DEFAULT_EVE_TIMEOUT_MS = 60_000;
export const MIN_EVE_TIMEOUT_MS = 1_000;
export const MAX_EVE_TIMEOUT_MS = 120_000;

export type EveProviderDisabledReason =
  | 'FEATURE_DISABLED'
  | 'MISSING_BASE_URL'
  | 'INVALID_BASE_URL'
  | 'INSECURE_BASE_URL'
  | 'INVALID_TIMEOUT';

export type EveProviderConfig =
  | {
      enabled: false;
      reason: EveProviderDisabledReason;
    }
  | {
      enabled: true;
      host: string;
      localDevelopment: boolean;
      timeoutMs: number;
    };

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * The pilot is enabled only when both the exact release flag and a safe,
 * absolute Eve base URL are present. Every malformed state remains disabled.
 */
export function readEveProviderConfig(
  environment: Readonly<Record<string, string | undefined>>
): EveProviderConfig {
  if (environment[EVE_FEATURE_FLAG_ENV] !== 'true') {
    return { enabled: false, reason: 'FEATURE_DISABLED' };
  }

  const rawHost = environment[EVE_BASE_URL_ENV]?.trim();
  if (!rawHost) {
    return { enabled: false, reason: 'MISSING_BASE_URL' };
  }

  let url: URL;
  try {
    url = new URL(rawHost);
  } catch {
    return { enabled: false, reason: 'INVALID_BASE_URL' };
  }

  const localDevelopment = isLoopbackHostname(url.hostname);
  if (
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0 ||
    url.search.length > 0 ||
    (url.protocol !== 'https:' && !(localDevelopment && url.protocol === 'http:'))
  ) {
    return {
      enabled: false,
      reason:
        url.protocol === 'http:' && !localDevelopment ? 'INSECURE_BASE_URL' : 'INVALID_BASE_URL',
    };
  }

  const rawTimeout = environment[EVE_TIMEOUT_MS_ENV]?.trim();
  const timeoutMs = rawTimeout === undefined ? DEFAULT_EVE_TIMEOUT_MS : Number(rawTimeout);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < MIN_EVE_TIMEOUT_MS ||
    timeoutMs > MAX_EVE_TIMEOUT_MS
  ) {
    return { enabled: false, reason: 'INVALID_TIMEOUT' };
  }

  return {
    enabled: true,
    host: url.toString().replace(/\/$/, ''),
    localDevelopment,
    timeoutMs,
  };
}
