import adapter from '@sveltejs/adapter-vercel';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { microfrontends } from '@vercel/microfrontends/experimental/vite';
import { resolve } from 'path';
import { defineConfig } from 'vite';

function isDashboardBasePath(path: string): path is '' | `/${string}` {
  return path === '' || path.startsWith('/');
}

const dashboardBasePath = process.env.PUBLIC_DASHBOARD_BASE_PATH ?? '/dashboard';
if (!isDashboardBasePath(dashboardBasePath)) {
  throw new Error('PUBLIC_DASHBOARD_BASE_PATH must be empty or start with a slash.');
}

export default defineConfig(async () => ({
  plugins: [
    microfrontends(),
    ...(await sveltekit({
      adapter: adapter({ runtime: 'nodejs22.x' }),
      paths: { base: dashboardBasePath },
    })),
    tailwindcss(),
  ],
  resolve: {
    alias: [
      {
        find: /^@pulse\/ui$/,
        replacement: resolve(import.meta.dirname, '../../packages/ui/src/index.ts'),
      },
      {
        find: /^@pulse\/ui\/app\.css$/,
        replacement: resolve(import.meta.dirname, '../../packages/ui/src/app.css'),
      },
    ],
    conditions: ['svelte', 'browser', 'import', 'module', 'default'],
  },
}));
