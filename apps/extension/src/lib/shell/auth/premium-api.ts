/**
 * Premium API client — calls the landing backend for premium features.
 * Shell module: I/O, async, network.
 *
 * Sends the Supabase JWT for authentication.
 * Returns a typed result so callers can distinguish checkout prompts from backend failures.
 */

import type { GeneratedAsset, GenerationType } from '../../core/types/generation';
import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import { getSupabaseClient } from './supabase-client';

/** The landing backend URL */
const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:5174' : 'https://missionpulse.app';

export interface PremiumGenerationResult {
  asset: GeneratedAsset | null;
  error?: 'INSUFFICIENT_CREDITS' | 'GENERATION_FAILED';
  creditBalance?: number;
  creditsConsumed?: number;
}

/**
 * Generate content using the premium GLM backend.
 */
export const generatePremium = async (
  missionId: string,
  type: GenerationType,
  mission: Mission,
  profile: UserProfile
): Promise<PremiumGenerationResult> => {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { asset: null, error: 'GENERATION_FAILED' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        missionId,
        type,
        mission: {
          title: mission.title,
          description: mission.description,
          client: mission.client,
          stack: mission.stack,
          location: mission.location,
        },
        profile: {
          jobTitle: profile.jobTitle,
          stack: profile.stack,
          seniority: profile.seniority,
          location: profile.location,
        },
      }),
    });

    if (!response.ok) {
      let errorPayload: { error?: string; creditBalance?: number; creditsConsumed?: number } = {};
      try {
        errorPayload = await response.json();
      } catch {
        // Non-JSON response: fall through to generic failure.
      }
      if (errorPayload.error === 'INSUFFICIENT_CREDITS') {
        return {
          asset: null,
          error: 'INSUFFICIENT_CREDITS',
          creditBalance: errorPayload.creditBalance ?? 0,
          creditsConsumed: errorPayload.creditsConsumed ?? 0,
        };
      }
      if (import.meta.env.DEV) {
        console.warn('[PremiumAPI] Generate failed:', response.status);
      }
      return { asset: null, error: 'GENERATION_FAILED' };
    }

    const data = await response.json();

    if (!data.content || typeof data.content !== 'string') {
      return { asset: null, error: 'GENERATION_FAILED' };
    }

    const now = Date.now();
    return {
      asset: {
        id: `gen-${type}-${missionId}-${now}`,
        missionId,
        type,
        content: data.content,
        createdAt: now,
        modelUsed: data.model ?? 'glm-4-flash',
      },
      creditBalance: typeof data.creditBalance === 'number' ? data.creditBalance : undefined,
      creditsConsumed: typeof data.creditsConsumed === 'number' ? data.creditsConsumed : undefined,
    };
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error('[PremiumAPI] Generate error:', err);
    }
    return { asset: null, error: 'GENERATION_FAILED' };
  }
};
