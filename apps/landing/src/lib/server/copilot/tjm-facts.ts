import {
  isCopilotTjmCoachFacts,
  type CopilotConsentSelection,
  type CopilotOperationKind,
  type CopilotTjmCoachFacts,
} from '@pulse/domain';

import { CopilotApiError } from './errors';

export type { CopilotTjmCoachFacts } from '@pulse/domain';

export function parseTjmFactsForOperation(
  operationKind: CopilotOperationKind,
  value: unknown,
  consent: CopilotConsentSelection
): CopilotTjmCoachFacts | null {
  if (operationKind !== 'tjm-coach') {
    if (value !== null) {
      throw new CopilotApiError(422, 'INVALID_REQUEST', 'TJM facts are only valid for TJM coach');
    }
    return null;
  }
  const mission = new Set(consent.missionFields);
  const profile = new Set(consent.profileFields);
  if (
    !isCopilotTjmCoachFacts(value) ||
    !mission.has('stack') ||
    !mission.has('displayedTjm') ||
    !profile.has('keywords') ||
    !profile.has('tjmBounds')
  ) {
    throw new CopilotApiError(422, 'INVALID_REQUEST', 'Invalid deterministic TJM facts');
  }
  return value;
}
