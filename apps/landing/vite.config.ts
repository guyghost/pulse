import { microfrontends } from '@vercel/microfrontends/experimental/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [microfrontends(), sveltekit()],
});
