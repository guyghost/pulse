import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

import { inspectPrivilegedWorkflow } from '../../../scripts/release-readiness/workflow-policy';

const WORKSPACE_ROOT = resolve(import.meta.dirname, '../../../../..');
const CI_WORKFLOW_PATH = resolve(WORKSPACE_ROOT, '.github/workflows/ci.yml');

const REVIEWED_ACTION_PINS = new Map([
  ['actions/checkout', 'de0fac2e4500dabe0009e67214ff5f5447ce83dd'],
  ['actions/setup-node', '48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e'],
  ['pnpm/action-setup', '0e279bb959325dab635dd2c09392533439d90093'],
  ['actions/attest', 'f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6'],
  ['actions/upload-artifact', '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'],
]);
const VERIFY_UPLOAD_DIGEST_RUN = `[[ "$CAPTURED_TRANSPORT_SHA256" =~ ^[0-9a-f]{64}$ ]]
[[ "$UPLOADED_ARTIFACT_SHA256" =~ ^[0-9a-f]{64}$ ]]
[[ "$UPLOADED_ARTIFACT_SHA256" == "$CAPTURED_TRANSPORT_SHA256" ]]
`;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

describe('release workflow integration — actual committed policy', () => {
  it('admits the exact CI workflow through the hostile privileged-job inspector', () => {
    const bytes = readFileSync(CI_WORKFLOW_PATH);
    expect(() => inspectPrivilegedWorkflow(bytes)).not.toThrow();
  });

  it('uses only the reviewed full-SHA action inventory across every CI job', () => {
    const workflow = record(parseYaml(readFileSync(CI_WORKFLOW_PATH, 'utf8')), 'workflow');
    const jobs = record(workflow.jobs, 'jobs');
    const observed: Array<{ repository: string; commit: string }> = [];

    for (const [jobId, rawJob] of Object.entries(jobs)) {
      const job = record(rawJob, `job ${jobId}`);
      expect(job['runs-on'], jobId).toBe('ubuntu-24.04');
      expect(job.permissions, jobId).toBeDefined();
      expect(Array.isArray(job.steps), jobId).toBe(true);
      for (const rawStep of job.steps as unknown[]) {
        const step = record(rawStep, `${jobId} step`);
        expect(step.id, `${jobId} step id`).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
        if (typeof step.uses !== 'string') {
          continue;
        }
        const match = /^([^/@]+\/[^/@]+)(?:\/[^@]+)?@([0-9a-f]{40})$/.exec(step.uses);
        expect(match, `${jobId}/${String(step.id)} action pin`).not.toBeNull();
        if (match === null) {
          continue;
        }
        const [, repository, commit] = match;
        expect(REVIEWED_ACTION_PINS.get(repository), repository).toBe(commit);
        observed.push({ repository, commit });
      }
    }

    expect(observed.some(({ repository }) => repository === 'actions/attest')).toBe(true);
    expect(observed.some(({ repository }) => repository === 'actions/upload-artifact')).toBe(true);
  });

  it('keeps attest, upload and exact digest verification on one fatal privileged path', () => {
    const workflow = record(parseYaml(readFileSync(CI_WORKFLOW_PATH, 'utf8')), 'workflow');
    const jobs = record(workflow.jobs, 'jobs');
    const sealJob = record(jobs['seal-candidate'], 'seal-candidate');
    expect(sealJob.needs).toBeUndefined();
    expect(sealJob.services).toBeUndefined();
    expect(sealJob.container).toBeUndefined();
    expect(sealJob.strategy).toBeUndefined();

    const steps = sealJob.steps as unknown[];
    for (const rawStep of steps) {
      const step = record(rawStep, 'seal-candidate step');
      expect(step['continue-on-error'], String(step.id)).not.toBe(true);
    }

    const attest = steps.map((step) => record(step, 'step')).find((step) => step.id === 'attest');
    const upload = steps.map((step) => record(step, 'step')).find((step) => step.id === 'upload');
    const verifyUploadDigest = steps
      .map((step) => record(step, 'step'))
      .find((step) => step.id === 'verify-upload-digest');
    expect(attest).toMatchObject({
      uses: 'actions/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6',
      with: {
        'subject-name': 'missionpulse-sealed-candidate',
        'subject-digest': 'sha256:${{ steps.build.outputs.transport-sha256 }}',
      },
    });
    expect(upload).toMatchObject({
      uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      with: {
        name: 'missionpulse-sealed-candidate',
        path: '${{ steps.build.outputs.transport-path }}',
        archive: false,
        overwrite: false,
        'retention-days': 30,
      },
    });
    expect(verifyUploadDigest).toEqual({
      id: 'verify-upload-digest',
      name: 'Verify the uploaded transport digest',
      shell: 'bash',
      env: {
        CAPTURED_TRANSPORT_SHA256: '${{ steps.build.outputs.transport-sha256 }}',
        UPLOADED_ARTIFACT_SHA256: '${{ steps.upload.outputs.artifact-digest }}',
      },
      run: VERIFY_UPLOAD_DIGEST_RUN,
    });
    expect(attest?.if).toBeUndefined();
    expect(upload?.if).toBeUndefined();
    expect(steps.indexOf(attest)).toBeLessThan(steps.indexOf(upload));
    expect(steps.indexOf(verifyUploadDigest)).toBe(steps.indexOf(upload) + 1);
    expect(steps.indexOf(verifyUploadDigest)).toBe(steps.length - 1);
  });
});
