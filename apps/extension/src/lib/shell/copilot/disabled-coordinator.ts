import type { CopilotCoordinator } from './coordinator';
import type { CopilotError } from './contracts';

/**
 * Copilot coordinator used when the rollout is compiled out
 * (`VITE_COPILOT_ROLLOUT_ENABLED !== 'true'`, the release default).
 *
 * Every request answers `ROLLOUT_DISABLED` without touching `chrome.identity`,
 * the Copilot session/checkpoint stores or the network. This is what lets the
 * release manifest drop the `identity` permission and the
 * `copilot.missionpulse.app` host: no code path of the shipped service worker
 * can reach them. Re-enabling the rollout requires adding both back to the
 * manifest in the same change (see scripts/verify-manifest.ts).
 */
export function createDisabledCopilotCoordinator(): CopilotCoordinator {
  const disabled = (): CopilotError => ({
    code: 'ROLLOUT_DISABLED',
    message: "Le Copilot Premium n'est pas disponible dans cette version.",
    retryable: false,
  });

  const jobError = (requestId: string, missionId: string) => ({
    requestId,
    missionId,
    outcome: 'error' as const,
    job: null,
    deletionReceipt: null,
    error: disabled(),
  });

  return {
    async link(requestId) {
      return { requestId, outcome: 'error', subject: null, error: disabled() };
    },
    async syncEntitlement(requestId) {
      return {
        requestId,
        outcome: 'error',
        state: 'unlinked',
        entitlement: null,
        error: disabled(),
      };
    },
    async getDossier(requestId, missionId) {
      return { requestId, missionId, outcome: 'error', dossier: null, error: disabled() };
    },
    async createJob(command) {
      return jobError(command.requestId, command.missionId);
    },
    async getJob(requestId, missionId) {
      return jobError(requestId, missionId);
    },
    async cancelJob(requestId, missionId) {
      return jobError(requestId, missionId);
    },
    async reviewJob(requestId, missionId) {
      return jobError(requestId, missionId);
    },
    async deleteDossier(requestId, missionId) {
      return {
        requestId,
        missionId,
        outcome: 'error',
        disposition: null,
        receipt: null,
        error: disabled(),
      };
    },
  };
}
