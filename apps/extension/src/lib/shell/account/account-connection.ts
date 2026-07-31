import {
  canUsePremiumFeature,
  extensionAccountLinkMachine,
  type EntitlementSnapshot,
  type EntitlementStatus,
  type PremiumFeature,
} from '@pulse/domain';
import { createActor } from 'xstate';
import { z } from 'zod';

const ACCOUNT_CONNECTION_STORAGE_KEY = 'pulse_account_connection_v1';
const DEFAULT_APP_ORIGIN = 'https://missionpulse.app';
const DEFAULT_MAX_BINDINGS_PER_CONNECTOR = 2;

const PremiumFeatureSchema = z.enum(['multi_account', 'application_form_ai_assistance']);

const EntitlementStatusSchema = z.enum([
  'free',
  'premium_active',
  'premium_cancel_at_period_end',
  'premium_past_due',
  'premium_expired',
  'premium_revoked',
]);

const ServerEntitlementSchema = z
  .object({
    user_id: z.string().min(1),
    plan_id: z.enum(['free', 'premium_yearly']),
    status: EntitlementStatusSchema,
    valid_from: z.string().nullable(),
    valid_until: z.string().nullable(),
    features: z.array(PremiumFeatureSchema),
    source_subscription_id: z.string().nullable(),
    provider_updated_at: z.string(),
    event_priority: z.number().int(),
    provider_event_id: z.string(),
    revision: z.number().int().positive(),
    issued_at: z.string(),
    cache_expires_at: z.string(),
  })
  .strict();

const LinkStartResponseSchema = z
  .object({
    linkId: z.string().uuid(),
    expiresAt: z.string(),
    approvalUrl: z.string().url(),
  })
  .strict();

const LinkStatusResponseSchema = z.discriminatedUnion('state', [
  z
    .object({
      state: z.literal('pending'),
    })
    .passthrough(),
  z
    .object({
      state: z.enum(['refused', 'expired', 'cancelled']),
    })
    .passthrough(),
  z
    .object({
      state: z.literal('approved'),
      accountId: z.string().min(1),
      installId: z.string().min(8),
      entitlement: ServerEntitlementSchema.nullable(),
      premiumMaxBindingsPerConnector: z.number().int().min(2).max(20),
    })
    .strict(),
]);

const EntitlementResponseSchema = z
  .object({
    accountId: z.string().min(1),
    entitlement: ServerEntitlementSchema.nullable(),
    premiumMaxBindingsPerConnector: z.number().int().min(2).max(20),
  })
  .strict();

const StoredConnectionSchema = z
  .object({
    installId: z.string().min(8).max(128),
    deviceSecret: z.string().min(43).max(128).nullable(),
    linkId: z.string().uuid().nullable(),
    linkExpiresAt: z.string().nullable(),
    accountId: z.string().nullable(),
    entitlement: z.unknown().nullable(),
    premiumMaxBindingsPerConnector: z.number().int().min(2).max(20),
    workflowSnapshot: z.unknown().nullable(),
    lastError: z.string().nullable(),
  })
  .strict();

type StoredConnection = z.infer<typeof StoredConnectionSchema>;

export type ExtensionAccountLinkState =
  | 'unlinked'
  | 'creating_link'
  | 'awaiting_user_approval'
  | 'linked'
  | 'refused'
  | 'expired'
  | 'cancelled'
  | 'error';

export interface ExtensionAccountProjection {
  state: ExtensionAccountLinkState;
  accountId: string | null;
  entitlement: EntitlementSnapshot | null;
  premiumMaxBindingsPerConnector: number;
  lastError: string | null;
}

export interface StartAccountLinkResult {
  projection: ExtensionAccountProjection;
  approvalUrl: string | null;
}

function appOrigin(): string {
  const configured = import.meta.env.VITE_MISSIONPULSE_APP_URL;
  return typeof configured === 'string' && /^https?:\/\//.test(configured)
    ? configured.replace(/\/$/, '')
    : DEFAULT_APP_ORIGIN;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function newOpaqueSecret(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toMs(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toEntitlementSnapshot(
  raw: z.infer<typeof ServerEntitlementSchema> | null
): EntitlementSnapshot | null {
  if (raw === null) {
    return null;
  }
  const issuedAtMs = toMs(raw.issued_at);
  const cacheExpiresAtMs = toMs(raw.cache_expires_at);
  if (issuedAtMs === null || cacheExpiresAtMs === null) {
    return null;
  }
  return {
    accountId: raw.user_id,
    planId: raw.plan_id,
    status: raw.status,
    validFromMs: toMs(raw.valid_from),
    validUntilMs: toMs(raw.valid_until),
    features: raw.features,
    sourceSubscriptionId: raw.source_subscription_id,
    sourceVersion: {
      providerUpdatedAt: raw.provider_updated_at,
      eventPriority: raw.event_priority,
      providerEventId: raw.provider_event_id,
    },
    revision: raw.revision,
    issuedAtMs,
    cacheExpiresAtMs,
  };
}

function readEntitlement(raw: unknown): EntitlementSnapshot | null {
  if (raw === null) {
    return null;
  }
  const parsed = z
    .object({
      accountId: z.string(),
      planId: z.enum(['free', 'premium_yearly']),
      status: EntitlementStatusSchema,
      validFromMs: z.number().nullable(),
      validUntilMs: z.number().nullable(),
      features: z.array(PremiumFeatureSchema),
      sourceSubscriptionId: z.string().nullable(),
      sourceVersion: z.object({
        providerUpdatedAt: z.string(),
        eventPriority: z.number().int(),
        providerEventId: z.string(),
      }),
      revision: z.number().int().positive(),
      issuedAtMs: z.number(),
      cacheExpiresAtMs: z.number(),
    })
    .strict()
    .safeParse(raw);
  return parsed.success ? parsed.data : null;
}

async function readConnection(): Promise<StoredConnection | null> {
  const stored = await chrome.storage.local.get(ACCOUNT_CONNECTION_STORAGE_KEY);
  const parsed = StoredConnectionSchema.safeParse(stored[ACCOUNT_CONNECTION_STORAGE_KEY]);
  return parsed.success ? parsed.data : null;
}

async function writeConnection(connection: StoredConnection): Promise<void> {
  await chrome.storage.local.set({ [ACCOUNT_CONNECTION_STORAGE_KEY]: connection });
}

function defaultConnection(): StoredConnection {
  return {
    installId: crypto.randomUUID(),
    deviceSecret: null,
    linkId: null,
    linkExpiresAt: null,
    accountId: null,
    entitlement: null,
    premiumMaxBindingsPerConnector: DEFAULT_MAX_BINDINGS_PER_CONNECTOR,
    workflowSnapshot: null,
    lastError: null,
  };
}

function workflowState(connection: StoredConnection): ExtensionAccountLinkState {
  if (connection.accountId !== null && connection.deviceSecret !== null) {
    return 'linked';
  }
  if (connection.linkId !== null && connection.deviceSecret !== null) {
    return 'awaiting_user_approval';
  }
  return connection.lastError === null ? 'unlinked' : 'error';
}

function projectionFrom(connection: StoredConnection | null): ExtensionAccountProjection {
  if (connection === null) {
    return {
      state: 'unlinked',
      accountId: null,
      entitlement: null,
      premiumMaxBindingsPerConnector: DEFAULT_MAX_BINDINGS_PER_CONNECTOR,
      lastError: null,
    };
  }
  return {
    state: workflowState(connection),
    accountId: connection.accountId,
    entitlement: readEntitlement(connection.entitlement),
    premiumMaxBindingsPerConnector: connection.premiumMaxBindingsPerConnector,
    lastError: connection.lastError,
  };
}

function newLinkActor() {
  const actor = createActor(extensionAccountLinkMachine);
  actor.start();
  return actor;
}

export async function getExtensionAccountProjection(): Promise<ExtensionAccountProjection> {
  return projectionFrom(await readConnection());
}

export async function startExtensionAccountLink(): Promise<StartAccountLinkResult> {
  const current = (await readConnection()) ?? defaultConnection();
  if (current.accountId !== null && current.deviceSecret !== null) {
    return { projection: projectionFrom(current), approvalUrl: null };
  }

  const actor = newLinkActor();
  actor.send({ type: 'LINK_REQUESTED' });
  const secret = newOpaqueSecret();

  try {
    const response = await fetch(`${appOrigin()}/api/extension/link/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        installId: current.installId,
        secretHash: await sha256Hex(secret),
      }),
    });
    if (!response.ok) {
      actor.send({
        type: response.status >= 500 ? 'CREATE_FAILED_RETRYABLE' : 'CREATE_FAILED_TERMINAL',
      });
      throw new Error(response.status >= 500 ? 'LINK_CREATE_RETRYABLE' : 'LINK_CREATE_REJECTED');
    }

    const parsed = LinkStartResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      actor.send({ type: 'CREATE_FAILED_TERMINAL' });
      throw new Error('LINK_RESPONSE_INVALID');
    }
    actor.send({ type: 'LINK_CREATED' });
    const next: StoredConnection = {
      ...current,
      deviceSecret: secret,
      linkId: parsed.data.linkId,
      linkExpiresAt: parsed.data.expiresAt,
      accountId: null,
      entitlement: null,
      workflowSnapshot: actor.getPersistedSnapshot(),
      lastError: null,
    };
    await writeConnection(next);
    return { projection: projectionFrom(next), approvalUrl: parsed.data.approvalUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LINK_CREATE_FAILED';
    const failed: StoredConnection = {
      ...current,
      deviceSecret: null,
      linkId: null,
      linkExpiresAt: null,
      workflowSnapshot: actor.getPersistedSnapshot(),
      lastError: message,
    };
    await writeConnection(failed);
    throw error;
  }
}

export async function pollExtensionAccountLink(): Promise<ExtensionAccountProjection> {
  const current = await readConnection();
  if (current === null || current.linkId === null || current.deviceSecret === null) {
    return projectionFrom(current);
  }

  const response = await fetch(`${appOrigin()}/api/extension/link/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ linkId: current.linkId, secret: current.deviceSecret }),
  });
  if (!response.ok) {
    const next = { ...current, lastError: 'LINK_STATUS_FAILED' };
    await writeConnection(next);
    return projectionFrom(next);
  }

  const parsed = LinkStatusResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    const next = { ...current, lastError: 'LINK_STATUS_INVALID' };
    await writeConnection(next);
    return projectionFrom(next);
  }

  if (parsed.data.state === 'pending') {
    return projectionFrom(current);
  }
  if (parsed.data.state !== 'approved') {
    const terminal: StoredConnection = {
      ...current,
      deviceSecret: null,
      linkId: null,
      linkExpiresAt: null,
      accountId: null,
      entitlement: null,
      workflowSnapshot: null,
      lastError: null,
    };
    await writeConnection(terminal);
    return {
      ...projectionFrom(terminal),
      state: parsed.data.state,
    };
  }

  const linked: StoredConnection = {
    ...current,
    installId: parsed.data.installId,
    linkId: null,
    linkExpiresAt: null,
    accountId: parsed.data.accountId,
    entitlement: toEntitlementSnapshot(parsed.data.entitlement),
    premiumMaxBindingsPerConnector: parsed.data.premiumMaxBindingsPerConnector,
    workflowSnapshot: null,
    lastError: null,
  };
  await writeConnection(linked);
  return projectionFrom(linked);
}

export async function refreshExtensionEntitlement(): Promise<ExtensionAccountProjection> {
  const current = await readConnection();
  if (current === null || current.accountId === null || current.deviceSecret === null) {
    return projectionFrom(current);
  }

  const response = await fetch(`${appOrigin()}/api/extension/entitlement`, {
    headers: { authorization: `Bearer ${current.deviceSecret}` },
  });
  if (response.status === 401) {
    const revoked: StoredConnection = {
      ...current,
      deviceSecret: null,
      linkId: null,
      linkExpiresAt: null,
      accountId: null,
      entitlement: null,
      workflowSnapshot: null,
      lastError: 'DEVICE_REVOKED',
    };
    await writeConnection(revoked);
    return projectionFrom(revoked);
  }
  if (!response.ok) {
    return projectionFrom({ ...current, lastError: 'ENTITLEMENT_REFRESH_FAILED' });
  }

  const parsed = EntitlementResponseSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.accountId !== current.accountId) {
    return projectionFrom({ ...current, lastError: 'ENTITLEMENT_RESPONSE_INVALID' });
  }
  const refreshed: StoredConnection = {
    ...current,
    entitlement: toEntitlementSnapshot(parsed.data.entitlement),
    premiumMaxBindingsPerConnector: parsed.data.premiumMaxBindingsPerConnector,
    lastError: null,
  };
  await writeConnection(refreshed);
  return projectionFrom(refreshed);
}

export async function unlinkExtensionAccount(): Promise<ExtensionAccountProjection> {
  const current = await readConnection();
  if (current !== null && current.deviceSecret !== null && current.accountId !== null) {
    await fetch(`${appOrigin()}/api/extension/entitlement`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${current.deviceSecret}` },
    }).catch(() => undefined);
  }
  const unlinked: StoredConnection = {
    ...(current ?? defaultConnection()),
    deviceSecret: null,
    linkId: null,
    linkExpiresAt: null,
    accountId: null,
    entitlement: null,
    workflowSnapshot: null,
    lastError: null,
  };
  await writeConnection(unlinked);
  return projectionFrom(unlinked);
}

export async function fetchConnectedAccountApi(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const connection = await readConnection();
  if (connection?.deviceSecret === null || connection?.deviceSecret === undefined) {
    return new Response(JSON.stringify({ error: 'ACCOUNT_REQUIRED' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${connection.deviceSecret}`);
  return fetch(`${appOrigin()}${path}`, { ...init, headers });
}

export function projectionHasPremiumFeature(
  projection: ExtensionAccountProjection,
  feature: PremiumFeature,
  nowMs: number
): boolean {
  return canUsePremiumFeature({
    snapshot: projection.entitlement,
    accountState: projection.accountId === null ? 'anonymous' : 'active',
    accountId: projection.accountId,
    feature,
    nowMs,
  });
}

export function entitlementStatusLabel(status: EntitlementStatus | null): string {
  switch (status) {
    case 'premium_active':
      return 'Premium actif';
    case 'premium_cancel_at_period_end':
      return 'Premium actif jusqu’à échéance';
    case 'premium_past_due':
      return 'Paiement à régulariser';
    case 'premium_expired':
      return 'Premium expiré';
    case 'premium_revoked':
      return 'Premium révoqué';
    case 'free':
    case null:
      return 'Gratuit';
  }
}
