/**
 * Shared utilities for declarativeNetRequest cookie injection.
 * Used by connectors that need to send cross-origin cookies from the extension context.
 */

/** Result of injectCookieRule operation */
export interface CookieRuleResult {
  /** Whether the rule was successfully injected */
  success: boolean;
  /** Number of cookies found for the domain */
  cookieCount: number;
  /** Warning message if cookies were empty (possible partitioning issue) */
  warning?: string;
}

export const CONNECTOR_DYNAMIC_RULE_IDS = [1, 2, 3, 10, 11] as const;

export interface RequestHeaderRuleHeader {
  header: string;
  value: string;
}

export interface RequestHeaderRuleOptions {
  ruleId: number;
  urlFilter: string;
  requestDomains: string[];
  requestHeaders: RequestHeaderRuleHeader[];
  priority?: number;
}

export const injectRequestHeaderRule = async ({
  ruleId,
  urlFilter,
  requestDomains,
  requestHeaders,
  priority = 2,
}: RequestHeaderRuleOptions): Promise<void> => {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId],
    addRules: [
      {
        id: ruleId,
        priority,
        action: {
          type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
          requestHeaders: requestHeaders.map(({ header, value }) => ({
            header,
            operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
            value,
          })),
        },
        condition: {
          urlFilter,
          requestDomains,
          resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
        },
      },
    ],
  });
};

/** Minimal cookie shape needed to decide whether a cookie belongs to a URL. */
export interface ScopedCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  hostOnly?: boolean;
}

/**
 * Pure RFC 6265 scope check: would a browser attach `cookie` to a request for
 * `targetUrl`? Applies the domain-match (host-only cookies need an exact host,
 * domain cookies match the host or one of its parent domains), the path-match
 * and the `Secure` attribute. Used as a defence-in-depth filter on top of
 * `chrome.cookies.getAll({ url })`, so a forwarded Cookie header never carries
 * a cookie scoped to another subdomain or path.
 */
export const cookieAppliesToUrl = (cookie: ScopedCookie, targetUrl: string): boolean => {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const rawDomain = cookie.domain.toLowerCase();
  const domain = rawDomain.replace(/^\./, '');
  if (domain.length === 0) {
    return false;
  }
  const hostOnly = cookie.hostOnly ?? !rawDomain.startsWith('.');
  const domainMatches = hostOnly ? host === domain : host === domain || host.endsWith(`.${domain}`);
  if (!domainMatches) {
    return false;
  }
  if (cookie.secure && url.protocol !== 'https:') {
    return false;
  }
  const cookiePath = cookie.path && cookie.path.startsWith('/') ? cookie.path : '/';
  const requestPath = url.pathname || '/';
  if (requestPath === cookiePath) {
    return true;
  }
  if (!requestPath.startsWith(cookiePath)) {
    return false;
  }
  return cookiePath.endsWith('/') || requestPath.charAt(cookiePath.length) === '/';
};

/** Serializes cookies as a `Cookie` request header value. */
export const serializeCookieHeader = (cookies: readonly ScopedCookie[]): string =>
  cookies.map((c) => `${c.name}=${c.value}`).join('; ');

/**
 * Injects a short-lived declarativeNetRequest rule carrying ONLY the cookies a
 * browser would legitimately send to `targetUrl` (domain, path and Secure
 * compatible). Cookies are read with `chrome.cookies.getAll({ url })`, which
 * applies the browser's own matching, then re-checked with cookieAppliesToUrl.
 *
 * @param targetUrl - Exact API URL the extension is about to call
 * @param urlFilter - URL filter for the rule; keep it as narrow as `targetUrl`
 * @param ruleId - Unique rule ID for this connector
 * @param requestDomains - Exact request domains where the rule may apply
 * @param additionalRequestHeaders - Additional headers to set for this same request window
 */
export const injectUrlScopedCookieRule = async (
  targetUrl: string,
  urlFilter: string,
  ruleId: number,
  requestDomains: string[],
  additionalRequestHeaders: RequestHeaderRuleHeader[] = []
): Promise<CookieRuleResult> => {
  const candidates = await chrome.cookies.getAll({ url: targetUrl });
  const cookies = candidates.filter((cookie) => cookieAppliesToUrl(cookie, targetUrl));
  const cookieCount = cookies.length;

  if (cookieCount === 0) {
    const warning = `No cookies in scope for ${new URL(targetUrl).host} — not signed in or cookie partitioning`;
    if (import.meta.env.DEV) {
      console.warn(`[cookie-rules] ${warning}`);
    }
    return { success: false, cookieCount, warning };
  }

  await injectRequestHeaderRule({
    ruleId,
    urlFilter,
    requestDomains,
    requestHeaders: [
      { header: 'Cookie', value: serializeCookieHeader(cookies) },
      ...additionalRequestHeaders,
    ],
  });

  return { success: true, cookieCount };
};

/**
 * Injects a declarativeNetRequest rule to attach cookies to cross-origin requests.
 * Prefer injectUrlScopedCookieRule: this variant forwards every cookie of
 * `cookieDomain`, whatever its subdomain or path scope.
 * This is necessary because `credentials: 'include'` from extension context
 * does not reliably forward cookies on non-Chrome Chromium browsers.
 *
 * @param cookieDomain - Domain to fetch cookies from (e.g., '.example.com')
 * @param urlFilter - URL filter pattern for the rule (e.g., 'api.example.com')
 * @param ruleId - Unique rule ID for this connector
 * @param requestDomains - Exact request domains where the rule may apply
 * @param additionalRequestHeaders - Additional headers to set for this same request window
 * @returns CookieRuleResult with success status and diagnostics
 */
export const injectCookieRule = async (
  cookieDomain: string,
  urlFilter: string,
  ruleId: number,
  requestDomains: string[],
  additionalRequestHeaders: RequestHeaderRuleHeader[] = []
): Promise<CookieRuleResult> => {
  const cookies = await chrome.cookies.getAll({ domain: cookieDomain });
  const cookieCount = cookies.length;
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  // Warn if no cookies found — possible cookie partitioning issue
  if (cookieCount === 0) {
    const warning = `No cookies found for ${cookieDomain} — possible cookie partitioning issue`;
    if (import.meta.env.DEV) {
      console.warn(`[cookie-rules] ${warning}`);
    }
    return { success: false, cookieCount, warning };
  }

  // Log found cookies for diagnostics
  if (import.meta.env.DEV) {
    const cookieNames = cookies.map((c) => c.name).join(', ');
    console.debug(
      `[cookie-rules] Found ${cookieCount} cookies for ${cookieDomain}: ${cookieNames}`
    );
  }

  await injectRequestHeaderRule({
    ruleId,
    urlFilter,
    requestDomains,
    requestHeaders: [{ header: 'Cookie', value: cookieHeader }, ...additionalRequestHeaders],
  });

  return { success: true, cookieCount };
};

/**
 * Removes a previously injected cookie rule
 *
 * @param ruleId - The rule ID to remove
 */
export const removeCookieRule = async (ruleId: number): Promise<void> => {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] });
  } catch {
    // Rule may not exist — ignore
  }
};

export const clearConnectorDynamicRules = async (
  ruleIds: readonly number[] = CONNECTOR_DYNAMIC_RULE_IDS
): Promise<void> => {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [...ruleIds] });
  } catch {
    // Cleanup is best-effort; connectors re-inject their short-lived rules when needed.
  }
};

/**
 * Verifies that a cookie rule was successfully applied
 * Used for diagnostic purposes to confirm the rule is active
 *
 * @param ruleId - The rule ID to verify
 * @returns true if the rule exists and is active
 */
export const verifyCookieRule = async (ruleId: number): Promise<boolean> => {
  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return rules.some((r) => r.id === ruleId);
  } catch {
    return false;
  }
};

/**
 * Gets the number of cookies for a domain
 * Useful for diagnostic logging when debugging cookie partitioning issues
 *
 * @param domain - Domain to count cookies for
 * @returns Number of cookies found, or 0 on error
 */
export const getCookieCount = async (domain: string): Promise<number> => {
  try {
    const cookies = await chrome.cookies.getAll({ domain });
    return cookies.length;
  } catch {
    return 0;
  }
};

/**
 * Gets cookie names for a domain for diagnostic logging
 *
 * @param domain - Domain to get cookie names for
 * @returns Array of cookie names
 */
export const getCookieNames = async (domain: string): Promise<string[]> => {
  try {
    const cookies = await chrome.cookies.getAll({ domain });
    return cookies.map((c) => c.name);
  } catch {
    return [];
  }
};
