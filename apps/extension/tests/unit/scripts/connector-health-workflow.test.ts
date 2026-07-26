import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

const WORKSPACE_ROOT = resolve(import.meta.dirname, '../../../../..');
const WORKFLOW_PATH = resolve(WORKSPACE_ROOT, '.github/workflows/connector-health.yml');
const WORKFLOW_README = resolve(WORKSPACE_ROOT, '.github/workflows/README.md');
const HEALTH_README = resolve(WORKSPACE_ROOT, 'apps/extension/tests/health/README.md');

const ACTION_PINS = new Map([
  ['actions/checkout', 'de0fac2e4500dabe0009e67214ff5f5447ce83dd'],
  ['pnpm/action-setup', '0e279bb959325dab635dd2c09392533439d90093'],
  ['actions/setup-node', '48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e'],
  ['actions/upload-artifact', '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'],
  ['actions/download-artifact', '70fc10c6e5e1ce46ad2ea6f2b72d43f7d47b13c3'],
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function steps(job: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(job.steps)) {
    throw new Error('job steps must be an array');
  }
  return job.steps.map((step) => record(step, 'step'));
}

function workflow() {
  return record(parseYaml(readFileSync(WORKFLOW_PATH, 'utf8')), 'workflow');
}

describe('connector-health committed workflow policy', () => {
  it('uses the exact three-job permissions, runner, concurrency and machine outputs', () => {
    const parsed = workflow();
    const jobs = record(parsed.jobs, 'jobs');
    expect(Object.keys(jobs).sort()).toEqual(['conclusion', 'health-capture', 'issue-writer']);
    expect(parsed.permissions).toEqual({});
    expect(parsed.concurrency).toEqual({
      group: 'connector-health-${{ github.repository }}',
      'cancel-in-progress': false,
    });

    const capture = record(jobs['health-capture'], 'health-capture');
    const writer = record(jobs['issue-writer'], 'issue-writer');
    const conclusion = record(jobs.conclusion, 'conclusion');
    for (const job of [capture, writer, conclusion]) {
      expect(job['runs-on']).toBe('ubuntu-24.04');
      expect(job.container).toBeUndefined();
      expect(job.services).toBeUndefined();
      expect(job.strategy).toBeUndefined();
      expect(job.uses).toBeUndefined();
    }
    expect(capture.permissions).toEqual({ contents: 'read' });
    expect(writer.permissions).toEqual({ actions: 'read', contents: 'read', issues: 'write' });
    expect(conclusion.permissions).toEqual({ contents: 'read' });
    expect(capture.outputs).toEqual({
      captureTerminal: '${{ steps.finalize-capture.outputs.captureTerminal }}',
      issueAdmission: '${{ steps.finalize-capture.outputs.issueAdmission }}',
      disposition: '${{ steps.finalize-capture.outputs.disposition }}',
      failureFingerprint: '${{ steps.finalize-capture.outputs.failureFingerprint }}',
      evidenceFileSha256: '${{ steps.finalize-capture.outputs.evidenceFileSha256 }}',
      artifactId: '${{ steps.finalize-capture.outputs.artifactId }}',
      artifactArchiveSha256: '${{ steps.finalize-capture.outputs.artifactArchiveSha256 }}',
    });
    expect(writer.outputs).toEqual({
      issueTerminal: '${{ steps.settle-issue.outputs.issueTerminal }}',
    });
    expect(writer.needs).toBe('health-capture');
    expect(writer.if).toContain("needs.health-capture.outputs.issueAdmission == 'admitted'");
    for (const output of [
      'captureTerminal',
      'disposition',
      'failureFingerprint',
      'evidenceFileSha256',
      'artifactId',
      'artifactArchiveSha256',
    ]) {
      expect(writer.if).toContain(`needs.health-capture.outputs.${output} != ''`);
    }
    expect(conclusion.needs).toEqual(['health-capture', 'issue-writer']);
    expect(conclusion.if).toBe('always()');
  });

  it('pins every remote action and gives each step one globally unique stable ID', () => {
    const jobs = record(workflow().jobs, 'jobs');
    const ids = new Set<string>();
    const repositories = new Set<string>();
    for (const [jobId, rawJob] of Object.entries(jobs)) {
      for (const step of steps(record(rawJob, jobId))) {
        expect(step.id, `${jobId} step id`).toMatch(/^[a-z][a-z0-9-]+$/);
        expect(ids.has(String(step.id)), `duplicate step id ${String(step.id)}`).toBe(false);
        ids.add(String(step.id));
        expect(step['continue-on-error']).toBeUndefined();
        if (typeof step.uses !== 'string') {
          continue;
        }
        const match = /^([^/@]+\/[^/@]+)(?:\/[^@]+)?@([0-9a-f]{40})$/.exec(step.uses);
        expect(match, `${jobId}/${String(step.id)} immutable action`).not.toBeNull();
        if (match !== null) {
          expect(ACTION_PINS.get(match[1]), match[1]).toBe(match[2]);
          repositories.add(match[1]);
        }
      }
    }
    expect(repositories).toEqual(new Set(ACTION_PINS.keys()));
  });

  it('uses exact checkout/toolchain/frozen install policy in all three jobs', () => {
    const jobs = record(workflow().jobs, 'jobs');
    for (const [jobId, rawJob] of Object.entries(jobs)) {
      const jobSteps = steps(record(rawJob, jobId));
      const checkout = jobSteps.find((step) => String(step.id).endsWith('-checkout'));
      const pnpm = jobSteps.find((step) => String(step.id).endsWith('-pnpm'));
      const node = jobSteps.find((step) => String(step.id).endsWith('-node'));
      const install = jobSteps.find((step) => String(step.id).startsWith('install-'));
      expect(checkout).toMatchObject({
        uses: 'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
        with: { ref: '${{ github.sha }}', 'persist-credentials': false },
      });
      expect(pnpm).toMatchObject({
        uses: 'pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093',
        with: { version: '10.32.1' },
      });
      expect(node).toMatchObject({
        uses: 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
        with: { 'node-version': '22.23.1' },
      });
      expect(install?.run).toBe('pnpm install --frozen-lockfile');
    }
  });

  it('admits the exact checked-out source before any dependency installation', () => {
    const jobs = record(workflow().jobs, 'jobs');
    for (const [jobId, rawJob] of Object.entries(jobs)) {
      const jobSteps = steps(record(rawJob, jobId));
      const verifyIndex = jobSteps.findIndex((step) => String(step.id).startsWith('verify-'));
      const installIndex = jobSteps.findIndex((step) => String(step.id).startsWith('install-'));
      expect(verifyIndex, `${jobId} source verifier`).toBeGreaterThan(-1);
      expect(installIndex, `${jobId} dependency install`).toBeGreaterThan(verifyIndex);
      expect(jobSteps[verifyIndex]?.run).toBe(
        'node --experimental-strip-types scripts/connector-health/verify-source-cli.ts'
      );
      expect(jobSteps[verifyIndex]?.['working-directory']).toBe('apps/extension');
    }
  });

  it('captures, uploads and machine-finalizes one exact current-run evidence file', () => {
    const capture = record(record(workflow().jobs, 'jobs')['health-capture'], 'capture');
    const captureSteps = steps(capture);
    expect(captureSteps.find((step) => step.id === 'capture-evidence')?.run).toBe(
      'pnpm --filter @pulse/extension exec tsx scripts/connector-health/capture.ts'
    );
    expect(captureSteps.find((step) => step.id === 'upload-evidence')).toMatchObject({
      uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      with: {
        name: 'connector-health-report',
        path: 'apps/extension/output/connector-health/connector-health-evidence.v1.json',
        'if-no-files-found': 'error',
        overwrite: false,
        'retention-days': 14,
      },
    });
    expect(captureSteps.find((step) => step.id === 'finalize-capture')?.run).toBe(
      'pnpm --filter @pulse/extension exec tsx scripts/connector-health/capture-finalize-cli.ts'
    );
  });

  it('downloads by exact current artifact ID, binds all run identities and isolates the token', () => {
    const parsed = workflow();
    const text = readFileSync(WORKFLOW_PATH, 'utf8');
    const jobs = record(parsed.jobs, 'jobs');
    const writerSteps = steps(record(jobs['issue-writer'], 'writer'));
    expect(writerSteps.find((step) => step.id === 'download-evidence')).toMatchObject({
      uses: 'actions/download-artifact@70fc10c6e5e1ce46ad2ea6f2b72d43f7d47b13c3',
      with: {
        'artifact-ids': '${{ needs.health-capture.outputs.artifactId }}',
        path: 'apps/extension/output/connector-health',
        'merge-multiple': false,
      },
    });
    const settle = writerSteps.find((step) => step.id === 'settle-issue');
    expect(settle?.run).toBe(
      'pnpm --filter @pulse/extension exec tsx scripts/connector-health/issue-writer.ts'
    );
    expect(record(settle?.env, 'settle env')).toMatchObject({
      GITHUB_TOKEN: '${{ github.token }}',
      EXPECTED_ARTIFACT_ID: '${{ needs.health-capture.outputs.artifactId }}',
      EXPECTED_EVIDENCE_FILE_SHA256: '${{ needs.health-capture.outputs.evidenceFileSha256 }}',
      EXPECTED_ARTIFACT_ARCHIVE_SHA256: '${{ needs.health-capture.outputs.artifactArchiveSha256 }}',
      EXPECTED_FAILURE_FINGERPRINT: '${{ needs.health-capture.outputs.failureFingerprint }}',
    });
    expect(text.match(/GITHUB_TOKEN:/g)).toHaveLength(1);
    expect(text).not.toContain('secrets.');
    expect(text).not.toContain('node -e');
    expect(text).not.toContain('continue-on-error');
  });

  it('runs the committed conclusion actor after exact bootstrap with strict needs inputs', () => {
    const conclusion = record(record(workflow().jobs, 'jobs').conclusion, 'conclusion');
    const conclude = steps(conclusion).find((step) => step.id === 'conclude-workflow');
    expect(conclude?.run).toBe(
      'pnpm --filter @pulse/extension exec tsx scripts/connector-health/conclusion-cli.ts'
    );
    expect(conclude?.env).toEqual({
      CAPTURE_RESULT: '${{ needs.health-capture.result }}',
      CAPTURE_TERMINAL: '${{ needs.health-capture.outputs.captureTerminal }}',
      ISSUE_RESULT: '${{ needs.issue-writer.result }}',
      ISSUE_TERMINAL: '${{ needs.issue-writer.outputs.issueTerminal }}',
    });
  });

  it('keeps both required policy READMEs aligned with authority and no-claim boundaries', () => {
    for (const path of [WORKFLOW_README, HEALTH_README]) {
      const text = readFileSync(path, 'utf8');
      for (const fragment of [
        '`health-capture`: `contents: read`',
        '`issue-writer`: `actions: read`, `contents: read`, `issues: write`',
        '`conclusion`: `contents: read`',
        '`CONCLUSION_ACTOR_STARTED`',
        '`pre_actor_bootstrap_interrupted`',
        '`capture_passed`',
        '`capture_failed`',
        '`capture_infrastructure_failed`',
        '`issue_settled`',
        '`issue_failed`',
        '`passed`',
        '`failed_recorded`',
        '`failed_unreported`',
        '`connector-health-report`',
        '`connector-health-evidence.v1.json`',
        '14 jours',
        'Node `22.23.1`',
        'pnpm `10.32.1`',
        'hors bande',
        'groupe contrôlé',
        'aucune session navigateur',
      ]) {
        expect(text, `${path} missing ${fragment}`).toContain(fragment);
      }
      expect(text).not.toContain('tous les jobs sont en lecture seule');
      expect(text).not.toContain('prouve que la branche est protégée');
    }
  });
});
