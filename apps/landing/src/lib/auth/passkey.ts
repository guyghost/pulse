import { createSupabaseBrowserClient } from '$lib/supabase';
import { env } from '$env/dynamic/public';

type JsonObject = Record<string, unknown>;

type PasskeyOptionsResponse = {
  challenge_id: string;
  options: unknown;
};

type AuthSessionPayload = {
  access_token?: string;
  refresh_token?: string;
  session?: {
    access_token?: string;
    refresh_token?: string;
  };
};

type CredentialWithToJson = PublicKeyCredential & {
  toJSON?: () => unknown;
  response: AuthenticatorAttestationResponse | AuthenticatorAssertionResponse;
  authenticatorAttachment?: string | null;
};

type PublicKeyCredentialJsonParsers = typeof PublicKeyCredential & {
  parseCreationOptionsFromJSON?: (options: unknown) => PublicKeyCredentialCreationOptions;
  parseRequestOptionsFromJSON?: (options: unknown) => PublicKeyCredentialRequestOptions;
};

export function browserSupportsPasskeys(): boolean {
  return typeof PublicKeyCredential !== 'undefined' && Boolean(navigator.credentials);
}

export function passkeyErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'La creation ou validation du passkey a ete annulee.';
    }

    if (error.name === 'SecurityError') {
      return "Le passkey doit etre utilise depuis l'origine locale autorisee.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "L'operation passkey a echoue.";
}

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Reponse passkey invalide: ${label}`);
  }

  return value as JsonObject;
}

function stringField(source: JsonObject, field: string): string {
  const value = source[field];

  if (typeof value !== 'string') {
    throw new Error(`Reponse passkey invalide: ${field}`);
  }

  return value;
}

function optionalStringField(source: JsonObject, field: string): string | undefined {
  const value = source[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`Reponse passkey invalide: ${field}`);
  }

  return value;
}

function arrayField<T>(source: JsonObject, field: string): T[] {
  const value = source[field];

  if (!Array.isArray(value)) {
    throw new Error(`Reponse passkey invalide: ${field}`);
  }

  return value as T[];
}

function optionalArrayField<T>(source: JsonObject, field: string): T[] | undefined {
  const value = source[field];

  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Reponse passkey invalide: ${field}`);
  }

  return value as T[];
}

function unwrapPublicKeyOptions(options: unknown): JsonObject {
  const optionsObject = asObject(options, 'options');
  const publicKey = optionsObject.publicKey;

  return publicKey ? asObject(publicKey, 'options.publicKey') : optionsObject;
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function serializeOptionalBuffer(buffer: ArrayBuffer | null): string | undefined {
  return buffer ? arrayBufferToBase64Url(buffer) : undefined;
}

function parseCreationOptions(options: unknown): PublicKeyCredentialCreationOptions {
  const jsonOptions = unwrapPublicKeyOptions(options);
  const credential = PublicKeyCredential as PublicKeyCredentialJsonParsers;

  if (typeof credential.parseCreationOptionsFromJSON === 'function') {
    return credential.parseCreationOptionsFromJSON(jsonOptions);
  }

  const user = asObject(jsonOptions.user, 'user');
  const excludeCredentials = optionalArrayField<JsonObject>(jsonOptions, 'excludeCredentials');

  return {
    ...jsonOptions,
    challenge: base64UrlToArrayBuffer(stringField(jsonOptions, 'challenge')),
    user: {
      ...user,
      id: base64UrlToArrayBuffer(stringField(user, 'id')),
    } as PublicKeyCredentialUserEntity,
    pubKeyCredParams: arrayField<PublicKeyCredentialParameters>(jsonOptions, 'pubKeyCredParams'),
    excludeCredentials: excludeCredentials?.map((descriptor) => ({
      ...descriptor,
      id: base64UrlToArrayBuffer(stringField(descriptor, 'id')),
      type: (optionalStringField(descriptor, 'type') ?? 'public-key') as PublicKeyCredentialType,
    })) as PublicKeyCredentialDescriptor[] | undefined,
  } as PublicKeyCredentialCreationOptions;
}

function parseRequestOptions(options: unknown): PublicKeyCredentialRequestOptions {
  const jsonOptions = unwrapPublicKeyOptions(options);
  const credential = PublicKeyCredential as PublicKeyCredentialJsonParsers;

  if (typeof credential.parseRequestOptionsFromJSON === 'function') {
    return credential.parseRequestOptionsFromJSON(jsonOptions);
  }

  const allowCredentials = optionalArrayField<JsonObject>(jsonOptions, 'allowCredentials');

  return {
    ...jsonOptions,
    challenge: base64UrlToArrayBuffer(stringField(jsonOptions, 'challenge')),
    allowCredentials: allowCredentials?.map((descriptor) => ({
      ...descriptor,
      id: base64UrlToArrayBuffer(stringField(descriptor, 'id')),
      type: (optionalStringField(descriptor, 'type') ?? 'public-key') as PublicKeyCredentialType,
    })) as PublicKeyCredentialDescriptor[] | undefined,
  } as PublicKeyCredentialRequestOptions;
}

function assertPublicKeyCredential(credential: Credential | null): CredentialWithToJson {
  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error('Le navigateur n’a pas retourne de passkey valide.');
  }

  return credential as CredentialWithToJson;
}

function serializeCreationCredential(credential: CredentialWithToJson): unknown {
  if (typeof credential.toJSON === 'function') {
    return credential.toJSON();
  }

  const response = credential.response as AuthenticatorAttestationResponse;

  return {
    id: credential.id,
    rawId: credential.id,
    response: {
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
    },
    type: 'public-key',
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
  };
}

function serializeRequestCredential(credential: CredentialWithToJson): unknown {
  if (typeof credential.toJSON === 'function') {
    return credential.toJSON();
  }

  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    id: credential.id,
    rawId: credential.id,
    response: {
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      signature: arrayBufferToBase64Url(response.signature),
      userHandle: serializeOptionalBuffer(response.userHandle),
    },
    type: 'public-key',
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
  };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text) as unknown;
}

async function supabaseAuthRequest<T>(
  path: string,
  body: JsonObject,
  accessToken?: string
): Promise<T> {
  const response = await fetch(`${env.PUBLIC_SUPABASE_URL}/auth/v1${path}`, {
    method: 'POST',
    headers: {
      apikey: env.PUBLIC_SUPABASE_ANON_KEY!,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    const errorPayload = asObject(payload, 'error');
    const message =
      optionalStringField(errorPayload, 'msg') ??
      optionalStringField(errorPayload, 'message') ??
      optionalStringField(errorPayload, 'error_description') ??
      'La requete passkey a echoue.';

    throw new Error(message);
  }

  return payload as T;
}

export async function requestPasskeyAccountSetup(email: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error('Email requis');
  }

  if (!browserSupportsPasskeys()) {
    throw new Error('Ce navigateur ne prend pas en charge les passkeys.');
  }

  const redirectTo = `${window.location.origin}/api/auth/callback?next=/register/passkey`;
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    throw error;
  }
}

export async function registerCurrentUserPasskey(): Promise<void> {
  if (!browserSupportsPasskeys()) {
    throw new Error('Ce navigateur ne prend pas en charge les passkeys.');
  }

  const supabase = createSupabaseBrowserClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (sessionError) {
    throw sessionError;
  }

  if (userError) {
    throw userError;
  }

  if (!userData.user || !sessionData.session) {
    throw new Error('Session introuvable. Relancez la creation de compte.');
  }

  const options = await supabaseAuthRequest<PasskeyOptionsResponse>(
    '/passkeys/registration/options',
    {},
    sessionData.session.access_token
  );
  const publicKey = parseCreationOptions(options.options);
  const credential = assertPublicKeyCredential(await navigator.credentials.create({ publicKey }));

  await supabaseAuthRequest(
    '/passkeys/registration/verify',
    {
      challenge_id: options.challenge_id,
      credential_response: serializeCreationCredential(credential),
    },
    sessionData.session.access_token
  );
}

export async function signInWithPasskey(): Promise<void> {
  if (!browserSupportsPasskeys()) {
    throw new Error('Ce navigateur ne prend pas en charge les passkeys.');
  }

  const supabase = createSupabaseBrowserClient();
  const options = await supabaseAuthRequest<PasskeyOptionsResponse>(
    '/passkeys/authentication/options',
    {
      gotrue_meta_security: {},
    }
  );
  const publicKey = parseRequestOptions(options.options);
  const credential = assertPublicKeyCredential(await navigator.credentials.get({ publicKey }));
  const session = await supabaseAuthRequest<AuthSessionPayload>('/passkeys/authentication/verify', {
    challenge_id: options.challenge_id,
    credential_response: serializeRequestCredential(credential),
  });
  const accessToken = session.access_token ?? session.session?.access_token;
  const refreshToken = session.refresh_token ?? session.session?.refresh_token;

  if (!accessToken || !refreshToken) {
    throw new Error("La session passkey n'a pas pu etre creee.");
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw error;
  }
}
