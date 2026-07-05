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

type MessageResponse =
  | { type: 'PROFILE_RESULT'; payload: unknown }
  | { type: 'FIRST_SCAN_DONE_RESULT'; payload: unknown }
  | { type: 'ONBOARDING_COMPLETED_RESULT'; payload: unknown }
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
    chrome.runtime.sendMessage({ type: 'GET_ONBOARDING_COMPLETED' }) as Promise<MessageResponse>,
  ])
    .then(([profileResponse, firstScanResponse, onboardingResponse]) => {
      const hasProfile =
        profileResponse?.type === 'PROFILE_RESULT' && profileResponse.payload !== null;
      const firstScanDone =
        firstScanResponse?.type === 'FIRST_SCAN_DONE_RESULT' && firstScanResponse.payload;
      const onboardingCompleted =
        onboardingResponse?.type === 'ONBOARDING_COMPLETED_RESULT' && onboardingResponse.payload;

      if (!hasProfile && !firstScanDone && !onboardingCompleted) {
        renderOnboardingShell(app);
      }
    })
    .catch(() => {});
}

initShellBoot();
