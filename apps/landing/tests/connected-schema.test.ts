import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(resolve(testDir, '../supabase/schema.sql'), 'utf8');

function tableBlock(tableName: string): string {
  const pattern = new RegExp(
    `create table if not exists public\\.${tableName} \\([\\s\\S]*?\\n\\);`,
    'm'
  );
  const match = schemaSql.match(pattern);
  return match?.[0] ?? '';
}

describe('connected dashboard schema', () => {
  it('keeps the consolidated Supabase schema aligned with connected dashboard tables', () => {
    const requiredTables = [
      'mission_sources',
      'missions',
      'mission_scores',
      'mission_duplicates',
      'applications',
      'application_pipeline_events',
      'generated_application_assets',
      'candidate_profiles',
      'candidate_experiences',
      'candidate_education',
      'candidate_skills',
      'candidate_links',
      'profile_imports',
      'extension_devices',
      'sync_status',
      'dashboard_alert_preferences',
      'sync_conflicts',
      'candidate_profile_field_suggestions',
      'connector_health_events',
    ];

    for (const tableName of requiredTables) {
      expect(schemaSql, `${tableName} table should be present`).toContain(
        `create table if not exists public.${tableName}`
      );
      expect(schemaSql, `${tableName} RLS should be enabled`).toContain(
        `alter table public.${tableName} enable row level security`
      );
    }
  });

  it('includes columns required by extension-dashboard sync conflict handling', () => {
    expect(tableBlock('candidate_profiles')).toContain('updated_by text not null');
    expect(tableBlock('sync_status')).toContain('retry_after_at timestamptz');
    expect(tableBlock('sync_conflicts')).toContain(
      "entity in ('applications', 'candidate_profile')"
    );
    expect(tableBlock('candidate_profile_field_suggestions')).toContain(
      "field in ('title', 'summary', 'target_role')"
    );
    expect(tableBlock('sync_status')).toContain("'alert_preferences'");
    expect(tableBlock('dashboard_alert_preferences')).toContain('score_threshold integer');
    expect(tableBlock('dashboard_alert_preferences')).toContain('required_stacks text[]');
  });

  it('enforces one pending sync conflict or CV suggestion per field', () => {
    expect(schemaSql).toContain(
      'create unique index if not exists idx_sync_conflicts_pending_unique'
    );
    expect(schemaSql).toContain("where status = 'pending'");
    expect(schemaSql).toContain(
      "coalesce(device_id, '00000000-0000-0000-0000-000000000000'::uuid)"
    );
    expect(schemaSql).toContain(
      'create unique index if not exists idx_candidate_profile_field_suggestions_pending_unique'
    );
    expect(schemaSql).toContain('on public.candidate_profile_field_suggestions');
    expect(schemaSql).toContain('(user_id, profile_id, field, source)');
  });

  it('preserves the canonical application pipeline stages in SQL constraints', () => {
    const applications = tableBlock('applications');
    const pipelineEvents = tableBlock('application_pipeline_events');
    const stages = [
      'detected',
      'selected',
      'application_prepared',
      'applied',
      'interview',
      'offer',
      'accepted',
      'rejected',
      'archived',
    ];

    for (const stage of stages) {
      expect(applications).toContain(`'${stage}'`);
      expect(pipelineEvents).toContain(`'${stage}'`);
    }
    expect(pipelineEvents).toContain('from_stage text check');
    expect(pipelineEvents).toContain('from_stage is null or from_stage in');
    expect(pipelineEvents).toContain('constraint application_pipeline_events_transition_check');
    expect(pipelineEvents).toContain("from_stage is null and to_stage = 'detected'");
    expect(pipelineEvents).toContain(
      "from_stage = 'detected' and to_stage in ('selected', 'archived')"
    );
    expect(pipelineEvents).toContain(
      "from_stage = 'offer' and to_stage in ('accepted', 'rejected', 'archived')"
    );
  });
});
