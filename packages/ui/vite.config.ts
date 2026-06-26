import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default {
  plugins: [svelte()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PulseUI',
    },
  },
  resolve: {
    conditions: ['browser', 'import', 'module', 'default'],
  },
};
