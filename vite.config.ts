import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import manifest from './src/manifest.json';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte(), tailwindcss(), crx({ manifest })],
	test: {
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			exclude: [
				'tests/',
				'node_modules/',
				'dist/',
				'src/dev/',
				'**/*.test.ts',
				'**/*.d.ts',
			],
		},
	},
	resolve: {
		alias: {
			$lib: resolve(__dirname, './src/lib'),
		},
		conditions: ['browser', 'import', 'module', 'default'],
	},
	build: {
		outDir: 'dist',
		rollupOptions: {
			input: {
				sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
			},
			output: {
				// Optimize chunking for connector lazy loading
				manualChunks: (id) => {
					// Separate connector implementations into their own chunks
					if (id.includes('/connectors/') && id.endsWith('.connector.ts')) {
						const match = id.match(/([^/]+)\.connector\.ts$/);
						if (match) {
							return `connector-${match[1].toLowerCase()}`;
						}
					}
					// Core types and logic in main chunk
					if (id.includes('/lib/core/')) {
						return 'core';
					}
				},
			},
		},
	},
});
