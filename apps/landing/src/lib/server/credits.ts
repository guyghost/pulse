import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CREDIT_PACKS, type CreditPackId } from '$lib/credits';

export const creditPackVariantIds: Record<CreditPackId, string | undefined> = {
  starter: env.LEMON_SQUEEZY_CREDITS_STARTER_VARIANT_ID,
  pro: env.LEMON_SQUEEZY_CREDITS_PRO_VARIANT_ID,
  power: env.LEMON_SQUEEZY_CREDITS_POWER_VARIANT_ID,
};

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
