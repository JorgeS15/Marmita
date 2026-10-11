import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		// A verificação de origem é feita em hooks.server.js (aceita localhost/IP/domínio).
		csrf: { trustedOrigins: ['*'] },
		version: { pollInterval: 0 }
	}
};

export default config;
