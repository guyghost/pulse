/**
 * Supabase client for the Chrome extension.
 * Shell module: I/O, side effects, singleton.
 *
 * Uses chrome.storage.local as the backing store for auth sessions,
 * since Chrome extension service workers have no access to window.localStorage.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jhgjtlkfewuiiofxfrvh.supabase.co';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY ??
  import.meta.env.PUBLIC_SUPABASE_KEY ??
  '';

const NORMALIZED_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY.trim();

const hasSupabaseKey = NORMALIZED_SUPABASE_ANON_KEY.length > 0;

let client: SupabaseClient | null = null;

/**
 * Get or create the Supabase client singleton.
 * Safe to call from both service worker and side panel.
 */
export const getSupabaseClient = (): SupabaseClient => {
  if (!client) {
    if (!hasSupabaseKey) {
      throw new Error('Missing VITE_SUPABASE_ANON_KEY for MissionPulse extension.');
    }

    client = createClient(SUPABASE_URL, NORMALIZED_SUPABASE_ANON_KEY, {
      auth: {
        storage: {
          getItem: async (key: string): Promise<string | null> => {
            const result = await chrome.storage.local.get(key);
            return (result[key] as string) ?? null;
          },
          setItem: async (key: string, value: string): Promise<void> => {
            await chrome.storage.local.set({ [key]: value });
          },
          removeItem: async (key: string): Promise<void> => {
            await chrome.storage.local.remove(key);
          },
        },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
};
