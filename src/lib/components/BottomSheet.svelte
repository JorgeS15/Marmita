<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	/**
	 * Painel modal (bottom sheet no telemóvel, caixa centrada no ecrã largo).
	 * O estado aberto/fechado vive no URL, por isso funciona sem JS e o botão
	 * "voltar" do telemóvel também o fecha.
	 * @type {{ title: string, subtitle?: string, closeHref: string, children: import('svelte').Snippet }}
	 */
	let { title, subtitle = '', closeHref, children } = $props();

	/** @type {HTMLElement | undefined} */
	let panel = $state();
	const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`;

	function close() {
		goto(closeHref, { replaceState: true, noScroll: true, keepFocus: false });
	}

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	onMount(() => {
		const previous = /** @type {HTMLElement | null} */ (document.activeElement);
		panel?.focus({ preventScroll: true });
		const overflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = overflow;
			previous?.focus?.({ preventScroll: true });
		};
	});
</script>

<svelte:window onkeydown={onKeydown} />

<div class="sheet-root">
	<a class="backdrop" href={closeHref} data-sveltekit-replacestate data-sveltekit-noscroll aria-label="Fechar" tabindex="-1"></a>
	<div class="panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabindex="-1" bind:this={panel}>
		<div class="grabber" aria-hidden="true"></div>
		<header>
			<div class="titles">
				<h2 id={titleId}>{title}</h2>
				{#if subtitle}<p class="muted small">{subtitle}</p>{/if}
			</div>
			<a class="btn icon ghost" href={closeHref} data-sveltekit-replacestate data-sveltekit-noscroll aria-label="Fechar">✕</a>
		</header>
		<div class="content">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.sheet-root {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		background: rgb(0 0 0 / 0.45);
		animation: fade 0.15s ease-out;
	}

	.panel {
		position: relative;
		width: 100%;
		max-width: 560px;
		max-height: 88dvh;
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border-radius: 20px 20px 0 0;
		box-shadow: 0 -8px 30px rgb(0 0 0 / 0.2);
		padding-bottom: env(safe-area-inset-bottom);
		animation: slide 0.2s ease-out;
		outline: none;
	}

	.grabber {
		width: 40px;
		height: 4px;
		border-radius: 2px;
		background: var(--border);
		margin: 8px auto 0;
	}

	header {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 8px 12px 8px 16px;
		border-bottom: 1px solid var(--border);
	}

	.titles {
		flex: 1;
		min-width: 0;
		padding-top: 8px;
	}

	.titles h2 {
		overflow-wrap: anywhere;
	}

	.titles p {
		margin: 2px 0 0;
	}

	.content {
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 16px;
	}

	@media (min-width: 720px) {
		.sheet-root {
			align-items: center;
		}

		.panel {
			border-radius: 20px;
			max-height: 85vh;
		}

		.grabber {
			display: none;
		}
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	@keyframes slide {
		from {
			transform: translateY(40px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.backdrop,
		.panel {
			animation: none;
		}
	}
</style>
