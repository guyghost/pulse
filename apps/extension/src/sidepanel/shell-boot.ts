/**
 * Shell bootstrap — runs before the main bundle mounts Svelte.
 *
 * Externalized from index.html so it complies with the MV3 Content Security
 * Policy (script-src 'self': inline scripts are blocked). Listed as a module
 * before main.ts so it executes first, in source order.
 *
 * Responsibility: decide whether to render the onboarding-specific skeleton
 * into #app before Svelte mounts, so first-time users see a coherent shell
 * instead of the generic skeleton.
 */

import { CANONICAL_INCLUDED_CONNECTOR_IDS } from '../lib/shell/connectors/build-config';
import {
  captureSettingsReleaseData,
  decodeSettingsReleaseSnapshot,
} from '../lib/shell/settings-release/settings-release.contract';

type MessageResponse =
  | { type: 'PROFILE_RESULT'; payload: unknown }
  | { type: 'FIRST_SCAN_DONE_RESULT'; payload: unknown }
  | { type: 'SETTINGS_RELEASE_RESULT'; payload: unknown }
  | { type: string; payload?: unknown };

const ONBOARDING_SHELL_HTML = `
  <div class="initial-shell" data-initial-shell>
    <section class="initial-card" style="margin-top: 4rem">
      <p class="initial-eyebrow">MissionPulse</p>
      <h1 style="margin: 0.75rem 0 0; font-size: 1.25rem; line-height: 1.2">
        Configurez votre premier scan
      </h1>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-top: 1.5rem">
        <div class="initial-line" style="height: 4rem; background: #ffffff; border: 1px solid #f0efef"></div>
        <div class="initial-line" style="height: 4rem; background: #ffffff; border: 1px solid #f0efef"></div>
        <div class="initial-line" style="height: 4rem; background: #ffffff; border: 1px solid #f0efef"></div>
      </div>
      <div class="initial-line" style="height: 7rem; margin-top: 1.25rem; background: #ffffff; border: 1px solid #f0efef"></div>
    </section>
  </div>
`;

function renderOnboardingShell(target: HTMLElement) {
  target.innerHTML = ONBOARDING_SHELL_HTML;
}

function initShellBoot() {
  const app = document.getElementById('app');
  if (!app || !globalThis.chrome?.runtime?.sendMessage) {
    return;
  }

  // Test override: force the onboarding shell for screenshots / perf harness.
  if (
    (window as unknown as { __missionPulsePerfForceOnboardingShell?: boolean })
      .__missionPulsePerfForceOnboardingShell
  ) {
    renderOnboardingShell(app);
    return;
  }

  Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_PROFILE' }) as Promise<MessageResponse>,
    chrome.runtime.sendMessage({ type: 'GET_FIRST_SCAN_DONE' }) as Promise<MessageResponse>,
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS_RELEASE' }) as Promise<MessageResponse>,
  ])
    .then(([profileResponse, firstScanResponse, onboardingResponse]) => {
      // P1: the sendMessage round-trip can resolve after main.ts has committed
      // to mounting (or even after Svelte mounted). Writing the skeleton then
      // would either destroy the live Svelte tree (innerHTML overwrite) or leave
      // an uncaptured `[data-initial-shell]` stuck on screen. main.ts sets this
      // flag synchronously immediately before mount(), and capture->mount never
      // yields to a microtask, so if the flag is up we are too late: do not touch
      // the DOM.
      if ((window as unknown as { __missionPulseAppMounted?: boolean }).__missionPulseAppMounted) {
        return;
      }
      const hasProfile =
        profileResponse?.type === 'PROFILE_RESULT' && profileResponse.payload !== null;
      const firstScanDone =
        firstScanResponse?.type === 'FIRST_SCAN_DONE_RESULT' && firstScanResponse.payload;
      const capturedReleaseResponse = captureSettingsReleaseData(onboardingResponse);
      const releaseResponse =
        capturedReleaseResponse !== null && typeof capturedReleaseResponse === 'object'
          ? (capturedReleaseResponse as Record<string, unknown>)
          : null;
      const releasePayload =
        releaseResponse?.type === 'SETTINGS_RELEASE_RESULT' &&
        releaseResponse.payload !== null &&
        typeof releaseResponse.payload === 'object'
          ? (releaseResponse.payload as Record<string, unknown>)
          : null;
      const releaseSnapshot =
        releasePayload?.status === 'confirmed'
          ? decodeSettingsReleaseSnapshot(releasePayload.snapshot, CANONICAL_INCLUDED_CONNECTOR_IDS)
          : null;
      if (!releaseSnapshot) {
        return;
      }
      const onboardingCompleted = releaseSnapshot.onboardingCompleted;

      if (!hasProfile && !firstScanDone && !onboardingCompleted) {
        renderOnboardingShell(app);
      }
    })
    .catch(() => {});
}

initShellBoot();
