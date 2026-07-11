import type { AppError } from '../../core/errors/app-error';
import { err, ok, type Result } from '../../core/errors/result';
import type { RawExperience } from '../../core/profile-extractors/types';
import {
  extractLinkedInExperiencesFromDom,
  type LinkedInExperienceDomSnapshot,
} from './linkedin-experience-dom';
import {
  createProfileExtractorError,
  type ProfileExtractorErrorCode,
} from './profile-extractor-errors';
import {
  LINKEDIN_SESSION_REQUIRED_COPY,
  LINKEDIN_VERIFICATION_REQUIRED_COPY,
} from './linkedin-import-copy';

export const DETAIL_PAGE_LOAD_TIMEOUT_MS = 15_000;
export const DETAIL_LIST_STABILIZE_TIMEOUT_MS = 10_000;
export const DETAIL_LIST_OBSERVATION_MS = 500;

const PROFILE_COPY = 'Ouvrez le profil LinkedIn à importer puis réessayez.';
const LOAD_COPY =
  'La page complète des expériences LinkedIn n’a pas pu être chargée. Rechargez LinkedIn puis relancez l’import.';
const DOM_COPY =
  'La page LinkedIn est chargée, mais sa section Expérience n’est plus reconnue. Rechargez la page puis réessayez.';

export interface LinkedInExperienceChromeApi {
  tabs: Pick<typeof chrome.tabs, 'create' | 'get' | 'remove'> & {
    onUpdated: Pick<typeof chrome.tabs.onUpdated, 'addListener' | 'removeListener'>;
    onRemoved: Pick<typeof chrome.tabs.onRemoved, 'addListener' | 'removeListener'>;
  };
  scripting: Pick<typeof chrome.scripting, 'executeScript'>;
}

type DetailTabsApi = LinkedInExperienceChromeApi['tabs'];
type UpdatedListener = Parameters<typeof chrome.tabs.onUpdated.addListener>[0];
type RemovedListener = Parameters<typeof chrome.tabs.onRemoved.addListener>[0];

export function buildLinkedInExperienceDetailUrl(profileUrl: string): string | null {
  try {
    const parsed = new URL(profileUrl);
    const profileMatch = parsed.pathname.match(/^\/in\/([^/]+)\/?$/);
    if (parsed.hostname !== 'www.linkedin.com' || !profileMatch) {
      return null;
    }
    return `https://www.linkedin.com/in/${profileMatch[1]}/details/experience/`;
  } catch {
    return null;
  }
}

function waitForDetailTab(
  tabs: DetailTabsApi,
  created: chrome.tabs.Tab,
  timeoutMs: number
): Promise<chrome.tabs.Tab> {
  if (created.status === 'complete') {
    return Promise.resolve(created);
  }

  const tabId = created.id;
  if (tabId === undefined) {
    return Promise.reject(new Error('LinkedIn detail tab has no id.'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const removeListeners = (): void => {
      clearTimeout(timer);
      tabs.onUpdated.removeListener(onUpdated);
      tabs.onRemoved.removeListener(onRemoved);
    };

    const settle = (complete: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      removeListeners();
      complete();
    };

    const onUpdated: UpdatedListener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
        return;
      }
      void tabs.get(tabId).then(
        (tab) => settle(() => resolve(tab)),
        (error: unknown) => settle(() => reject(error))
      );
    };

    const onRemoved: RemovedListener = (removedTabId) => {
      if (removedTabId === tabId) {
        settle(() => reject(new Error('LinkedIn detail tab was removed.')));
      }
    };

    const timer = setTimeout(() => {
      settle(() => reject(new Error('LinkedIn detail tab load timed out.')));
    }, timeoutMs);
    tabs.onUpdated.addListener(onUpdated);
    tabs.onRemoved.addListener(onRemoved);

    // The tab can reach `complete` between tabs.create() resolving and listener
    // registration. Re-read it only after both listeners are installed so that
    // neither the old state nor a subsequent update can be lost.
    void tabs.get(tabId).then(
      (tab) => {
        if (tab.status === 'complete') {
          settle(() => resolve(tab));
        }
      },
      (error: unknown) => settle(() => reject(error))
    );
  });
}

function classifyDetailTabUrl(url: string | undefined): ProfileExtractorErrorCode | null {
  if (!url) {
    return 'detail_page_unavailable';
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'www.linkedin.com') {
      return 'detail_page_unavailable';
    }
    if (parsed.pathname.includes('/login') || parsed.pathname.includes('/uas/login')) {
      return 'session_required';
    }
    if (parsed.pathname.includes('/checkpoint') || parsed.pathname.includes('/challenge')) {
      return 'rate_limited_or_blocked';
    }
    return /^\/in\/[^/]+\/details\/experience\/?$/.test(parsed.pathname)
      ? null
      : 'detail_page_unavailable';
  } catch {
    return 'detail_page_unavailable';
  }
}

function errorForSnapshot(
  snapshot: Exclude<LinkedInExperienceDomSnapshot, { kind: 'ready' } | { kind: 'empty' }>,
  now: number
): AppError {
  if (snapshot.kind === 'blocked') {
    return createProfileExtractorError(
      'rate_limited_or_blocked',
      LINKEDIN_VERIFICATION_REQUIRED_COPY,
      now,
      {
        reason: snapshot.blockedReason,
      }
    );
  }
  if (snapshot.kind === 'unreadable') {
    return createProfileExtractorError('dom_changed', DOM_COPY, now);
  }
  return createProfileExtractorError('detail_page_unavailable', LOAD_COPY, now);
}

export async function loadCompleteLinkedInExperiences(
  chromeApi: LinkedInExperienceChromeApi,
  profileUrl: string,
  now: number
): Promise<Result<RawExperience[], AppError>> {
  let createdTabId: number | null = null;

  try {
    const url = buildLinkedInExperienceDetailUrl(profileUrl);
    if (!url) {
      return err(createProfileExtractorError('profile_not_found', PROFILE_COPY, now));
    }

    const created = await chromeApi.tabs.create({ url, active: false });
    if (created.id === undefined) {
      return err(createProfileExtractorError('detail_page_unavailable', LOAD_COPY, now));
    }
    createdTabId = created.id;

    const readyTab = await waitForDetailTab(chromeApi.tabs, created, DETAIL_PAGE_LOAD_TIMEOUT_MS);
    const urlError = classifyDetailTabUrl(readyTab.url);
    if (urlError) {
      const message =
        urlError === 'session_required'
          ? LINKEDIN_SESSION_REQUIRED_COPY
          : urlError === 'rate_limited_or_blocked'
            ? LINKEDIN_VERIFICATION_REQUIRED_COPY
            : LOAD_COPY;
      return err(createProfileExtractorError(urlError, message, now, { url: readyTab.url }));
    }

    const [injection] = await chromeApi.scripting.executeScript({
      target: { tabId: createdTabId },
      func: extractLinkedInExperiencesFromDom,
      args: [
        {
          stabilizationTimeoutMs: DETAIL_LIST_STABILIZE_TIMEOUT_MS,
          observationMs: DETAIL_LIST_OBSERVATION_MS,
          stableCycles: 2,
        },
      ],
    });
    const snapshot = injection?.result;
    if (!snapshot) {
      return err(createProfileExtractorError('dom_changed', DOM_COPY, now));
    }
    if (snapshot.kind === 'ready' || snapshot.kind === 'empty') {
      return ok(snapshot.experiences);
    }
    return err(errorForSnapshot(snapshot, now));
  } catch (error: unknown) {
    return err(
      createProfileExtractorError('detail_page_unavailable', LOAD_COPY, now, {
        cause: error instanceof Error ? error.message : String(error),
      })
    );
  } finally {
    if (createdTabId !== null) {
      await chromeApi.tabs.remove(createdTabId).catch((error: unknown) => {
        console.warn('[MissionPulse][LinkedInExperienceImport]', {
          event: 'detail_tab_cleanup_failed',
          tabId: createdTabId,
          cause: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }
}
