import { describe, it } from 'vitest';

/**
 * SENTINELLE PERMANENTE — cf. tests/SKIPS.md (runbook).
 *
 * Ce test est un tripwire : il throw par design tant que le blocker
 * `release-runtime.transport-consumer-capability-issuer-missing` n'est pas
 * résolu (aucun consommateur de transport production ne détient encore le
 * chemin d'enregistrement private verified-payload ; l'exécution raw DTO est
 * interdite). Ne pas dé-skiper sans suivre le runbook de tests/SKIPS.md.
 */
const RELEASE_BLOCKER_CODE = 'release-runtime.transport-consumer-capability-issuer-missing';

describe.skip(`[release-blocker:${RELEASE_BLOCKER_CODE}] real Linux/x64 Docker OCI host adapter`, () => {
  it('executes only after the authenticated transport consumer issues the opaque one-shot capability', () => {
    throw new Error(
      `${RELEASE_BLOCKER_CODE}: no production transport consumer currently owns the private verified-payload registration path; raw DTO execution is forbidden.`
    );
  });
});
