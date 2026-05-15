import '../ui/design-tokens.css';
import App from './App.svelte';
import { mount } from 'svelte';

async function init() {
  if (import.meta.env.DEV) {
    const { bootstrapDevMode } = await import('../dev/index');
    await bootstrapDevMode();
  }

  const target = document.getElementById('app');
  if (!target) {
    throw new Error('[MissionPulse] Root element #app not found');
  }

  mount(App, {
    target,
  });
}

init();
