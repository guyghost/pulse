import { createHmac } from 'node:crypto';
import { resolveApiRateLimitState } from '@pulse/domain/preproduction';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getSecurityServerConfig } from './security-config';

export type RateLimitScope =
  | 'extension_link_start_ip'
  | 'extension_link_start_install'
  | 'extension_link_status_ip'
  | 'extension_link_status_link'
  | 'extension_link_resolution_user';

export const NO_STORE_HEADERS = { 'cache-control': 'no-store' } as const;

const RateLimitRpcResultSchema = z
  .object({
    allowed: z.boolean(),
    remaining: z.number().int().min(0),
    retry_after_seconds: z.number().int().min(0).max(3600),
  })
  .strict();

export interface RateLimitConstraint {
  scope: RateLimitScope;
  subject: string;
}

export type RateLimitDecision =
  | { ok: true }
  | { ok: false; kind: 'denied'; retryAfterSeconds: number }
  | { ok: false; kind: 'unavailable' };

export function hashRateLimitSubject(
  secret: string,
  scope: RateLimitScope,
  subject: string
): string {
  return createHmac('sha256', secret).update(scope).update('\0').update(subject).digest('hex');
}

async function consumeRateLimit(
  supabase: SupabaseClient,
  constraint: RateLimitConstraint,
  now: Date,
  config: ReturnType<typeof getSecurityServerConfig>
): Promise<RateLimitDecision> {
  const limit = config.rateLimits[constraint.scope];
  if (
    config.rateLimitHashSecret === null ||
    constraint.subject.length < 1 ||
    constraint.subject.length > 512
  ) {
    resolveApiRateLimitState('subject_invalid');
    return { ok: false, kind: 'unavailable' };
  }

  const { data, error } = await supabase.rpc('consume_api_rate_limit', {
    p_scope: constraint.scope,
    p_subject_hash: hashRateLimitSubject(
      config.rateLimitHashSecret,
      constraint.scope,
      constraint.subject
    ),
    p_limit: limit,
    p_window_seconds: config.rateLimitWindowSeconds,
    p_now: now.toISOString(),
  });
  if (error) {
    resolveApiRateLimitState('store_failed');
    return { ok: false, kind: 'unavailable' };
  }

  const parsed = RateLimitRpcResultSchema.safeParse(data);
  if (!parsed.success) {
    resolveApiRateLimitState('store_failed');
    return { ok: false, kind: 'unavailable' };
  }
  if (!parsed.data.allowed) {
    resolveApiRateLimitState('bucket_denied');
    return {
      ok: false,
      kind: 'denied',
      retryAfterSeconds: Math.max(1, parsed.data.retry_after_seconds),
    };
  }
  resolveApiRateLimitState('bucket_allowed');
  return { ok: true };
}

export async function enforceRateLimits(
  supabase: SupabaseClient,
  constraints: readonly RateLimitConstraint[],
  now: Date,
  config: ReturnType<typeof getSecurityServerConfig> = getSecurityServerConfig()
): Promise<RateLimitDecision> {
  for (const constraint of constraints) {
    const decision = await consumeRateLimit(supabase, constraint, now, config);
    if (!decision.ok) {
      return decision;
    }
  }
  return { ok: true };
}
