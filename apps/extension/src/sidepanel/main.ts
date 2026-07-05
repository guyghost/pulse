import '../ui/design-tokens.css';
import App from './App.svelte';
import { mount } from 'svelte';
import { launchMarks } from '../lib/shell/metrics';

// Install launch marks before any async work so FCP / CSS resource timing is captured.
launchMarks.install();

// Model §5 — phase-3 overlap: start the FeedPage chunk fetch+compile now, in
// parallel with the main bundle mount. ES module imports are singletons, so
// App.svelte's later loadPage('feed') reuses this in-flight promise. Marks fire
// here so the harness records the true chunk-resolve time, not the post-rAF time.
launchMarks.markImportStart('feed');
void import('../ui/pages/FeedPage.svelte').then(() => {
  launchMarks.markPageLoaded('feed');
});

async function init() {
  if (import.meta.env.DEV) {
    const { bootstrapDevMode } = await import('../dev/index');
    const { initPerformanceMonitoring } = await import('../lib/shell/metrics');
    initPerformanceMonitoring();
    await bootstrapDevMode();
  }

  const target = document.getElementById('app');
  if (!target) {
    throw new Error('[MissionPulse] Root element #app not found');
  }

  const initialShells = Array.from(target.querySelectorAll('[data-initial-shell]'));
  mount(App, {
    target,
  });
  launchMarks.markAppMounted();
  window.setTimeout(() => {
    for (const shell of initialShells) {
      shell.remove();
    }
  }, 500);
}

init();
