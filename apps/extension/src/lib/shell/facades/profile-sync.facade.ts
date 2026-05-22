import type { ProfileSyncField } from '$lib/core/profile/profile-sync';
import type { CanonicalCandidateProfileDraft } from '$lib/core/profile-extractors/types';
import {
  compareProfileText,
  summarizeProfileComparison,
  type ProfileFieldComparison,
} from '$lib/core/profile/profile-sync';
import { sendMessage } from '$lib/shell/messaging/bridge';

export type ProfilePageReadResult =
  | { status: 'available'; finalUrl: string; text: string }
  | { status: 'auth-required'; finalUrl: string; text: string }
  | { status: 'blocked'; finalUrl: string; text: string; reason: string };

export interface VerifyProfileResult {
  read: ProfilePageReadResult;
  comparisons: ProfileFieldComparison[];
  summary: {
    matches: number;
    mismatches: number;
    missing: number;
  };
}

export type LinkedInProfileImportResult =
  | { imported: true; profile: CanonicalCandidateProfileDraft }
  | { imported: false; errorCode: string; errorMessage: string };

function looksLikeAuthPage(url: string, text: string): boolean {
  const normalizedUrl = url.toLowerCase();
  const normalizedText = text.toLowerCase();

  return (
    normalizedUrl.includes('/auth') ||
    normalizedUrl.includes('/login') ||
    normalizedUrl.includes('/security/auth') ||
    normalizedText.includes('se connecter') ||
    normalizedText.includes('connecte-toi') ||
    normalizedText.includes('continue with linkedin') ||
    normalizedText.includes('email address') ||
    normalizedText.includes('mot de passe')
  );
}

async function readProfilePage(url: string): Promise<ProfilePageReadResult> {
  try {
    const response = await fetch(url, {
      credentials: 'include',
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    const finalUrl = response.url || url;
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();

    if (looksLikeAuthPage(finalUrl, text)) {
      return { status: 'auth-required', finalUrl, text };
    }

    if (!response.ok || !contentType.includes('text/html')) {
      return {
        status: 'blocked',
        finalUrl,
        text,
        reason: `HTTP ${response.status}, content-type ${contentType || 'unknown'}`,
      };
    }

    return { status: 'available', finalUrl, text };
  } catch (error) {
    return {
      status: 'blocked',
      finalUrl: url,
      text: '',
      reason: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

export async function verifyProfilePage(
  url: string,
  fields: ProfileSyncField[]
): Promise<VerifyProfileResult> {
  const read = await readProfilePage(url);
  const comparisons =
    read.status === 'available'
      ? compareProfileText(fields, read.text)
      : compareProfileText([], '');

  return {
    read,
    comparisons,
    summary: summarizeProfileComparison(comparisons),
  };
}

export async function importLinkedInProfile(): Promise<LinkedInProfileImportResult> {
  const response = await sendMessage({ type: 'IMPORT_LINKEDIN_PROFILE' });

  if (response.type !== 'LINKEDIN_PROFILE_IMPORTED') {
    return {
      imported: false,
      errorCode: 'unexpected_response',
      errorMessage: "L'import LinkedIn n'a pas renvoyé de résultat exploitable.",
    };
  }

  return response.payload;
}
