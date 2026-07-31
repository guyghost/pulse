import type { Mission } from '../types/mission';

export interface MissionPlatformBindingScope {
  accountId: string;
  bindingId: string;
}

/**
 * Gives a platform mission a stable, account-scoped local identity while
 * retaining the connector's external identifier for server synchronization.
 */
export function scopeMissionToPlatformBinding(
  mission: Mission,
  scope: MissionPlatformBindingScope
): Mission {
  const externalId = mission.externalId ?? mission.id;
  return {
    ...mission,
    id: `binding:${scope.bindingId}:${externalId}`,
    externalId,
    accountId: scope.accountId,
    bindingId: scope.bindingId,
  };
}
