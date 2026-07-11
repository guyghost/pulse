/**
 * Availability facade — wires shell I/O (profile bridge, clipboard, tabs) into
 * the {@link AvailabilityDeps} consumed by the runes store.
 *
 * Mirrors `cv-experience.facade.ts`. The side panel never touches `chrome.*`
 * or IndexedDB directly; everything crosses the service-worker bridge via
 * `sendMessage`. Clipboard is the one browser API the side panel may call
 * directly (it is the sync transport).
 *
 * Push targets are the 6 mission connectors only (no LinkedIn) — see
 * `models/availability-sync.model.md`.
 */
import type { Availability } from '$lib/core/types/availability';
import type { PlatformSyncTarget } from '$lib/core/cv/experience-helpers';
import type { Experience } from '$lib/core/types/profile';
import type { AvailabilityDeps } from '$lib/state/availability.svelte';
import { getProfile, saveProfile } from './settings.facade';
import { getConnectorsMeta, openExternalUrl } from './feed-data.facade';

/** Build the push target list (the 6 mission connectors, no LinkedIn). */
export function getAvailabilityPushTargets(): PlatformSyncTarget[] {
  const connectors = getConnectorsMeta();
  return connectors.map((connector) => ({
    id: connector.id,
    name: connector.name,
    profileUrl: connector.url,
  }));
}

/** Default shell deps for the availability store. Mockable in tests. */
export function createAvailabilityDeps(): AvailabilityDeps {
  return {
    async loadAvailability(): Promise<Availability | null> {
      const profile = await getProfile();
      return profile?.availability ?? null;
    },

    async saveAvailability(availability: Availability | null): Promise<void> {
      const current = await getProfile();
      const profile = {
        ...(current ?? createBlankProfile()),
        availability,
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

    platforms: getAvailabilityPushTargets(),

    now(): number {
      return Date.now();
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
    availability: null as Availability | null,
  };
}
