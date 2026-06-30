import '../ui/design-tokens.css';
import App from './App.svelte';
import { mount } from 'svelte';

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
  window.setTimeout(() => {
    for (const shell of initialShells) {
      shell.remove();
    }
  }, 500);
}

init();
