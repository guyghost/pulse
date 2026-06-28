import type { ProfileSyncField, VerifyProfileResult } from '$lib/core/profile/profile-sync';
import type { CanonicalCandidateProfileDraft } from '$lib/core/profile-extractors/types';
import { sendMessage } from '$lib/shell/messaging/bridge';

export type { VerifyProfileResult };

export type LinkedInProfileImportResult =
  | { imported: true; profile: CanonicalCandidateProfileDraft }
  | { imported: false; errorCode: string; errorMessage: string };

export type LinkedInProfilePreviewResult =
  | { extracted: true; profile: CanonicalCandidateProfileDraft }
  | { extracted: false; errorCode: string; errorMessage: string };

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
): Promise<LinkedInProfileImportResult> {
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

  return response.payload;
}
