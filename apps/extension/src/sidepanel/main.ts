import '../ui/design-tokens.css';
import App from './App.svelte';
import { mount } from 'svelte';

async function init() {
  if (import.meta.env.DEV) {
    const { bootstrapDevMode } = await import('../dev/index');
    await bootstrapDevMode();
  }

  mount(App, {
    target: document.getElementById('app')!,
  });
}

init();
