import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  COPILOT_PREMIUM_RETENTION_METRIC,
  COPILOT_PROVIDER_COST_METRIC,
} from '../../src/lib/server/copilot/metrics';

const testDir = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(testDir, '../../supabase/migrations/20260721130000_add_copilot_metrics.sql'),
  'utf8'
);

describe('Copilot pilot metrics', () => {
  it('stamps immutable review, uncertainty and terminal milestones', () => {
    expect(migration).toContain('add column if not exists review_ready_at timestamptz');
    expect(migration).toContain('add column if not exists first_uncertain_at timestamptz');
    expect(migration).toContain('add column if not exists terminal_at timestamptz');
    expect(migration).toContain('new.review_ready_at := old.review_ready_at');
    expect(migration).toContain('new.first_uncertain_at := old.first_uncertain_at');
    expect(migration).toContain('new.terminal_at := old.terminal_at');
    expect(migration).toContain('new.provider_dispatched_at := old.provider_dispatched_at');
    expect(migration).toContain(
      'if new.provider_dispatched_at is null then\n      new.provider_dispatched_at := null'
    );
    expect(migration).toContain('new.reviewed_at := old.reviewed_at');
    expect(migration).toContain('new.reviewed_at := null');
    expect(migration).toContain('copilot_jobs_provider_dispatched_order');
    expect(migration).toContain('copilot_jobs_terminal_milestone_required');
  });

  it('uses the database clock for cross-service ordering', () => {
    expect(migration).toContain('new.provider_dispatched_at := greatest(now(), new.created_at)');
    expect(migration).toContain('coalesce(new.provider_dispatched_at, new.created_at)');
    expect(migration).toContain('coalesce(new.review_ready_at, new.created_at)');
    expect(migration).toContain(
      'set provider_dispatched_at = greatest(provider_dispatched_at, created_at)'
    );
    expect(migration).toContain(
      'set reviewed_at = greatest(reviewed_at, review_ready_at, created_at)'
    );
  });

  it('keeps content-free facts private to the service role', () => {
    const facts = migration.slice(
      migration.indexOf('create or replace view private.copilot_job_facts')
    );
    expect(facts).toContain('with (security_invoker = true)');
    expect(facts).toContain('grant select on private.copilot_job_facts to service_role');
    expect(facts).toContain('grant select on private.copilot_dossier_facts to service_role');
    expect(facts).toContain('as reservation_count');
    expect(facts).toContain('as refund_count');
    expect(facts).toContain("else 'UNKNOWN'");
    for (const sensitiveColumn of [
      'input_payload',
      'consent_selection',
      'continuation_token',
      'provider_session_id',
      'approved_artifacts',
    ]) {
      expect(facts).not.toContain(sensitiveColumn);
    }
  });

  it('never represents missing provider cost or retention history as zero', () => {
    expect(COPILOT_PROVIDER_COST_METRIC).toEqual({
      availability: 'unavailable',
      reason: 'PROVIDER_BILLING_SOURCE_MISSING',
    });
    expect(COPILOT_PREMIUM_RETENTION_METRIC).toEqual({
      availability: 'unavailable',
      reason: 'SUBSCRIPTION_HISTORY_MISSING',
    });
  });
});
