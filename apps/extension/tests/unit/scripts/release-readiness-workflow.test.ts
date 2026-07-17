import { describe, expect, it } from 'vitest';

import {
  ReleaseWorkflowPolicyError,
  inspectPrivilegedWorkflow,
} from '../../../scripts/release-readiness/workflow-policy';

const CHECKOUT_SHA = 'de0fac2e4500dabe0009e67214ff5f5447ce83dd';
const ATTEST_SHA = 'f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6';
const UPLOAD_SHA = '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
const VERIFY_UPLOAD_DIGEST_STEP = `      - id: verify-upload-digest
        name: Verify the uploaded transport digest
        shell: bash
        env:
          CAPTURED_TRANSPORT_SHA256: \${{ steps.build.outputs.transport-sha256 }}
          UPLOADED_ARTIFACT_SHA256: \${{ steps.upload.outputs.artifact-digest }}
        run: |
          [[ "$CAPTURED_TRANSPORT_SHA256" =~ ^[0-9a-f]{64}$ ]]
          [[ "$UPLOADED_ARTIFACT_SHA256" =~ ^[0-9a-f]{64}$ ]]
          [[ "$UPLOADED_ARTIFACT_SHA256" == "$CAPTURED_TRANSPORT_SHA256" ]]
`;

function workflow(overrides = ''): string {
  return `name: Release candidate
on:
  push:
    branches: [main]
jobs:
  seal-candidate:
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      id-token: write
      attestations: write
    steps:
      - id: checkout
        uses: actions/checkout@${CHECKOUT_SHA}
      - id: build
        env:
          SOURCE_COMMIT: \${{ github.sha }}
        run: node apps/extension/scripts/release-controller.mjs
      - id: attest
        uses: actions/attest@${ATTEST_SHA}
        with:
          subject-name: missionpulse-sealed-candidate
          subject-digest: sha256:\${{ steps.build.outputs.transport-sha256 }}
      - id: upload
        uses: actions/upload-artifact@${UPLOAD_SHA}
        with:
          name: missionpulse-sealed-candidate
          path: \${{ steps.build.outputs.transport-path }}
          archive: false
          overwrite: false
          retention-days: 30
${VERIFY_UPLOAD_DIGEST_STEP}${overrides}`;
}

describe('release privileged workflow policy', () => {
  it('projects the complete privileged job and every pinned action deterministically', () => {
    const first = inspectPrivilegedWorkflow(Buffer.from(workflow()));
    const second = inspectPrivilegedWorkflow(Buffer.from(workflow()));

    expect(first).toEqual(second);
    expect(first.jobId).toBe('seal-candidate');
    expect(first.permissions).toEqual({
      attestations: 'write',
      contents: 'read',
      'id-token': 'write',
    });
    expect(first.uses).toEqual([
      expect.objectContaining({ stepId: 'checkout', commitSha: CHECKOUT_SHA }),
      expect.objectContaining({ stepId: 'attest', commitSha: ATTEST_SHA }),
      expect.objectContaining({ stepId: 'upload', commitSha: UPLOAD_SHA }),
    ]);
    expect(first.projectionSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.projection.steps).toHaveLength(5);
    expect(first.projection.steps[1]).toMatchObject({
      id: 'build',
      run: 'node apps/extension/scripts/release-controller.mjs',
    });
  });

  it.each([
    ['tag', `actions/checkout@v4`],
    ['short SHA', `actions/checkout@${CHECKOUT_SHA.slice(0, 12)}`],
    ['expression', 'actions/checkout@${{ inputs.action_ref }}'],
    ['local action', './.github/actions/seal'],
    ['Docker action', 'docker://alpine:3.20'],
    ['reusable workflow', `acme/release/.github/workflows/seal.yml@${CHECKOUT_SHA}`],
  ])('rejects a %s uses target', (_label, hostileUses) => {
    const hostile = workflow().replace(`actions/checkout@${CHECKOUT_SHA}`, hostileUses);
    expect(() => inspectPrivilegedWorkflow(Buffer.from(hostile))).toThrow(
      ReleaseWorkflowPolicyError
    );
  });

  it('rejects job-level uses even when it is pinned', () => {
    const hostile = `name: hostile
on: push
jobs:
  seal-candidate:
    uses: acme/release/.github/workflows/seal.yml@${CHECKOUT_SHA}
    permissions:
      contents: read
      id-token: write
      attestations: write
`;
    expect(() => inspectPrivilegedWorkflow(Buffer.from(hostile))).toThrow(/job-level uses/i);
  });

  it.each([
    ['attestation', ATTEST_SHA, '44'.repeat(20)],
    ['uploader', UPLOAD_SHA, '55'.repeat(20)],
  ])('rejects an arbitrary SHA40 for the official %s action', (_label, official, arbitrary) => {
    expect(() =>
      inspectPrivilegedWorkflow(Buffer.from(workflow().replace(official, arbitrary)))
    ).toThrow(/official|reviewed|pin/i);
  });

  it('rejects a full SHA outside the exact reviewed action allowlist', () => {
    expect(() =>
      inspectPrivilegedWorkflow(Buffer.from(workflow().replace(CHECKOUT_SHA, '11'.repeat(20))))
    ).toThrow(/allowlist|reviewed|pin/i);
  });

  it.each([
    [
      'external needs',
      '    runs-on: ubuntu-24.04\n',
      '    needs: setup\n    runs-on: ubuntu-24.04\n',
    ],
    [
      'conditional attestation',
      '      - id: attest\n',
      '      - id: attest\n        if: always()\n',
    ],
    [
      'nonfatal upload',
      '      - id: upload\n',
      '      - id: upload\n        continue-on-error: true\n',
    ],
  ])('rejects %s on the privileged final path', (_label, needle, replacement) => {
    expect(() =>
      inspectPrivilegedWorkflow(Buffer.from(workflow().replace(needle, replacement)))
    ).toThrow(/needs|conditional|fatal|continue|attest|upload/i);
  });

  it('rejects YAML warnings and custom tags before projection', () => {
    const tagged = workflow().replace(
      'name: Release candidate',
      'name: !hostile Release candidate'
    );
    expect(() => inspectPrivilegedWorkflow(Buffer.from(tagged))).toThrow(/tag|YAML/i);
  });

  it('requires attestation before upload in the exact privileged step order', () => {
    const hostile = workflow()
      .replace(/ {6}- id: attest[\s\S]*?(?= {6}- id: upload)/, '')
      .replace(
        / {6}- id: upload[\s\S]*?(?=$)/,
        `      - id: upload\n        uses: actions/upload-artifact@${UPLOAD_SHA}\n        with:\n          name: missionpulse-sealed-candidate\n          path: \${{ steps.build.outputs.transport-path }}\n          archive: false\n          overwrite: false\n          retention-days: 30\n      - id: attest\n        uses: actions/attest@${ATTEST_SHA}\n        with:\n          subject-name: missionpulse-sealed-candidate\n          subject-digest: sha256:\${{ steps.build.outputs.transport-sha256 }}\n`
      );
    expect(() => inspectPrivilegedWorkflow(Buffer.from(hostile))).toThrow(
      /attest.*before.*upload/i
    );
  });

  it.each([
    ['an absent verification step', workflow().replace(VERIFY_UPLOAD_DIGEST_STEP, '')],
    [
      'verification before upload',
      workflow()
        .replace(VERIFY_UPLOAD_DIGEST_STEP, '')
        .replace('      - id: upload\n', `${VERIFY_UPLOAD_DIGEST_STEP}      - id: upload\n`),
    ],
    ['a renamed upload step', workflow().replace('      - id: upload\n', '      - id: publish\n')],
    [
      'a different uploaded digest expression',
      workflow().replace(
        'UPLOADED_ARTIFACT_SHA256: ${{ steps.upload.outputs.artifact-digest }}',
        'UPLOADED_ARTIFACT_SHA256: ${{ steps.attest.outputs.bundle-path }}'
      ),
    ],
    [
      'a normalized digest expression',
      workflow().replace(
        'CAPTURED_TRANSPORT_SHA256: ${{ steps.build.outputs.transport-sha256 }}',
        'CAPTURED_TRANSPORT_SHA256: ${{ toLower(steps.build.outputs.transport-sha256) }}'
      ),
    ],
    [
      'an altered comparison command',
      workflow().replace(
        '[[ "$UPLOADED_ARTIFACT_SHA256" == "$CAPTURED_TRANSPORT_SHA256" ]]',
        '[[ "${UPLOADED_ARTIFACT_SHA256,,}" == "${CAPTURED_TRANSPORT_SHA256,,}" ]]'
      ),
    ],
    [
      'an extra verification environment input',
      workflow().replace(
        '          UPLOADED_ARTIFACT_SHA256: ${{ steps.upload.outputs.artifact-digest }}\n',
        '          UPLOADED_ARTIFACT_SHA256: ${{ steps.upload.outputs.artifact-digest }}\n          NORMALIZE_DIGESTS: "true"\n'
      ),
    ],
    [
      'nonfatal digest verification',
      workflow().replace(
        '      - id: verify-upload-digest\n',
        '      - id: verify-upload-digest\n        continue-on-error: true\n'
      ),
    ],
  ])('rejects %s', (_label, hostile) => {
    expect(() => inspectPrivilegedWorkflow(Buffer.from(hostile))).toThrow(
      /upload|digest|verify|fatal|environment|command|step/i
    );
  });

  it.each([
    [
      'subject-path discovery',
      '          subject-name: missionpulse-sealed-candidate\n',
      '          subject-path: artifact.zip\n',
    ],
    ['archive wrapper', '          archive: false\n', '          archive: true\n'],
    ['overwrite', '          overwrite: false\n', '          overwrite: true\n'],
    ['retention', '          retention-days: 30\n', '          retention-days: 29\n'],
  ])('rejects hostile %s inputs', (_label, needle, replacement) => {
    expect(() =>
      inspectPrivilegedWorkflow(Buffer.from(workflow().replace(needle, replacement)))
    ).toThrow(/attest|upload|input|archive|retention|overwrite/i);
  });

  it.each([
    [
      'mutable action in another job',
      `\n  observe:\n    runs-on: ubuntu-24.04\n    permissions:\n      contents: read\n    steps:\n      - id: checkout-other\n        uses: actions/checkout@v4\n`,
    ],
    [
      'local action in another job',
      `\n  observe:\n    runs-on: ubuntu-24.04\n    permissions:\n      contents: read\n    steps:\n      - id: local-other\n        uses: ./.github/actions/observe\n`,
    ],
    [
      'OIDC capability in another job',
      `\n  observe:\n    runs-on: ubuntu-24.04\n    permissions:\n      contents: read\n      id-token: write\n    steps:\n      - id: observe-run\n        run: node observe.mjs\n`,
    ],
  ])('rejects %s', (_label, hostileJob) => {
    expect(() => inspectPrivilegedWorkflow(Buffer.from(workflow(hostileJob)))).toThrow(
      /workflow|job|uses|SHA40|permission|capability/i
    );
  });

  it.each([
    ['missing permission', '      attestations: write\n', ''],
    [
      'extra permission',
      '      attestations: write\n',
      '      attestations: write\n      packages: write\n',
    ],
    ['wrong permission', '      id-token: write\n', '      id-token: read\n'],
  ])('rejects %s', (_label, needle, replacement) => {
    expect(() =>
      inspectPrivilegedWorkflow(Buffer.from(workflow().replace(needle, replacement)))
    ).toThrow(/permissions/i);
  });

  it('rejects duplicate YAML keys and aliases before projection', () => {
    const duplicate = workflow().replace(
      '    runs-on: ubuntu-24.04',
      '    runs-on: ubuntu-24.04\n    runs-on: ubuntu-latest'
    );
    const alias = workflow()
      .replace(
        'permissions:\n      contents: read',
        'permissions: &privileges\n      contents: read'
      )
      .replace('    steps:', '    copied-permissions: *privileges\n    steps:');

    expect(() => inspectPrivilegedWorkflow(Buffer.from(duplicate))).toThrow(/YAML/i);
    expect(() => inspectPrivilegedWorkflow(Buffer.from(alias))).toThrow(/alias|anchor/i);
  });

  it('rejects a BOM and an oversized workflow before YAML allocation', () => {
    expect(() => inspectPrivilegedWorkflow(Buffer.from(`\ufeff${workflow()}`))).toThrow(/BOM/i);
    expect(() => inspectPrivilegedWorkflow(Buffer.alloc(262_145, 0x61))).toThrow(/262144/);
  });
});
