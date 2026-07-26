import { describe, expect, it } from 'vitest';

import {
  compareCanonicalSemVer,
  computeCatalogSha256,
  computePayloadVerificationSha256,
  jcsCanonicalize,
  parseCanonicalSemVer,
  parseGlobalReleaseCatalog,
  parseReleaseExecutionPayloadVerification,
  parseSealedCandidateTransportObservation,
  sha256Hex,
} from '../../../scripts/release-readiness/contracts';

const SOURCE_COMMIT = 'ab'.repeat(20);
const HASH = 'ef'.repeat(32);

function transportObservation(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'missionpulse.sealed-candidate-transport-observation',
    version: 1,
    artifactName: 'missionpulse-sealed-candidate',
    transportFormat: 'missionpulse-canonical-zip-v1',
    transportBytes: 100,
    transportSha256: HASH,
    payloadInventorySha256: HASH,
    capturedAt: '2026-07-16T10:06:00.000Z',
    preUploadAttestation: {
      schema: 'missionpulse.github-transport-attestation',
      version: 1,
      provider: 'github-artifact-attestations',
      attestationId: 'attestation-1',
      subjectName: 'missionpulse-sealed-candidate',
      subjectDigest: HASH,
      predicateType: 'https://slsa.dev/provenance/v1',
      sigstoreBundleJcsBase64: Buffer.from('{"bundle":1}').toString('base64'),
      sigstoreBundleJcsSha256: sha256Hex('{"bundle":1}'),
      sourceRepository: 'missionpulse/pulse',
      sourceRef: 'refs/heads/main',
      workflowPath: '.github/workflows/ci.yml',
      signerWorkflowRef: 'missionpulse/pulse/.github/workflows/ci.yml@refs/heads/main',
      signerWorkflowSha: SOURCE_COMMIT,
      runId: 123,
      runAttempt: 1,
      headSha: SOURCE_COMMIT,
    },
    uploaderOutputDigest: HASH,
    artifactId: 'artifact-1',
    artifactDigest: HASH,
    downloadedTransportSha256: HASH,
    requestedRetentionDays: 30,
    workflowPath: '.github/workflows/ci.yml',
    runId: 123,
    runAttempt: 1,
    headSha: SOURCE_COMMIT,
    conclusion: 'success',
    artifactCreatedAt: '2026-07-16T10:07:00.000Z',
    artifactExpiresAt: '2026-08-15T10:07:00.000Z',
    observedAt: '2026-07-16T10:08:00.000Z',
    ...overrides,
  };
}

function payloadVerification(overrides: Record<string, unknown> = {}) {
  const value = {
    schema: 'missionpulse.release-execution-payload-verification',
    version: 1,
    verificationId: 'verification-1',
    verificationSha256: HASH,
    releaseId: 'release-0.2.2',
    sealId: 'seal-1',
    sealSha256: HASH,
    sourceCommit: SOURCE_COMMIT,
    transportSha256: HASH,
    transportZipReceiptSha256: HASH,
    payloadInventorySha256: HASH,
    controllerBundleSha256: HASH,
    controllerBundleSourceInventorySha256: HASH,
    buildMetadataSha256: HASH,
    buildProvenanceSha256: HASH,
    executionAuthoritySha256: HASH,
    controllerExecutionAuthoritySha256: HASH,
    ociArchiveSha256: HASH,
    ociIndexSha256: HASH,
    ociManifestSha256: HASH,
    ociConfigSha256: HASH,
    layerSha256: [HASH],
    diffIdSha256: [HASH],
    finalRootInventorySha256: HASH,
    pythonRuntimeTreeSha256: HASH,
    pythonExecutableSha256: HASH,
    effectiveLoadedObjectsSha256: HASH,
    verifiedAt: '2026-07-16T10:09:00.000Z',
    ...overrides,
  };
  value.verificationSha256 = computePayloadVerificationSha256(value);
  return value;
}

function catalog(records: readonly Record<string, unknown>[], revision = records.length) {
  const value = {
    schema: 'missionpulse.global-release-catalog',
    version: 1,
    revision,
    catalogSha256: '',
    records,
  };
  value.catalogSha256 = computeCatalogSha256(value);
  return value;
}

function reservation(kind: 'candidate_reserved' | 'candidate_abandoned' = 'candidate_reserved') {
  return {
    catalogSequence: 1,
    kind,
    actorId: 'actor-old',
    releaseId: 'release-old',
    sourceCommit: SOURCE_COMMIT,
    committedVersion: '0.2.1',
    releaseNamespace: 'v0.2.1',
    artifactId: null,
    artifactSha256: null,
    recordedAt: '2026-07-16T09:00:00.000Z',
  };
}

describe('release readiness runtime contracts', () => {
  it('rejects isolated UTF-16 surrogates in JCS values and object keys', () => {
    expect(() => jcsCanonicalize('\ud800')).toThrow(/surrogate|unicode/i);
    expect(() => jcsCanonicalize({ ['\udfff']: 'value' })).toThrow(/surrogate|unicode/i);
  });

  it('implements safe-integer SemVer precedence and ignores build metadata', () => {
    expect(parseCanonicalSemVer('1.2.3-alpha.1+build.7')).toMatchObject({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ['alpha', 1],
    });
    expect(compareCanonicalSemVer('1.2.3-alpha.9', '1.2.3-alpha.10')).toBeLessThan(0);
    expect(compareCanonicalSemVer('1.2.3', '1.2.3-rc.9')).toBeGreaterThan(0);
    expect(compareCanonicalSemVer('1.2.3+one', '1.2.3+two')).toBe(0);
    expect(() => parseCanonicalSemVer('9007199254740992.0.0')).toThrow(/safe/i);
    expect(() => parseCanonicalSemVer('1.2.3+9007199254740992')).toThrow(/safe/i);
    expect(() => parseCanonicalSemVer('1.2.3+01')).toThrow(/leading zero/i);
  });

  it('accepts one replacement CAS that atomically abandons then reserves', () => {
    const reserved = reservation();
    const abandoned = {
      ...reserved,
      catalogSequence: 2,
      kind: 'candidate_abandoned',
      recordedAt: '2026-07-16T09:01:00.000Z',
    };
    const replacement = {
      ...reserved,
      catalogSequence: 3,
      kind: 'candidate_reserved',
      releaseId: 'release-replacement',
      sourceCommit: 'cd'.repeat(20),
      recordedAt: abandoned.recordedAt,
    };
    expect(
      parseGlobalReleaseCatalog(catalog([reserved, abandoned, replacement], 2)).records
    ).toHaveLength(3);
    expect(() => parseGlobalReleaseCatalog(catalog([reserved, abandoned, replacement], 1))).toThrow(
      /revision|CAS/i
    );
  });

  it.each([
    ['orphan abandonment', [reservation('candidate_abandoned')]],
    [
      'second terminal transition',
      [
        reservation(),
        {
          ...reservation(),
          catalogSequence: 2,
          kind: 'artifact_published',
          artifactId: 'artifact-old',
          artifactSha256: HASH,
          recordedAt: '2026-07-16T09:01:00.000Z',
        },
        {
          ...reservation(),
          catalogSequence: 3,
          kind: 'candidate_abandoned',
          recordedAt: '2026-07-16T09:02:00.000Z',
        },
      ],
    ],
  ])('rejects catalog corruption: %s', (_label, records) => {
    expect(() => parseGlobalReleaseCatalog(catalog(records))).toThrow(
      /catalog|reservation|terminal/i
    );
  });

  it('enforces the full transport digest chain and rejects unknown fields', () => {
    expect(() =>
      parseSealedCandidateTransportObservation(
        transportObservation({ downloadedTransportSha256: '01'.repeat(32) })
      )
    ).toThrow(/digest/i);
    expect(() =>
      parseSealedCandidateTransportObservation({ ...transportObservation(), surprise: true })
    ).toThrow();
  });

  it('requires an exact self-digest and strict payload-verification shape', () => {
    const exact = parseReleaseExecutionPayloadVerification(payloadVerification());
    expect(exact.verificationId).toBe('verification-1');
    expect(exact.controllerExecutionAuthoritySha256).toBe(HASH);

    const withoutControllerAuthority = payloadVerification();
    delete withoutControllerAuthority.controllerExecutionAuthoritySha256;
    withoutControllerAuthority.verificationSha256 = computePayloadVerificationSha256(
      withoutControllerAuthority
    );
    expect(() => parseReleaseExecutionPayloadVerification(withoutControllerAuthority)).toThrow();
    expect(() =>
      parseReleaseExecutionPayloadVerification({ ...payloadVerification(), surprise: true })
    ).toThrow();
    expect(() =>
      parseReleaseExecutionPayloadVerification({
        ...payloadVerification(),
        verificationSha256: '01'.repeat(32),
      })
    ).toThrow(/SHA-256/i);
  });
});
