import type { ProfileSyncField, VerifyProfileResult } from '$lib/core/profile/profile-sync';
import type { CanonicalCandidateProfileDraft } from '$lib/core/profile-extractors/types';
import { sendMessage } from '$lib/shell/messaging/bridge';

export type { VerifyProfileResult };

export type LinkedInProfileImportResult =
  | { imported: true; profile: CanonicalCandidateProfileDraft }
  | { imported: false; errorCode: string; errorMessage: string };

export type LinkedInProfileSyncResult =
  | { imported: true; profile: CanonicalCandidateProfileDraft; addedCount: number }
  | { imported: false; errorCode: string; errorMessage: string };

export type LinkedInProfilePreviewResult =
  | { extracted: true; profile: CanonicalCandidateProfileDraft }
  | { extracted: false; errorCode: string; errorMessage: string };

const LINKEDIN_HOST_PERMISSION: chrome.permissions.Permissions = {
  origins: ['https://www.linkedin.com/*'],
};

interface ChromePermissionsLike {
  contains(permissions: chrome.permissions.Permissions): Promise<boolean>;
  request(permissions: chrome.permissions.Permissions): Promise<boolean>;
}

function getChromePermissions(): ChromePermissionsLike | undefined {
  if (typeof chrome === 'undefined') {
    return undefined;
  }
  const permissions = chrome.permissions as ChromePermissionsLike | undefined;
  if (!permissions?.contains || !permissions.request) {
    return undefined;
  }
  return permissions;
}

/**
 * Ensures the optional LinkedIn host permission is granted before the side
 * panel asks the service worker to extract the active LinkedIn tab.
 *
 * `chrome.permissions.request()` MUST run in a UI context (side panel) during a
 * user gesture — it cannot run in the service worker (MV3). Returns false when
 * the API is unavailable or the user denies the prompt.
 * See `src/models/linkedin-import.model.md`.
 */
export async function ensureLinkedInHostPermission(): Promise<boolean> {
  const permissions = getChromePermissions();
  if (!permissions) {
    return false;
  }
  if (await permissions.contains(LINKEDIN_HOST_PERMISSION)) {
    return true;
  }
  try {
    return await permissions.request(LINKEDIN_HOST_PERMISSION);
  } catch {
    return false;
  }
}

export async function verifyProfilePage(
  url: string,
  fields: ProfileSyncField[]
): Promise<VerifyProfileResult> {
  const response = await sendMessage({
    type: 'VERIFY_PROFILE_PAGE',
    payload: { url, fields },
  });

  // Guard null/unknown responses (e.g. the dev `default` stub path, or a
  // missing production handler) so we never read `.type` off null.
  if (response?.type === 'PROFILE_PAGE_VERIFIED') {
    return response.payload;
  }

  return {
    read: {
      status: 'blocked',
      finalUrl: url,
      reason: 'Réponse service worker inattendue.',
    },
    comparisons: [],
    summary: { matches: 0, mismatches: 0, missing: 0 },
  };
}

export async function importLinkedInProfile(): Promise<LinkedInProfileImportResult> {
  const response = await sendMessage({ type: 'IMPORT_LINKEDIN_PROFILE' });

  if (response?.type !== 'LINKEDIN_PROFILE_IMPORTED') {
    return {
      imported: false,
      errorCode: 'unexpected_response',
      errorMessage: "L'import LinkedIn n'a pas renvoyé de résultat exploitable.",
    };
  }

  return response.payload;
}

export async function previewLinkedInProfile(): Promise<LinkedInProfilePreviewResult> {
  const response = await sendMessage({ type: 'PREVIEW_LINKEDIN_PROFILE' });

  if (response?.type !== 'LINKEDIN_PROFILE_PREVIEWED') {
    return {
      extracted: false,
      errorCode: 'unexpected_response',
      errorMessage: "L'extraction LinkedIn n'a pas renvoyé de preview exploitable.",
    };
  }

  return response.payload;
}

export async function syncLinkedInProfileImport(
  profile: CanonicalCandidateProfileDraft
): Promise<LinkedInProfileSyncResult> {
  const response = await sendMessage({
    type: 'SYNC_LINKEDIN_PROFILE_IMPORT',
    payload: { profile },
  });

  if (response?.type !== 'LINKEDIN_PROFILE_IMPORTED') {
    return {
      imported: false,
      errorCode: 'unexpected_response',
      errorMessage: "La synchronisation LinkedIn n'a pas renvoyé de résultat exploitable.",
    };
  }

  const payload = response.payload;
  if (!payload.imported) {
    return payload;
  }

  return {
    imported: true,
    profile: payload.profile,
    // SW omits addedCount only on unexpected/handcrafted responses — default to
    // a safe 0 so the UI never crashes (the toast will read "already present").
    addedCount: payload.addedCount ?? 0,
  };
}
