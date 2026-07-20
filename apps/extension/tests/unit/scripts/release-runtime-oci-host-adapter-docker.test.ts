import { describe, it } from 'vitest';

const RELEASE_BLOCKER_CODE = 'release-runtime.transport-consumer-capability-issuer-missing';

describe.skip(`[release-blocker:${RELEASE_BLOCKER_CODE}] real Linux/x64 Docker OCI host adapter`, () => {
  it('executes only after the authenticated transport consumer issues the opaque one-shot capability', () => {
    throw new Error(
      `${RELEASE_BLOCKER_CODE}: no production transport consumer currently owns the private verified-payload registration path; raw DTO execution is forbidden.`
    );
  });
});
