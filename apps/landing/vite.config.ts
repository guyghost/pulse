import { microfrontends } from '@vercel/microfrontends/experimental/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { eveSvelteKit } from 'eve/sveltekit';
import { defineConfig, type PluginOption } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig(async ({ mode }) => {
  const plugins = [
    microfrontends(),
    ...(mode === 'test' ? [] : [eveSvelteKit()]),
    ...(await sveltekit()),
  ] as unknown as PluginOption[];

  return {
    plugins,
    // adapter-vercel's dependency tracer does not follow Eve's package-internal
    // `#…` imports. Bundle the server client so every runtime dependency is
    // present in the generated function instead of shipping a partial package.
    ssr: { noExternal: ['eve'] },
    test: {
      exclude: [...configDefaults.exclude, '.eve/**'],
    },
  };
});
