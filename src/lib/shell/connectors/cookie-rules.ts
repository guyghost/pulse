/**
 * Shared utilities for declarativeNetRequest cookie injection.
 * Used by connectors that need to send cross-origin cookies from the side panel.
 */

export async function injectCookieRule(
  cookieDomain: string,
  urlFilter: string,
  ruleId: number,
): Promise<void> {
  const cookies = await chrome.cookies.getAll({ domain: cookieDomain });
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  if (!cookieHeader) return;

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId],
    addRules: [{
      id: ruleId,
      priority: 2,
      action: {
        type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [
          { header: 'Cookie', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: cookieHeader },
        ],
      },
      condition: {
        urlFilter,
        resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
      },
    }],
  });
}

export async function removeCookieRule(ruleId: number): Promise<void> {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] });
  } catch {
    // Rule may not exist
  }
}
