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
  loadCompleteLinkedInExperiences,
  type LinkedInExperienceChromeApi,
} from './linkedin-experience-loader';
import {
  createProfileExtractorError,
  type ProfileExtractorErrorCode,
} from './profile-extractor-errors';
import {
  LINKEDIN_SESSION_REQUIRED_COPY,
  LINKEDIN_VERIFICATION_REQUIRED_COPY,
} from './linkedin-import-copy';
import { classifyLinkedInReservedRoute } from './linkedin-url-classification';

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
  };
  scripting?: LinkedInExperienceChromeApi['scripting'];
  tabs?: LinkedInExperienceChromeApi['tabs'] & Pick<typeof chrome.tabs, 'query'>;
}

function getChromeApi(): ChromeLike {
  return typeof chrome === 'undefined' ? {} : chrome;
}

export interface LinkedInProfileExtractorDependencies {
  parseLinkedInProfilePayload: typeof parseLinkedInProfilePayload;
}

const DEFAULT_DEPENDENCIES: LinkedInProfileExtractorDependencies = {
  parseLinkedInProfilePayload,
};

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
    const reservedRouteError = classifyLinkedInReservedRoute(parsed);
    if (reservedRouteError) {
      return reservedRouteError;
    }
    return isLinkedInProfileUrl(url) ? null : 'profile_not_found';
  } catch {
    return 'profile_not_found';
  }
}

export function extractLinkedInProfileFromDom(): LinkedInDomProfileSnapshot {
  const clean = (value: string | null | undefined): string =>
    (value ?? '').replace(/\s+/g, ' ').trim();
  // Specific, non-greedy: the bare words "challenge"/"checkpoint" are NOT block
  // signals — they appear in legitimate profile prose ("I enjoy new challenges")
  // and previously caused false `rate_limited_or_blocked` errors. Only
  // challenge-page phrases qualify, and only with explicit corroboration when
  // no strong profile marker is present (see the guard below).
  // See src/models/linkedin-import.model.md.
  const blockedSignalsFromText = (value: string): string[] => {
    const text = value.toLowerCase();
    const signals: string[] = [];
    if (text.includes('security verification')) {
      signals.push('security verification required');
    }
    if (text.includes('unusual activity')) {
      signals.push('unusual activity challenge');
    }
    if (text.includes('verify your identity')) {
      signals.push('identity verification required');
    }
    if (text.includes('security check')) {
      signals.push('security check required');
    }
    if (text.includes('temporarily restricted')) {
      signals.push('temporarily restricted session');
    }
    return signals;
  };
  const isChallengeHeading = (value: string): boolean =>
    /^(?:security verification(?: required)?|security check(?: required)?|verify your identity|unusual activity(?: detected)?|temporarily restricted(?: account|session)?)[.!:]?$/i.test(
      clean(value)
    );
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
  const mainHeading = text('main h1');
  const headlineCandidate =
    text('.pv-text-details__left-panel .text-body-medium') ||
    text('[data-generated-suggestion-target]') ||
    mainHeading;
  const experiences = sectionItems(experience).map(parseExperience);
  const educationItems = sectionItems(education).map(parseEducation);
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

  // Defensive guard: text-based block signals are authoritative only when the
  // page has no parseable profile sections. A real profile that mentions
  // "challenge" or "unusual activity" in its bio must NOT be treated as a
  // checkpoint interstitial. `innerText` is preferred (layout-aware, ignores
  // <script>/<style>); `textContent` is a fallback for undrawn/jsdom contexts.
  const bodyText = clean(document.body?.innerText || document.body?.textContent || '');
  const bodySignals = blockedSignalsFromText(bodyText);
  const bodyWithoutMainHeading = document.body?.cloneNode(true) as HTMLElement | undefined;
  for (const heading of bodyWithoutMainHeading?.querySelectorAll('main h1') ?? []) {
    heading.remove();
  }
  const outsideHeadingText = clean(
    bodyWithoutMainHeading?.innerText || bodyWithoutMainHeading?.textContent || ''
  );
  const outsideHeadingSignals = blockedSignalsFromText(outsideHeadingText);
  const challengeHeadingReason = isChallengeHeading(mainHeading)
    ? (blockedSignalsFromText(mainHeading)[0] ?? null)
    : null;
  const hasVerificationControl = Boolean(
    document.querySelector(
      'form[action*="checkpoint" i], form[action*="challenge" i], input[name*="verification" i], input[name*="challenge" i], input[name*="pin" i], [data-test*="verification" i], [data-testid*="verification" i], [data-test*="challenge" i], [data-testid*="challenge" i]'
    )
  );
  const firstPathSegment = window.location.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  const isReservedChallengeRoute =
    firstPathSegment === 'checkpoint' || firstPathSegment === 'challenge';
  const hasStrongProfileMarkers =
    Boolean(about || experience || education || (mainHeading && !challengeHeadingReason)) ||
    experiences.length > 0 ||
    educationItems.length > 0;
  const hasDistinctSignalOutsideHeading = Boolean(
    challengeHeadingReason &&
    outsideHeadingSignals.some((signal) => signal !== challengeHeadingReason)
  );
  const hasCorroboratedDomChallenge =
    !hasStrongProfileMarkers &&
    ((Boolean(challengeHeadingReason) &&
      (hasDistinctSignalOutsideHeading || hasVerificationControl)) ||
      bodySignals.length >= 2 ||
      (bodySignals.length >= 1 && hasVerificationControl));
  const blockedReason =
    isReservedChallengeRoute || hasCorroboratedDomChallenge
      ? (challengeHeadingReason ?? bodySignals[0] ?? 'linkedin challenge route')
      : null;
  const headline = blockedReason ? '' : headlineCandidate;

  return {
    profileUrl: window.location.href,
    ...(blockedReason ? { blockedReason } : {}),
    sections: {
      headline,
      summary: clean(summary),
      experiences,
      skills: allTexts('span[aria-hidden="true"], .pvs-list__item--with-top-padding')
        .filter((value) => value.length <= 80)
        .slice(0, 80),
      education: educationItems,
      links,
    },
  };
}

export class LinkedInProfileExtractor implements PlatformProfileExtractor {
  readonly id = 'linkedin' as const;
  readonly name = 'LinkedIn';

  constructor(
    private readonly chromeApi: ChromeLike = getChromeApi(),
    private readonly dependencies: LinkedInProfileExtractorDependencies = DEFAULT_DEPENDENCIES
  ) {}

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
    // Permission gate runs BEFORE resolveTab: without the LinkedIn host
    // permission, chrome.tabs.query returns tab.url === undefined and the URL
    // classification would emit a misleading profile_not_found. The origin is
    // requested from the side panel (user gesture) before this bridge call;
    // see src/models/linkedin-import.model.md.
    const scriptingReady = await this.ensureExtractionPermission();
    if (!scriptingReady) {
      return err(
        createProfileExtractorError(
          'permission_required',
          'LinkedIn profile import requires the LinkedIn host permission. Grant it from the MissionPulse side panel before importing.',
          now
        )
      );
    }

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
            ? LINKEDIN_SESSION_REQUIRED_COPY
            : urlError === 'rate_limited_or_blocked'
              ? LINKEDIN_VERIFICATION_REQUIRED_COPY
              : 'The active tab is not a LinkedIn profile page.',
          now,
          { url: tab.url }
        )
      );
    }

    const scripting = this.chromeApi.scripting;
    if (!scripting?.executeScript) {
      return err(
        createProfileExtractorError(
          'permission_required',
          'LinkedIn profile import requires the scripting permission.',
          now,
          { url: tab.url }
        )
      );
    }

    const session = await this.detectSession(now);
    if (!session.ok) {
      return session;
    }
    if (!session.value) {
      return err(
        createProfileExtractorError('session_required', LINKEDIN_SESSION_REQUIRED_COPY, now, {
          url: tab.url,
        })
      );
    }

    const tabs = this.chromeApi.tabs;
    if (!tabs) {
      return err(
        createProfileExtractorError(
          'profile_not_found',
          'Open a LinkedIn profile tab before importing.',
          now
        )
      );
    }

    try {
      const [result] = await scripting.executeScript({
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
            LINKEDIN_VERIFICATION_REQUIRED_COPY,
            now,
            { url: tab.url, reason: snapshot.blockedReason }
          )
        );
      }

      const detail = await loadCompleteLinkedInExperiences({ tabs, scripting }, tab.url, now);
      if (!detail.ok) {
        return detail;
      }

      const parsed = this.dependencies.parseLinkedInProfilePayload({
        source: 'linkedin',
        profileUrl: snapshot.profileUrl || tab.url,
        capturedAt: new Date(now),
        sections: {
          ...snapshot.sections,
          experiences: detail.value,
        },
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

    // Contains-only: the LinkedIn host permission is requested from the side
    // panel (user gesture) before the bridge call. The service worker cannot
    // call chrome.permissions.request (MV3). See src/models/linkedin-import.model.md.
    return this.chromeApi.permissions.contains({
      origins: ['https://www.linkedin.com/*'],
    });
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
