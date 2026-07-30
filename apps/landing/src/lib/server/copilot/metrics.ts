export type UnavailableCopilotMetricReason =
  'PROVIDER_BILLING_SOURCE_MISSING' | 'SUBSCRIPTION_HISTORY_MISSING';

export interface UnavailableCopilotMetric {
  availability: 'unavailable';
  reason: UnavailableCopilotMetricReason;
}

/** Missing provider billing data is never represented as a zero monetary cost. */
export const COPILOT_PROVIDER_COST_METRIC: UnavailableCopilotMetric = {
  availability: 'unavailable',
  reason: 'PROVIDER_BILLING_SOURCE_MISSING',
};

/** A current subscription flag is not historical retention evidence. */
export const COPILOT_PREMIUM_RETENTION_METRIC: UnavailableCopilotMetric = {
  availability: 'unavailable',
  reason: 'SUBSCRIPTION_HISTORY_MISSING',
};
