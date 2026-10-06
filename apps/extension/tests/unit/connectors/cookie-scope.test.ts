/**
 * Cookie scope for LeHibou (0.2.5): the DNR Cookie header must only carry
 * cookies a browser would legitimately send to https://api.lehibou.com/api/…
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  hostOnly: boolean;
};

let jar: MockCookie[] = [];
const getAll = vi.fn(async (_query: { url?: string; domain?: string }) => jar);
const updateDynamicRules = vi.fn(async (_options: unknown) => undefined);

vi.stubGlobal('chrome', {
  cookies: { getAll },
  declarativeNetRequest: { updateDynamicRules, getDynamicRules: vi.fn(async () => []) },
});

import {
  cookieAppliesToUrl,
  injectUrlScopedCookieRule,
  serializeCookieHeader,
} from '../../../src/lib/shell/connectors/cookie-rules';
import { LeHibouConnector } from '../../../src/lib/shell/connectors/lehibou.connector';

const API_URL = 'https://api.lehibou.com/api/search/mission/list';

const cookie = (overrides: Partial<MockCookie>): MockCookie => ({
  name: 'c',
  value: 'v',
  domain: '.lehibou.com',
  path: '/',
  secure: true,
  hostOnly: false,
  ...overrides,
});

/** Realistic lehibou.com jar: only the first three may reach the API. */
const LEHIBOU_JAR: MockCookie[] = [
  cookie({ name: 'rt', value: 'refresh' }),
  cookie({ name: 'api_host_only', domain: 'api.lehibou.com', hostOnly: true }),
  cookie({ name: 'api_path', path: '/api' }),
  cookie({ name: 'www_only', domain: 'www.lehibou.com', hostOnly: true }),
  cookie({ name: 'other_sub', domain: '.blog.lehibou.com' }),
  cookie({ name: 'admin_path', path: '/admin' }),
  cookie({ name: 'apix_path', path: '/apix' }),
];

function injectedCookieHeader(): string | undefined {
  const options = updateDynamicRules.mock.calls.at(-1)?.[0] as
    | {
        addRules?: Array<{
          action: { requestHeaders: Array<{ header: string; value: string }> };
          condition: { urlFilter: string; requestDomains: string[] };
        }>;
      }
    | undefined;
  return options?.addRules?.[0]?.action.requestHeaders.find((h) => h.header === 'Cookie')?.value;
}

describe('cookieAppliesToUrl', () => {
  it('accepts parent-domain cookies and exact host-only cookies', () => {
    expect(cookieAppliesToUrl(cookie({}), API_URL)).toBe(true);
    expect(cookieAppliesToUrl(cookie({ domain: 'api.lehibou.com', hostOnly: true }), API_URL)).toBe(
      true
    );
    expect(cookieAppliesToUrl(cookie({ domain: 'lehibou.com', hostOnly: false }), API_URL)).toBe(
      true
    );
  });

  it('rejects cookies scoped to a sibling subdomain or another host', () => {
    expect(cookieAppliesToUrl(cookie({ domain: 'www.lehibou.com', hostOnly: true }), API_URL)).toBe(
      false
    );
    expect(cookieAppliesToUrl(cookie({ domain: '.blog.lehibou.com' }), API_URL)).toBe(false);
    expect(cookieAppliesToUrl(cookie({ domain: 'lehibou.com', hostOnly: true }), API_URL)).toBe(
      false
    );
    expect(cookieAppliesToUrl(cookie({ domain: '.evillehibou.com' }), API_URL)).toBe(false);
  });

  it('applies the RFC 6265 path-match', () => {
    expect(cookieAppliesToUrl(cookie({ path: '/api' }), API_URL)).toBe(true);
    expect(cookieAppliesToUrl(cookie({ path: '/api/' }), API_URL)).toBe(true);
    expect(cookieAppliesToUrl(cookie({ path: '/api/search/mission/list' }), API_URL)).toBe(true);
    expect(cookieAppliesToUrl(cookie({ path: '/apix' }), API_URL)).toBe(false);
    expect(cookieAppliesToUrl(cookie({ path: '/admin' }), API_URL)).toBe(false);
  });

  it('never sends Secure cookies over plain http', () => {
    expect(cookieAppliesToUrl(cookie({ secure: true }), 'http://api.lehibou.com/api/x')).toBe(
      false
    );
    expect(cookieAppliesToUrl(cookie({ secure: false }), 'http://api.lehibou.com/api/x')).toBe(
      true
    );
  });

  it('fails closed on malformed input', () => {
    expect(cookieAppliesToUrl(cookie({ domain: '' }), API_URL)).toBe(false);
    expect(cookieAppliesToUrl(cookie({}), 'not a url')).toBe(false);
  });
});

describe('injectUrlScopedCookieRule', () => {
  beforeEach(() => {
    jar = [...LEHIBOU_JAR];
    vi.clearAllMocks();
  });

  it('reads cookies by target URL and forwards only the in-scope ones', async () => {
    const result = await injectUrlScopedCookieRule(API_URL, `|${API_URL}`, 10, ['api.lehibou.com']);

    expect(getAll).toHaveBeenCalledWith({ url: API_URL });
    expect(result).toEqual({ success: true, cookieCount: 3 });
    expect(injectedCookieHeader()).toBe('rt=refresh; api_host_only=v; api_path=v');
  });

  it('injects no rule when no cookie is in scope', async () => {
    jar = [cookie({ name: 'www_only', domain: 'www.lehibou.com', hostOnly: true })];

    const result = await injectUrlScopedCookieRule(API_URL, `|${API_URL}`, 10, ['api.lehibou.com']);

    expect(result.success).toBe(false);
    expect(result.cookieCount).toBe(0);
    expect(updateDynamicRules).not.toHaveBeenCalled();
  });

  it('serializes the header in jar order', () => {
    expect(serializeCookieHeader([cookie({ name: 'a', value: '1' }), cookie({ name: 'b' })])).toBe(
      'a=1; b=v'
    );
  });
});

describe('LeHibouConnector.fetchMissions cookie forwarding', () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ total: 0, missions: [] }),
  }));

  beforeEach(() => {
    jar = [...LEHIBOU_JAR];
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('chrome', {
      cookies: { getAll },
      declarativeNetRequest: { updateDynamicRules, getDynamicRules: vi.fn(async () => []) },
    });
  });

  it('scopes the DNR rule to the mission list endpoint and api.lehibou.com cookies', async () => {
    const result = await new LeHibouConnector().fetchMissions(Date.now());

    expect(result.ok).toBe(true);
    expect(getAll).toHaveBeenCalledWith({ url: API_URL });
    expect(getAll).not.toHaveBeenCalledWith({ domain: '.lehibou.com' });

    const addCall = updateDynamicRules.mock.calls.find(
      ([options]) => (options as { addRules?: unknown[] }).addRules
    )?.[0] as {
      addRules: Array<{
        action: { requestHeaders: Array<{ header: string; value: string }> };
        condition: { urlFilter: string; requestDomains: string[] };
      }>;
    };
    const rule = addCall.addRules[0];
    expect(rule.condition.urlFilter).toBe(`|${API_URL}`);
    expect(rule.condition.requestDomains).toEqual(['api.lehibou.com']);
    const header = rule.action.requestHeaders.find((h) => h.header === 'Cookie')?.value ?? '';
    expect(header.split('; ').map((pair) => pair.split('=')[0])).toEqual([
      'rt',
      'api_host_only',
      'api_path',
    ]);
    expect(header).not.toContain('www_only');
    expect(header).not.toContain('other_sub');
    expect(header).not.toContain('admin_path');
  });

  it('removes the short-lived rule once the fetch completes', async () => {
    await new LeHibouConnector().fetchMissions(Date.now());

    const lastCall = updateDynamicRules.mock.calls.at(-1)?.[0] as {
      removeRuleIds?: number[];
      addRules?: unknown[];
    };
    expect(lastCall.removeRuleIds).toEqual([10]);
    expect(lastCall.addRules).toBeUndefined();
  });
});
