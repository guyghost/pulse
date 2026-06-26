import { LinkedInProfileExtractor } from './linkedin.extractor';
import type { PlatformProfileExtractor } from './platform-profile-extractor';

export type ProfileExtractorFactory = () => PlatformProfileExtractor;
export type ProfileExtractorFactories = Record<string, ProfileExtractorFactory>;

export interface ProfileExtractorRegistry {
  list(): PlatformProfileExtractor[];
  get(id: string): PlatformProfileExtractor;
}

const defaultProfileExtractorFactories: ProfileExtractorFactories = {
  linkedin: () => new LinkedInProfileExtractor(),
};

export function createProfileExtractorRegistry(
  factories: ProfileExtractorFactories = defaultProfileExtractorFactories
): ProfileExtractorRegistry {
  return {
    list() {
      return Object.values(factories).map((createExtractor) => createExtractor());
    },
    get(id: string) {
      const createExtractor = factories[id];
      if (!createExtractor) {
        throw new Error(`Unknown profile extractor: ${id}`);
      }

      return createExtractor();
    },
  };
}

export function getProfileExtractors(): PlatformProfileExtractor[] {
  return createProfileExtractorRegistry().list();
}

export function getProfileExtractor(id: string): PlatformProfileExtractor {
  return createProfileExtractorRegistry().get(id);
}

export { LinkedInProfileExtractor };
export type { PlatformProfileExtractor };
export type { ProfileExtractorErrorCode } from './profile-extractor-errors';
