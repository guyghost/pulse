import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CREDIT_PACKS, PREMIUM_MONTHLY_CREDITS, type CreditPackId } from '$lib/credits';

export const creditPackVariantIds: Record<CreditPackId, string | undefined> = {
  starter: env.LEMON_SQUEEZY_CREDITS_STARTER_VARIANT_ID,
  pro: env.LEMON_SQUEEZY_CREDITS_PRO_VARIANT_ID,
  power: env.LEMON_SQUEEZY_CREDITS_POWER_VARIANT_ID,
};

export function currentPremiumCreditPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isPremiumProfileActive(profile: {
  subscription_status?: string | null;
  subscription_period_end?: string | null;
}): boolean {
  if (profile.subscription_status !== 'premium') {
    return false;
  }
  if (!profile.subscription_period_end) {
    return true;
  }
  return new Date(profile.subscription_period_end).getTime() > Date.now();
}

export async function grantPremiumMonthlyCredits(
  supabase: SupabaseClient,
  userId: string,
  now = new Date()
): Promise<number | null> {
  const { data, error } = await supabase.rpc('grant_premium_monthly_credits', {
    p_user_id: userId,
    p_period: currentPremiumCreditPeriod(now),
    p_amount: PREMIUM_MONTHLY_CREDITS,
  });

  if (error) {
    console.error('Credit bonus grant failed:', error.message);
    return null;
  }

  return typeof data === 'number' ? data : null;
}

export async function consumeGenerationCredit(
  supabase: SupabaseClient,
  userId: string,
  metadata: Record<string, unknown>
): Promise<number | null> {
  const { data, error } = await supabase.rpc('consume_generation_credit', {
    p_user_id: userId,
    p_source: 'generation',
    p_metadata: metadata,
  });

  if (error) {
    console.error('Credit consumption failed:', error.message);
    return null;
  }

  return typeof data === 'number' ? data : null;
}

export async function refundGenerationCredit(
  supabase: SupabaseClient,
  userId: string,
  metadata: Record<string, unknown>
): Promise<number | null> {
  const { data, error } = await supabase.rpc('refund_generation_credit', {
    p_user_id: userId,
    p_source: 'generation_refund',
    p_metadata: metadata,
  });

  if (error) {
    console.error('Credit refund failed:', error.message);
    return null;
  }

  return typeof data === 'number' ? data : null;
}

export function getCreditPackVariantId(packId: CreditPackId): string | null {
  return creditPackVariantIds[packId] ?? null;
}

export function getCreditAmountForVariant(variantId: string | null | undefined): number | null {
  if (!variantId) {
    return null;
  }

  const packEntry = Object.entries(creditPackVariantIds).find(([, id]) => id === variantId);
  if (!packEntry) {
    return null;
  }

  return CREDIT_PACKS[packEntry[0] as CreditPackId].credits;
}
