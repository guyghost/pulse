import {
  compareProfileText,
  summarizeProfileComparison,
  type ProfilePageReadResult,
  type ProfileSyncField,
  type VerifyProfileResult,
} from '../../core/profile/profile-sync';

type ProfilePageReadWithText = ProfilePageReadResult & { text: string };

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

async function readProfilePage(url: string): Promise<ProfilePageReadWithText> {
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

function stripProfilePageText(read: ProfilePageReadWithText): ProfilePageReadResult {
  if (read.status === 'blocked') {
    return { status: read.status, finalUrl: read.finalUrl, reason: read.reason };
  }

  return { status: read.status, finalUrl: read.finalUrl };
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
    read: stripProfilePageText(read),
    comparisons,
    summary: summarizeProfileComparison(comparisons),
  };
}
