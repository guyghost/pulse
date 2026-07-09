/**
 * CV experience facade — wires shell I/O (profile bridge, clipboard, tabs) into
 * the {@link CvExperienceDeps} consumed by the runes store.
 *
 * The side panel never touches `chrome.*` or IndexedDB directly; everything
 * crosses the service-worker bridge via `sendMessage`. Clipboard is the one
 * browser API the side panel may call directly (it is the sync transport).
 */
import type { Experience } from '$lib/core/types/profile';
import type { PlatformSyncTarget } from '$lib/core/cv/experience-helpers';
import type { CvExperienceDeps } from '$lib/state/cv-experience.svelte';
import { getProfile, saveProfile } from './settings.facade';
import { getConnectorsMeta, openExternalUrl } from './feed-data.facade';

const LINKEDIN_PROFILE_URL = 'https://www.linkedin.com/in/';

/** Build the sync target list (LinkedIn + the 6 mission connectors). */
export function getCvSyncTargets(): PlatformSyncTarget[] {
  const connectors = getConnectorsMeta();
  return [
    {
      id: 'linkedin',
      name: 'LinkedIn',
      profileUrl: LINKEDIN_PROFILE_URL,
    },
    ...connectors.map((connector) => ({
      id: connector.id,
      name: connector.name,
      profileUrl: connector.url,
    })),
  ];
}

/** Default shell deps for the CV experience store. Mockable in tests. */
export function createCvExperienceDeps(): CvExperienceDeps {
  return {
    async loadExperiences(): Promise<Experience[]> {
      const profile = await getProfile();
      return profile?.experiences ?? [];
    },

    async saveExperiences(experiences: Experience[]): Promise<void> {
      const current = await getProfile();
      const profile = {
        ...(current ?? createBlankProfile()),
        experiences,
      };
      await saveProfile(profile);
    },

    async copyToClipboard(text: string): Promise<void> {
      if (!navigator?.clipboard) {
        throw new Error('Presse-papiers indisponible dans ce contexte.');
      }
      await navigator.clipboard.writeText(text);
    },

    async openUrl(url: string): Promise<void> {
      await openExternalUrl(url);
    },

    platforms: getCvSyncTargets(),

    now(): number {
      return Date.now();
    },

    generateId(): string {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `exp-${crypto.randomUUID()}`;
      }
      return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    },
  };
}

function createBlankProfile() {
  return {
    firstName: '',
    stack: [] as string[],
    tjmMin: 0,
    tjmMax: 0,
    location: '',
    remote: 'any' as const,
    seniority: 'senior' as const,
    jobTitle: '',
    searchKeywords: [] as string[],
    experiences: [] as Experience[],
  };
}
