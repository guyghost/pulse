import type { ApplicationStatus, MissionTracking } from '$lib/core/types/tracking';
import { applicationIntentPath } from '$lib/core/tracking/application-intent';
export async function executeApplicationIntent(options: {
  missionId: string;
  intent: 'open' | 'confirm';
  openSource: () => Promise<void>;
  store: {
    getTrackingForMission: (id: string) => MissionTracking | undefined;
    transitionStatus: (id: string, status: ApplicationStatus) => Promise<MissionTracking>;
  };
}): Promise<boolean> {
  if (options.intent === 'open') {
    await options.openSource();
  }
  const path = applicationIntentPath(
    options.store.getTrackingForMission(options.missionId)?.currentStatus ?? null,
    options.intent
  );
  for (const status of path) {
    await options.store.transitionStatus(options.missionId, status);
  }
  return path.length > 0;
}
