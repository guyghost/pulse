const DEFAULT_COPILOT_ACCOUNT_ORIGIN = 'https://missionpulse.app';
const DEFAULT_COPILOT_API_ORIGIN = 'https://copilot.missionpulse.app';

function resolveOrigin(value: string | undefined, fallback: string, isDev: boolean): string {
  const candidate = value?.trim() || fallback;
  try {
    const url = new URL(candidate);
    const devLoopback =
      isDev &&
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (
      (url.protocol !== 'https:' && !devLoopback) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return fallback;
    }
    return url.origin;
  } catch {
    return fallback;
  }
}

export interface CopilotOrigins {
  accountOrigin: string;
  apiOrigin: string;
}

export function resolveCopilotOrigins(
  accountValue: string | undefined,
  apiValue: string | undefined,
  isDev: boolean
): CopilotOrigins {
  const accountOrigin = resolveOrigin(accountValue, DEFAULT_COPILOT_ACCOUNT_ORIGIN, isDev);
  const apiOrigin = resolveOrigin(apiValue, DEFAULT_COPILOT_API_ORIGIN, isDev);
  if (!isDev && accountOrigin === apiOrigin) {
    return {
      accountOrigin: DEFAULT_COPILOT_ACCOUNT_ORIGIN,
      apiOrigin: DEFAULT_COPILOT_API_ORIGIN,
    };
  }
  return { accountOrigin, apiOrigin };
}

/** Build-time rollout. Missing or malformed values remain fail-closed. */
export function isCopilotRolloutEnabled(): boolean {
  return import.meta.env.VITE_COPILOT_ROLLOUT_ENABLED === 'true';
}

export function getCopilotOrigins(): CopilotOrigins {
  return resolveCopilotOrigins(
    import.meta.env.VITE_COPILOT_ACCOUNT_ORIGIN,
    import.meta.env.VITE_COPILOT_API_ORIGIN,
    import.meta.env.DEV
  );
}
