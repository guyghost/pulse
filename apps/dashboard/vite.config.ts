import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { microfrontends } from '@vercel/microfrontends/experimental/vite';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [microfrontends(), sveltekit(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: /^@pulse\/ui$/,
        replacement: resolve(__dirname, '../../packages/ui/src/index.ts'),
      },
      {
        find: /^@pulse\/ui\/app\.css$/,
        replacement: resolve(__dirname, '../../packages/ui/src/app.css'),
      },
    ],
    conditions: ['svelte', 'browser', 'import', 'module', 'default'],
  },
});
