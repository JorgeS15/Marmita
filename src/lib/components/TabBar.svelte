<script>
	import { page } from '$app/state';

	const tabs = [
		{
			href: '/',
			label: 'Semana',
			match: (/** @type {string} */ p) => p === '/',
			icon: 'M7 3v2M17 3v2M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 7h2m3 0h2m-7 4h2m3 0h2'
		},
		{
			href: '/inventario',
			label: 'Inventário',
			match: (/** @type {string} */ p) => p.startsWith('/inventario'),
			icon: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm-1 7h14M8 6v1.5M8 13v3'
		},
		{
			href: '/definicoes',
			label: 'Definições',
			match: (/** @type {string} */ p) => p.startsWith('/definicoes'),
			icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a7.3 7.3 0 0 0-2-1.2L14.5 3h-4l-.4 2.5a7.3 7.3 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-.9c.6.5 1.3.9 2 1.2l.4 2.5h4l.4-2.5c.7-.3 1.4-.7 2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z'
		}
	];
</script>

<nav class="tabbar" aria-label="Navegação principal">
	{#each tabs as tab (tab.href)}
		{@const active = tab.match(page.url.pathname)}
		<a href={tab.href} aria-current={active ? 'page' : undefined} class:active>
			<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
				<path d={tab.icon} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			<span>{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	.tabbar {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 20;
		display: flex;
		justify-content: center;
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-top: 1px solid var(--border);
		padding-bottom: env(safe-area-inset-bottom);
	}

	a {
		flex: 1;
		max-width: 200px;
		height: var(--tabbar-h);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.75rem;
		font-weight: 600;
	}

	a.active {
		color: var(--accent);
	}
</style>
