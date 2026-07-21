import { CopilotApiError } from './errors';
import { verifyCopilotSessionToken } from './session-token';
import type { CopilotPrincipal } from './types';

export interface CopilotEntitlementProfile {
  subscriptionStatus: string | null;
  subscriptionPeriodEnd: string | null;
  copilotAccessRevokedAt: string | null;
  creditBalance: number;
}

export interface CopilotAuthorizationDependencies {
  signingSecret: string;
  rolloutEnabled: string | undefined;
  rolloutUserIds: string | undefined;
  now: () => Date;
  loadProfile: (userId: string) => Promise<CopilotEntitlementProfile | null>;
  grantMonthlyCredits: (userId: string, now: Date) => Promise<number | null>;
}

export interface CopilotEntitlementSnapshot {
  status: 'free' | 'active' | 'expired' | 'revoked';
  subject: string;
  issuedAtMs: number | null;
  expiresAtMs: number | null;
  creditsRemaining: number;
}

export function assertCopilotRollout(
  userId: string,
  dependencies: CopilotAuthorizationDependencies
): void {
  if (dependencies.rolloutEnabled !== 'true') {
    throw new CopilotApiError(403, 'ROLLOUT_DISABLED', 'Copilot rollout is disabled');
  }
  const allowlist = dependencies.rolloutUserIds
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  // The Eve deletion/retention capability is not production-complete. Until
  // that gate is lifted, a global rollout is forbidden: an explicit internal
  // pilot allowlist is mandatory even when the release flag is true.
  if (!allowlist || allowlist.length === 0 || !allowlist.includes(userId)) {
    throw new CopilotApiError(403, 'ROLLOUT_DISABLED', 'Copilot rollout is disabled');
  }
}

export async function loadCopilotEntitlement(
  userId: string,
  dependencies: CopilotAuthorizationDependencies
): Promise<CopilotEntitlementSnapshot> {
  const profile = await dependencies.loadProfile(userId);
  const nowMs = dependencies.now().getTime();
  const creditsRemaining = profile?.creditBalance ?? 0;
  if (!Number.isSafeInteger(creditsRemaining) || creditsRemaining < 0) {
    throw new CopilotApiError(503, 'PERSISTENCE_FAILED', 'Invalid Copilot credit balance', true);
  }
  if (profile?.copilotAccessRevokedAt !== null && profile?.copilotAccessRevokedAt !== undefined) {
    return {
      status: 'revoked',
      subject: userId,
      issuedAtMs: null,
      expiresAtMs: null,
      creditsRemaining,
    };
  }
  if (profile?.subscriptionStatus !== 'premium') {
    return {
      status: 'free',
      subject: userId,
      issuedAtMs: null,
      expiresAtMs: null,
      creditsRemaining,
    };
  }
  const expiresAtMs = profile.subscriptionPeriodEnd
    ? Date.parse(profile.subscriptionPeriodEnd)
    : Number.NaN;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    return {
      status: 'expired',
      subject: userId,
      issuedAtMs: null,
      expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : null,
      creditsRemaining,
    };
  }
  return {
    status: 'active',
    subject: userId,
    issuedAtMs: nowMs,
    expiresAtMs,
    creditsRemaining,
  };
}

async function withGrantedMonthlyCredits(
  entitlement: CopilotEntitlementSnapshot,
  dependencies: CopilotAuthorizationDependencies
): Promise<CopilotEntitlementSnapshot> {
  if (entitlement.status !== 'active') return entitlement;
  const grantedBalance = await dependencies.grantMonthlyCredits(
    entitlement.subject,
    dependencies.now()
  );
  if (
    typeof grantedBalance !== 'number' ||
    !Number.isSafeInteger(grantedBalance) ||
    grantedBalance < 0
  ) {
    throw new CopilotApiError(
      503,
      'PERSISTENCE_FAILED',
      'Premium monthly credit grant could not be reconciled',
      true
    );
  }
  return { ...entitlement, creditsRemaining: grantedBalance };
}

/** Explicit entitlement sync may materialize the idempotent monthly grant. */
export async function syncCopilotEntitlement(
  userId: string,
  dependencies: CopilotAuthorizationDependencies
): Promise<CopilotEntitlementSnapshot> {
  return withGrantedMonthlyCredits(
    await loadCopilotEntitlement(userId, dependencies),
    dependencies
  );
}

export async function loadActiveCopilotPrincipal(
  userId: string,
  dependencies: CopilotAuthorizationDependencies
): Promise<{ principal: CopilotPrincipal; expiresAtMs: number }> {
  assertCopilotRollout(userId, dependencies);
  const entitlement = await withGrantedMonthlyCredits(
    await loadCopilotEntitlement(userId, dependencies),
    dependencies
  );
  if (entitlement.status !== 'active' || entitlement.expiresAtMs === null) {
    throw new CopilotApiError(403, 'ENTITLEMENT_DENIED', 'Premium entitlement is not active');
  }
  return {
    principal: { userId, creditsRemaining: entitlement.creditsRemaining },
    expiresAtMs: entitlement.expiresAtMs,
  };
}

export async function authenticateCopilotRequest(
  request: Request,
  dependencies: CopilotAuthorizationDependencies
): Promise<{ principal: CopilotPrincipal; entitlement: CopilotEntitlementSnapshot }> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length <= 7) {
    throw new CopilotApiError(401, 'AUTHENTICATION_REQUIRED', 'Copilot session required');
  }
  const userId = await verifyCopilotSessionToken({
    token: authorization.slice(7),
    secret: dependencies.signingSecret,
    nowMs: dependencies.now().getTime(),
  });
  const entitlement = await loadCopilotEntitlement(userId, dependencies);
  return {
    principal: { userId, creditsRemaining: entitlement.creditsRemaining },
    entitlement,
  };
}

export async function authorizeCopilotRequest(
  request: Request,
  dependencies: CopilotAuthorizationDependencies
): Promise<{ principal: CopilotPrincipal; expiresAtMs: number }> {
  const authenticated = await authenticateCopilotRequest(request, dependencies);
  assertCopilotRollout(authenticated.principal.userId, dependencies);
  if (
    authenticated.entitlement.status !== 'active' ||
    authenticated.entitlement.expiresAtMs === null
  ) {
    throw new CopilotApiError(403, 'ENTITLEMENT_DENIED', 'Premium entitlement is not active');
  }
  const expiresAtMs = authenticated.entitlement.expiresAtMs;
  const entitlement = await withGrantedMonthlyCredits(authenticated.entitlement, dependencies);
  return {
    principal: {
      userId: authenticated.principal.userId,
      creditsRemaining: entitlement.creditsRemaining,
    },
    expiresAtMs,
  };
}

export function isAllowedCopilotRedirect(
  candidate: string,
  configuredAllowlist: string | undefined
): boolean {
  if (!configuredAllowlist) return false;
  const allowed = configuredAllowlist
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return allowed.includes(candidate);
}
