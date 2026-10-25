import { LEMON_SQUEEZY_WEBHOOK_SECRET } from '$app/env/private';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const verifyLemonSqueezyWebhook = (rawBody: string, signature: string): boolean => {
  const secret = LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LEMON_SQUEEZY_WEBHOOK_SECRET not configured');
    return false;
  }

  const hmac = createHmac('sha256', secret);
  const digest = hmac.update(rawBody).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
};
