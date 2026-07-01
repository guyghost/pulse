import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  if (
    env.MISSIONPULSE_PERF_CACHE_HTML === '1' &&
    event.request.method === 'GET' &&
    response.headers.get('content-type')?.includes('text/html')
  ) {
    response.headers.set('cache-control', 'public, max-age=300');
  }

  return response;
};
