/**
 * Shell tests: Cookie injection via declarativeNetRequest
 *
 * Tests mock chrome.cookies and chrome.declarativeNetRequest APIs.
 * These functions are in cookie-rules.ts and test the cookie injection
 * mechanism for cross-browser compatibility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Mock setup - must be done BEFORE importing the module
// =============================================================================

type MockCookie = { name: string; value: string; domain: string };

// Mock storage for cookies
let mockCookies: MockCookie[] = [];

// Mock rules storage
let mockDynamicRules: Array<{
  id: number;
  priority?: number;
  action?: unknown;
  condition?: unknown;
}> = [];

// Mock chrome.cookies.getAll
const mockCookiesGetAll = vi.fn(async (query: { domain: string }) => {
  return mockCookies.filter((c) => c.domain === query.domain || c.domain === `.${query.domain}`);
});

// Mock chrome.declarativeNetRequest.updateDynamicRules
const mockUpdateDynamicRules = vi.fn(
  async (options: { removeRuleIds?: number[]; addRules?: unknown[] }) => {
    // Remove rules
    if (options.removeRuleIds) {
      mockDynamicRules = mockDynamicRules.filter((r) => !options.removeRuleIds?.includes(r.id));
    }
    // Add rules
    if (options.addRules) {
      for (const rule of options.addRules) {
        const typedRule = rule as { id: number };
        // Remove existing rule with same ID first
        mockDynamicRules = mockDynamicRules.filter((r) => r.id !== typedRule.id);
        mockDynamicRules.push(typedRule as (typeof mockDynamicRules)[number]);
      }
    }
  }
);

// Mock chrome.declarativeNetRequest.getDynamicRules
const mockGetDynamicRules = vi.fn(async () => {
  return mockDynamicRules;
});

// Setup global chrome mock
vi.stubGlobal('chrome', {
  cookies: {
    getAll: mockCookiesGetAll,
  },
  declarativeNetRequest: {
    updateDynamicRules: mockUpdateDynamicRules,
    getDynamicRules: mockGetDynamicRules,
  },
});

// Import AFTER setting up mocks
import {
  injectCookieRule,
  removeCookieRule,
  verifyCookieRule,
  getCookieCount,
  getCookieNames,
} from '../../../src/lib/shell/connectors/cookie-rules';

// =============================================================================
// Test suites
// =============================================================================

describe('injectCookieRule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies = [];
    mockDynamicRules = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns success=true when cookies are found and rule is injected', async () => {
    // Setup: Add mock cookies
    mockCookies = [
      { name: 'session', value: 'abc123', domain: '.example.com' },
      { name: 'token', value: 'xyz789', domain: '.example.com' },
    ];

    const result = await injectCookieRule('.example.com', '*://api.example.com/*', 100);

    expect(result.success).toBe(true);
    expect(result.cookieCount).toBe(2);
    expect(result.warning).toBeUndefined();
    expect(mockCookiesGetAll).toHaveBeenCalledWith({ domain: '.example.com' });
    expect(mockUpdateDynamicRules).toHaveBeenCalled();
  });

  it('returns success=false when no cookies found (empty cookie jar)', async () => {
    // Setup: No cookies
    mockCookies = [];

    const result = await injectCookieRule('.example.com', '*://api.example.com/*', 100);

    expect(result.success).toBe(false);
    expect(result.cookieCount).toBe(0);
    expect(result.warning).toContain('No cookies found');
    expect(mockUpdateDynamicRules).not.toHaveBeenCalled();
  });

  it('serializes cookies correctly as Cookie header', async () => {
    // Setup: Multiple cookies
    mockCookies = [
      { name: 'session_id', value: 'session-value', domain: '.example.com' },
      { name: 'auth_token', value: 'auth-value', domain: '.example.com' },
    ];

    await injectCookieRule('.example.com', '*://api.example.com/*', 100);

    // Verify the call to updateDynamicRules
    expect(mockUpdateDynamicRules).toHaveBeenCalled();
    const callArgs = mockUpdateDynamicRules.mock.calls[0]?.[0];

    expect(callArgs?.removeRuleIds).toEqual([100]);
    expect(callArgs?.addRules).toHaveLength(1);

    const addedRule = callArgs?.addRules?.[0] as {
      id: number;
      action: { requestHeaders: Array<{ header: string; value: string }> };
      condition: { urlFilter: string };
    };

    expect(addedRule.id).toBe(100);
    expect(addedRule.action.requestHeaders[0]?.header).toBe('Cookie');
    expect(addedRule.action.requestHeaders[0]?.value).toBe(
      'session_id=session-value; auth_token=auth-value'
    );
    expect(addedRule.condition.urlFilter).toBe('*://api.example.com/*');
  });

  it('creates rule with correct priority and resourceType', async () => {
    mockCookies = [{ name: 'test', value: 'val', domain: '.example.com' }];

    await injectCookieRule('.example.com', 'api.example.com', 200);

    const callArgs = mockUpdateDynamicRules.mock.calls[0]?.[0];
    const addedRule = callArgs?.addRules?.[0] as {
      priority: number;
      action: { type: string };
      condition: { resourceTypes: string[] };
    };

    expect(addedRule.priority).toBe(2);
    expect(addedRule.action.type).toBe('modifyHeaders');
    expect(addedRule.condition.resourceTypes).toContain('xmlhttprequest');
  });

  it('removes existing rule with same ID before adding new one', async () => {
    mockCookies = [{ name: 'test', value: 'val', domain: '.example.com' }];

    // Pre-existing rule
    mockDynamicRules = [{ id: 100, priority: 1 }];

    await injectCookieRule('.example.com', '*://api.example.com/*', 100);

    const callArgs = mockUpdateDynamicRules.mock.calls[0]?.[0];
    expect(callArgs?.removeRuleIds).toEqual([100]);
    expect(callArgs?.addRules).toHaveLength(1);
  });
});

describe('removeCookieRule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDynamicRules = [{ id: 100 }, { id: 200 }];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('removes existing rule successfully', async () => {
    await removeCookieRule(100);

    expect(mockUpdateDynamicRules).toHaveBeenCalledWith({ removeRuleIds: [100] });
  });

  it('handles non-existent rule gracefully', async () => {
    // Should not throw even if rule doesn't exist
    await expect(removeCookieRule(999)).resolves.toBeUndefined();

    expect(mockUpdateDynamicRules).toHaveBeenCalledWith({ removeRuleIds: [999] });
  });

  it('handles errors gracefully without throwing', async () => {
    mockUpdateDynamicRules.mockRejectedValueOnce(new Error('API error'));

    // Should not throw
    await expect(removeCookieRule(100)).resolves.toBeUndefined();
  });
});

describe('verifyCookieRule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDynamicRules = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when rule exists', async () => {
    mockDynamicRules = [{ id: 100 }, { id: 200 }];

    const result = await verifyCookieRule(100);

    expect(result).toBe(true);
    expect(mockGetDynamicRules).toHaveBeenCalled();
  });

  it('returns false when rule does not exist', async () => {
    mockDynamicRules = [{ id: 100 }, { id: 200 }];

    const result = await verifyCookieRule(999);

    expect(result).toBe(false);
  });

  it('returns false when rules array is empty', async () => {
    mockDynamicRules = [];

    const result = await verifyCookieRule(100);

    expect(result).toBe(false);
  });

  it('returns false on error', async () => {
    mockGetDynamicRules.mockRejectedValueOnce(new Error('API error'));

    const result = await verifyCookieRule(100);

    expect(result).toBe(false);
  });
});

describe('getCookieCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct count when cookies exist', async () => {
    mockCookies = [
      { name: 'session', value: 'val1', domain: '.example.com' },
      { name: 'token', value: 'val2', domain: '.example.com' },
      { name: 'csrf', value: 'val3', domain: '.example.com' },
    ];

    const count = await getCookieCount('.example.com');

    expect(count).toBe(3);
    expect(mockCookiesGetAll).toHaveBeenCalledWith({ domain: '.example.com' });
  });

  it('returns 0 when no cookies', async () => {
    mockCookies = [];

    const count = await getCookieCount('.example.com');

    expect(count).toBe(0);
  });

  it('returns 0 on error', async () => {
    mockCookiesGetAll.mockRejectedValueOnce(new Error('API error'));

    const count = await getCookieCount('.example.com');

    expect(count).toBe(0);
  });

  it('filters by domain correctly', async () => {
    mockCookies = [
      { name: 'a', value: '1', domain: '.example.com' },
      { name: 'b', value: '2', domain: '.other.com' },
      { name: 'c', value: '3', domain: '.example.com' },
    ];

    const count = await getCookieCount('.example.com');

    expect(count).toBe(2);
  });
});

describe('getCookieNames', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns array of cookie names', async () => {
    mockCookies = [
      { name: 'session', value: 'val1', domain: '.example.com' },
      { name: 'token', value: 'val2', domain: '.example.com' },
    ];

    const names = await getCookieNames('.example.com');

    expect(names).toEqual(['session', 'token']);
    expect(mockCookiesGetAll).toHaveBeenCalledWith({ domain: '.example.com' });
  });

  it('returns empty array when no cookies', async () => {
    mockCookies = [];

    const names = await getCookieNames('.example.com');

    expect(names).toEqual([]);
  });

  it('returns empty array on error', async () => {
    mockCookiesGetAll.mockRejectedValueOnce(new Error('API error'));

    const names = await getCookieNames('.example.com');

    expect(names).toEqual([]);
  });
});

// =============================================================================
// Edge cases and error handling
// =============================================================================

describe('edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies = [];
    mockDynamicRules = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('injectCookieRule handles cookies with special characters in values', async () => {
    mockCookies = [{ name: 'session', value: 'abc=123&xyz=456', domain: '.example.com' }];

    const result = await injectCookieRule('.example.com', '*://api.example.com/*', 100);

    expect(result.success).toBe(true);

    const callArgs = mockUpdateDynamicRules.mock.calls[0]?.[0];
    const addedRule = callArgs?.addRules?.[0] as {
      action: { requestHeaders: Array<{ value: string }> };
    };

    expect(addedRule.action.requestHeaders[0]?.value).toBe('session=abc=123&xyz=456');
  });

  it('injectCookieRule handles single cookie', async () => {
    mockCookies = [{ name: 'single', value: 'value', domain: '.example.com' }];

    const result = await injectCookieRule('.example.com', '*://api.example.com/*', 100);

    expect(result.success).toBe(true);
    expect(result.cookieCount).toBe(1);
  });

  it('verifyCookieRule matches exact rule ID', async () => {
    mockDynamicRules = [{ id: 99 }, { id: 100 }, { id: 101 }];

    const result = await verifyCookieRule(100);

    expect(result).toBe(true);
  });

  it('verifyCookieRule does not match partial IDs', async () => {
    mockDynamicRules = [{ id: 1000 }];

    const result = await verifyCookieRule(100);

    expect(result).toBe(false);
  });
});
