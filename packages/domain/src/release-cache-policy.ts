export type WebSurface = 'landing' | 'dashboard';
export type PerformanceCacheMode = 'enabled' | 'disabled' | 'unknown';

export interface CacheRequestFacts {
  surface: WebSurface;
  method: string;
  routeId: string | null;
  performanceCacheMode: PerformanceCacheMode;
  hasAuthorizationHeader: boolean;
  hasAnyCookieHeader: boolean;
  hasVerifiedUser: boolean;
}

export interface CacheResponseFacts {
  status: number;
  contentType: string | null;
  hasSetCookie: boolean;
  existingCacheControl: string | null;
  existingVary: string | null;
}

export type CacheDecision =
  | {
      kind: 'public';
      cacheControl:
        | { action: 'set'; value: 'public, max-age=300' }
        | { action: 'preserve_exact'; value: string };
      vary: { action: 'set'; value: string } | { action: 'preserve_exact'; value: string };
    }
  | {
      kind: 'private';
      cacheControl:
        | { action: 'set'; value: 'private, no-store' }
        | { action: 'preserve_stricter'; value: string };
      vary: { action: 'preserve'; value: string | null };
    }
  | { kind: 'non_html'; cacheControl: null; vary: null };

const PUBLIC_CACHE_CONTROL = 'public, max-age=300' as const;
const PRIVATE_CACHE_CONTROL = 'private, no-store' as const;
const REQUIRED_VARY = ['Cookie', 'Authorization'] as const;
const LANDING_PUBLIC_ROUTES = new Set(['/', '/privacy', '/login']);
const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

type ContentKind = 'html' | 'non_html' | 'unknown';

interface CacheControlDirective {
  readonly name: string;
  readonly value: string | null;
}

function isQuotedString(value: string): boolean {
  if (value.length < 2 || value[0] !== '"' || value[value.length - 1] !== '"') {
    return false;
  }

  for (let index = 1; index < value.length - 1; index += 1) {
    const code = value.charCodeAt(index);
    if (value[index] === '\\') {
      index += 1;
      if (index >= value.length - 1) {
        return false;
      }
      const escapedCode = value.charCodeAt(index);
      if (escapedCode !== 0x09 && (escapedCode < 0x20 || escapedCode > 0x7e)) {
        return false;
      }
      continue;
    }
    if (value[index] === '"' || code === 0x7f) {
      return false;
    }
    const isQuotedText =
      code === 0x09 ||
      code === 0x20 ||
      code === 0x21 ||
      (code >= 0x23 && code <= 0x5b) ||
      (code >= 0x5d && code <= 0x7e) ||
      (code >= 0x80 && code <= 0xff);
    if (!isQuotedText) {
      return false;
    }
  }

  return true;
}

function splitOutsideQuotes(value: string, delimiter: string): string[] | null {
  const segments: string[] = [];
  let start = 0;
  let inQuotes = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (inQuotes) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inQuotes = false;
      }
      continue;
    }
    if (character === '"') {
      inQuotes = true;
    } else if (character === delimiter) {
      segments.push(value.slice(start, index));
      start = index + 1;
    }
  }

  if (inQuotes || escaped) {
    return null;
  }
  segments.push(value.slice(start));
  return segments;
}

function classifyContentType(raw: string | null): ContentKind {
  if (raw === null || raw.trim() === '') {
    return 'unknown';
  }

  const segments = splitOutsideQuotes(raw, ';');
  if (!segments || segments.length === 0) {
    return 'unknown';
  }

  const essence = segments[0].trim();
  const slash = essence.indexOf('/');
  if (
    slash <= 0 ||
    slash !== essence.lastIndexOf('/') ||
    !HTTP_TOKEN.test(essence.slice(0, slash)) ||
    !HTTP_TOKEN.test(essence.slice(slash + 1))
  ) {
    return 'unknown';
  }

  const parameterNames = new Set<string>();
  for (const rawParameter of segments.slice(1)) {
    const parameter = rawParameter.trim();
    const equals = parameter.indexOf('=');
    if (equals <= 0) {
      return 'unknown';
    }
    const name = parameter.slice(0, equals).trim();
    const value = parameter.slice(equals + 1).trim();
    const normalizedName = name.toLowerCase();
    if (
      !HTTP_TOKEN.test(name) ||
      parameterNames.has(normalizedName) ||
      (!HTTP_TOKEN.test(value) && !isQuotedString(value))
    ) {
      return 'unknown';
    }
    parameterNames.add(normalizedName);
  }

  return essence.toLowerCase() === 'text/html' ? 'html' : 'non_html';
}

function parseCacheControl(raw: string | null): CacheControlDirective[] | null {
  if (raw === null) {
    return [];
  }

  const parts = splitOutsideQuotes(raw, ',');
  if (!parts || parts.length === 0) {
    return null;
  }

  const directives: CacheControlDirective[] = [];
  const names = new Set<string>();
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (part === '') {
      return null;
    }
    const equals = part.indexOf('=');
    const rawName = equals === -1 ? part : part.slice(0, equals).trim();
    const rawValue = equals === -1 ? null : part.slice(equals + 1).trim();
    const name = rawName.toLowerCase();
    if (
      !HTTP_TOKEN.test(rawName) ||
      names.has(name) ||
      (rawValue !== null && !HTTP_TOKEN.test(rawValue) && !isQuotedString(rawValue))
    ) {
      return null;
    }
    names.add(name);
    directives.push({ name, value: rawValue });
  }

  return directives;
}

function hasExactPublicCacheControl(directives: readonly CacheControlDirective[]): boolean {
  if (directives.length !== 2) {
    return false;
  }
  const publicDirective = directives.find(({ name }) => name === 'public');
  const maxAgeDirective = directives.find(({ name }) => name === 'max-age');
  return publicDirective?.value === null && maxAgeDirective?.value === '300';
}

function hasStricterPrivateCacheControl(
  directives: readonly CacheControlDirective[] | null
): boolean {
  if (directives === null) {
    return false;
  }
  return (
    directives.some(({ name, value }) => name === 'private' && value === null) &&
    directives.some(({ name, value }) => name === 'no-store' && value === null)
  );
}

function mergeVary(
  raw: string | null
):
  | { readonly kind: 'conflict' }
  | { readonly kind: 'mergeable'; readonly value: string; readonly exact: boolean } {
  if (raw === null) {
    return { kind: 'mergeable', value: REQUIRED_VARY.join(', '), exact: false };
  }

  const rawTokens = raw.split(',');
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const rawToken of rawTokens) {
    const token = rawToken.trim();
    const normalized = token.toLowerCase();
    if (token === '' || token === '*' || !HTTP_TOKEN.test(token)) {
      return { kind: 'conflict' };
    }
    if (!seen.has(normalized) && normalized !== 'cookie' && normalized !== 'authorization') {
      tokens.push(token);
    }
    seen.add(normalized);
  }

  tokens.push(...REQUIRED_VARY);
  const value = tokens.join(', ');
  return { kind: 'mergeable', value, exact: raw === value };
}

function privateDecision(response: Readonly<CacheResponseFacts>): CacheDecision {
  const directives = parseCacheControl(response.existingCacheControl);
  return {
    kind: 'private',
    cacheControl: hasStricterPrivateCacheControl(directives)
      ? { action: 'preserve_stricter', value: response.existingCacheControl as string }
      : { action: 'set', value: PRIVATE_CACHE_CONTROL },
    vary: { action: 'preserve', value: response.existingVary },
  };
}

export function parsePerformanceCacheMode(raw: string | undefined): PerformanceCacheMode {
  if (raw === undefined || raw === '0') {
    return 'disabled';
  }
  return raw === '1' ? 'enabled' : 'unknown';
}

export function classifyReleaseCache(
  request: Readonly<CacheRequestFacts>,
  response: Readonly<CacheResponseFacts>
): CacheDecision {
  const contentKind = classifyContentType(response.contentType);
  if (contentKind === 'non_html') {
    return { kind: 'non_html', cacheControl: null, vary: null };
  }
  if (contentKind === 'unknown') {
    return privateDecision(response);
  }

  const cacheControl = parseCacheControl(response.existingCacheControl);
  const cacheControlIsPublicCompatible =
    response.existingCacheControl === null ||
    (cacheControl !== null && hasExactPublicCacheControl(cacheControl));
  const vary = mergeVary(response.existingVary);
  const isAllowlistedLandingRoute =
    request.surface === 'landing' &&
    request.routeId !== null &&
    LANDING_PUBLIC_ROUTES.has(request.routeId);
  const mayUsePublicCache =
    request.performanceCacheMode === 'enabled' &&
    (request.method === 'GET' || request.method === 'HEAD') &&
    isAllowlistedLandingRoute &&
    !request.hasAuthorizationHeader &&
    !request.hasAnyCookieHeader &&
    !request.hasVerifiedUser &&
    response.status === 200 &&
    !response.hasSetCookie &&
    cacheControlIsPublicCompatible &&
    vary.kind === 'mergeable';

  if (!mayUsePublicCache || vary.kind !== 'mergeable') {
    return privateDecision(response);
  }

  return {
    kind: 'public',
    cacheControl:
      response.existingCacheControl === null
        ? { action: 'set', value: PUBLIC_CACHE_CONTROL }
        : { action: 'preserve_exact', value: response.existingCacheControl },
    vary: vary.exact
      ? { action: 'preserve_exact', value: vary.value }
      : { action: 'set', value: vary.value },
  };
}
