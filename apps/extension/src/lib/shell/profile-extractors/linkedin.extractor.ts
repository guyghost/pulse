import { err, ok, type Result } from '../../core/errors/result';
import type { AppError } from '../../core/errors/app-error';
import { parseLinkedInProfilePayload } from '../../core/profile-extractors/linkedin-parser';
import type {
  CanonicalCandidateProfileDraft,
  RawEducation,
  RawExperience,
  RawProfileLink,
} from '../../core/profile-extractors/types';
import type { PlatformProfileExtractor } from './platform-profile-extractor';
import {
  createProfileExtractorError,
  type ProfileExtractorErrorCode,
} from './profile-extractor-errors';

interface LinkedInDomProfileSnapshot {
  profileUrl: string;
  blockedReason?: string;
  sections: {
    headline?: string;
    summary?: string;
    experiences: RawExperience[];
    skills: string[];
    education: RawEducation[];
    links: RawProfileLink[];
  };
}

interface ChromeLike {
  cookies?: {
    getAll(details: chrome.cookies.GetAllDetails): Promise<chrome.cookies.Cookie[]>;
  };
  permissions?: {
    contains(permissions: chrome.permissions.Permissions): Promise<boolean>;
    request?(permissions: chrome.permissions.Permissions): Promise<boolean>;
  };
  scripting?: {
    executeScript(
      injection: chrome.scripting.ScriptInjection<[], LinkedInDomProfileSnapshot>
    ): Promise<chrome.scripting.InjectionResult<LinkedInDomProfileSnapshot>[]>;
  };
  tabs?: {
    get(tabId: number): Promise<chrome.tabs.Tab>;
    query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>;
  };
}

function getChromeApi(): ChromeLike {
  return typeof chrome === 'undefined' ? {} : chrome;
}

function isLinkedInProfileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.linkedin.com' && parsed.pathname.startsWith('/in/');
  } catch {
    return false;
  }
}

function classifyLinkedInUrl(url: string): ProfileExtractorErrorCode | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'www.linkedin.com') {
      return 'profile_not_found';
    }
    if (parsed.pathname.includes('/login') || parsed.pathname.includes('/uas/login')) {
      return 'session_required';
    }
    if (parsed.pathname.includes('/checkpoint') || parsed.pathname.includes('/challenge')) {
      return 'rate_limited_or_blocked';
    }
    return isLinkedInProfileUrl(url) ? null : 'profile_not_found';
  } catch {
    return 'profile_not_found';
  }
}

function extractLinkedInProfileFromDom(): LinkedInDomProfileSnapshot {
  const clean = (value: string | null | undefined): string =>
    (value ?? '').replace(/\s+/g, ' ').trim();
  const blockedReasonFromText = (value: string): string | null => {
    const text = value.toLowerCase();
    if (text.includes('security verification')) {
      return 'security verification required';
    }
    if (text.includes('unusual activity')) {
      return 'unusual activity challenge';
    }
    if (text.includes('verify your identity')) {
      return 'identity verification required';
    }
    if (text.includes('temporarily restricted')) {
      return 'temporarily restricted session';
    }
    if (text.includes('checkpoint') || text.includes('challenge')) {
      return 'linkedin checkpoint challenge';
    }

    return null;
  };
  const text = (selector: string): string => clean(document.querySelector(selector)?.textContent);
  const allTexts = (selector: string): string[] =>
    [...document.querySelectorAll(selector)].map((item) => clean(item.textContent)).filter(Boolean);
  const sectionByHeading = (labels: string[]): Element | null => {
    const normalizedLabels = labels.map((label) => label.toLowerCase());
    for (const section of document.querySelectorAll('section')) {
      const heading = clean(section.querySelector('h2')?.textContent).toLowerCase();
      if (normalizedLabels.some((label) => heading.includes(label))) {
        return section;
      }
    }
    return null;
  };
  const sectionItems = (section: Element | null): Element[] =>
    section ? [...section.querySelectorAll('li')].slice(0, 20) : [];
  const splitLines = (item: Element): string[] =>
    clean((item as HTMLElement).innerText)
      .split(/\n| {2,}/)
      .map(clean)
      .filter(Boolean);
  const parseExperience = (item: Element, index: number): RawExperience => {
    const lines = splitLines(item);
    return {
      title: lines[0],
      company: lines[1],
      dateRange: lines.find((line) => /\b(19|20)\d{2}\b/.test(line)),
      location: lines.find((line) => /remote|hybrid|paris|france|lyon|lille/i.test(line)),
      description: lines.slice(2, 7).join('\n'),
      skills: lines.filter((line) =>
        /svelte|typescript|react|node|design|architecture/i.test(line)
      ),
      externalId: `linkedin-experience-${index}`,
    };
  };
  const parseEducation = (item: Element): RawEducation => {
    const lines = splitLines(item);
    return {
      school: lines[0],
      degree: lines[1],
      field: lines[2],
      dateRange: lines.find((line) => /\b(19|20)\d{2}\b/.test(line)),
      description: lines.slice(3, 7).join('\n'),
    };
  };

  const about = sectionByHeading(['about', 'infos', 'à propos']);
  const experience = sectionByHeading(['experience', 'expérience']);
  const education = sectionByHeading(['education', 'formation']);
  const skills = sectionByHeading(['skills', 'compétences']);
  const blockedReason = blockedReasonFromText(clean(document.body?.innerText));
  const headline =
    text('.pv-text-details__left-panel .text-body-medium') ||
    text('[data-generated-suggestion-target]') ||
    text('main h1');
  const summary = about
    ? clean((about as HTMLElement).innerText).replace(/^about|^à propos/i, '')
    : '';
  const links = [...document.querySelectorAll('main a[href^="https://"]')]
    .slice(0, 12)
    .map((anchor) => ({
      label: clean(anchor.textContent) || (anchor as HTMLAnchorElement).hostname,
      url: (anchor as HTMLAnchorElement).href,
    }))
    .filter((link) => link.url.includes('linkedin.com') || !link.url.includes('/feed/'));

  return {
    profileUrl: window.location.href,
    ...(blockedReason ? { blockedReason } : {}),
    sections: {
      headline,
      summary: clean(summary),
      experiences: sectionItems(experience).map(parseExperience),
      skills: allTexts('span[aria-hidden="true"], .pvs-list__item--with-top-padding')
        .filter((value) => value.length <= 80)
        .slice(0, 80),
      education: sectionItems(education).map(parseEducation),
      links,
    },
  };
}

export class LinkedInProfileExtractor implements PlatformProfileExtractor {
  readonly id = 'linkedin' as const;
  readonly name = 'LinkedIn';

  constructor(private readonly chromeApi: ChromeLike = getChromeApi()) {}

  async detectSession(now: number): Promise<Result<boolean, AppError>> {
    if (!this.chromeApi.cookies?.getAll) {
      return err(
        createProfileExtractorError(
          'permission_required',
          'LinkedIn session detection requires Chrome cookies permission.',
          now
        )
      );
    }

    try {
      const cookies = await this.chromeApi.cookies.getAll({ domain: '.linkedin.com' });
      return ok(cookies.some((cookie) => cookie.name === 'li_at'));
    } catch (error) {
      return err(
        createProfileExtractorError(
          'permission_required',
          'LinkedIn cookies are not readable for this extension context.',
          now,
          { cause: error instanceof Error ? error.message : String(error) }
        )
      );
    }
  }

  async extractProfile(
    now: number,
    tabId?: number
  ): Promise<Result<CanonicalCandidateProfileDraft, AppError>> {
    const tab = await this.resolveTab(tabId);
    if (!tab?.id || !tab.url) {
      return err(
        createProfileExtractorError(
          'profile_not_found',
          'Open a LinkedIn profile tab before importing.',
          now
        )
      );
    }

    const urlError = classifyLinkedInUrl(tab.url);
    if (urlError) {
      return err(
        createProfileExtractorError(
          urlError,
          urlError === 'session_required'
            ? 'LinkedIn requires a browser session before import.'
            : 'The active tab is not a LinkedIn profile page.',
          now,
          { url: tab.url }
        )
      );
    }

    const scriptingReady = await this.ensureExtractionPermission();
    if (!scriptingReady || !this.chromeApi.scripting?.executeScript || !this.chromeApi.tabs) {
      return err(
        createProfileExtractorError(
          'permission_required',
          'LinkedIn profile import requires activeTab and scripting permissions.',
          now
        )
      );
    }

    const session = await this.detectSession(now);
    if (!session.ok) {
      return session;
    }
    if (!session.value) {
      return err(
        createProfileExtractorError(
          'session_required',
          'LinkedIn requires an authenticated browser session before import.',
          now,
          { url: tab.url }
        )
      );
    }

    try {
      const [result] = await this.chromeApi.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractLinkedInProfileFromDom,
      });
      const snapshot = result?.result;
      if (!snapshot) {
        return err(
          createProfileExtractorError(
            'dom_changed',
            'LinkedIn did not return profile data from the active tab.',
            now,
            { url: tab.url }
          )
        );
      }
      if (snapshot.blockedReason) {
        return err(
          createProfileExtractorError(
            'rate_limited_or_blocked',
            'LinkedIn blocked profile extraction with a challenge or checkpoint.',
            now,
            { url: tab.url, reason: snapshot.blockedReason }
          )
        );
      }

      const parsed = parseLinkedInProfilePayload({
        source: 'linkedin',
        profileUrl: snapshot.profileUrl || tab.url,
        capturedAt: new Date(now),
        sections: snapshot.sections,
      });

      if (!parsed.ok) {
        return err(
          createProfileExtractorError(
            parsed.error.code === 'dom_changed' ? 'dom_changed' : 'dom_changed',
            parsed.error.message,
            now,
            { field: parsed.error.field, url: tab.url }
          )
        );
      }

      return parsed;
    } catch (error) {
      return err(
        createProfileExtractorError(
          'permission_required',
          'Chrome blocked LinkedIn DOM extraction.',
          now,
          { cause: error instanceof Error ? error.message : String(error), url: tab.url }
        )
      );
    }
  }

  private async ensureExtractionPermission(): Promise<boolean> {
    if (!this.chromeApi.permissions?.contains) {
      return false;
    }

    const hasScriptApis = await this.chromeApi.permissions.contains({
      permissions: ['scripting', 'activeTab'],
    });
    if (!hasScriptApis) {
      return false;
    }

    const hasLinkedInOrigin = await this.chromeApi.permissions.contains({
      origins: ['https://www.linkedin.com/*'],
    });
    if (hasLinkedInOrigin) {
      return true;
    }

    return (
      this.chromeApi.permissions.request?.({ origins: ['https://www.linkedin.com/*'] }) ?? false
    );
  }

  private async resolveTab(tabId?: number): Promise<chrome.tabs.Tab | null> {
    if (!this.chromeApi.tabs) {
      return null;
    }

    if (typeof tabId === 'number') {
      return this.chromeApi.tabs.get(tabId);
    }

    const [tab] = await this.chromeApi.tabs.query({ active: true, currentWindow: true });
    return tab ?? null;
  }
}
