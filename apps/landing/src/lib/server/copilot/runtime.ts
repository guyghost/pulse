import { env } from '$env/dynamic/private';

import { createSupabaseAdminClient } from '$lib/server/supabase';
import { grantPremiumMonthlyCredits } from '$lib/server/credits';

import {
  authenticateCopilotRequest,
  authorizeCopilotRequest,
  type CopilotAuthorizationDependencies,
  type CopilotEntitlementProfile,
} from './auth';
import { createEveCopilotProvider, readEveProviderConfig } from './providers';
import { CopilotService } from './service';
import { SupabaseCopilotRepository } from './supabase-repository';

export function copilotAuthorizationDependencies(): CopilotAuthorizationDependencies {
  const admin = createSupabaseAdminClient();
  return {
    signingSecret: env.COPILOT_SESSION_SIGNING_SECRET ?? '',
    rolloutEnabled: env.COPILOT_ROLLOUT_ENABLED,
    rolloutUserIds: env.COPILOT_ROLLOUT_USER_IDS,
    now: () => new Date(),
    grantMonthlyCredits: (userId, now) => grantPremiumMonthlyCredits(admin, userId, now),
    async loadProfile(userId): Promise<CopilotEntitlementProfile | null> {
      const { data, error } = await admin
        .from('profiles')
        .select(
          'subscription_status, subscription_period_end, copilot_access_revoked_at, credit_balance'
        )
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error('Copilot entitlement lookup failed');
      if (!data) return null;
      return {
        subscriptionStatus:
          typeof data.subscription_status === 'string' ? data.subscription_status : null,
        subscriptionPeriodEnd:
          typeof data.subscription_period_end === 'string' ? data.subscription_period_end : null,
        copilotAccessRevokedAt:
          typeof data.copilot_access_revoked_at === 'string'
            ? data.copilot_access_revoked_at
            : null,
        creditBalance: typeof data.credit_balance === 'number' ? data.credit_balance : Number.NaN,
      };
    },
  };
}

export async function createAuthorizedCopilotRuntime(request: Request) {
  const authorization = copilotAuthorizationDependencies();
  const { principal, expiresAtMs } = await authorizeCopilotRequest(request, authorization);
  const admin = createSupabaseAdminClient();
  const repository = new SupabaseCopilotRepository(admin);
  const providerConfig = readEveProviderConfig({
    MISSIONPULSE_EVE_ENABLED: env.MISSIONPULSE_EVE_ENABLED,
    MISSIONPULSE_EVE_BASE_URL: env.MISSIONPULSE_EVE_BASE_URL ?? env.EVE_BASE_URL,
    MISSIONPULSE_EVE_TIMEOUT_MS: env.MISSIONPULSE_EVE_TIMEOUT_MS,
  });
  return {
    principal,
    expiresAtMs,
    service: new CopilotService({
      repository,
      provider: createEveCopilotProvider(providerConfig),
      createId: () => crypto.randomUUID(),
      now: () => new Date(),
    }),
  };
}

export async function createAuthenticatedCopilotRuntime(request: Request) {
  const authorization = copilotAuthorizationDependencies();
  const { principal, entitlement } = await authenticateCopilotRequest(request, authorization);
  const admin = createSupabaseAdminClient();
  const repository = new SupabaseCopilotRepository(admin);
  const providerConfig = readEveProviderConfig({
    MISSIONPULSE_EVE_ENABLED: env.MISSIONPULSE_EVE_ENABLED,
    MISSIONPULSE_EVE_BASE_URL: env.MISSIONPULSE_EVE_BASE_URL ?? env.EVE_BASE_URL,
    MISSIONPULSE_EVE_TIMEOUT_MS: env.MISSIONPULSE_EVE_TIMEOUT_MS,
  });
  return {
    principal,
    entitlement,
    service: new CopilotService({
      repository,
      provider: createEveCopilotProvider(providerConfig),
      createId: () => crypto.randomUUID(),
      now: () => new Date(),
    }),
  };
}
