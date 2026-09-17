import { describe, it } from 'vitest';

/**
 * SENTINELLE PERMANENTE — cf. tests/SKIPS.md (runbook).
 *
 * Ce test est un tripwire : il throw par design tant que le blocker
 * `release-runtime.transport-consumer-capability-issuer-missing` n'est pas
 * resolved (no production transport consumer holds the private
 * verified-payload registration path yet; raw DTO execution is forbidden).
 * Do not unskip without following the tests/SKIPS.md runbook.
 */
const RELEASE_BLOCKER_CODE = 'release-runtime.transport-consumer-capability-issuer-missing';

describe.skip(`[release-blocker:${RELEASE_BLOCKER_CODE}] real Linux/x64 Docker OCI host adapter`, () => {
  it('executes only after the authenticated transport consumer issues the opaque one-shot capability', () => {
    throw new Error(
      `${RELEASE_BLOCKER_CODE}: no production transport consumer currently owns the private verified-payload registration path; raw DTO execution is forbidden.`
    );
  });
});
