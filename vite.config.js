import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version)
	},
	// Mesma porta que em produção (Docker), para não haver surpresas.
	server: { port: 4004 },
	preview: { port: 4004 },
	ssr: {
		external: ['node:sqlite']
	}
});
