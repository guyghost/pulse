import { describe, expect, it, vi } from 'vitest';
import { parseLinkedInProfilePayload } from '../../../src/lib/core/profile-extractors/linkedin-parser';
import {
  LinkedInProfileExtractor,
  type LinkedInProfileExtractorDependencies,
} from '../../../src/lib/shell/profile-extractors/linkedin.extractor';

type LinkedInChromeDouble = ConstructorParameters<typeof LinkedInProfileExtractor>[0];

const linkedinTab = {
  id: 42,
  url: 'https://www.linkedin.com/in/example/',
} as chrome.tabs.Tab;

const linkedInSessionCookie: chrome.cookies.Cookie = {
  domain: '.linkedin.com',
  hostOnly: false,
  httpOnly: true,
  name: 'li_at',
  path: '/',
  sameSite: 'unspecified',
  secure: true,
  session: true,
  storeId: '0',
  value: 'session',
};

function createChromeDouble(
  overrides: Partial<{
    contains: (permissions: chrome.permissions.Permissions) => Promise<boolean>;
    request: (permissions: chrome.permissions.Permissions) => Promise<boolean>;
    query: () => Promise<chrome.tabs.Tab[]>;
    sourceSnapshot: unknown;
    createDetailTab: () => Promise<chrome.tabs.Tab>;
    detailSnapshot: unknown;
    getAllCookies: () => Promise<chrome.cookies.Cookie[]>;
  }> = {}
): LinkedInChromeDouble {
  const detailTab = {
    id: 99,
    url: 'https://www.linkedin.com/in/example/details/experience/',
    status: 'complete',
  } as chrome.tabs.Tab;

  return {
    permissions: {
      contains: vi.fn(overrides.contains ?? (async () => true)),
      request: vi.fn(overrides.request ?? (async () => true)),
    },
    tabs: {
      create: vi.fn(overrides.createDetailTab ?? (async () => detailTab)),
      get: vi.fn(async () => linkedinTab),
      query: vi.fn(overrides.query ?? (async () => [linkedinTab])),
      remove: vi.fn(async () => undefined),
      onUpdated: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      onRemoved: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    scripting: {
      executeScript: vi.fn(async (injection: { target: { tabId: number } }) => [
        {
          frameId: 0,
          result:
            injection.target.tabId === 99
              ? (overrides.detailSnapshot ?? {
                  kind: 'ready',
                  experiences: [
                    {
                      title: 'Technical Lead',
                      company: 'ScaleOps',
                      employmentType: 'Freelance',
                    },
                    {
                      title: 'Software Engineer',
                      company: 'Acme',
                      employmentType: 'Permanent',
                    },
                  ],
                })
              : (overrides.sourceSnapshot ?? {
                  profileUrl: 'https://www.linkedin.com/in/example/',
                  sections: {
                    headline: 'Lead Svelte',
                    summary: 'Frontend senior',
                    experiences: [
                      {
                        title: 'Incomplete visible row',
                        company: 'Profile summary only',
                      },
                    ],
                    skills: ['Svelte', 'TypeScript'],
                    education: [],
                    links: [],
                  },
                }),
        },
      ]),
    },
    cookies: {
      getAll: vi.fn(overrides.getAllCookies ?? (async () => [linkedInSessionCookie])),
    },
  } satisfies LinkedInChromeDouble;
}

function extractorCode(result: Awaited<ReturnType<LinkedInProfileExtractor['extractProfile']>>) {
  return result.ok ? null : result.error.context?.profileExtractorCode;
}

function extractorMessage(result: Awaited<ReturnType<LinkedInProfileExtractor['extractProfile']>>) {
  return result.ok ? null : result.error.message;
}

describe('LinkedInProfileExtractor', () => {
  it('detects an existing LinkedIn browser session without storing credentials', async () => {
    const extractor = new LinkedInProfileExtractor(createChromeDouble());

    await expect(extractor.detectSession(1779436800000)).resolves.toEqual({
      ok: true,
      value: true,
    });
  });

  it('extracts the active LinkedIn profile tab into a canonical draft', async () => {
    const chromeDouble = createChromeDouble();
    const extractor = new LinkedInProfileExtractor(chromeDouble);

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected success');
    }
    expect(result.value).toMatchObject({
      title: 'Lead Svelte',
      summary: 'Frontend senior',
      source: 'linkedin',
      capturedAt: '2026-05-22T08:00:00.000Z',
    });
    expect(result.value.experiences.map((item) => item.title)).toEqual([
      'Technical Lead',
      'Software Engineer',
    ]);
    expect(result.value.experiences[0].employmentType).toBe('Freelance');
    expect(chromeDouble.tabs?.create).toHaveBeenCalledWith(
      expect.objectContaining({ active: false })
    );
    expect(chromeDouble.tabs?.remove).toHaveBeenCalledWith(99);
  });

  it('routes a complete detail payload through the injected canonical parser', async () => {
    const parseLinkedInProfile = vi.fn(parseLinkedInProfilePayload);
    const extractor = new LinkedInProfileExtractor(createChromeDouble(), {
      parseLinkedInProfilePayload: parseLinkedInProfile,
    });

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(true);
    expect(parseLinkedInProfile).toHaveBeenCalledTimes(1);
  });

  it('returns permission_required when the LinkedIn origin is not granted and never calls request from the service worker', async () => {
    const request = vi.fn(async () => true);
    const extractor = new LinkedInProfileExtractor(
      createChromeDouble({
        // scripting/activeTab (declared permissions) are contained; the LinkedIn
        // origin (optional_host_permissions) is not.
        contains: async (permissions) => Boolean(permissions.permissions?.length),
        request,
      })
    );

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(false);
    expect(extractorCode(result)).toBe('permission_required');
    // MV3 invariant: chrome.permissions.request cannot run in the service worker.
    expect(request).not.toHaveBeenCalled();
  });

  it('returns profile_not_found when the active tab is not a LinkedIn profile', async () => {
    const extractor = new LinkedInProfileExtractor(
      createChromeDouble({
        query: async () => [{ id: 9, url: 'https://www.linkedin.com/feed/' } as chrome.tabs.Tab],
      })
    );

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(false);
    expect(extractorCode(result)).toBe('profile_not_found');
  });

  it('returns profile_not_found when the active tab url is undefined despite permission being granted', async () => {
    // With the LinkedIn host permission granted, tab.url is populated for
    // LinkedIn tabs but stays undefined for non-LinkedIn tabs (no host match).
    const extractor = new LinkedInProfileExtractor(
      createChromeDouble({
        query: async () => [{ id: 9 } as chrome.tabs.Tab],
      })
    );

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(false);
    expect(extractorCode(result)).toBe('profile_not_found');
  });

  it('returns permission_required when scripting or activeTab is missing', async () => {
    const extractor = new LinkedInProfileExtractor(
      createChromeDouble({
        contains: async () => false,
      })
    );

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(false);
    expect(extractorCode(result)).toBe('permission_required');
  });

  it('returns session_required when LinkedIn redirects to login', async () => {
    const extractor = new LinkedInProfileExtractor(
      createChromeDouble({
        query: async () => [{ id: 9, url: 'https://www.linkedin.com/login' } as chrome.tabs.Tab],
      })
    );

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(false);
    expect(extractorCode(result)).toBe('session_required');
    expect(extractorMessage(result)).toBe(
      'Votre session LinkedIn a expiré. Reconnectez-vous à LinkedIn puis relancez l’import.'
    );
  });

  it('returns session_required when the active profile tab has no LinkedIn session cookie', async () => {
    const chromeDouble = createChromeDouble({
      getAllCookies: async () => [],
    });
    const extractor = new LinkedInProfileExtractor(chromeDouble);

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(false);
    expect(extractorCode(result)).toBe('session_required');
    expect(extractorMessage(result)).toBe(
      'Votre session LinkedIn a expiré. Reconnectez-vous à LinkedIn puis relancez l’import.'
    );
    expect(chromeDouble.scripting?.executeScript).not.toHaveBeenCalled();
  });

  it('returns rate_limited_or_blocked when LinkedIn shows a checkpoint', async () => {
    const extractor = new LinkedInProfileExtractor(
      createChromeDouble({
        query: async () => [
          { id: 9, url: 'https://www.linkedin.com/checkpoint/challenge/' } as chrome.tabs.Tab,
        ],
      })
    );

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(false);
    expect(extractorCode(result)).toBe('rate_limited_or_blocked');
    expect(extractorMessage(result)).toBe(
      'LinkedIn demande une vérification de sécurité. Terminez cette vérification dans LinkedIn puis relancez l’import.'
    );
  });

  it('returns rate_limited_or_blocked when LinkedIn serves a challenge DOM on a profile URL', async () => {
    const chromeDouble = createChromeDouble({
      sourceSnapshot: {
        profileUrl: 'https://www.linkedin.com/in/example/',
        blockedReason: 'security verification required',
        sections: {
          experiences: [],
          skills: [],
          education: [],
          links: [],
        },
      },
    });
    const extractor = new LinkedInProfileExtractor(chromeDouble);

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(false);
    expect(extractorCode(result)).toBe('rate_limited_or_blocked');
    expect(extractorMessage(result)).toBe(
      'LinkedIn demande une vérification de sécurité. Terminez cette vérification dans LinkedIn puis relancez l’import.'
    );
    expect(chromeDouble.tabs?.create).not.toHaveBeenCalled();
  });

  it('returns the detail failure before the canonical parser can accept source rows', async () => {
    const chromeDouble = createChromeDouble({
      createDetailTab: async () => {
        throw new Error('detail tab unavailable');
      },
    });
    const parseLinkedInProfile = vi.fn(parseLinkedInProfilePayload);
    const dependencies: LinkedInProfileExtractorDependencies = {
      parseLinkedInProfilePayload: parseLinkedInProfile,
    };
    const extractor = new LinkedInProfileExtractor(chromeDouble, dependencies);

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(false);
    expect(extractorCode(result)).toBe('detail_page_unavailable');
    expect(chromeDouble.scripting?.executeScript).toHaveBeenCalledTimes(1);
    expect(chromeDouble.tabs?.remove).not.toHaveBeenCalled();
    expect(parseLinkedInProfile).not.toHaveBeenCalled();
  });

  it('returns dom_changed when LinkedIn returns an empty sanitized payload', async () => {
    const extractor = new LinkedInProfileExtractor(
      createChromeDouble({
        sourceSnapshot: {
          profileUrl: 'https://www.linkedin.com/in/example/',
          sections: {
            experiences: [],
            skills: [],
            education: [],
            links: [],
          },
        },
        detailSnapshot: {
          kind: 'empty',
          experiences: [],
        },
      })
    );

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(false);
    expect(extractorCode(result)).toBe('dom_changed');
  });
});
