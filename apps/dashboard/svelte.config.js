import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      runtime: 'nodejs22.x',
    }),
    paths: {
      base: process.env.PUBLIC_DASHBOARD_BASE_PATH ?? '/dashboard',
    },
  },
};

export default config;
