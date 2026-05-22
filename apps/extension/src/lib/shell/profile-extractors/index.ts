import { LinkedInProfileExtractor } from './linkedin.extractor';
import type { PlatformProfileExtractor } from './platform-profile-extractor';

export function getProfileExtractors(): PlatformProfileExtractor[] {
  return [new LinkedInProfileExtractor()];
}

export function getProfileExtractor(id: PlatformProfileExtractor['id']): PlatformProfileExtractor {
  if (id === 'linkedin') {
    return new LinkedInProfileExtractor();
  }

  throw new Error(`Unknown profile extractor: ${id}`);
}

export { LinkedInProfileExtractor };
export type { PlatformProfileExtractor };
export type { ProfileExtractorErrorCode } from './profile-extractor-errors';
