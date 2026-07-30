import {
  addPlatformAccountMachine,
  canAddPlatformBinding,
  switchPlatformAccountMachine,
  type PlatformAccountBinding,
} from '@pulse/domain';
import { createActor } from 'xstate';
import { z } from 'zod';
import {
  fetchConnectedAccountApi,
  projectionHasPremiumFeature,
  refreshExtensionEntitlement,
} from './account-connection';
import { INCLUDED_CONNECTOR_IDS } from '../connectors/build-config';

const ALL_PLATFORM_ACCOUNT_CONNECTORS = [
  { id: 'free-work', label: 'Free-Work', cookieDomains: ['free-work.com'] },
  { id: 'lehibou', label: 'LeHibou', cookieDomains: ['lehibou.com'] },
  { id: 'hiway', label: 'Hiway', cookieDomains: ['hiway-missions.fr'] },
  { id: 'collective', label: 'Collective', cookieDomains: ['collective.work'] },
  { id: 'cherry-pick', label: 'Cherry Pick', cookieDomains: ['cherry-pick.io'] },
  { id: 'malt', label: 'Malt', cookieDomains: ['malt.fr', 'malt.io'] },
] as const;

export type PlatformAccountConnectorId = (typeof ALL_PLATFORM_ACCOUNT_CONNECTORS)[number]['id'];

export const PLATFORM_ACCOUNT_CONNECTORS = ALL_PLATFORM_ACCOUNT_CONNECTORS.filter((connector) =>
  INCLUDED_CONNECTOR_IDS.includes(connector.id)
);

const BindingRowSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string(),
    connector_id: z.string(),
    external_account_key_hash: z.string().regex(/^[a-f0-9]{64}$/),
    display_label: z.string(),
    status: z.enum([
      'ready',
      'locked_by_entitlement',
      'needs_session',
      'needs_permission',
      'error',
      'removed',
    ]),
    is_active: z.boolean(),
    revision: z.number().int().positive(),
    created_at: z.string(),
  })
  .passthrough();

const BindingListSchema = z
  .object({
    bindings: z.array(BindingRowSchema),
    premiumMaxBindingsPerConnector: z.number().int().min(2).max(20),
  })
  .strict();

const BindingMutationSchema = z
  .object({
    result: z.string(),
    binding: BindingRowSchema.optional(),
  })
  .passthrough();

export type PlatformAccountOperationError =
  | 'ACCOUNT_REQUIRED'
  | 'PREMIUM_REQUIRED'
  | 'LIMIT_REACHED'
  | 'SESSION_REQUIRED'
  | 'CONFIRMATION_REQUIRED'
  | 'SESSION_MISMATCH'
  | 'BINDING_NOT_FOUND'
  | 'SERVER_ERROR';

export type PlatformAccountOperationResult =
  | { ok: true; binding: PlatformAccountBinding }
  | { ok: false; error: PlatformAccountOperationError; state: string };

function toBinding(row: z.infer<typeof BindingRowSchema>): PlatformAccountBinding {
  return {
    id: row.id,
    accountId: row.user_id,
    connectorId: row.connector_id,
    externalAccountKeyHash: row.external_account_key_hash,
    displayLabel: row.display_label,
    status: row.status,
    isActive: row.is_active,
    createdAtMs: Date.parse(row.created_at),
    revision: row.revision,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function currentSessionFingerprint(
  connectorId: PlatformAccountConnectorId
): Promise<string | null> {
  const connector = PLATFORM_ACCOUNT_CONNECTORS.find((item) => item.id === connectorId);
  if (!connector) {
    return null;
  }
  const cookieGroups = await Promise.all(
    connector.cookieDomains.map((domain) => chrome.cookies.getAll({ domain }))
  );
  const cookies = cookieGroups
    .flat()
    .filter((cookie) => cookie.value.length > 0)
    .sort((left, right) =>
      `${left.domain}:${left.path}:${left.name}`.localeCompare(
        `${right.domain}:${right.path}:${right.name}`
      )
    );
  if (cookies.length === 0) {
    return null;
  }
  return sha256Hex(
    cookies
      .map((cookie) => `${cookie.domain}:${cookie.path}:${cookie.name}:${cookie.value}`)
      .join('|')
  );
}

export async function currentSessionMatchesPlatformBinding(
  binding: PlatformAccountBinding
): Promise<boolean> {
  const connector = PLATFORM_ACCOUNT_CONNECTORS.find((item) => item.id === binding.connectorId);
  if (!connector) {
    return false;
  }
  const fingerprint = await currentSessionFingerprint(connector.id);
  return fingerprint !== null && fingerprint === binding.externalAccountKeyHash;
}

export async function listPlatformAccounts(): Promise<PlatformAccountBinding[]> {
  const response = await fetchConnectedAccountApi('/api/extension/bindings');
  if (!response.ok) {
    return [];
  }
  const parsed = BindingListSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.bindings.map(toBinding) : [];
}

export async function addCurrentPlatformAccount(input: {
  connectorId: PlatformAccountConnectorId;
  displayLabel: string;
  confirmed: boolean;
  nowMs: number;
}): Promise<PlatformAccountOperationResult> {
  const actor = createActor(addPlatformAccountMachine);
  actor.start();
  actor.send({ type: 'ADD_REQUESTED' });

  const [account, bindings] = await Promise.all([
    refreshExtensionEntitlement(),
    listPlatformAccounts(),
  ]);
  if (account.accountId === null) {
    actor.send({ type: 'ACCOUNT_INACTIVE' });
    return {
      ok: false,
      error: 'ACCOUNT_REQUIRED',
      state: String(actor.getSnapshot().value),
    };
  }
  const connectorBindings = bindings.filter(
    (binding) => binding.connectorId === input.connectorId && binding.status !== 'removed'
  );
  const access = canAddPlatformBinding({
    accountState: 'active',
    usableBindingCount: connectorBindings.length,
    hasPremium: projectionHasPremiumFeature(account, 'multi_account', input.nowMs),
    premiumMaxBindingsPerConnector: account.premiumMaxBindingsPerConnector,
  });
  if (access === 'premium_required') {
    actor.send({ type: 'ACCESS_DENIED_PREMIUM' });
    return {
      ok: false,
      error: 'PREMIUM_REQUIRED',
      state: String(actor.getSnapshot().value),
    };
  }
  if (access === 'limit_reached') {
    actor.send({ type: 'LIMIT_REACHED' });
    return {
      ok: false,
      error: 'LIMIT_REACHED',
      state: String(actor.getSnapshot().value),
    };
  }
  actor.send({ type: 'ACCESS_READY' });

  const fingerprint = await currentSessionFingerprint(input.connectorId);
  if (fingerprint === null) {
    actor.send({ type: 'SESSION_MISSING' });
    return {
      ok: false,
      error: 'SESSION_REQUIRED',
      state: String(actor.getSnapshot().value),
    };
  }
  actor.send({ type: 'SESSION_DETECTED' });
  if (!input.confirmed) {
    actor.send({ type: 'CANCEL_REQUESTED' });
    return {
      ok: false,
      error: 'CONFIRMATION_REQUIRED',
      state: String(actor.getSnapshot().value),
    };
  }
  actor.send({ type: 'CONFIRM_BINDING' });

  const response = await fetchConnectedAccountApi('/api/extension/bindings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      connectorId: input.connectorId,
      externalAccountKeyHash: fingerprint,
      displayLabel: input.displayLabel,
    }),
  });
  const parsed = BindingMutationSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) {
    actor.send({ type: 'PERSIST_FAILED_RETRYABLE' });
    return { ok: false, error: 'SERVER_ERROR', state: String(actor.getSnapshot().value) };
  }
  if (parsed.data.result === 'premium_required') {
    return { ok: false, error: 'PREMIUM_REQUIRED', state: 'premium_required_terminal' };
  }
  if (parsed.data.result === 'limit_reached') {
    return { ok: false, error: 'LIMIT_REACHED', state: 'limit_reached_terminal' };
  }
  if (parsed.data.result !== 'created' || parsed.data.binding === undefined) {
    actor.send({ type: 'PERSIST_FAILED_TERMINAL' });
    return { ok: false, error: 'SERVER_ERROR', state: String(actor.getSnapshot().value) };
  }
  actor.send({ type: 'BINDING_COMMITTED' });
  return { ok: true, binding: toBinding(parsed.data.binding) };
}

export async function switchCurrentPlatformAccount(input: {
  bindingId: string;
  nowMs: number;
}): Promise<PlatformAccountOperationResult> {
  const actor = createActor(switchPlatformAccountMachine);
  actor.start();
  actor.send({ type: 'SWITCH_REQUESTED' });
  const [account, bindings] = await Promise.all([
    refreshExtensionEntitlement(),
    listPlatformAccounts(),
  ]);
  const target = bindings.find((binding) => binding.id === input.bindingId);
  if (!target) {
    actor.send({ type: 'SWITCH_FAILED_TERMINAL' });
    return {
      ok: false,
      error: 'BINDING_NOT_FOUND',
      state: String(actor.getSnapshot().value),
    };
  }
  if (target.isActive) {
    actor.send({ type: 'TARGET_ALREADY_ACTIVE' });
    return { ok: true, binding: target };
  }
  if (!projectionHasPremiumFeature(account, 'multi_account', input.nowMs)) {
    actor.send({ type: 'ACCESS_DENIED_PREMIUM' });
    return {
      ok: false,
      error: 'PREMIUM_REQUIRED',
      state: String(actor.getSnapshot().value),
    };
  }
  const fingerprint = await currentSessionFingerprint(
    target.connectorId as PlatformAccountConnectorId
  );
  if (fingerprint === null || fingerprint !== target.externalAccountKeyHash) {
    actor.send({ type: 'SESSION_MISMATCH' });
    return {
      ok: false,
      error: 'SESSION_MISMATCH',
      state: String(actor.getSnapshot().value),
    };
  }
  actor.send({ type: 'SESSION_MATCHES_TARGET' });

  const response = await fetchConnectedAccountApi('/api/extension/bindings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bindingId: target.id, sessionKeyHash: fingerprint }),
  });
  const parsed = BindingMutationSchema.safeParse(await response.json().catch(() => null));
  if (
    !response.ok ||
    !parsed.success ||
    !['switched', 'already_active'].includes(parsed.data.result) ||
    parsed.data.binding === undefined
  ) {
    actor.send({ type: 'SWITCH_FAILED_RETRYABLE' });
    return { ok: false, error: 'SERVER_ERROR', state: String(actor.getSnapshot().value) };
  }
  actor.send({ type: 'SWITCH_COMMITTED' });
  return { ok: true, binding: toBinding(parsed.data.binding) };
}
