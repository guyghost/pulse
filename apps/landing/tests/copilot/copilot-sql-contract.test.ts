import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const landingDir = resolve(testDir, '../..');
const migration = readFileSync(
  resolve(landingDir, 'supabase/migrations/20260721120000_create_copilot_backend.sql'),
  'utf8'
);
const hardeningMigration = readFileSync(
  resolve(landingDir, 'supabase/migrations/20260721140000_harden_copilot_table_privileges.sql'),
  'utf8'
);
const repository = readFileSync(
  resolve(landingDir, 'src/lib/server/copilot/supabase-repository.ts'),
  'utf8'
);
const service = readFileSync(resolve(landingDir, 'src/lib/server/copilot/service.ts'), 'utf8');
const maintenanceRoute = readFileSync(
  resolve(landingDir, 'src/routes/api/internal/copilot/receipt-maintenance/+server.ts'),
  'utf8'
);
const vercelConfig = JSON.parse(readFileSync(resolve(landingDir, 'vercel.json'), 'utf8')) as {
  crons?: Array<{ path: string; schedule: string }>;
};

function sqlFunction(name: string, nextName: string): string {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf(`create or replace function public.${nextName}`, start + 1);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  expect(end, `${nextName} must follow ${name}`).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe('Copilot SQL cut-point contracts', () => {
  it('records a provider handle and disposition proof in one RPC', () => {
    const record = sqlFunction(
      'record_copilot_provider_session',
      'settle_copilot_job_without_credit'
    );
    expect(record).toContain('insert into public.copilot_provider_sessions');
    expect(record).toContain('provider_disposition_known = true');
    expect(record).toContain(
      'public.copilot_provider_sessions.active_job_id = excluded.active_job_id'
    );
    expect(repository).toContain("this.client.rpc('record_copilot_provider_session'");
    expect(repository).not.toMatch(
      /from\('copilot_provider_sessions'\)[\s\S]{0,160}\.(?:insert|upsert)\(/
    );
  });

  it('settles no-credit jobs and dossiers atomically behind the active-job fence', () => {
    const settle = sqlFunction(
      'settle_copilot_job_without_credit',
      'claim_copilot_provider_session'
    );
    expect(settle).toContain('update public.copilot_jobs');
    expect(settle).toContain('update public.copilot_dossiers');
    expect(settle).toContain("set state = 'ready', active_job_id = null");
    expect(settle).toContain('v_dossier.active_job_id <> p_job_id');
    expect(settle.indexOf('select * into v_dossier')).toBeLessThan(
      settle.indexOf('select * into v_job')
    );
    expect(service).not.toContain('markDossierReady');
    expect(service).not.toContain('healTerminalDossier');
  });

  it('binds sessions and dossiers to the same job, owner and dossier', () => {
    expect(migration).toContain('unique (id, user_id, dossier_id)');
    expect(migration).toContain('foreign key (active_job_id, user_id, dossier_id)');
    expect(migration).toContain('references public.copilot_jobs(id, user_id, dossier_id)');
    expect(migration).toContain('foreign key (active_job_id, user_id, id)');
    expect(migration).toContain("set state = 'processing', active_job_id = p_job_id");
  });

  it('makes refund idempotency stale-safe and clears only the matching active job', () => {
    const refund = sqlFunction('refund_copilot_credit', 'begin_copilot_deletion');
    expect(refund).toContain('v_dossier public.copilot_dossiers%rowtype');
    expect(refund).toContain('for update');
    expect(refund).toContain('v_dossier.active_job_id is distinct from p_job_id');
    expect(refund.indexOf('select * into v_dossier')).toBeLessThan(
      refund.indexOf('select * into v_job')
    );
    expect(refund).toContain("set state = 'ready', active_job_id = null");
    expect(refund).not.toContain("state in ('processing', 'deletionFailed', 'ready')");
  });

  it('makes the persisted credit projection structurally coherent', () => {
    expect(migration).toContain('constraint copilot_jobs_credit_projection_coherent');
    expect(migration).toContain("reservation_status = 'required'");
    expect(migration).toContain("refund_status = 'not-required'");
    expect(migration).toContain("refund_status = 'refunded' and refund_transaction_id is not null");
  });

  it('keeps Copilot persistence service-only and bounds retained artifacts before billing', () => {
    for (const table of [
      'public.copilot_dossiers',
      'public.copilot_jobs',
      'public.copilot_provider_sessions',
      'public.copilot_daily_admissions',
      'public.copilot_deleted_job_receipts',
    ]) {
      expect(hardeningMigration).toContain(table);
    }
    expect(hardeningMigration).toContain('from public, anon, authenticated');
    expect(hardeningMigration).toContain('to service_role');
    expect(hardeningMigration).toContain('copilot_dossiers_approved_artifacts_bounded');
    expect(hardeningMigration).toContain('jsonb_array_length(approved_artifacts) <= 512');

    const beginStart = hardeningMigration.indexOf(
      'create or replace function public.begin_copilot_job'
    );
    const beginEnd = hardeningMigration.indexOf('revoke all privileges on table', beginStart);
    const begin = hardeningMigration.slice(beginStart, beginEnd);
    expect(beginStart).toBeGreaterThanOrEqual(0);
    expect(beginEnd).toBeGreaterThan(beginStart);
    expect(begin).toContain("p_operation_kind <> 'analysis'");
    expect(begin).toContain('jsonb_array_length(v_dossier.approved_artifacts) >= 512');
    expect(begin).toContain('COPILOT_DOSSIER_ARTIFACT_LIMIT');
    expect(begin.indexOf('COPILOT_DOSSIER_ARTIFACT_LIMIT')).toBeLessThan(
      begin.indexOf('perform 1 from public.profiles')
    );
    expect(begin.indexOf('COPILOT_DOSSIER_ARTIFACT_LIMIT')).toBeLessThan(
      begin.indexOf('insert into public.copilot_daily_admissions')
    );
    expect(repository).toContain("message.includes('COPILOT_DOSSIER_ARTIFACT_LIMIT')");
  });

  it('persists deletion obligations before Eve and commits receipts with exact local deletion', () => {
    const deletionStart = migration.indexOf(
      'create or replace function public.delete_copilot_dossier'
    );
    const deletion = migration.slice(
      deletionStart,
      migration.indexOf('revoke execute on function', deletionStart)
    );
    expect(deletionStart).toBeGreaterThanOrEqual(0);
    expect(migration).toContain(
      "deletion_disposition in ('pending', 'uncertain', 'deleted', 'retention-confirmed')"
    );
    expect(repository).toContain("'begin_copilot_provider_session_deletion'");
    expect(repository).toContain("'confirm_copilot_provider_session_deletion'");
    expect(migration).toContain(
      'revoke execute on function public.begin_copilot_provider_session_deletion'
    );
    expect(migration).toContain(
      'grant execute on function public.confirm_copilot_provider_session_deletion'
    );
    expect(deletion).toContain("deletion_disposition not in ('deleted', 'retention-confirmed')");
    expect(deletion).toContain('insert into public.copilot_deleted_job_receipts');
    expect(deletion).toContain('get diagnostics v_deleted_rows = row_count');
    expect(deletion).toContain('if v_deleted_rows <> 1');
    expect(migration).toContain(
      'revoke execute on function public.delete_copilot_dossier(uuid, uuid)'
    );
    expect(migration).toContain(
      'grant execute on function public.delete_copilot_dossier(uuid, uuid) to service_role'
    );

    const deleteMethod = service.slice(
      service.indexOf('async deleteDossier('),
      service.indexOf('/** Resume only effects', service.indexOf('async deleteDossier('))
    );
    expect(deleteMethod.indexOf('hasUnresolvedProviderDisposition')).toBeLessThan(
      deleteMethod.indexOf('deleteSession!')
    );
    expect(deleteMethod.indexOf('beginProviderSessionDeletion')).toBeLessThan(
      deleteMethod.indexOf('deleteSession!')
    );
    expect(deleteMethod.indexOf('confirmProviderSessionDeletion')).toBeGreaterThan(
      deleteMethod.indexOf('deleteSession!')
    );
    expect(deleteMethod).not.toContain('Promise.all(');
  });

  it('keeps quota and deleted-job replay proof outside dossier cascade', () => {
    const begin = sqlFunction('begin_copilot_job', 'reserve_copilot_credit');
    expect(migration).toContain('create table if not exists public.copilot_daily_admissions');
    expect(migration).toContain('create table if not exists public.copilot_deleted_job_receipts');
    expect(begin.indexOf('copilot_deleted_job_receipts')).toBeLessThan(
      begin.indexOf('copilot_daily_admissions')
    );
    expect(begin).toContain('COPILOT_JOB_GONE');
    expect(begin).toContain('COPILOT_IDEMPOTENCY_CONFLICT');
    expect(begin).toContain('total_count = total_count + 1');
    expect(begin).toContain("case when v_credit_cost = 0 then 'not-required' else 'required' end");
    expect(begin).toContain("    'not-required'\n  );");
    expect(repository).toContain("this.client.rpc('assert_copilot_job_replay_allowed'");
    expect(repository).not.toContain(".gt('expires_at', new Date().toISOString())");
    const replayPreflight = sqlFunction('assert_copilot_job_replay_allowed', 'begin_copilot_job');
    expect(replayPreflight).toContain('expires_at > now()');
  });

  it('physically purges expired receipts through opportunistic and scheduled service-role paths', () => {
    const purge = sqlFunction(
      'purge_expired_copilot_deleted_job_receipts',
      'assert_copilot_job_replay_allowed'
    );
    expect(purge).toContain('delete from public.copilot_deleted_job_receipts');
    expect(purge).toContain('expires_at <= now()');
    expect(purge).toContain('p_limit is null');
    expect(purge).toContain('limit p_limit');
    expect(purge).toContain('for update skip locked');
    expect(migration).toContain(
      'revoke execute on function public.purge_expired_copilot_deleted_job_receipts(integer)'
    );
    expect(migration).toContain(
      'grant execute on function public.purge_expired_copilot_deleted_job_receipts(integer)\n  to service_role'
    );

    const replayPreflight = sqlFunction('assert_copilot_job_replay_allowed', 'begin_copilot_job');
    const begin = sqlFunction('begin_copilot_job', 'reserve_copilot_credit');
    expect(replayPreflight).toContain(
      'perform public.purge_expired_copilot_deleted_job_receipts(100)'
    );
    expect(begin).toContain('perform public.purge_expired_copilot_deleted_job_receipts(100)');
    expect(maintenanceRoute).toContain('env.CRON_SECRET');
    expect(maintenanceRoute).toContain('createSupabaseAdminClient()');
    expect(vercelConfig.crons).toContainEqual({
      path: '/api/internal/copilot/receipt-maintenance',
      schedule: '17 3 * * *',
    });
  });

  it('bounds the cumulative consent union after taking the dossier lock', () => {
    const expand = sqlFunction('expand_copilot_consent', 'begin_copilot_job');
    expect(expand.indexOf('for update')).toBeLessThan(expand.indexOf('into v_consent'));
    expect(expand).toContain("jsonb_array_length(v_consent->'evidenceIds') > 24");
    expect(expand).toContain('COPILOT_CONSENT_LIMIT_EXCEEDED');
  });
});

describe('Copilot route authorization contracts', () => {
  const readRoute = (path: string) => readFileSync(resolve(landingDir, path), 'utf8');

  it('authorizes every route that can resume billing or provider work', () => {
    for (const route of [
      'src/routes/api/copilot/jobs/+server.ts',
      'src/routes/api/copilot/jobs/[jobId]/+server.ts',
    ]) {
      const source = readRoute(route);
      expect(source).toContain('createAuthorizedCopilotRuntime');
      expect(source).not.toContain('createAuthenticatedCopilotRuntime');
    }
    const review = readRoute('src/routes/api/copilot/jobs/[jobId]/review/+server.ts');
    expect(review).toContain('createAuthenticatedCopilotRuntime');
    expect(review).not.toContain('createAuthorizedCopilotRuntime');
    const post = readRoute('src/routes/api/copilot/jobs/+server.ts');
    expect(post.indexOf('assertCopilotInputHash')).toBeLessThan(
      post.indexOf('getJobByIdempotency')
    );
  });

  it('keeps auth-only cancellation, review and deletion on non-dispatching service methods', () => {
    expect(readRoute('src/routes/api/copilot/jobs/[jobId]/cancel/+server.ts')).toContain(
      'createAuthenticatedCopilotRuntime'
    );
    expect(readRoute('src/routes/api/copilot/dossiers/[missionId]/+server.ts')).toContain(
      'createAuthenticatedCopilotRuntime'
    );
    expect(
      service.slice(service.indexOf('async cancelJob('), service.indexOf('async reviewJob('))
    ).not.toContain('provider.start');
    expect(
      service.slice(
        service.indexOf('async deleteDossier('),
        service.indexOf('/** Resume only effects')
      )
    ).not.toContain('provider.start');
  });

  it('keeps the public dossier recovery read auth-only and observational', () => {
    const route = readRoute('src/routes/api/copilot/dossiers/[missionId]/+server.ts');
    expect(route).toContain('export const GET');
    expect(route).toContain('createAuthenticatedCopilotRuntime');
    expect(route).not.toContain('createAuthorizedCopilotRuntime');
    expect(route).toContain('getDossierProjection');

    const projectionRead = service.slice(
      service.indexOf('async getDossierProjection('),
      service.indexOf('async createJob(')
    );
    expect(projectionRead).not.toContain('provider.');
    expect(projectionRead).not.toContain('reserveCredit');
    expect(projectionRead).not.toContain('refundCredit');
    expect(projectionRead).not.toContain('updateJob');
    expect(projectionRead).not.toContain('result: job.result');
  });
});
