<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import TabBar from '$lib/components/TabBar.svelte';

	let { data, children } = $props();

	let offline = $state(false);
	let refreshing = false;

	/** Recarrega os dados se o servidor estiver acessível. */
	async function refresh() {
		if (refreshing || document.visibilityState !== 'visible') return;
		refreshing = true;
		try {
			const res = await fetch('/health', { cache: 'no-store' });
			offline = !res.ok;
			if (res.ok && data.user) await invalidateAll();
		} catch {
			offline = true;
		} finally {
			refreshing = false;
		}
	}

	onMount(() => {
		const onVisible = () => document.visibilityState === 'visible' && refresh();
		const onOffline = () => (offline = true);
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('focus', refresh);
		window.addEventListener('online', refresh);
		window.addEventListener('offline', onOffline);
		const timer = setInterval(refresh, 60_000);

		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('focus', refresh);
			window.removeEventListener('online', refresh);
			window.removeEventListener('offline', onOffline);
			clearInterval(timer);
		};
	});
</script>

{#if offline}
	<div class="offline" role="status">
		<span>Sem ligação ao servidor. As alterações não serão guardadas.</span>
		<button class="btn small" onclick={refresh}>Tentar de novo</button>
	</div>
{/if}

{@render children()}

{#if data.user}
	<footer class="app-version">Marmita v{__APP_VERSION__}</footer>
	<TabBar />
{/if}

<style>
	.app-version {
		padding: 0 16px calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 16px);
		text-align: center;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.offline {
		position: sticky;
		top: 0;
		z-index: 30;
		display: flex;
		gap: 8px;
		align-items: center;
		justify-content: space-between;
		padding: calc(8px + env(safe-area-inset-top)) 16px 8px;
		background: var(--warn-soft);
		color: var(--warn);
		font-weight: 600;
		font-size: 0.9rem;
	}
</style>
