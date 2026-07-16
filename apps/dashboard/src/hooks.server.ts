import { env } from '$env/dynamic/private';
import { classifyReleaseCache, parsePerformanceCacheMode, type CacheDecision } from '@pulse/domain';
import type { Handle } from '@sveltejs/kit';

function hasVerifiedUser(locals: App.Locals): boolean {
  return Reflect.get(locals, 'session') != null;
}

function applyCacheDecision(response: Response, decision: CacheDecision): void {
  if (decision.kind === 'non_html') {
    return;
  }
  if (decision.cacheControl.action === 'set') {
    response.headers.set('cache-control', decision.cacheControl.value);
  }
  if (decision.kind === 'public' && decision.vary.action === 'set') {
    response.headers.set('vary', decision.vary.value);
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  const decision = classifyReleaseCache(
    {
      surface: 'dashboard',
      method: event.request.method,
      routeId: event.route.id,
      performanceCacheMode: parsePerformanceCacheMode(env.MISSIONPULSE_PERF_CACHE_HTML),
      hasAuthorizationHeader: event.request.headers.has('authorization'),
      hasAnyCookieHeader: event.request.headers.has('cookie'),
      hasVerifiedUser: hasVerifiedUser(event.locals),
    },
    {
      status: response.status,
      contentType: response.headers.get('content-type'),
      hasSetCookie: response.headers.has('set-cookie'),
      existingCacheControl: response.headers.get('cache-control'),
      existingVary: response.headers.get('vary'),
    }
  );
  applyCacheDecision(response, decision);

  return response;
};
