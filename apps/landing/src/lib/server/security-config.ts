import { env } from '$env/dynamic/private';

const DEFAULT_WINDOW_SECONDS = 10 * 60;

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
export function getSecurityServerConfig() {
  return {
    rateLimitHashSecret:
      typeof env.RATE_LIMIT_HASH_SECRET === 'string' && env.RATE_LIMIT_HASH_SECRET.length >= 32
        ? env.RATE_LIMIT_HASH_SECRET
        : null,
    rateLimitWindowSeconds: parseBoundedInteger(
      env.EXTENSION_LINK_RATE_LIMIT_WINDOW_SECONDS,
      DEFAULT_WINDOW_SECONDS,
      60,
      3600
    ),
    rateLimits: {
      extension_link_start_ip: parseBoundedInteger(env.EXTENSION_LINK_START_IP_LIMIT, 10, 1, 100),
      extension_link_start_install: parseBoundedInteger(
        env.EXTENSION_LINK_START_INSTALL_LIMIT,
        3,
        1,
        100
      ),
      extension_link_status_ip: parseBoundedInteger(
        env.EXTENSION_LINK_STATUS_IP_LIMIT,
        120,
        10,
        1000
      ),
      extension_link_status_link: parseBoundedInteger(
        env.EXTENSION_LINK_STATUS_LINK_LIMIT,
        60,
        10,
        1000
      ),
      extension_link_resolution_user: parseBoundedInteger(
        env.EXTENSION_LINK_RESOLUTION_USER_LIMIT,
        20,
        1,
        100
      ),
    },
    retention: {
      rateLimitHours: parseBoundedInteger(env.RETENTION_RATE_LIMIT_HOURS, 24, 1, 168),
      extensionLinkHours: parseBoundedInteger(env.RETENTION_EXTENSION_LINK_HOURS, 24, 1, 168),
      terminalCheckoutDays: parseBoundedInteger(env.RETENTION_TERMINAL_CHECKOUT_DAYS, 90, 30, 365),
      billingEventDays: parseBoundedInteger(env.RETENTION_BILLING_EVENT_DAYS, 395, 365, 2555),
    },
  } as const;
}
