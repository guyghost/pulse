import type { ProfileExtractorErrorCode } from './profile-extractor-errors';

export type LinkedInReservedRouteError = Extract<
  ProfileExtractorErrorCode,
  'session_required' | 'rate_limited_or_blocked'
>;

/** Classifies only LinkedIn's exact leading reserved route segments. */
export function classifyLinkedInReservedRoute(url: URL): LinkedInReservedRouteError | null {
  const segments = url.pathname.split('/').filter(Boolean);
  const [firstSegment, secondSegment] = segments;

  if (firstSegment === 'login' || (firstSegment === 'uas' && secondSegment === 'login')) {
    return 'session_required';
  }
  if (firstSegment === 'checkpoint' || firstSegment === 'challenge') {
    return 'rate_limited_or_blocked';
  }
  return null;
}
