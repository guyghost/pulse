import { env } from '$env/dynamic/public';

export function parseCanonicalPublicOrigin(configured: string | undefined): string | null {
  if (typeof configured !== 'string' || configured.length === 0) {
    return null;
  }

  try {
    const parsed = new URL(configured);
    const localHttp =
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    if (parsed.protocol !== 'https:' && !localHttp) {
      return null;
    }
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getCanonicalPublicOrigin(): string | null {
  return parseCanonicalPublicOrigin(env.PUBLIC_LANDING_URL);
}
