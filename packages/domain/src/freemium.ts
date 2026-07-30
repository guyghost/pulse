export const PREMIUM_YEARLY_OFFER = {
  id: 'premium_yearly',
  amountMinor: 1000,
  currency: 'EUR',
  interval: 'year',
  intervalCount: 1,
  taxIncluded: true,
  features: ['multi_account', 'application_form_ai_assistance'],
  catalogVersion: 1,
} as const;

export type PlanId = 'free' | typeof PREMIUM_YEARLY_OFFER.id;
export type PremiumFeature = (typeof PREMIUM_YEARLY_OFFER.features)[number];

export type PulseAccountState = 'anonymous' | 'active' | 'suspended' | 'deleting' | 'deleted';

export type EntitlementStatus =
  | 'free'
  | 'premium_active'
  | 'premium_cancel_at_period_end'
  | 'premium_past_due'
  | 'premium_expired'
  | 'premium_revoked';

export interface EntitlementSourceVersion {
  providerUpdatedAt: string;
  eventPriority: number;
  providerEventId: string;
}

export interface EntitlementSnapshot {
  accountId: string;
  planId: PlanId;
  status: EntitlementStatus;
  validFromMs: number | null;
  validUntilMs: number | null;
  features: readonly PremiumFeature[];
  sourceSubscriptionId: string | null;
  sourceVersion: EntitlementSourceVersion;
  revision: number;
  issuedAtMs: number;
  cacheExpiresAtMs: number;
}

export type EntitlementSignalType =
  | 'ACCOUNT_CREATED'
  | 'SUBSCRIPTION_ACTIVATED'
  | 'CANCELLATION_SCHEDULED'
  | 'SUBSCRIPTION_RESUMED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_RECOVERED'
  | 'PERIOD_ENDED'
  | 'REFUND_CONFIRMED'
  | 'CHARGEBACK_CONFIRMED'
  | 'ADMIN_REVOKED';

export interface EntitlementSignal {
  type: EntitlementSignalType;
  accountId: string;
  sourceSubscriptionId: string | null;
  validFromMs: number | null;
  validUntilMs: number | null;
  sourceVersion: EntitlementSourceVersion;
  issuedAtMs: number;
  cacheExpiresAtMs: number;
}

export type EntitlementReduction =
  | { ok: true; decision: 'applied'; snapshot: EntitlementSnapshot }
  | { ok: true; decision: 'ignored_stale'; snapshot: EntitlementSnapshot }
  | {
      ok: false;
      error:
        | 'ACCOUNT_MISMATCH'
        | 'MISSING_SUBSCRIPTION'
        | 'MISSING_VALID_UNTIL'
        | 'INVALID_CACHE_EXPIRY'
        | 'INVALID_TRANSITION';
    };

export function compareEntitlementSourceVersion(
  left: EntitlementSourceVersion,
  right: EntitlementSourceVersion
): number {
  const updatedAt = left.providerUpdatedAt.localeCompare(right.providerUpdatedAt);
  if (updatedAt !== 0) {
    return updatedAt;
  }

  if (left.eventPriority !== right.eventPriority) {
    return left.eventPriority - right.eventPriority;
  }

  return left.providerEventId.localeCompare(right.providerEventId);
}

export function createFreeEntitlement(input: {
  accountId: string;
  sourceVersion: EntitlementSourceVersion;
  issuedAtMs: number;
  cacheExpiresAtMs: number;
}): EntitlementSnapshot {
  return {
    accountId: input.accountId,
    planId: 'free',
    status: 'free',
    validFromMs: null,
    validUntilMs: null,
    features: [],
    sourceSubscriptionId: null,
    sourceVersion: input.sourceVersion,
    revision: 1,
    issuedAtMs: input.issuedAtMs,
    cacheExpiresAtMs: input.cacheExpiresAtMs,
  };
}

function nextStatusForSignal(
  current: EntitlementStatus,
  signal: EntitlementSignalType
): EntitlementStatus | null {
  switch (signal) {
    case 'ACCOUNT_CREATED':
      return current === 'free' ? 'free' : null;
    case 'SUBSCRIPTION_ACTIVATED':
      return 'premium_active';
    case 'CANCELLATION_SCHEDULED':
      return current === 'premium_active' ? 'premium_cancel_at_period_end' : null;
    case 'SUBSCRIPTION_RESUMED':
      return current === 'premium_cancel_at_period_end' ? 'premium_active' : null;
    case 'PAYMENT_FAILED':
      return current === 'premium_active' || current === 'premium_cancel_at_period_end'
        ? 'premium_past_due'
        : null;
    case 'PAYMENT_RECOVERED':
      return current === 'premium_past_due' ? 'premium_active' : null;
    case 'PERIOD_ENDED':
      return current.startsWith('premium_') && current !== 'premium_revoked'
        ? 'premium_expired'
        : null;
    case 'REFUND_CONFIRMED':
    case 'CHARGEBACK_CONFIRMED':
    case 'ADMIN_REVOKED':
      return 'premium_revoked';
  }
}

export function reduceEntitlement(
  current: EntitlementSnapshot,
  signal: EntitlementSignal
): EntitlementReduction {
  if (current.accountId !== signal.accountId) {
    return { ok: false, error: 'ACCOUNT_MISMATCH' };
  }

  if (compareEntitlementSourceVersion(signal.sourceVersion, current.sourceVersion) <= 0) {
    return { ok: true, decision: 'ignored_stale', snapshot: current };
  }

  const nextStatus = nextStatusForSignal(current.status, signal.type);
  if (nextStatus === null) {
    return { ok: false, error: 'INVALID_TRANSITION' };
  }

  const premiumSignal = nextStatus !== 'free';
  if (premiumSignal && signal.sourceSubscriptionId === null) {
    return { ok: false, error: 'MISSING_SUBSCRIPTION' };
  }
  if (
    (nextStatus === 'premium_active' || nextStatus === 'premium_cancel_at_period_end') &&
    signal.validUntilMs === null
  ) {
    return { ok: false, error: 'MISSING_VALID_UNTIL' };
  }
  if (signal.cacheExpiresAtMs < signal.issuedAtMs) {
    return { ok: false, error: 'INVALID_CACHE_EXPIRY' };
  }

  const activePlan =
    nextStatus === 'premium_active' || nextStatus === 'premium_cancel_at_period_end';

  return {
    ok: true,
    decision: 'applied',
    snapshot: {
      accountId: current.accountId,
      planId: activePlan ? 'premium_yearly' : 'free',
      status: nextStatus,
      validFromMs: activePlan ? signal.validFromMs : null,
      validUntilMs: signal.validUntilMs,
      features: activePlan ? PREMIUM_YEARLY_OFFER.features : [],
      sourceSubscriptionId: signal.sourceSubscriptionId,
      sourceVersion: signal.sourceVersion,
      revision: current.revision + 1,
      issuedAtMs: signal.issuedAtMs,
      cacheExpiresAtMs: signal.cacheExpiresAtMs,
    },
  };
}

export function canUsePremiumFeature(input: {
  snapshot: EntitlementSnapshot | null;
  accountState: PulseAccountState;
  accountId: string | null;
  feature: PremiumFeature;
  nowMs: number;
}): boolean {
  const { snapshot, accountState, accountId, feature, nowMs } = input;
  if (
    snapshot === null ||
    accountState !== 'active' ||
    accountId === null ||
    snapshot.accountId !== accountId
  ) {
    return false;
  }

  if (snapshot.status !== 'premium_active' && snapshot.status !== 'premium_cancel_at_period_end') {
    return false;
  }

  if (
    snapshot.validUntilMs === null ||
    nowMs >= snapshot.validUntilMs ||
    nowMs >= snapshot.cacheExpiresAtMs
  ) {
    return false;
  }

  return snapshot.features.includes(feature);
}

export type PlatformBindingStatus =
  'ready' | 'locked_by_entitlement' | 'needs_session' | 'needs_permission' | 'error' | 'removed';

export interface PlatformAccountBinding {
  id: string;
  accountId: string;
  connectorId: string;
  externalAccountKeyHash: string;
  displayLabel: string;
  status: PlatformBindingStatus;
  isActive: boolean;
  createdAtMs: number;
  revision: number;
}

export type BindingAccessDecision =
  'allowed' | 'account_inactive' | 'premium_required' | 'limit_reached';

export function canAddPlatformBinding(input: {
  accountState: PulseAccountState;
  usableBindingCount: number;
  hasPremium: boolean;
  premiumMaxBindingsPerConnector: number;
}): BindingAccessDecision {
  if (input.accountState !== 'active') {
    return 'account_inactive';
  }
  if (input.usableBindingCount === 0) {
    return 'allowed';
  }
  if (!input.hasPremium) {
    return 'premium_required';
  }
  if (
    !Number.isInteger(input.premiumMaxBindingsPerConnector) ||
    input.premiumMaxBindingsPerConnector < 2 ||
    input.usableBindingCount >= input.premiumMaxBindingsPerConnector
  ) {
    return 'limit_reached';
  }
  return 'allowed';
}

export function applyEntitlementLossToBindings(
  bindings: readonly PlatformAccountBinding[]
): PlatformAccountBinding[] {
  return bindings.map((binding) => {
    if (binding.status === 'removed' || binding.isActive) {
      return binding;
    }
    return {
      ...binding,
      status: 'locked_by_entitlement',
      revision: binding.revision + 1,
    };
  });
}

export interface CapturedFormField {
  fieldId: string;
  kind: 'text' | 'textarea' | 'email' | 'tel' | 'url' | 'select';
  label: string;
  value: string;
  autocomplete: string | null;
}

export interface FieldSuggestion {
  suggestionId: string;
  fieldId: string;
  proposedValue: string;
  confidence: number;
  rationale: string;
  sourceRefs: string[];
}

export type SuggestionDecision = 'pending' | 'approved' | 'approved_edited' | 'refused';

const SENSITIVE_FIELD_PATTERN =
  /\b(password|mot de passe|captcha|signature|consent|iban|bank|carte|card|ssn|social security|numéro fiscal|tax id|passeport|passport|national id|santé|health|handicap|disability|religion|origine|ethnicity|race|criminal|casier|work authorization|autorisation de travail|eeo)\b/i;

export function isFormFieldAllowed(field: CapturedFormField): boolean {
  const searchable = `${field.fieldId} ${field.label} ${field.autocomplete ?? ''}`;
  return !SENSITIVE_FIELD_PATTERN.test(searchable);
}

export function filterAllowedFormFields(fields: readonly CapturedFormField[]): CapturedFormField[] {
  return fields.filter(isFormFieldAllowed);
}

export function canApplySuggestion(input: {
  suggestion: FieldSuggestion;
  decision: SuggestionDecision;
  allowedFieldIds: readonly string[];
}): boolean {
  return (
    (input.decision === 'approved' || input.decision === 'approved_edited') &&
    input.allowedFieldIds.includes(input.suggestion.fieldId)
  );
}
