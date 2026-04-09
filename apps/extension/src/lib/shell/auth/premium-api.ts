/**
 * Premium API client — calls the landing backend for premium features.
 * Shell module: I/O, async, network.
 *
 * Sends the Supabase JWT for authentication.
 * Returns null if the user is not authenticated, not premium, or on server error.
 */

import type { GeneratedAsset, GenerationType } from '../../core/types/generation';
import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import { getSupabaseClient } from './supabase-client';

/** The landing backend URL */
const API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:5174'
  : 'https://missionpulse.app';

/**
 * Generate content using the premium GLM backend.
 */
export const generatePremium = async (
  missionId: string,
  type: GenerationType,
  mission: Mission,
  profile: UserProfile,
): Promise<GeneratedAsset | null> => {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return null;
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
      if (import.meta.env.DEV) {
        console.warn('[PremiumAPI] Generate failed:', response.status, await response.text());
      }
      return null;
    }

    const data = await response.json();

    if (!data.content || typeof data.content !== 'string') {
      return null;
    }

    const now = Date.now();
    return {
      id: `gen-${type}-${missionId}-${now}`,
      missionId,
      type,
      content: data.content,
      createdAt: now,
      modelUsed: data.model ?? 'glm-4-flash',
    };
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error('[PremiumAPI] Generate error:', err);
    }
    return null;
  }
};
