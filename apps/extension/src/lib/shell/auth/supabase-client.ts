/**
 * Supabase client for the Chrome extension.
 * Shell module: I/O, side effects, singleton.
 *
 * Uses chrome.storage.local as the backing store for auth sessions,
 * since Chrome extension service workers have no access to window.localStorage.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jhgjtlkfewuiiofxfrvh.supabase.co';

// TODO: Set the actual anon key before deploy.
// This is a public key (safe to embed in client-side code) — it's not a secret.
// Supabase RLS policies enforce data access rules.
const SUPABASE_ANON_KEY = 'PLACEHOLDER_SET_BEFORE_DEPLOY';

let client: SupabaseClient | null = null;

/**
 * Get or create the Supabase client singleton.
 * Safe to call from both service worker and side panel.
 */
export const getSupabaseClient = (): SupabaseClient => {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
