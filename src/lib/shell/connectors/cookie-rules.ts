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

/**
 * Injects a declarativeNetRequest rule to attach cookies to cross-origin requests.
 * This is necessary because `credentials: 'include'` from extension context
 * does not reliably forward cookies on non-Chrome Chromium browsers.
 *
 * @param cookieDomain - Domain to fetch cookies from (e.g., '.example.com')
 * @param urlFilter - URL filter pattern for the rule (e.g., 'api.example.com')
 * @param ruleId - Unique rule ID for this connector
 * @returns CookieRuleResult with success status and diagnostics
 */
export const injectCookieRule = async (
  cookieDomain: string,
  urlFilter: string,
  ruleId: number
): Promise<CookieRuleResult> => {
  const cookies = await chrome.cookies.getAll({ domain: cookieDomain });
  const cookieCount = cookies.length;
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  // Warn if no cookies found — possible cookie partitioning issue
  if (cookieCount === 0) {
    const warning = `No cookies found for ${cookieDomain} — possible cookie partitioning issue`;
    console.warn(`[cookie-rules] ${warning}`);
    return { success: false, cookieCount, warning };
  }

  // Log found cookies for diagnostics
  if (import.meta.env.DEV) {
    const cookieNames = cookies.map((c) => c.name).join(', ');
    console.log(`[cookie-rules] Found ${cookieCount} cookies for ${cookieDomain}: ${cookieNames}`);
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId],
    addRules: [
      {
        id: ruleId,
        priority: 2,
        action: {
          type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
          requestHeaders: [
            {
              header: 'Cookie',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: cookieHeader,
            },
          ],
        },
        condition: {
          urlFilter,
          resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
        },
      },
    ],
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
