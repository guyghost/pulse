import { describe, expect, it, vi } from 'vitest';
import { LinkedInProfileExtractor } from '../../../src/lib/shell/profile-extractors/linkedin.extractor';

type LinkedInChromeDouble = ConstructorParameters<typeof LinkedInProfileExtractor>[0];

const linkedinTab = {
  id: 42,
  url: 'https://www.linkedin.com/in/example/',
} as chrome.tabs.Tab;

function createChromeDouble(
  overrides: Partial<{
    contains: () => Promise<boolean>;
    query: () => Promise<chrome.tabs.Tab[]>;
    executeScript: () => Promise<chrome.scripting.InjectionResult<unknown>[]>;
    getAllCookies: () => Promise<chrome.cookies.Cookie[]>;
  }> = {}
): LinkedInChromeDouble {
  return {
    permissions: {
      contains: vi.fn(overrides.contains ?? (async () => true)),
    },
    tabs: {
      get: vi.fn(async () => linkedinTab),
      query: vi.fn(overrides.query ?? (async () => [linkedinTab])),
    },
    scripting: {
      executeScript: vi.fn(
        overrides.executeScript ??
          (async () => [
            {
              frameId: 0,
              result: {
                profileUrl: 'https://www.linkedin.com/in/example/',
                sections: {
                  headline: 'Lead Svelte',
                  summary: 'Frontend senior',
                  experiences: [{ title: 'Lead Frontend', company: 'ScaleOps' }],
                  skills: ['Svelte', 'TypeScript'],
                  education: [],
                  links: [],
                },
              },
            },
          ])
      ),
    },
    cookies: {
      getAll: vi.fn(
        overrides.getAllCookies ??
          (async () => [{ name: 'li_at' } as unknown as chrome.cookies.Cookie])
      ),
    },
  } as unknown as LinkedInChromeDouble;
}

function extractorCode(result: Awaited<ReturnType<LinkedInProfileExtractor['extractProfile']>>) {
  return result.ok ? null : result.error.context?.profileExtractorCode;
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
    const extractor = new LinkedInProfileExtractor(createChromeDouble());

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        title: 'Lead Svelte',
        summary: 'Frontend senior',
        source: 'linkedin',
        capturedAt: '2026-05-22T08:00:00.000Z',
      });
      expect(result.value.experiences[0]).toMatchObject({
        title: 'Lead Frontend',
        company: 'ScaleOps',
      });
    }
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

  it('returns dom_changed when LinkedIn returns an empty sanitized payload', async () => {
    const extractor = new LinkedInProfileExtractor(
      createChromeDouble({
        executeScript: async () => [
          {
            frameId: 0,
            result: {
              profileUrl: 'https://www.linkedin.com/in/example/',
              sections: {
                experiences: [],
                skills: [],
                education: [],
                links: [],
              },
            },
          },
        ],
      })
    );

    const result = await extractor.extractProfile(1779436800000);

    expect(result.ok).toBe(false);
    expect(extractorCode(result)).toBe('dom_changed');
  });
});
