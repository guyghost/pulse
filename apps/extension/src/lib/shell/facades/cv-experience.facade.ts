/**
 * CV experience facade — wires profile persistence into the
 * {@link CvExperienceDeps} consumed by the runes store.
 *
 * The side panel never touches `chrome.*` or IndexedDB directly; everything
 * crosses the service-worker bridge via `sendMessage`.
 */
import type { Experience } from '$lib/core/types/profile';
import type { CvExperienceDeps } from '$lib/state/cv-experience.svelte';
import { getProfile, saveProfile } from './settings.facade';

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
    keywords: [] as string[],
    tjmMin: 0,
    tjmMax: 0,
    location: '',
    remote: 'any' as const,
    seniority: 'senior' as const,
    jobTitle: '',
    experiences: [] as Experience[],
    availability: null as import('$lib/core/types/availability').Availability | null,
  };
}
