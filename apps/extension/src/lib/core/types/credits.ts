export type CreditPackId = 'starter' | 'pro' | 'power';

export type CreditTransactionReason =
  | 'purchase'
  | 'premium_monthly_bonus'
  | 'generation'
  | 'adjustment';

export interface CreditPack {
  readonly id: CreditPackId;
  readonly credits: number;
  readonly priceCents: number;
  readonly label: string;
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: 'starter', label: 'Starter', credits: 5, priceCents: 490 },
  { id: 'pro', label: 'Pro', credits: 15, priceCents: 1290 },
  { id: 'power', label: 'Power', credits: 40, priceCents: 2990 },
];

export const PREMIUM_MONTHLY_CREDITS = 20;
