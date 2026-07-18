import { TextDecoder } from 'node:util';

import { isAlias, isMap, isPair, isScalar, parseDocument, visit } from 'yaml';

import { jcsCanonicalize, sha256Hex } from './canonical';

const MAX_WORKFLOW_BLOB_BYTES = 262_144;
const MAX_PRIVILEGED_WORKFLOW_USES = 32;
const OFFICIAL_ATTEST_SHA = 'f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6';
const OFFICIAL_UPLOAD_SHA = '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
const MV3_DIAGNOSTIC_JOB_ID = 'test-mv3';
const MV3_DIAGNOSTIC_STEP_ID = 'upload-mv3-evidence';
const MV3_DIAGNOSTIC_NAME =
  'missionpulse-mv3-evidence-${{ github.run_id }}-${{ github.run_attempt }}';
const VERIFY_UPLOAD_DIGEST_RUN = `[[ "$CAPTURED_TRANSPORT_SHA256" =~ ^[0-9a-f]{64}$ ]]
[[ "$UPLOADED_ARTIFACT_SHA256" =~ ^[0-9a-f]{64}$ ]]
[[ "$UPLOADED_ARTIFACT_SHA256" == "$CAPTURED_TRANSPORT_SHA256" ]]
`;
const REVIEWED_ACTION_PINS = new Map<string, string>([
  ['actions/checkout', 'de0fac2e4500dabe0009e67214ff5f5447ce83dd'],
  ['actions/setup-node', '48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e'],
  ['pnpm/action-setup', '0e279bb959325dab635dd2c09392533439d90093'],
  ['actions/attest', OFFICIAL_ATTEST_SHA],
  ['actions/upload-artifact', OFFICIAL_UPLOAD_SHA],
]);
const ASCII_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REMOTE_ACTION =
  /^([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)(?:\/([^@]+))?@([0-9a-f]{40})$/;

export interface PinnedPrivilegedWorkflowUseV1 {
  readonly stepId: string;
  readonly usesLiteral: string;
  readonly repository: string;
  readonly actionPath: string | null;
  readonly commitSha: string;
}

export interface PrivilegedWorkflowProjectionV1 {
  readonly schema: 'missionpulse.privileged-workflow-job-projection';
  readonly version: 1;
  readonly jobId: 'seal-candidate';
  readonly job: Readonly<Record<string, unknown>>;
  readonly steps: readonly Readonly<Record<string, unknown>>[];
}

export interface PrivilegedWorkflowInspectionV1 {
  readonly jobId: 'seal-candidate';
  readonly permissions: Readonly<{
    attestations: 'write';
    contents: 'read';
    'id-token': 'write';
  }>;
  readonly projection: PrivilegedWorkflowProjectionV1;
  readonly projectionSha256: string;
  readonly uses: readonly PinnedPrivilegedWorkflowUseV1[];
}

export class ReleaseWorkflowPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseWorkflowPolicyError';
  }
}

function exactUtf8(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_WORKFLOW_BLOB_BYTES) {
    throw new ReleaseWorkflowPolicyError(
      `Workflow blob exceeds the 262144 byte release-policy bound.`
    );
  }
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new ReleaseWorkflowPolicyError('Workflow blob must not contain a UTF-8 BOM.');
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!Buffer.from(text, 'utf8').equals(Buffer.from(bytes))) {
      throw new ReleaseWorkflowPolicyError('Workflow blob does not round-trip through UTF-8.');
    }
    return text;
  } catch (error) {
    if (error instanceof ReleaseWorkflowPolicyError) {
      throw error;
    }
    throw new ReleaseWorkflowPolicyError('Workflow blob is not strict UTF-8.');
  }
}

function rejectYamlIndirection(document: ReturnType<typeof parseDocument>): void {
  try {
    visit(document, (_key, node) => {
      if (isAlias(node)) {
        throw new ReleaseWorkflowPolicyError('Workflow YAML aliases are forbidden.');
      }
      if (
        typeof node === 'object' &&
        node !== null &&
        'anchor' in node &&
        typeof node.anchor === 'string'
      ) {
        throw new ReleaseWorkflowPolicyError('Workflow YAML anchors are forbidden.');
      }
      if (
        typeof node === 'object' &&
        node !== null &&
        'tag' in node &&
        typeof node.tag === 'string' &&
        node.tag.startsWith('!')
      ) {
        throw new ReleaseWorkflowPolicyError('Workflow YAML custom tags are forbidden.');
      }
      if (isPair(node) && isScalar(node.key) && node.key.value === '<<') {
        throw new ReleaseWorkflowPolicyError('Workflow YAML merge keys are forbidden.');
      }
    });
  } catch (error) {
    if (error instanceof ReleaseWorkflowPolicyError) {
      throw error;
    }
    throw new ReleaseWorkflowPolicyError('Workflow YAML indirection is forbidden.');
  }
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ReleaseWorkflowPolicyError(`${label} must be a YAML mapping.`);
  }
  return value as Record<string, unknown>;
}

function exactPermissions(value: unknown): PrivilegedWorkflowInspectionV1['permissions'] {
  const permissions = plainRecord(value, 'seal-candidate permissions');
  const keys = Object.keys(permissions).sort();
  if (
    keys.join('\0') !== ['attestations', 'contents', 'id-token'].join('\0') ||
    permissions.attestations !== 'write' ||
    permissions.contents !== 'read' ||
    permissions['id-token'] !== 'write'
  ) {
    throw new ReleaseWorkflowPolicyError(
      'seal-candidate permissions must be exactly contents:read, id-token:write and attestations:write.'
    );
  }
  return {
    attestations: 'write',
    contents: 'read',
    'id-token': 'write',
  };
}

function exactReadOnlyPermissions(value: unknown, jobId: string): void {
  const permissions = plainRecord(value, `${jobId} permissions`);
  if (Object.keys(permissions).join('\0') !== 'contents' || permissions.contents !== 'read') {
    throw new ReleaseWorkflowPolicyError(
      `Non-privileged job ${jobId} permissions must be exactly contents: read.`
    );
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}

function validateOfficialReleaseActions(
  steps: readonly Readonly<Record<string, unknown>>[],
  uses: readonly PinnedPrivilegedWorkflowUseV1[]
): void {
  const attestUses = uses.filter(
    (entry) => entry.repository === 'actions/attest' && entry.actionPath === null
  );
  const uploadUses = uses.filter(
    (entry) => entry.repository === 'actions/upload-artifact' && entry.actionPath === null
  );
  if (attestUses.length !== 1 || attestUses[0]?.commitSha !== OFFICIAL_ATTEST_SHA) {
    throw new ReleaseWorkflowPolicyError(
      'The official actions/attest action must appear once at the reviewed v4.2.0 pin.'
    );
  }
  if (uploadUses.length !== 1 || uploadUses[0]?.commitSha !== OFFICIAL_UPLOAD_SHA) {
    throw new ReleaseWorkflowPolicyError(
      'The official actions/upload-artifact action must appear once at the reviewed v7.0.1 pin.'
    );
  }

  const attestIndex = steps.findIndex((step) => step.id === attestUses[0]?.stepId);
  const uploadIndex = steps.findIndex((step) => step.id === uploadUses[0]?.stepId);
  if (attestIndex < 0 || uploadIndex < 0 || attestIndex >= uploadIndex) {
    throw new ReleaseWorkflowPolicyError(
      'The attestation step must complete before the upload step.'
    );
  }
  const buildIndex = steps.findIndex((step) => step.id === 'build');
  if (
    buildIndex < 0 ||
    buildIndex >= attestIndex ||
    attestUses[0]?.stepId !== 'attest' ||
    uploadUses[0]?.stepId !== 'upload'
  ) {
    throw new ReleaseWorkflowPolicyError(
      'The release path must use the exact build, attest and upload step IDs in that order.'
    );
  }

  const attestStep = steps[attestIndex];
  if ('if' in attestStep || 'continue-on-error' in attestStep) {
    throw new ReleaseWorkflowPolicyError('The attestation step must be unconditional and fatal.');
  }
  const attestInputs = plainRecord(attestStep?.with, 'actions/attest inputs');
  if (
    !exactKeys(attestInputs, ['subject-name', 'subject-digest']) ||
    attestInputs['subject-name'] !== 'missionpulse-sealed-candidate' ||
    attestInputs['subject-digest'] !== 'sha256:${{ steps.build.outputs.transport-sha256 }}'
  ) {
    throw new ReleaseWorkflowPolicyError(
      'actions/attest inputs must be the exact explicit subject name and captured digest.'
    );
  }

  const uploadStep = steps[uploadIndex];
  if ('if' in uploadStep || 'continue-on-error' in uploadStep) {
    throw new ReleaseWorkflowPolicyError('The upload step must be unconditional and fatal.');
  }
  const uploadInputs = plainRecord(uploadStep?.with, 'actions/upload-artifact inputs');
  if (
    !exactKeys(uploadInputs, ['name', 'path', 'archive', 'overwrite', 'retention-days']) ||
    uploadInputs.name !== 'missionpulse-sealed-candidate' ||
    uploadInputs.path !== '${{ steps.build.outputs.transport-path }}' ||
    uploadInputs.archive !== false ||
    uploadInputs.overwrite !== false ||
    uploadInputs['retention-days'] !== 30
  ) {
    throw new ReleaseWorkflowPolicyError(
      'actions/upload-artifact inputs must select the single raw transport with archive:false, no overwrite and retention 30.'
    );
  }

  const verifyIndex = steps.findIndex((step) => step.id === 'verify-upload-digest');
  if (
    verifyIndex !== uploadIndex + 1 ||
    verifyIndex !== steps.length - 1 ||
    steps.filter((step) => step.id === 'verify-upload-digest').length !== 1
  ) {
    throw new ReleaseWorkflowPolicyError(
      'The terminal upload digest verification step must appear exactly once immediately after upload.'
    );
  }
  const verifyStep = steps[verifyIndex];
  if ('if' in verifyStep || 'continue-on-error' in verifyStep) {
    throw new ReleaseWorkflowPolicyError(
      'The upload digest verification step must be unconditional and fatal.'
    );
  }
  if (
    !exactKeys(verifyStep, ['id', 'name', 'shell', 'env', 'run']) ||
    verifyStep.name !== 'Verify the uploaded transport digest' ||
    verifyStep.shell !== 'bash' ||
    verifyStep.run !== VERIFY_UPLOAD_DIGEST_RUN
  ) {
    throw new ReleaseWorkflowPolicyError(
      'The upload digest verification step must use the exact reviewed shell command.'
    );
  }
  const verifyEnvironment = plainRecord(verifyStep.env, 'upload digest verification environment');
  if (
    !exactKeys(verifyEnvironment, ['CAPTURED_TRANSPORT_SHA256', 'UPLOADED_ARTIFACT_SHA256']) ||
    verifyEnvironment.CAPTURED_TRANSPORT_SHA256 !== '${{ steps.build.outputs.transport-sha256 }}' ||
    verifyEnvironment.UPLOADED_ARTIFACT_SHA256 !== '${{ steps.upload.outputs.artifact-digest }}'
  ) {
    throw new ReleaseWorkflowPolicyError(
      'The upload digest verification environment must bind the exact build and upload action outputs.'
    );
  }
}

function validateMv3DiagnosticUpload(
  jobId: string,
  step: Readonly<Record<string, unknown>>,
  action: PinnedPrivilegedWorkflowUseV1
): void {
  if (
    jobId !== MV3_DIAGNOSTIC_JOB_ID ||
    action.repository !== 'actions/upload-artifact' ||
    action.actionPath !== null ||
    action.commitSha !== OFFICIAL_UPLOAD_SHA ||
    step.id !== MV3_DIAGNOSTIC_STEP_ID ||
    step.name !== 'Upload MV3 Playwright evidence' ||
    step.if !== 'always()' ||
    'continue-on-error' in step
  ) {
    throw new ReleaseWorkflowPolicyError(
      `Privileged attestation/upload action is forbidden in ${jobId}.`
    );
  }
  if (!exactKeys(step, ['id', 'name', 'if', 'uses', 'with'])) {
    throw new ReleaseWorkflowPolicyError(
      'The MV3 diagnostic upload step has unsupported capabilities.'
    );
  }
  const inputs = plainRecord(step.with, 'MV3 diagnostic upload inputs');
  if (
    !exactKeys(inputs, ['name', 'path', 'if-no-files-found', 'overwrite', 'retention-days']) ||
    inputs.name !== MV3_DIAGNOSTIC_NAME ||
    inputs.path !== 'output/playwright/' ||
    inputs['if-no-files-found'] !== 'error' ||
    inputs.overwrite !== false ||
    inputs['retention-days'] !== 14 ||
    'archive' in inputs
  ) {
    throw new ReleaseWorkflowPolicyError(
      'The MV3 diagnostic upload must match the exact bounded diagnostic-only policy.'
    );
  }
}

function actionProjection(stepId: string, usesLiteral: string): PinnedPrivilegedWorkflowUseV1 {
  if (usesLiteral.includes('${{')) {
    throw new ReleaseWorkflowPolicyError(`Step ${stepId} uses an expression instead of a SHA40.`);
  }
  if (usesLiteral.startsWith('./') || usesLiteral.startsWith('docker://')) {
    throw new ReleaseWorkflowPolicyError(`Step ${stepId} uses a local or Docker action.`);
  }
  if (usesLiteral.includes('/.github/workflows/')) {
    throw new ReleaseWorkflowPolicyError(`Step ${stepId} uses a reusable workflow.`);
  }
  const match = REMOTE_ACTION.exec(usesLiteral);
  if (match === null) {
    throw new ReleaseWorkflowPolicyError(
      `Step ${stepId} must use a literal lower-case repository action pinned to a full SHA40.`
    );
  }
  const [, owner, repositoryName, rawActionPath, commitSha] = match;
  const actionPath = rawActionPath ?? null;
  if (actionPath !== null) {
    const segments = actionPath.split('/');
    if (
      segments.some(
        (segment) =>
          segment.length === 0 ||
          segment === '.' ||
          segment === '..' ||
          !/^[A-Za-z0-9._-]+$/.test(segment)
      )
    ) {
      throw new ReleaseWorkflowPolicyError(`Step ${stepId} has a non-canonical action path.`);
    }
  }
  const repository = `${owner}/${repositoryName}`;
  if (actionPath !== null || REVIEWED_ACTION_PINS.get(repository) !== commitSha) {
    throw new ReleaseWorkflowPolicyError(
      `Step ${stepId} action is outside the exact reviewed action allowlist.`
    );
  }
  return {
    stepId,
    usesLiteral,
    repository,
    actionPath,
    commitSha,
  };
}

export function inspectPrivilegedWorkflow(
  workflowBytes: Uint8Array
): PrivilegedWorkflowInspectionV1 {
  const workflowText = exactUtf8(workflowBytes);
  const document = parseDocument(workflowText, {
    merge: false,
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new ReleaseWorkflowPolicyError(
      `Workflow YAML is invalid: ${document.errors.map((error) => error.message).join('; ')}`
    );
  }
  if (document.warnings.length > 0) {
    throw new ReleaseWorkflowPolicyError(
      `Workflow YAML warnings are forbidden: ${document.warnings
        .map((warning) => warning.message)
        .join('; ')}`
    );
  }
  if (!isMap(document.contents)) {
    throw new ReleaseWorkflowPolicyError('Workflow YAML root must be a mapping.');
  }
  rejectYamlIndirection(document);

  const parsed = document.toJS({ maxAliasCount: 0 }) as unknown;
  const workflow = plainRecord(parsed, 'workflow');
  const jobs = plainRecord(workflow.jobs, 'workflow jobs');
  let mv3DiagnosticUploadCount = 0;
  if (workflow.permissions !== undefined) {
    const workflowPermissions = plainRecord(workflow.permissions, 'workflow permissions');
    if (
      Object.keys(workflowPermissions).join('\0') !== 'contents' ||
      workflowPermissions.contents !== 'read'
    ) {
      throw new ReleaseWorkflowPolicyError(
        'Workflow-level permissions may grant only contents: read.'
      );
    }
  }
  for (const [jobId, rawJob] of Object.entries(jobs)) {
    if (!ASCII_ID.test(jobId)) {
      throw new ReleaseWorkflowPolicyError(`Workflow job ID ${jobId} is not canonical.`);
    }
    const inspectedJob = plainRecord(rawJob, `${jobId} job`);
    if ('uses' in inspectedJob) {
      throw new ReleaseWorkflowPolicyError(`${jobId} job-level uses is forbidden.`);
    }
    for (const unsupported of ['container', 'services', 'strategy']) {
      if (unsupported in inspectedJob) {
        throw new ReleaseWorkflowPolicyError(
          `${jobId} has unsupported ${unsupported} execution capability.`
        );
      }
    }
    if (inspectedJob['runs-on'] !== 'ubuntu-24.04') {
      throw new ReleaseWorkflowPolicyError(`${jobId} runs-on must be exactly ubuntu-24.04.`);
    }
    if (jobId !== 'seal-candidate') {
      exactReadOnlyPermissions(inspectedJob.permissions, jobId);
      if (!Array.isArray(inspectedJob.steps) || inspectedJob.steps.length === 0) {
        throw new ReleaseWorkflowPolicyError(`${jobId} must have a nonempty steps array.`);
      }
      const otherStepIds = new Set<string>();
      for (const rawStep of inspectedJob.steps) {
        const step = plainRecord(rawStep, `${jobId} step`);
        const stepId = step.id;
        if (typeof stepId !== 'string' || !ASCII_ID.test(stepId) || otherStepIds.has(stepId)) {
          throw new ReleaseWorkflowPolicyError(
            `Every ${jobId} step needs one unique canonical id.`
          );
        }
        otherStepIds.add(stepId);
        const hasRun = typeof step.run === 'string';
        const hasUses = typeof step.uses === 'string';
        if (hasRun === hasUses) {
          throw new ReleaseWorkflowPolicyError(
            `Step ${jobId}/${stepId} must contain exactly one string run or uses field.`
          );
        }
        if (hasUses) {
          const action = actionProjection(stepId, step.uses as string);
          if (action.repository === 'actions/attest') {
            throw new ReleaseWorkflowPolicyError(
              `Privileged attestation/upload action is forbidden in ${jobId}.`
            );
          }
          if (action.repository === 'actions/upload-artifact') {
            validateMv3DiagnosticUpload(jobId, step, action);
            mv3DiagnosticUploadCount += 1;
          }
        }
      }
    }
  }
  if (MV3_DIAGNOSTIC_JOB_ID in jobs && mv3DiagnosticUploadCount !== 1) {
    throw new ReleaseWorkflowPolicyError(
      'The test-mv3 job must contain exactly one admitted diagnostic-only upload.'
    );
  }
  const job = plainRecord(jobs['seal-candidate'], 'seal-candidate job');
  if ('needs' in job) {
    throw new ReleaseWorkflowPolicyError('seal-candidate needs must be absent.');
  }
  if ('uses' in job) {
    throw new ReleaseWorkflowPolicyError('seal-candidate job-level uses is forbidden.');
  }
  for (const unsupported of ['container', 'services', 'strategy']) {
    if (unsupported in job) {
      throw new ReleaseWorkflowPolicyError(
        `seal-candidate has unsupported ${unsupported} execution capability.`
      );
    }
  }
  if (job['runs-on'] !== 'ubuntu-24.04') {
    throw new ReleaseWorkflowPolicyError('seal-candidate runs-on must be exactly ubuntu-24.04.');
  }
  const permissions = exactPermissions(job.permissions);
  if (!Array.isArray(job.steps) || job.steps.length === 0) {
    throw new ReleaseWorkflowPolicyError('seal-candidate must have a nonempty steps array.');
  }

  const stepIds = new Set<string>();
  const projectedSteps: Readonly<Record<string, unknown>>[] = [];
  const uses: PinnedPrivilegedWorkflowUseV1[] = [];
  for (const rawStep of job.steps) {
    const step = plainRecord(rawStep, 'seal-candidate step');
    const stepId = step.id;
    if (typeof stepId !== 'string' || !ASCII_ID.test(stepId) || stepIds.has(stepId)) {
      throw new ReleaseWorkflowPolicyError(
        'Every seal-candidate step needs one unique canonical id.'
      );
    }
    stepIds.add(stepId);
    const hasRun = typeof step.run === 'string';
    const hasUses = typeof step.uses === 'string';
    if (hasRun === hasUses) {
      throw new ReleaseWorkflowPolicyError(
        `Step ${stepId} must contain exactly one string run or uses field.`
      );
    }
    if (hasUses) {
      uses.push(actionProjection(stepId, step.uses as string));
      if (uses.length > MAX_PRIVILEGED_WORKFLOW_USES) {
        throw new ReleaseWorkflowPolicyError(
          'Privileged workflow uses inventory exceeds 32 entries.'
        );
      }
    }
    projectedSteps.push(step);
  }
  if (uses.length === 0) {
    throw new ReleaseWorkflowPolicyError('Privileged workflow uses inventory must be nonempty.');
  }
  validateOfficialReleaseActions(projectedSteps, uses);

  const projection: PrivilegedWorkflowProjectionV1 = {
    schema: 'missionpulse.privileged-workflow-job-projection',
    version: 1,
    jobId: 'seal-candidate',
    job,
    steps: projectedSteps,
  };
  return {
    jobId: 'seal-candidate',
    permissions,
    projection,
    projectionSha256: sha256Hex(jcsCanonicalize(projection)),
    uses,
  };
}
