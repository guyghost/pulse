export type CreditPackId = 'starter' | 'pro' | 'power';

export type CreditTransactionReason =
  | 'purchase'
  | 'premium_monthly_bonus'
  | 'generation'
  | 'adjustment';

export interface CreditPack {
  id: CreditPackId;
  credits: number;
  priceCents: number;
  label: string;
}

export const PREMIUM_MONTHLY_CREDITS = 20;

export const CREDIT_PACKS: Record<CreditPackId, CreditPack> = {
  starter: { id: 'starter', label: 'Starter', credits: 5, priceCents: 490 },
  pro: { id: 'pro', label: 'Pro', credits: 15, priceCents: 1290 },
  power: { id: 'power', label: 'Power', credits: 40, priceCents: 2990 },
};

export const CREDIT_PACK_LIST = Object.values(CREDIT_PACKS);

export function isCreditPackId(value: unknown): value is CreditPackId {
  return typeof value === 'string' && value in CREDIT_PACKS;
}

export function formatPrice(priceCents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(priceCents / 100);
}
