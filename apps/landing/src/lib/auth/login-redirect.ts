const LOGIN_REDIRECT_ROUTES = new Set(['/api/copilot/link', '/dashboard', '/extension/connect']);

export function normalizeLoginRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }

  const pathname = value.split(/[?#]/, 1)[0];
  return LOGIN_REDIRECT_ROUTES.has(pathname) ? value : '/dashboard';
}
