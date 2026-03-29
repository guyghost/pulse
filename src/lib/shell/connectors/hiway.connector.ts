import { BaseConnector } from './base.connector';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';
import type { Mission } from '../../core/types/mission';
import { parseHiwayJSON } from '../../core/connectors/hiway-json-parser';
import { type Result, type AppError, ok, err, createConnectorError } from '$lib/core/errors';

const BASE_URL = 'https://hiway-missions.fr';

// ============================================================================
// SUPABASE CONFIG
// Extracted from hiway-missions.fr public client bundle.
// The anon key is designed to be public (used with RLS on the backend).
// ============================================================================
const SUPABASE_URL = 'https://jhgjtlkfewuiiofxfrvh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZ2p0bGtmZXd1aWlvZnhmcnZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA3NTQxMTYsImV4cCI6MjA2NjMzMDExNn0.yK8_ORWq4SYjQH11zvwA4g1MrIeagzErnWtoJWeukPI';
const SUPABASE_TABLE = 'freelance_posted_missions';

/**
 * Hiway connector using Supabase REST API.
 * Fetches mission data directly from the JSON endpoint instead of HTML scraping.
 */
export class HiwayConnector extends BaseConnector {
  readonly id = 'hiway';
  readonly name = 'Hiway';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=hiway-missions.fr&sz=32';

  protected get sessionCheckUrl() {
    return `${BASE_URL}/admin/freelance/missions`;
  }

  /** Hiway uses a public Supabase API with an anon key — no user session needed */
  async detectSession(_now: number): Promise<Result<boolean, AppError>> {
    return ok(this.isConfigured());
  }

  /**
   * Checks if the Supabase configuration is valid (not using placeholders).
   */
  private isConfigured(): boolean {
    return !SUPABASE_URL.includes('<project-id>') && !SUPABASE_ANON_KEY.includes('<anon-key>');
  }

  async fetchMissions(
    now: number,
    context?: ConnectorSearchContext
  ): Promise<Result<Mission[], AppError>> {
    // Guard: Require actual Supabase config
    if (!this.isConfigured()) {
      return err(
        createConnectorError(
          'Hiway connector not configured: Supabase URL and anon key required',
          {
            connectorId: this.id,
            phase: 'fetch',
            context: { reason: 'placeholder_config' },
          },
          now
        )
      );
    }

    try {
      // Build Supabase REST API URL with query params
      // Select all columns, order by created_at descending, limit to 100
      const endpoint = new URL(`/rest/v1/${SUPABASE_TABLE}`, SUPABASE_URL);
      endpoint.searchParams.set('select', '*');
      endpoint.searchParams.set('order', 'created_at.desc');
      endpoint.searchParams.set('limit', '100');

      // Add search context filters
      if (context?.query) {
        // Supabase ilike filter on title column
        endpoint.searchParams.set('title', `ilike.*${context.query}*`);
      }

      if (context?.lastSync) {
        endpoint.searchParams.set('created_at', `gt.${context.lastSync.toISOString()}`);
      }

      const result = await this.fetchJSON(endpoint.toString(), now, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!result.ok) {
        return err(
          createConnectorError(
            `Failed to fetch missions from Hiway Supabase: ${result.error.message}`,
            {
              connectorId: this.id,
              phase: 'fetch',
              context: { originalError: result.error },
            },
            now
          )
        );
      }

      // Parse JSON response into missions
      const rows = Array.isArray(result.value) ? result.value : [];
      const missions = parseHiwayJSON(rows, new Date(now), BASE_URL);

      // Last sync tracking (non-critical)
      this.setLastSync(now).catch(() => {});

      return ok(missions);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(
        createConnectorError(
          `Unexpected error fetching missions from Hiway: ${message}`,
          {
            connectorId: this.id,
            phase: 'fetch',
            context: { originalError: message },
          },
          now
        )
      );
    }
  }
}
