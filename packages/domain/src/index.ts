export type ApplicationStage =
  | 'detected'
  | 'selected'
  | 'application_prepared'
  | 'applied'
  | 'interview'
  | 'offer'
  | 'accepted'
  | 'rejected'
  | 'archived';

export type ApplicationEventCreator = 'dashboard' | 'extension' | 'system';

export interface ApplicationPipelineEvent {
  applicationId: string;
  fromStage: ApplicationStage;
  toStage: ApplicationStage;
  occurredAt: string;
  createdBy: ApplicationEventCreator;
  clientEventId: string;
  note: string | null;
}

export interface ApplicationTransitionInput {
  applicationId: string;
  fromStage: ApplicationStage;
  toStage: ApplicationStage;
  occurredAt: Date;
  createdBy: ApplicationEventCreator;
  clientEventId: string;
  note?: string | null;
}

export const APPLICATION_STAGES = [
  'detected',
  'selected',
  'application_prepared',
  'applied',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'archived',
] as const satisfies readonly ApplicationStage[];

const APPLICATION_TRANSITIONS: Record<ApplicationStage, readonly ApplicationStage[]> = {
  detected: ['selected', 'archived'],
  selected: ['application_prepared', 'applied', 'archived'],
  application_prepared: ['applied', 'archived'],
  applied: ['interview', 'offer', 'rejected', 'archived'],
  interview: ['offer', 'rejected', 'archived'],
  offer: ['accepted', 'rejected', 'archived'],
  accepted: ['archived'],
  rejected: ['archived'],
  archived: ['detected'],
};

const LEGACY_STAGE_MAP: Record<string, ApplicationStage> = {
  new: 'detected',
  detected: 'detected',
  interested: 'selected',
  selected: 'selected',
  draft: 'selected',
  applying: 'application_prepared',
  application_prepared: 'application_prepared',
  applied: 'applied',
  interview: 'interview',
  offer: 'offer',
  accepted: 'accepted',
  rejected: 'rejected',
  withdrawn: 'archived',
  archived: 'archived',
};

export function isAllowedApplicationTransition(
  fromStage: ApplicationStage,
  toStage: ApplicationStage
): boolean {
  return APPLICATION_TRANSITIONS[fromStage].includes(toStage);
}

export function transitionApplicationStage(
  input: ApplicationTransitionInput
): ApplicationPipelineEvent | null {
  if (!isAllowedApplicationTransition(input.fromStage, input.toStage)) {
    return null;
  }

  return {
    applicationId: input.applicationId,
    fromStage: input.fromStage,
    toStage: input.toStage,
    occurredAt: input.occurredAt.toISOString(),
    createdBy: input.createdBy,
    clientEventId: input.clientEventId,
    note: input.note ?? null,
  };
}

export function canonicalizeLegacyApplicationStage(value: string): ApplicationStage | null {
  return LEGACY_STAGE_MAP[value] ?? null;
}
